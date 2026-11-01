import React, { useState, useMemo } from 'react';
import { 
  Users, 
  Plus, 
  Phone, 
  Search, 
  X, 
  CheckCircle2, 
  HeartPulse, 
  History, 
  Share2,
  Calendar,
  Clock,
  AlertTriangle,
  BellRing,
  Pill,
  CreditCard,
  Check,
  Send,
  Sparkles,
  Info,
  ChevronRight,
  TrendingUp,
  Receipt,
  Pencil
} from 'lucide-react';
import { Customer, SaleBill, CartItem, StoreSettings } from '../../types/pharmacy';
import { sound } from '../../utils/sound';

interface CustomerCrmViewProps {
  customers: Customer[];
  bills: SaleBill[];
  settings: StoreSettings;
  onAddCustomer: (customer: Customer) => void;
  onUpdateCustomer: (customer: Customer) => void;
}

export interface PatientMedicineTrack {
  billId: string;
  billNumber: string;
  billDateStr: string;
  billTimestamp: number;
  medicineName: string;
  strength: string;
  batchNumber: string;
  quantity: number;
  daysSupply: number;
  daysTaken: number;
  daysRemaining: number;
  status: 'due_now' | 'due_soon' | 'in_progress' | 'course_completed';
  statusLabel: string;
}

export interface PatientReminderSummary {
  customer: Customer;
  medicines: PatientMedicineTrack[];
  totalCreditDue: number;
  creditDueDays: number;
  hasRefillDue: boolean;
  hasCreditDue: boolean;
  latestBill?: SaleBill;
  refillReminderDays: number;
  refillDueDate: Date;
  refillDueDateStr: string;
  daysUntilRefill: number;
  refillStatus: 'overdue' | 'due_today' | 'due_soon' | 'upcoming';
  refillStatusLabel: string;
}

export const CustomerCrmView: React.FC<CustomerCrmViewProps> = ({
  customers,
  bills,
  settings,
  onAddCustomer,
  onUpdateCustomer,
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [selectedCustomerHistory, setSelectedCustomerHistory] = useState<Customer | null>(null);
  const [reminderModalData, setReminderModalData] = useState<{
    customer: Customer;
    medTrack?: PatientMedicineTrack;
    includeMed: boolean;
    includeBill: boolean;
    customNote: string;
  } | null>(null);
  const [reminderFilter, setReminderFilter] = useState<'all' | 'refills' | 'bills' | 'active'>('all');
  const [sentSuccessId, setSentSuccessId] = useState<string | null>(null);

  // Customer Form State (Add / Edit)
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [name, setName] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [address, setAddress] = useState<string>('');
  const [conditions, setConditions] = useState<string>('');
  const [allergies, setAllergies] = useState<string>('');
  const [doctor, setDoctor] = useState<string>('');
  const [refillReminderDays, setRefillReminderDays] = useState<number | string>(30);

  // Clean phone number helper
  const cleanPhone = (p?: string) => (p ? p.replace(/\D/g, '') : '');

  // Calculate patient medication & bill due days tracking
  const patientSummaries = useMemo<PatientReminderSummary[]>(() => {
    const now = Date.now();

    return customers.map(cust => {
      const cPhone = cleanPhone(cust.phone);
      const patientBills = cPhone.length >= 10
        ? bills.filter(b => {
            const bPhone = cleanPhone(b.customerPhone);
            return bPhone.length >= 10 && bPhone.slice(-10) === cPhone.slice(-10);
          })
        : (cust.name && cust.name.trim() && cust.name !== 'Walk-in Customer'
            ? bills.filter(b => b.customerName && b.customerName.toLowerCase().trim() === cust.name.toLowerCase().trim())
            : []);

      const medicinesTrack: PatientMedicineTrack[] = [];
      let totalCreditDue = cust.creditBalance || 0;
      let oldestPendingDays = cust.creditDueDays || 0;

      // Scan all past bills
      patientBills.forEach(bill => {
        let billTime = new Date(bill.timestamp).getTime();
        if (isNaN(billTime)) {
          // Fallback parsing for YYYY-MM-DD
          billTime = new Date(bill.timestamp.split(' ')[0]).getTime();
        }
        if (isNaN(billTime)) {
          billTime = now - 86400000;
        }

        const elapsedDays = Math.max(1, Math.floor((now - billTime) / (1000 * 60 * 60 * 24)));

        // If bill payment was Split Pay or credit
        if (bill.paymentMethod === 'Split Pay' && bill.netPayable > 0 && bill.creditDueDays) {
          oldestPendingDays = Math.max(oldestPendingDays, elapsedDays);
        }

        // Evaluate each medicine
        bill.items.forEach(it => {
          const daysSupply = it.daysSupply || Math.max(5, it.quantity);
          const daysTaken = elapsedDays;
          const daysRemaining = daysSupply - daysTaken;

          let status: PatientMedicineTrack['status'] = 'in_progress';
          let statusLabel = `Day ${daysTaken} of ${daysSupply} taken`;

          if (daysRemaining <= 0) {
            status = 'due_now';
            statusLabel = `Course Ended • Refill Overdue (${Math.abs(daysRemaining)}d)`;
          } else if (daysRemaining <= 2) {
            status = 'due_soon';
            statusLabel = `Refill Due in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'}`;
          } else if (daysTaken > daysSupply + 7) {
            status = 'course_completed';
            statusLabel = `Completed ${daysTaken - daysSupply} days ago`;
          } else {
            status = 'in_progress';
            statusLabel = `Day ${daysTaken} of ${daysSupply} taken (${daysRemaining}d left)`;
          }

          medicinesTrack.push({
            billId: bill.id,
            billNumber: bill.billNumber,
            billDateStr: bill.timestamp,
            billTimestamp: billTime,
            medicineName: it.brandName,
            strength: it.strength,
            batchNumber: it.batchNumber,
            quantity: it.quantity,
            daysSupply,
            daysTaken,
            daysRemaining,
            status,
            statusLabel,
          });
        });
      });

      // Sort medicines by most recent first
      medicinesTrack.sort((a, b) => b.billTimestamp - a.billTimestamp);

      // Routine Refill Cycle Duration from cust.refillReminderDays (default 30 days)
      const contactCycleDays = cust.refillReminderDays && cust.refillReminderDays > 0 
        ? cust.refillReminderDays 
        : 30;

      // Determine base timestamp for refill cycle calculation:
      let baseTime = now;
      if (patientBills.length > 0) {
        let bTime = new Date(patientBills[0].timestamp).getTime();
        if (isNaN(bTime)) bTime = new Date(patientBills[0].timestamp.split(' ')[0]).getTime();
        if (!isNaN(bTime)) baseTime = bTime;
      } else if (cust.lastVisit) {
        let vTime = new Date(cust.lastVisit).getTime();
        if (!isNaN(vTime)) baseTime = vTime;
      }

      const elapsedDays = Math.max(0, Math.floor((now - baseTime) / (1000 * 60 * 60 * 24)));
      const daysUntilRefill = contactCycleDays - elapsedDays;
      const refillDueDate = new Date(baseTime + contactCycleDays * 24 * 60 * 60 * 1000);
      const refillDueDateStr = refillDueDate.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });

      let refillStatus: 'overdue' | 'due_today' | 'due_soon' | 'upcoming' = 'upcoming';
      let refillStatusLabel = `Refill in ${daysUntilRefill} days`;

      if (daysUntilRefill < 0) {
        refillStatus = 'overdue';
        refillStatusLabel = `Overdue by ${Math.abs(daysUntilRefill)} day${Math.abs(daysUntilRefill) === 1 ? '' : 's'}`;
      } else if (daysUntilRefill === 0) {
        refillStatus = 'due_today';
        refillStatusLabel = 'Refill Due Today';
      } else if (daysUntilRefill <= 3) {
        refillStatus = 'due_soon';
        refillStatusLabel = `Due in ${daysUntilRefill} day${daysUntilRefill === 1 ? '' : 's'}`;
      } else {
        refillStatus = 'upcoming';
        refillStatusLabel = `Refill in ${daysUntilRefill} days`;
      }

      // If customer has credit balance, calculate due days
      if (totalCreditDue > 0 && oldestPendingDays === 0) {
        const lastVisitTime = new Date(cust.lastVisit).getTime();
        oldestPendingDays = !isNaN(lastVisitTime)
          ? Math.max(1, Math.floor((now - lastVisitTime) / (1000 * 60 * 60 * 24)))
          : 14;
      }

      const hasMedRefillDue = medicinesTrack.some(m => m.status === 'due_now' || m.status === 'due_soon');
      const hasRefillDue = daysUntilRefill <= 3 || hasMedRefillDue;
      const hasCreditDue = totalCreditDue > 0;

      return {
        customer: cust,
        medicines: medicinesTrack,
        totalCreditDue,
        creditDueDays: oldestPendingDays,
        hasRefillDue,
        hasCreditDue,
        latestBill: patientBills[0],
        refillReminderDays: contactCycleDays,
        refillDueDate,
        refillDueDateStr,
        daysUntilRefill,
        refillStatus,
        refillStatusLabel,
      };
    });
  }, [customers, bills]);

  // Overall Statistics for Reminder Dashboard
  const stats = useMemo(() => {
    let refillsDueCount = 0;
    let creditDueCount = 0;
    let activeRegimensCount = 0;

    patientSummaries.forEach(ps => {
      if (ps.hasRefillDue) refillsDueCount += 1;
      if (ps.hasCreditDue) creditDueCount += 1;
      if (ps.medicines.some(m => m.status === 'in_progress')) activeRegimensCount += 1;
    });

    return { refillsDueCount, creditDueCount, activeRegimensCount };
  }, [patientSummaries]);

  // Compose Automated WhatsApp Reminder
  const composeReminderText = (
    cust: Customer,
    med?: PatientMedicineTrack,
    includeBill: boolean = true,
    customNote: string = ''
  ): string => {
    const storeName = settings.storeName || 'Pharmacy';
    let text = `*${encodeURIComponent(storeName)}*%0A`;
    text += `Dear *${encodeURIComponent(cust.name)}*, greetings from ${encodeURIComponent(storeName)}.%0A%0A`;

    if (med) {
      text += `💊 *MEDICATION REFILL REMINDER:*%0A`;
      text += `• *Prescription:* ${encodeURIComponent(med.medicineName)} (${encodeURIComponent(med.strength)})%0A`;
      text += `• *Duration Taken:* *${med.daysTaken} days taken* (out of ${med.daysSupply} days course)%0A`;
      if (med.daysRemaining <= 0) {
        text += `• *Refill Status:* ⚠️ *Your prescribed course is now due for refill!*%0A`;
      } else {
        text += `• *Refill Status:* ⏳ *Only ${med.daysRemaining} day(s) medication remaining. Refill due shortly.*%0A`;
      }
      text += `Consistent medicine adherence is vital for uninterrupted recovery.%0A%0A`;
    }

    if (includeBill && cust.creditBalance > 0) {
      const dueDays = cust.creditDueDays || 14;
      text += `🧾 *PENDING BILL NOTICE:*%0A`;
      text += `• *Outstanding Balance:* *₹${cust.creditBalance.toFixed(2)}*%0A`;
      text += `• *Payment Due Duration:* *${dueDays} days pending*%0A`;
      if (settings.upiId.trim()) {
        text += `• *UPI ID:* ${encodeURIComponent(settings.upiId)}%0A`;
      }
      text += `%0A`;
    }

    if (customNote.trim()) {
      text += `📝 *Pharmacist Note:* ${encodeURIComponent(customNote.trim())}%0A%0A`;
    }

    const address = [settings.addressLine1, settings.addressLine2, settings.city, settings.state, settings.pincode]
      .filter(Boolean)
      .join(', ');
    if (address) text += `🏬 *Pharmacy Address:* ${encodeURIComponent(address)}%0A`;
    if (settings.phone) text += `📞 *Call / WhatsApp for Refills:* ${encodeURIComponent(settings.phone)}%0A`;
    text += `_Wishing you sound health and speedy recovery!_`;

    return text;
  };

  // Open WhatsApp Link and Mark Reminded
  const handleSendWhatsApp = (
    cust: Customer,
    med?: PatientMedicineTrack,
    includeBill: boolean = true,
    customNote: string = ''
  ) => {
    const rawDigits = cleanPhone(cust.phone);
    const phoneWithCountry = rawDigits.length === 10 ? `91${rawDigits}` : rawDigits;
    const msg = composeReminderText(cust, med, includeBill, customNote);

    const waUrl = phoneWithCountry
      ? `https://wa.me/${phoneWithCountry}?text=${msg}`
      : `https://wa.me/?text=${msg}`;

    window.open(waUrl, '_blank');

    // Update customer's lastReminderSent
    const updated: Customer = {
      ...cust,
      lastReminderSent: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' }),
    };
    onUpdateCustomer(updated);
    sound.playSuccessChime();

    setSentSuccessId(cust.id);
    setTimeout(() => setSentSuccessId(null), 3000);
    setReminderModalData(null);
  };

  const handleMarkReminded = (cust: Customer) => {
    const updated: Customer = {
      ...cust,
      lastReminderSent: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' }),
    };
    onUpdateCustomer(updated);
    sound.playSuccessChime();
    setSentSuccessId(cust.id);
    setTimeout(() => setSentSuccessId(null), 3000);
  };

  const handleOpenCreateModal = () => {
    setEditingCustomer(null);
    setName('');
    setPhone('');
    setEmail('');
    setAddress('');
    setConditions('');
    setAllergies('');
    setDoctor('');
    setRefillReminderDays(30);
    setIsAddModalOpen(true);
  };

  const handleEditCustomer = (cust: Customer) => {
    setEditingCustomer(cust);
    setName(cust.name || '');
    setPhone(cust.phone || '');
    setEmail(cust.email || '');
    setAddress(cust.address || '');
    setConditions(cust.medicalConditions || '');
    setAllergies(cust.allergies || '');
    setDoctor(cust.doctorPreferred || '');
    setRefillReminderDays(
      cust.refillReminderDays !== undefined && cust.refillReminderDays !== null
        ? cust.refillReminderDays
        : 30
    );
    setIsAddModalOpen(true);
  };

  const handleCreateCustomerSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) return;

    const parsedDays = typeof refillReminderDays === 'number'
      ? refillReminderDays
      : parseInt(refillReminderDays, 10);
    const finalReminderDays = parsedDays > 0 ? parsedDays : 30;

    if (editingCustomer) {
      const updatedCustomer: Customer = {
        ...editingCustomer,
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim(),
        address: address.trim(),
        medicalConditions: conditions.trim(),
        allergies: allergies.trim(),
        doctorPreferred: doctor.trim(),
        refillReminderDays: finalReminderDays,
      };
      onUpdateCustomer(updatedCustomer);
      sound.playSuccessChime();
    } else {
      const newCustomer: Customer = {
        id: `cust-${Date.now()}`,
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim(),
        address: address.trim(),
        medicalConditions: conditions.trim(),
        allergies: allergies.trim(),
        doctorPreferred: doctor.trim(),
        refillReminderDays: finalReminderDays,
        totalVisits: 0,
        totalSpend: 0,
        creditBalance: 0,
        creditDueDays: 0,
        lastVisit: new Date().toISOString().split('T')[0],
      };
      onAddCustomer(newCustomer);
      sound.playSuccessChime();
    }

    setIsAddModalOpen(false);
    setEditingCustomer(null);
    setName('');
    setPhone('');
    setEmail('');
    setAddress('');
    setConditions('');
    setAllergies('');
    setDoctor('');
    setRefillReminderDays(30);
  };

  // Filtered customers based on search and reminder filter
  const filteredSummaries = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();

    return patientSummaries.filter(ps => {
      const c = ps.customer;
      const matchSearch = !q ||
        (c.name || '').toLowerCase().includes(q) ||
        (c.phone || '').includes(q) ||
        (c.address && c.address.toLowerCase().includes(q)) ||
        (c.medicalConditions && c.medicalConditions.toLowerCase().includes(q)) ||
        ps.medicines.some(m => (m.medicineName || '').toLowerCase().includes(q));

      if (!matchSearch) return false;

      if (reminderFilter === 'refills') return ps.hasRefillDue;
      if (reminderFilter === 'bills') return ps.hasCreditDue;
      if (reminderFilter === 'active') return ps.medicines.some(m => m.status === 'in_progress');
      return true;
    });
  }, [patientSummaries, searchQuery, reminderFilter]);

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Top Header Card */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-2xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <span>Customer & Patient CRM</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-200">
                  {customers.length} Profiled
                </span>
              </h2>
              <p className="text-xs text-slate-500">
                Patient Health Records, Automatic Medication Days Taken & Due Bill Reminders
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={handleOpenCreateModal}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#00897b] hover:bg-[#00796b] text-white text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-98"
        >
          <Plus className="w-4 h-4" />
          <span>+ New Customer</span>
        </button>
      </div>

      {/* AUTOMATIC REMINDER HIGHLIGHT DASHBOARD */}
      <div className="bg-gradient-to-br from-emerald-900 via-slate-900 to-teal-950 text-white p-5 sm:p-6 rounded-2xl shadow-md border border-emerald-800/40 space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-300 flex items-center justify-center border border-emerald-500/30">
              <BellRing className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <span>Automatic Medication & Bill Due Reminders</span>
                <span className="text-[10px] px-2 py-0.2 rounded-full bg-emerald-500/30 text-emerald-200 font-mono font-semibold">
                  Live FEFO Adherence
                </span>
              </h3>
              <p className="text-[11px] text-emerald-200/80">
                Tracks days taken since dispensing, warns when customer supply is low, and flags bills with overdue days
              </p>
            </div>
          </div>

          {/* Quick Filter Tabs */}
          <div className="flex flex-wrap items-center gap-1.5 bg-slate-800/70 p-1 rounded-xl border border-slate-700/60 text-xs font-semibold">
            <button
              onClick={() => setReminderFilter('all')}
              className={`px-3 py-1 rounded-lg transition-colors cursor-pointer ${
                reminderFilter === 'all' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-300 hover:text-white'
              }`}
            >
              All Patients ({customers.length})
            </button>
            <button
              onClick={() => setReminderFilter('refills')}
              className={`px-3 py-1 rounded-lg transition-colors cursor-pointer flex items-center gap-1 ${
                reminderFilter === 'refills' ? 'bg-amber-500 text-slate-950 font-bold shadow-xs' : 'text-amber-300 hover:text-amber-200'
              }`}
            >
              <Pill className="w-3 h-3" />
              <span>Refills Due ({stats.refillsDueCount})</span>
            </button>
            <button
              onClick={() => setReminderFilter('bills')}
              className={`px-3 py-1 rounded-lg transition-colors cursor-pointer flex items-center gap-1 ${
                reminderFilter === 'bills' ? 'bg-rose-500 text-white font-bold shadow-xs' : 'text-rose-300 hover:text-rose-200'
              }`}
            >
              <Receipt className="w-3 h-3" />
              <span>Bills Pending ({stats.creditDueCount})</span>
            </button>
            <button
              onClick={() => setReminderFilter('active')}
              className={`px-3 py-1 rounded-lg transition-colors cursor-pointer flex items-center gap-1 ${
                reminderFilter === 'active' ? 'bg-teal-500 text-slate-950 font-bold shadow-xs' : 'text-teal-300 hover:text-teal-200'
              }`}
            >
              <HeartPulse className="w-3 h-3" />
              <span>Active Regimens ({stats.activeRegimensCount})</span>
            </button>
          </div>
        </div>

        {/* Active Refill Follow-up Alert Banner if any patient is due */}
        {stats.refillsDueCount > 0 && (
          <div className="bg-amber-500/15 border border-amber-400/35 rounded-xl p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 text-xs animate-in fade-in">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <div>
                <span className="font-bold text-amber-200">
                  {stats.refillsDueCount} Patient{stats.refillsDueCount > 1 ? 's' : ''} Due for Refill Follow-up Alert
                </span>
                <span className="text-amber-300/80 text-[11px] block sm:inline sm:ml-1.5">
                  Calculated using configured patient contact cycle duration. Follow-up recommended.
                </span>
              </div>
            </div>
            <button
              onClick={() => setReminderFilter('refills')}
              className="px-3 py-1 rounded-lg bg-amber-400 text-slate-950 font-bold text-xs hover:bg-amber-300 transition-colors cursor-pointer shrink-0"
            >
              Filter Refills Due
            </button>
          </div>
        )}

        {/* 3 Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
          <div className="bg-slate-800/60 border border-slate-700/70 rounded-xl p-3.5 flex items-center justify-between">
            <div>
              <span className="text-[10px] text-amber-300 font-bold uppercase tracking-wider block">
                Refills Due / Overdue
              </span>
              <div className="text-xl font-black text-white mt-0.5">
                {stats.refillsDueCount} <span className="text-xs font-normal text-slate-400">Patients</span>
              </div>
              <span className="text-[10px] text-slate-400 mt-0.5 block">
                Targeted contact cycle / course due
              </span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30">
              <Pill className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-slate-800/60 border border-slate-700/70 rounded-xl p-3.5 flex items-center justify-between">
            <div>
              <span className="text-[10px] text-rose-300 font-bold uppercase tracking-wider block">
                Pending Bill Dues
              </span>
              <div className="text-xl font-black text-white mt-0.5">
                {stats.creditDueCount} <span className="text-xs font-normal text-slate-400">Customers</span>
              </div>
              <span className="text-[10px] text-slate-400 mt-0.5 block">
                Tracked with days overdue duration
              </span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center border border-rose-500/30">
              <CreditCard className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-slate-800/60 border border-slate-700/70 rounded-xl p-3.5 flex items-center justify-between">
            <div>
              <span className="text-[10px] text-emerald-300 font-bold uppercase tracking-wider block">
                Ongoing Medication Courses
              </span>
              <div className="text-xl font-black text-white mt-0.5">
                {stats.activeRegimensCount} <span className="text-xs font-normal text-slate-400">Active</span>
              </div>
              <span className="text-[10px] text-slate-400 mt-0.5 block">
                Live days-taken progress tracking
              </span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
        </div>
      </div>

      {/* Search Input Bar */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
        <div className="relative max-w-lg">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search patient by name, mobile, address, condition, or medicine..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-emerald-600 font-medium"
          />
        </div>
      </div>

      {/* PATIENTS AND CUSTOMER CARDS GRID (Matching Image 1) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredSummaries.map(({
          customer: cust,
          medicines,
          totalCreditDue,
          creditDueDays,
          hasRefillDue,
          hasCreditDue,
          refillReminderDays,
          refillDueDateStr,
          daysUntilRefill,
          refillStatus,
          refillStatusLabel
        }) => {
          const latestMed = medicines[0];
          const isRemindedRecently = Boolean(cust.lastReminderSent);

          return (
            <div 
              key={cust.id} 
              className={`bg-white p-5 rounded-2xl border transition-all flex flex-col justify-between space-y-3.5 shadow-2xs hover:shadow-sm ${
                hasRefillDue 
                  ? 'border-amber-300/80 bg-amber-50/20' 
                  : hasCreditDue 
                  ? 'border-rose-200/80' 
                  : 'border-slate-200'
              }`}
            >
              <div>
                {/* Header row: Name, initials, phone & Edit button */}
                <div className="flex items-start justify-between">
                  <div className="flex-1 pr-2">
                    <div className="flex items-center gap-1.5">
                      <h3 className="font-bold text-slate-900 text-sm">{cust.name}</h3>
                      {hasRefillDue && (
                        <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" title="Refill Due" />
                      )}
                    </div>
                    {/* Note: WhatsApp Mobile without star! */}
                    <div className="text-xs font-mono font-medium text-emerald-700 mt-0.5 flex items-center gap-1">
                      <Phone className="w-3 h-3 shrink-0" />
                      <span>{cust.phone}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleEditCustomer(cust)}
                      className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-emerald-50 text-slate-600 hover:text-emerald-700 flex items-center justify-center transition-all border border-slate-200 hover:border-emerald-300 cursor-pointer shadow-2xs active:scale-95"
                      title="Edit Customer Profile"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <span className="w-8 h-8 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs">
                      {cust.name[0] || 'P'}
                    </span>
                  </div>
                </div>

                <p className="text-xs text-slate-500 mt-2 line-clamp-1">{cust.address || 'Counter Retail Customer'}</p>

                {/* ACTIVE REFILL REMINDER & EXACT DUE DATE ALERT */}
                <div className={`mt-2.5 p-2.5 rounded-xl border text-xs flex items-center justify-between ${
                  refillStatus === 'overdue'
                    ? 'bg-rose-50/90 border-rose-200 text-rose-900'
                    : refillStatus === 'due_today'
                    ? 'bg-amber-100/80 border-amber-300 text-amber-950 font-medium'
                    : refillStatus === 'due_soon'
                    ? 'bg-amber-50/80 border-amber-200 text-amber-900'
                    : 'bg-slate-50/90 border-slate-200 text-slate-700'
                }`}>
                  <div className="flex items-center gap-2 min-w-0">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                      refillStatus === 'overdue'
                        ? 'bg-rose-100 text-rose-700'
                        : refillStatus === 'due_today' || refillStatus === 'due_soon'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-slate-200/70 text-slate-600'
                    }`}>
                      <Calendar className="w-3.5 h-3.5" />
                    </div>
                    <div className="truncate">
                      <div className="font-bold text-[11px] truncate flex items-center gap-1.5">
                        <span>Refill Due: {refillDueDateStr}</span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-white/90 border border-slate-200/80 text-slate-600 font-mono font-normal">
                          {refillReminderDays}d cycle
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-500 block truncate">
                        {refillStatusLabel}
                      </span>
                    </div>
                  </div>

                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                    refillStatus === 'overdue'
                      ? 'bg-rose-200 text-rose-900 font-extrabold'
                      : refillStatus === 'due_today'
                      ? 'bg-amber-300 text-amber-950 font-extrabold animate-pulse'
                      : refillStatus === 'due_soon'
                      ? 'bg-amber-200 text-amber-900'
                      : 'bg-emerald-100 text-emerald-800'
                  }`}>
                    {refillStatus === 'overdue' ? 'Overdue' : refillStatus === 'due_today' ? 'Due Today' : refillStatus === 'due_soon' ? 'Due Soon' : 'Upcoming'}
                  </span>
                </div>

                {/* Chronic Conditions & Health History */}
                {(cust.medicalConditions || cust.allergies || cust.doctorPreferred) && (
                  <div className="mt-2.5 space-y-1 bg-slate-50/80 p-2.5 rounded-xl border border-slate-100 text-[11px]">
                    {cust.medicalConditions && (
                      <div className="flex items-start gap-1.5 text-slate-700">
                        <HeartPulse className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />
                        <span className="line-clamp-1"><b>Conditions:</b> {cust.medicalConditions}</span>
                      </div>
                    )}
                    {cust.allergies && (
                      <div className="text-amber-800 line-clamp-1">
                        <b>Allergies:</b> {cust.allergies}
                      </div>
                    )}
                    {cust.doctorPreferred && (
                      <div className="text-slate-600 line-clamp-1">
                        <b>Doctor:</b> {cust.doctorPreferred}
                      </div>
                    )}
                  </div>
                )}

                {/* LIVE MEDICATION & DAYS TAKEN TRACKER */}
                {latestMed && (
                  <div className={`mt-3 p-3 rounded-xl border text-xs space-y-2 ${
                    latestMed.status === 'due_now' 
                      ? 'bg-amber-100/60 border-amber-300 text-amber-900' 
                      : latestMed.status === 'due_soon'
                      ? 'bg-amber-50 border-amber-200 text-amber-900'
                      : 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
                  }`}>
                    <div className="flex items-center justify-between">
                      <span className="font-bold flex items-center gap-1 truncate max-w-[190px]">
                        <Pill className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                        <span className="truncate">{latestMed.medicineName}</span>
                      </span>
                      <span className={`text-[10px] px-1.5 py-0.2 rounded font-bold uppercase ${
                        latestMed.status === 'due_now' || latestMed.status === 'due_soon'
                          ? 'bg-amber-200 text-amber-900'
                          : 'bg-emerald-200 text-emerald-800'
                      }`}>
                        {latestMed.status === 'due_now' ? 'Refill Overdue' : latestMed.status === 'due_soon' ? 'Refill Due' : 'Active'}
                      </span>
                    </div>

                    {/* Progress Bar of Days Taken */}
                    <div>
                      <div className="flex items-center justify-between text-[11px] mb-1 font-medium">
                        <span className="font-semibold text-slate-700">
                          Taken: <b>{latestMed.daysTaken} days</b>
                        </span>
                        <span className="text-slate-500 font-mono text-[10px]">
                          Course: {latestMed.daysSupply} days
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                        <div 
                          className={`h-full rounded-full transition-all ${
                            latestMed.daysTaken >= latestMed.daysSupply ? 'bg-amber-500' : 'bg-emerald-500'
                          }`}
                          style={{ width: `${Math.min(100, Math.round((latestMed.daysTaken / latestMed.daysSupply) * 100))}%` }}
                        />
                      </div>
                    </div>

                    <div className="text-[10px] text-slate-600 flex items-center justify-between pt-0.5">
                      <span>{latestMed.statusLabel}</span>
                      <span className="font-mono text-slate-400">{latestMed.billNumber}</span>
                    </div>
                  </div>
                )}

                {/* PENDING BILL DUE WARNING (IF APPLICABLE) */}
                {totalCreditDue > 0 && (
                  <div className="mt-2.5 p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-900 flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                      <div>
                        <span className="font-bold block">Bill Due: ₹{totalCreditDue.toFixed(2)}</span>
                        <span className="text-[10px] text-rose-700">Pending for <b>{creditDueDays} days</b></span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setReminderModalData({
                        customer: cust,
                        medTrack: latestMed,
                        includeMed: Boolean(latestMed),
                        includeBill: true,
                        customNote: '',
                      })}
                      className="px-2 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded text-[10px] font-bold cursor-pointer"
                    >
                      Remind Bill
                    </button>
                  </div>
                )}
              </div>

              {/* Bottom Metrics: Visits, Total Spend, Credit Due */}
              <div className="pt-2 border-t border-slate-100">
                <div className="grid grid-cols-3 text-center text-xs pb-3">
                  <div>
                    <span className="text-[10px] text-slate-400 block font-semibold uppercase">Visits</span>
                    <span className="font-bold text-slate-800">{cust.totalVisits}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block font-semibold uppercase">Total Spend</span>
                    <span className="font-bold text-emerald-700 font-mono">₹{cust.totalSpend.toFixed(0)}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block font-semibold uppercase">Credit Due</span>
                    <span className={`font-bold font-mono ${totalCreditDue > 0 ? 'text-rose-600' : 'text-slate-700'}`}>
                      ₹{totalCreditDue.toFixed(0)}
                    </span>
                  </div>
                </div>

                {/* Reminder Log Status */}
                {cust.lastReminderSent && (
                  <div className="mb-2 text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded text-center font-medium flex items-center justify-center gap-1">
                    <Check className="w-3 h-3 text-emerald-600" />
                    <span>Reminded {cust.lastReminderSent}</span>
                  </div>
                )}

                {/* Actions: History & Smart WhatsApp Reminder */}
                <div className="flex gap-2">
                  <button
                    onClick={() => setSelectedCustomerHistory(cust)}
                    className="flex-1 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer"
                  >
                    <History className="w-3.5 h-3.5 text-slate-500" />
                    <span>History ({medicines.length})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setReminderModalData({
                      customer: cust,
                      medTrack: latestMed,
                      includeMed: Boolean(latestMed),
                      includeBill: totalCreditDue > 0,
                      customNote: '',
                    })}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs active:scale-98"
                    title="Send WhatsApp Reminder with Medicine Days Taken & Bill Due"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    <span>WhatsApp</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* SMART WHATSAPP REMINDER MODAL */}
      {reminderModalData && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-emerald-900 text-white">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/30 flex items-center justify-center">
                  <BellRing className="w-4 h-4 text-emerald-200" />
                </div>
                <div>
                  <h3 className="font-bold text-sm">Send Patient Reminder via WhatsApp</h3>
                  <p className="text-[11px] text-emerald-200">
                    {reminderModalData.customer.name} • {reminderModalData.customer.phone}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setReminderModalData(null)}
                className="p-1 rounded-lg text-emerald-200 hover:text-white hover:bg-emerald-800 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 text-xs">
              {/* Checkbox Options */}
              <div className="space-y-2">
                <span className="font-bold text-slate-800 block">Reminder Elements to Include:</span>

                {reminderModalData.medTrack && (
                  <label className="flex items-start gap-2.5 p-3 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={reminderModalData.includeMed}
                      onChange={e => setReminderModalData({
                        ...reminderModalData,
                        includeMed: e.target.checked,
                      })}
                      className="rounded text-emerald-600 mt-0.5"
                    />
                    <div>
                      <span className="font-bold text-slate-900 block">
                        💊 Medicine Adherence & Days Taken ({reminderModalData.medTrack.daysTaken} days taken)
                      </span>
                      <p className="text-[11px] text-slate-500">
                        {reminderModalData.medTrack.medicineName} • {reminderModalData.medTrack.daysSupply} days course • {reminderModalData.medTrack.statusLabel}
                      </p>
                    </div>
                  </label>
                )}

                {reminderModalData.customer.creditBalance > 0 && (
                  <label className="flex items-start gap-2.5 p-3 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={reminderModalData.includeBill}
                      onChange={e => setReminderModalData({
                        ...reminderModalData,
                        includeBill: e.target.checked,
                      })}
                      className="rounded text-emerald-600 mt-0.5"
                    />
                    <div>
                      <span className="font-bold text-slate-900 block">
                        🧾 Pending Bill Notice (₹{reminderModalData.customer.creditBalance.toFixed(2)})
                      </span>
                      <p className="text-[11px] text-slate-500">
                        Payment has been pending for {reminderModalData.customer.creditDueDays || 14} days. Includes direct UPI ID.
                      </p>
                    </div>
                  </label>
                )}
              </div>

              {/* Pharmacist Custom Note */}
              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Optional Pharmacist Note or Special Advice:
                </label>
                <input
                  type="text"
                  placeholder="e.g. Please take after meals / Doctor consultation recommended."
                  value={reminderModalData.customNote}
                  onChange={e => setReminderModalData({
                    ...reminderModalData,
                    customNote: e.target.value,
                  })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:outline-emerald-600"
                />
              </div>

              {/* Message Live Preview */}
              <div className="bg-emerald-50/60 p-3.5 rounded-xl border border-emerald-200/80 space-y-2">
                <span className="text-[10px] font-bold text-emerald-900 uppercase tracking-wider block">
                  WhatsApp Message Preview:
                </span>
                <div className="p-3 bg-white rounded-lg border border-emerald-200/60 font-sans text-[11px] text-slate-800 whitespace-pre-wrap leading-relaxed shadow-2xs">
                  {decodeURIComponent(composeReminderText(
                    reminderModalData.customer,
                    reminderModalData.includeMed ? reminderModalData.medTrack : undefined,
                    reminderModalData.includeBill,
                    reminderModalData.customNote
                  )).replace(/%0A/g, '\n')}
                </div>
              </div>
            </div>

            {/* Modal Footer Buttons */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => handleMarkReminded(reminderModalData.customer)}
                className="px-3 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-semibold cursor-pointer"
              >
                Mark Logged Only
              </button>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setReminderModalData(null)}
                  className="px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleSendWhatsApp(
                    reminderModalData.customer,
                    reminderModalData.includeMed ? reminderModalData.medTrack : undefined,
                    reminderModalData.includeBill,
                    reminderModalData.customNote
                  )}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer active:scale-98"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Send on WhatsApp</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* REGISTER / EDIT CUSTOMER MODAL */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white ${editingCustomer ? 'bg-teal-600' : 'bg-emerald-600'}`}>
                  {editingCustomer ? <Pencil className="w-4 h-4" /> : <Users className="w-4 h-4" />}
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-sm">
                    {editingCustomer ? 'Edit Customer Profile' : 'Register Customer'}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    {editingCustomer ? 'Update details, contact duration & clinical history' : 'Patient CRM & Chronic Prescription Record'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setIsAddModalOpen(false);
                  setEditingCustomer(null);
                }}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateCustomerSubmit} className="p-5 space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Customer / Patient Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Rajesh Sharma"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs focus:outline-emerald-600 font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  {/* Note: WhatsApp Mobile without star! */}
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Mobile Number *</label>
                  <input
                    type="tel"
                    required
                    placeholder="e.g. 9845012345"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-mono focus:outline-emerald-600"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Email ID</label>
                  <input
                    type="email"
                    placeholder="patient@gmail.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs focus:outline-emerald-600"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Residential Address</label>
                <input
                  type="text"
                  placeholder="Street, Area, Pin code"
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs focus:outline-emerald-600"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Chronic Conditions / History</label>
                <input
                  type="text"
                  placeholder="e.g. Type-2 Diabetes, Hypertension, Asthma"
                  value={conditions}
                  onChange={e => setConditions(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs focus:outline-emerald-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Known Drug Allergies</label>
                  <input
                    type="text"
                    placeholder="e.g. Penicillin, Sulfa"
                    value={allergies}
                    onChange={e => setAllergies(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs focus:outline-emerald-600"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Preferred Doctor</label>
                  <input
                    type="text"
                    placeholder="e.g. Dr. K.S. Rao"
                    value={doctor}
                    onChange={e => setDoctor(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs focus:outline-emerald-600"
                  />
                </div>
              </div>

              {/* Refill Reminder / Contact After (Days) Field */}
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Refill Reminder / Contact After (Days)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min={1}
                    max={365}
                    required
                    placeholder="30"
                    value={refillReminderDays}
                    onChange={e => setRefillReminderDays(e.target.value === '' ? '' : Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className="w-full pl-3 pr-14 py-1.5 border border-slate-300 rounded-lg text-xs font-mono focus:outline-emerald-600 font-bold text-slate-900"
                  />
                  <span className="absolute right-3 top-1.5 text-[11px] font-semibold text-slate-400 pointer-events-none">
                    Days
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 mt-1">
                  Configures routine follow-up duration (default: 30 days) to calculate exact refill due dates and reminder alerts.
                </p>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddModalOpen(false);
                    setEditingCustomer(null);
                  }}
                  className="px-3 py-1.5 border border-slate-200 text-slate-700 rounded-lg text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-xs cursor-pointer active:scale-98"
                >
                  {editingCustomer ? 'Update Profile' : 'Save Customer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PATIENT PURCHASE HISTORY & DAYS TAKEN DETAIL MODAL */}
      {selectedCustomerHistory && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[88vh]">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="font-bold text-slate-800 text-sm">
                  {selectedCustomerHistory.name} — Prescription & Dispense Log
                </h3>
                <p className="text-[11px] text-slate-500 font-mono">
                  Mobile: {selectedCustomerHistory.phone} • Credit Due: ₹{selectedCustomerHistory.creditBalance.toFixed(2)}
                </p>
              </div>
              <button
                onClick={() => setSelectedCustomerHistory(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-3">
              {(() => {
                const histPhone = cleanPhone(selectedCustomerHistory.phone);
                const custBills = histPhone.length >= 10
                  ? bills.filter(b => cleanPhone(b.customerPhone).slice(-10) === histPhone.slice(-10))
                  : (selectedCustomerHistory.name && selectedCustomerHistory.name.trim() && selectedCustomerHistory.name !== 'Walk-in Customer'
                      ? bills.filter(b => b.customerName && b.customerName.toLowerCase().trim() === selectedCustomerHistory.name.toLowerCase().trim())
                      : []);

                if (custBills.length === 0) {
                  return (
                    <div className="p-12 text-center text-slate-400 text-xs">
                      No purchases recorded yet for this patient.
                    </div>
                  );
                }

                return custBills.map(b => {
                    const billTime = new Date(b.timestamp).getTime();
                    const daysTaken = !isNaN(billTime) 
                      ? Math.max(1, Math.floor((Date.now() - billTime) / (1000 * 60 * 60 * 24)))
                      : 1;

                    return (
                      <div key={b.id} className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-2">
                        <div className="flex justify-between items-center pb-1 border-b border-slate-200/60">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-slate-900">{b.billNumber}</span>
                            <span className="px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                              {daysTaken} days since dispense
                            </span>
                          </div>
                          <span className="text-[11px] text-slate-500">{b.timestamp}</span>
                        </div>

                        {/* Dispensed Items with Days Taken */}
                        <div className="space-y-1.5 pt-0.5">
                          {b.items.map((it, idx) => {
                            const courseDays = it.daysSupply || Math.max(5, it.quantity);
                            const remaining = courseDays - daysTaken;

                            return (
                              <div key={idx} className="flex items-center justify-between bg-white p-2 rounded-lg border border-slate-200/80">
                                <div>
                                  <div className="font-bold text-slate-800">
                                    {it.brandName} <span className="text-slate-400 font-normal">({it.quantity}x)</span>
                                  </div>
                                  <div className="text-[10px] text-slate-500">
                                    Batch: {it.batchNumber} • Exp: {it.expiryDate} • HSN: {it.hsnCode || 'Not provided'}
                                  </div>
                                </div>
                                <div className="text-right">
                                  <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                                    remaining <= 0 
                                      ? 'bg-amber-100 text-amber-800' 
                                      : 'bg-emerald-100 text-emerald-800'
                                  }`}>
                                    {remaining <= 0 ? 'Refill Overdue' : `${remaining}d supply left`}
                                  </span>
                                  <div className="text-[10px] text-slate-400 mt-0.5">
                                    Taken {daysTaken} of {courseDays}d
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        <div className="flex justify-between items-center text-xs pt-1.5 border-t border-slate-200/80">
                          <span className="text-slate-500">Payment: <b>{b.paymentMethod}</b></span>
                          <span className="font-black text-slate-900 text-sm">₹{b.netPayable.toFixed(2)}</span>
                        </div>
                      </div>
                    );
                  });
              })()}
            </div>

            <div className="p-3 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button
                onClick={() => setSelectedCustomerHistory(null)}
                className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg text-xs font-semibold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
