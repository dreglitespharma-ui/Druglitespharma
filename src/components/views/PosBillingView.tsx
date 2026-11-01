import React, { useState, useRef, useEffect } from 'react';
import { 
  Search, 
  Scan, 
  ShoppingCart, 
  Trash2, 
  Plus, 
  Minus, 
  User, 
  Phone, 
  CreditCard, 
  Smartphone, 
  Wallet, 
  CheckCircle2, 
  Gift,
  Printer,
  Share2,
  FileCheck2,
  Stethoscope,
  X
} from 'lucide-react';
import { Medicine, BatchInfo, CartItem, SaleBill, Customer, StaffMember, StoreSettings, PaymentMethod } from '../../types/pharmacy';
import { sound } from '../../utils/sound';
import { sendDirectWhatsAppInvoice } from '../../utils/whatsappInvoice';

interface PosBillingViewProps {
  medicines: Medicine[];
  customers: Customer[];
  activeStaff: StaffMember;
  settings: StoreSettings;
  onCompleteSale: (bill: SaleBill) => void;
  onOpenBarcodeScanner: () => void;
  onOpenAIAssistant?: () => void;
  onOpenUpiModal: (amount: number, billNumber: string, onPaid: (ref: string) => void) => void;
  onOpenInvoiceModal: (bill: SaleBill) => void;
  pendingCartItem?: { medicine: Medicine; batch: BatchInfo; timestamp: number } | null;
  onClearPendingCartItem?: () => void;
}

const getLooseUnitLabel = (dosageForm: Medicine['dosageForm']) => {
  if (dosageForm === 'Tablet') return 'tabs';
  if (dosageForm === 'Capsule') return 'capsules';
  return 'units';
};

const getAvailableLooseQuantity = (stock: number, packSize: number) =>
  Math.floor(stock * packSize + 1e-9);

const canDispenseLoose = (medicine: Medicine, batch: BatchInfo) =>
  medicine.allowLooseDispensing === true &&
  batch.allowLooseDispensing !== false &&
  (batch.packSize || medicine.packSize || 0) > 1;

export const PosBillingView: React.FC<PosBillingViewProps> = ({
  medicines,
  customers,
  activeStaff,
  settings,
  onCompleteSale,
  onOpenBarcodeScanner,
  onOpenAIAssistant,
  onOpenUpiModal,
  onOpenInvoiceModal,
  pendingCartItem,
  onClearPendingCartItem,
}) => {
  // Cart state
  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<{ medicine: Medicine; batch: BatchInfo }[]>([]);
  const [showSearchResults, setShowSearchResults] = useState<boolean>(false);

  // Customer info - defaults to Walk-in Customer as shown in user screenshot
  const [customerName, setCustomerName] = useState<string>('Walk-in Customer');
  const [customerPhone, setCustomerPhone] = useState<string>('');
  const [doctorName, setDoctorName] = useState<string>('');
  const [doctorRegNo, setDoctorRegNo] = useState<string>('');
  const [prescriptionVerified, setPrescriptionVerified] = useState<boolean>(false);

  // Payment Mode
  const [paymentMode, setPaymentMode] = useState<PaymentMethod>('Cash');
  const [externalPaymentRef, setExternalPaymentRef] = useState<string>('');

  // Discount states matching user screenshot exactly
  const [discountType, setDiscountType] = useState<'flat' | 'pct'>('flat');
  const [concessionAmount, setConcessionAmount] = useState<string>('');
  const [concessionReason, setConcessionReason] = useState<string>('');

  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const finalizingSaleRef = useRef<boolean>(false);
  const [showWhatsAppPrompt, setShowWhatsAppPrompt] = useState<boolean>(false);
  const [tempWhatsAppNumber, setTempWhatsAppNumber] = useState<string>('');
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const whatsAppPromptInputRef = useRef<HTMLInputElement | null>(null);

  // Auto-focus search input when billing counter opens
  useEffect(() => {
    const timer = setTimeout(() => {
      searchInputRef.current?.focus();
    }, 120);
    return () => clearTimeout(timer);
  }, []);

  // Auto-focus WhatsApp prompt input when modal opens
  useEffect(() => {
    if (showWhatsAppPrompt) {
      const timer = setTimeout(() => {
        whatsAppPromptInputRef.current?.focus();
        whatsAppPromptInputRef.current?.select();
      }, 60);
      return () => clearTimeout(timer);
    }
  }, [showWhatsAppPrompt]);

  // Search filter
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setShowSearchResults(false);
      return;
    }

    const q = searchQuery.toLowerCase().trim();
    const matches: { medicine: Medicine; batch: BatchInfo }[] = [];
    const currentMonth = new Date().toISOString().slice(0, 7);

    medicines.forEach(m => {
      const matchMed =
        (m.brandName || '').toLowerCase().includes(q) ||
        (m.genericName || '').toLowerCase().includes(q) ||
        (m.category || '').toLowerCase().includes(q);

      const batches = Array.isArray(m.batches) ? m.batches : [];
      // Sort batches by FEFO (First Expiry First Out)
      const sortedBatches = [...batches].sort((a, b) => (a.expiryDate || '').localeCompare(b.expiryDate || ''));

      sortedBatches.filter(b => b.stock > 0 && b.expiryDate && b.expiryDate >= currentMonth).forEach(b => {
        if (matchMed || (b.barcode && b.barcode.includes(q)) || (b.batchNumber && b.batchNumber.toLowerCase().includes(q))) {
          matches.push({ medicine: m, batch: b });
        }
      });
    });

    setSearchResults(matches.slice(0, 8));
    setShowSearchResults(matches.length > 0);
  }, [searchQuery, medicines]);

  // Customer auto-lookup on phone typing
  const handlePhoneChange = (phoneVal: string) => {
    setCustomerPhone(phoneVal);
    const clean = phoneVal.replace(/\D/g, '');
    if (clean.length >= 10) {
      const found = customers.find(c => c.phone.replace(/\D/g, '').slice(-10) === clean.slice(-10));
      if (found) {
        setCustomerName(found.name);
        if (found.doctorPreferred && !doctorName) {
          setDoctorName(found.doctorPreferred);
        }
      }
    }
  };

  // Add Item to Cart
  const addItemToCart = (medicine: Medicine, batch: BatchInfo) => {
    const currentMonth = new Date().toISOString().slice(0, 7);
    const packSize = batch.packSize || medicine.packSize || 1;
    const startLoose = batch.stock < 1 && canDispenseLoose(medicine, batch);
    if (
      batch.stock <= 0 ||
      (!startLoose && batch.stock < 1) ||
      (startLoose && getAvailableLooseQuantity(batch.stock, packSize) < 1) ||
      !batch.expiryDate ||
      batch.expiryDate < currentMonth
    ) {
      sound.playWarningBeep();
      alert(batch.expiryDate && batch.expiryDate < currentMonth
        ? `Batch ${batch.batchNumber} is expired and cannot be sold.`
        : `Batch ${batch.batchNumber} has no saleable stock available.`);
      return;
    }

    sound.playBarcodeBeep();

    setCart(prevCart => {
      const existingIdx = prevCart.findIndex(
        it => it.medicineId === medicine.id && it.batchNumber === batch.batchNumber
      );

      if (existingIdx !== -1) {
        const updated = [...prevCart];
        const existing = updated[existingIdx];
        const existingPackSize = existing.packSize || batch.packSize || medicine.packSize || 1;
        const maxQuantity = existing.dispenseMode === 'loose'
          ? getAvailableLooseQuantity(batch.stock, existingPackSize)
          : Math.floor(batch.stock + 1e-9);
        if (existing.quantity < maxQuantity) {
          updated[existingIdx].quantity += 1;
        } else {
          sound.playWarningBeep();
          alert(`Maximum stock reached for batch ${batch.batchNumber}.`);
        }
        return updated;
      } else {
        const newItem: CartItem = {
          medicineId: medicine.id,
          brandName: medicine.brandName,
          genericName: medicine.genericName,
          dosageForm: medicine.dosageForm,
          strength: medicine.strength,
          batchNumber: batch.batchNumber,
          expiryDate: batch.expiryDate,
          rackLocation: batch.rackLocation,
          quantity: 1,
          mrp: startLoose ? (batch.unitMrp || batch.mrp / packSize) : batch.mrp,
          purchasePrice: batch.purchasePrice,
          discountPercent: 0,
          gstRate: (medicine.gstRate !== undefined && !isNaN(Number(medicine.gstRate))) ? Number(medicine.gstRate) : 12,
          hsnCode: medicine.hsnCode || '30049099',
          daysSupply: Math.max(7, batch.stock > 0 ? 10 : 7),
          isScheduleDrug: medicine.isScheduleDrug,
          dispenseMode: startLoose ? 'loose' : 'pack',
          packSize,
          packUnit: batch.packUnit || medicine.packUnit || 'Pack',
          packMrp: batch.mrp,
          unitMrp: batch.unitMrp || batch.mrp / packSize,
        };
        return [...prevCart, newItem];
      }
    });

    setSearchQuery('');
    setShowSearchResults(false);
  };

  // Automatically add scanned item from BarcodeScannerModal
  useEffect(() => {
    if (pendingCartItem && pendingCartItem.medicine && pendingCartItem.batch) {
      addItemToCart(pendingCartItem.medicine, pendingCartItem.batch);
      onClearPendingCartItem?.();
    }
  }, [pendingCartItem]);

  // Cart item qty changes
  const updateItemQty = (index: number, delta: number) => {
    setCart(prev => {
      const updated = [...prev];
      const target = updated[index];
      const med = medicines.find(m => m.id === target.medicineId);
      const batch = med?.batches.find(b => b.batchNumber === target.batchNumber);
      const packSize = target.packSize || batch?.packSize || med?.packSize || 1;
      const maxStock = target.dispenseMode === 'loose'
        ? getAvailableLooseQuantity(batch?.stock ?? 0, packSize)
        : Math.floor((batch?.stock ?? 0) + 1e-9);

      const newQty = target.quantity + delta;
      if (newQty <= 0) {
        return updated.filter((_, i) => i !== index);
      }
      if (newQty > maxStock) {
        sound.playWarningBeep();
        const quantityUnit = target.dispenseMode === 'loose' ? getLooseUnitLabel(target.dosageForm) : 'packs';
        alert(`Cannot add more: only ${maxStock} ${quantityUnit} available.`);
        return updated;
      }

      updated[index].quantity = newQty;
      return updated;
    });
  };

  const updateDispenseMode = (index: number, mode: 'pack' | 'loose') => {
    setCart(prev => {
      const item = prev[index];
      if (!item || item.dispenseMode === mode) return prev;
      const medicine = medicines.find(m => m.id === item.medicineId);
      const batch = medicine?.batches.find(b => b.batchNumber === item.batchNumber);
      if (!medicine || !batch) {
        sound.playWarningBeep();
        alert('This batch is no longer available. Refresh inventory and review the cart.');
        return prev;
      }
      if (mode === 'loose' && !canDispenseLoose(medicine, batch)) {
        sound.playWarningBeep();
        alert('Loose dispensing is not enabled for this medicine or batch.');
        return prev;
      }
      if (mode === 'loose' && getAvailableLooseQuantity(batch.stock, item.packSize || batch.packSize || medicine.packSize || 1) < 1) {
        sound.playWarningBeep();
        alert('There are no loose units available in this batch.');
        return prev;
      }
      if (mode === 'pack' && batch.stock < 1) {
        sound.playWarningBeep();
        alert('There is not enough stock to dispense a full pack.');
        return prev;
      }

      const updated = [...prev];
      updated[index] = {
        ...item,
        dispenseMode: mode,
        quantity: 1,
        mrp: mode === 'loose' ? (item.unitMrp || item.mrp / (item.packSize || 1)) : (item.packMrp || item.mrp),
      };
      return updated;
    });
  };

  const removeItem = (index: number) => {
    setCart(prev => prev.filter((_, i) => i !== index));
  };

  // Computations
  let subtotal = 0;
  let totalItemDiscount = 0;
  let taxableAmount = 0;
  let totalGst = 0;

  const lineTotals = cart.map(item => {
    const lineTotal = item.quantity * item.mrp;
    const itemDiscount = lineTotal * ((item.discountPercent || 0) / 100);
    return { lineTotal, discountedTotal: lineTotal - itemDiscount };
  });
  const discountedSubtotal = lineTotals.reduce((total, line) => total + line.discountedTotal, 0);

  cart.forEach(item => {
    const lineTotal = item.quantity * item.mrp;
    const itemDiscAmount = lineTotal * ((item.discountPercent || 0) / 100);
    subtotal += lineTotal;
    totalItemDiscount += itemDiscAmount;
  });

  // Extra concession calculation
  let extraConcessionVal = 0;
  const concessionNum = Number(concessionAmount);
  if (Number.isFinite(concessionNum) && concessionNum > 0) {
    extraConcessionVal = discountType === 'flat'
      ? concessionNum
      : (discountedSubtotal * Math.min(concessionNum, 100)) / 100;
  }
  extraConcessionVal = Math.min(discountedSubtotal, Math.max(0, extraConcessionVal));

  const totalDiscountAllowed = Math.round((totalItemDiscount + extraConcessionVal) * 100) / 100;
  const grossPayable = Math.max(0, subtotal - totalDiscountAllowed);
  const netPayable = Math.round(grossPayable * 100) / 100;

  lineTotals.forEach(({ discountedTotal }, index) => {
    const lineConcession = discountedSubtotal > 0
      ? extraConcessionVal * (discountedTotal / discountedSubtotal)
      : 0;
    const finalLineTotal = Math.max(0, discountedTotal - lineConcession);
    const cartItem = cart[index];
    const safeGstRate = Number.isFinite(Number(cartItem?.gstRate)) ? Number(cartItem.gstRate) : 0;
    const taxableLine = safeGstRate === 0 ? finalLineTotal : finalLineTotal / (1 + safeGstRate / 100);
    taxableAmount += taxableLine;
    totalGst += finalLineTotal - taxableLine;
  });

  taxableAmount = Math.round(taxableAmount * 100) / 100;
  totalGst = Math.max(0, Math.round((netPayable - taxableAmount) * 100) / 100);
  const cgstAmount = Math.round((totalGst / 2) * 100) / 100;
  const sgstAmount = Math.round((totalGst - cgstAmount) * 100) / 100;

  const hasScheduleDrugs = cart.some(it => it.isScheduleDrug);
  const canVerifyPrescription =
    activeStaff.role === 'Pharmacist' && Boolean(activeStaff.pharmacistRegNo?.trim());

  // Quick preset concession buttons handler
  const handleQuickPreset = (amount: number) => {
    setDiscountType('flat');
    setConcessionAmount(amount.toString());
    sound.playBarcodeBeep();
  };

  const handleRoundOffPreset = () => {
    setDiscountType('flat');
    const afterItemDiscounts = Math.max(0, discountedSubtotal);
    const decimalPart = afterItemDiscounts - Math.floor(afterItemDiscounts);
    if (decimalPart > 0) {
      setConcessionAmount(decimalPart.toFixed(2));
    } else {
      setConcessionAmount('0');
    }
    sound.playBarcodeBeep();
  };

  // Generate Unique Bill Number
  const generateBillNumber = () => {
    const year = new Date().getFullYear();
    const uniqueSuffix = globalThis.crypto?.randomUUID?.().slice(0, 8).toUpperCase()
      || `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
    return `DLP/${year}/${uniqueSuffix}`;
  };

  // Finalize Sale
  const handleCompleteSaleAction = (actionType: 'printer' | 'whatsapp' | 'review') => {
    if (cart.length === 0) {
      sound.playWarningBeep();
      alert('Cart is empty. Please search and add medicines to generate a bill.');
      return;
    }

    if (actionType === 'whatsapp' && (!customerPhone || customerPhone.replace(/\D/g, '').length < 10)) {
      setTempWhatsAppNumber(customerPhone || '');
      setShowWhatsAppPrompt(true);
      return;
    }

    if (hasScheduleDrugs && (!canVerifyPrescription || !prescriptionVerified)) {
      sound.playWarningBeep();
      alert('A pharmacist account with a registration number must verify prescription medicines before this bill can be completed.');
      return;
    }
    if (paymentMode === 'Card POS' && !externalPaymentRef.trim()) {
      sound.playWarningBeep();
      alert('Verify the payment on your external card terminal and enter its transaction reference.');
      return;
    }

    const billNumber = generateBillNumber();

    if (paymentMode === 'UPI / QR') {
      if (!/^[a-zA-Z0-9._-]{2,256}@[a-zA-Z0-9.-]{2,64}$/.test(settings.upiId.trim())) {
        sound.playWarningBeep();
        alert('Enter a valid store UPI ID in Settings before accepting UPI payments.');
        return;
      }
      onOpenUpiModal(netPayable, billNumber, (txRef) => {
        executeSaleFinalization(billNumber, txRef, actionType);
      });
    } else {
      executeSaleFinalization(
        billNumber,
        paymentMode === 'Card POS' ? externalPaymentRef.trim() : undefined,
        actionType
      );
    }
  };

  const handleConfirmWhatsAppPrompt = () => {
    const digits = tempWhatsAppNumber.replace(/\D/g, '');
    const clean = digits.length >= 10 ? digits.slice(-10) : digits;
    if (clean.length < 10) {
      sound.playWarningBeep();
      alert('Please enter a valid 10-digit customer WhatsApp number.');
      return;
    }
    setCustomerPhone(clean);
    setShowWhatsAppPrompt(false);

    // Auto-match existing customer name from CRM
    const matched = customers.find(c => c.phone.replace(/\D/g, '').slice(-10) === clean);
    const resolvedCustomerName =
      matched && (!customerName || customerName === 'Walk-in Customer') ? matched.name : customerName;
    if (resolvedCustomerName !== customerName) setCustomerName(resolvedCustomerName);

    if (hasScheduleDrugs && (!canVerifyPrescription || !prescriptionVerified)) {
      sound.playWarningBeep();
      alert('A pharmacist account with a registration number must verify prescription medicines before this bill can be completed.');
      return;
    }
    if (paymentMode === 'Card POS' && !externalPaymentRef.trim()) {
      sound.playWarningBeep();
      alert('Verify the payment on your external card terminal and enter its transaction reference.');
      return;
    }

    const billNumber = generateBillNumber();

    if (paymentMode === 'UPI / QR') {
      if (!/^[a-zA-Z0-9._-]{2,256}@[a-zA-Z0-9.-]{2,64}$/.test(settings.upiId.trim())) {
        sound.playWarningBeep();
        alert('Enter a valid store UPI ID in Settings before accepting UPI payments.');
        return;
      }
      onOpenUpiModal(netPayable, billNumber, (txRef) => {
        executeSaleFinalization(billNumber, txRef, 'whatsapp', clean, resolvedCustomerName);
      });
    } else {
      executeSaleFinalization(
        billNumber,
        paymentMode === 'Card POS' ? externalPaymentRef.trim() : undefined,
        'whatsapp',
        clean,
        resolvedCustomerName
      );
    }
  };

  const executeSaleFinalization = (
    billNumber: string,
    paymentRef?: string,
    actionType: 'printer' | 'whatsapp' | 'review' = 'review',
    phoneOverride?: string,
    customerNameOverride?: string
  ) => {
    if (finalizingSaleRef.current) return;
    finalizingSaleRef.current = true;
    setIsProcessing(true);

    const finalPhone = (phoneOverride || customerPhone || '').trim();

    const newBill: SaleBill = {
      id: `bill-${billNumber.replaceAll('/', '-')}`,
      billNumber,
      timestamp: new Date().toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      }),
      cashierName: activeStaff.name,
      customerName: customerNameOverride || customerName || 'Walk-in Customer',
      customerPhone: finalPhone,
      doctorName: doctorName || (doctorRegNo ? `Dr. (Reg: ${doctorRegNo})` : ''),
      isPrescriptionVerified: hasScheduleDrugs && prescriptionVerified,
      ...(hasScheduleDrugs && prescriptionVerified ? {
        pharmacistName: activeStaff.name,
        pharmacistRegNo: activeStaff.pharmacistRegNo,
      } : {}),
      items: [...cart],
      subtotal,
      totalDiscount: totalDiscountAllowed,
      taxableAmount,
      cgstAmount,
      sgstAmount,
      roundOff: 0,
      netPayable,
      paymentMethod: paymentMode,
      ...(paymentRef ? { paymentRef } : {}),
      status: 'Completed',
    };

    try {
      onCompleteSale(newBill);
    } catch (error) {
      finalizingSaleRef.current = false;
      setIsProcessing(false);
      sound.playWarningBeep();
      alert(error instanceof Error ? error.message : 'The sale could not be saved. Check stock and try again.');
      return;
    }

    sound.playSuccessChime();
    finalizingSaleRef.current = false;

    // Reset Cart
    setCart([]);
    setCustomerName('Walk-in Customer');
    setCustomerPhone('');
    setDoctorName('');
    setDoctorRegNo('');
    setPrescriptionVerified(false);
    setPaymentMode('Cash');
    setExternalPaymentRef('');
    setDiscountType('flat');
    setConcessionAmount('');
    setConcessionReason('');
    setIsProcessing(false);

    // Action handling
    if (actionType === 'whatsapp') {
      // Directly dispatch to customer WhatsApp without downloading or dragging!
      sendDirectWhatsAppInvoice(newBill, settings, finalPhone);
      onOpenInvoiceModal(newBill);
    } else if (actionType === 'printer') {
      onOpenInvoiceModal(newBill);
      setTimeout(() => {
        window.print();
      }, 500);
    } else {
      onOpenInvoiceModal(newBill);
    }
  };

  // Keyboard shortcut listener within POS Billing view
  useEffect(() => {
    const handleFocusSearch = () => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    };
    const handleActionPrinter = () => {
      handleCompleteSaleAction('printer');
    };
    const handleActionWhatsapp = () => {
      handleCompleteSaleAction('whatsapp');
    };
    const handleNewBill = () => {
      setCart([]);
      setCustomerName('Walk-in Customer');
      setCustomerPhone('');
      setDoctorName('');
      setDoctorRegNo('');
      setPrescriptionVerified(false);
      setPaymentMode('Cash');
      setExternalPaymentRef('');
      setDiscountType('flat');
      setConcessionAmount('');
      searchInputRef.current?.focus();
    };

    window.addEventListener('pharmacy:focus-search', handleFocusSearch);
    window.addEventListener('pharmacy:action-printer', handleActionPrinter);
    window.addEventListener('pharmacy:action-whatsapp', handleActionWhatsapp);
    window.addEventListener('pharmacy:new-bill', handleNewBill);

    return () => {
      window.removeEventListener('pharmacy:focus-search', handleFocusSearch);
      window.removeEventListener('pharmacy:action-printer', handleActionPrinter);
      window.removeEventListener('pharmacy:action-whatsapp', handleActionWhatsapp);
      window.removeEventListener('pharmacy:new-bill', handleNewBill);
    };
  }, [cart, customerPhone, customerName, doctorName, doctorRegNo, prescriptionVerified, paymentMode, netPayable, subtotal, totalDiscountAllowed, taxableAmount, cgstAmount, sgstAmount]);

  return (
    <div className="p-5 max-w-7xl mx-auto space-y-4 font-sans select-none">
      {/* Title Header Matching Screenshot Image 1 */}
      <div>
        <div className="flex items-center gap-2">
          <ShoppingCart className="w-5 h-5 text-[#009688]" />
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">POS Billing Counter</h2>
          <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-sky-100 text-sky-700">
            FEFO Active
          </span>
        </div>
        <p className="text-xs text-slate-500 mt-0.5">
          Fast counter billing with printer receipts, WhatsApp dispatch, and UPI QR payment references.
        </p>
      </div>

      {/* Interactive Quick Function Keys Bar (Clickable & Keyboard Hotkeys) */}
      <div className="bg-slate-900 text-white p-2.5 rounded-xl flex flex-wrap items-center justify-between gap-2 shadow-md">
        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-300">
          <span className="text-amber-400">⌨️</span>
          <span className="text-xs">Shortkeys:</span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              setCart([]);
              setCustomerName('Walk-in Customer');
              setCustomerPhone('');
              setDoctorName('');
              setDoctorRegNo('');
              setPrescriptionVerified(false);
              setPaymentMode('Cash');
              setExternalPaymentRef('');
              setDiscountType('flat');
              setConcessionAmount('');
              searchInputRef.current?.focus();
            }}
            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 hover:text-white rounded-lg text-[11px] font-semibold transition-all flex items-center gap-1.5 cursor-pointer border border-slate-700"
            title="Start New Sale Bill [F1]"
          >
            <span className="px-1.5 py-0.2 bg-teal-600 text-white rounded font-mono font-bold text-[10px]">F1</span>
            <span>New Bill</span>
          </button>

          <button
            type="button"
            onClick={() => {
              searchInputRef.current?.focus();
              searchInputRef.current?.select();
            }}
            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 hover:text-white rounded-lg text-[11px] font-semibold transition-all flex items-center gap-1.5 cursor-pointer border border-slate-700"
            title="Focus Medicine Search Bar [F2]"
          >
            <span className="px-1.5 py-0.2 bg-teal-600 text-white rounded font-mono font-bold text-[10px]">F2</span>
            <span>Search Meds</span>
          </button>

          <button
            type="button"
            onClick={onOpenBarcodeScanner}
            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 hover:text-white rounded-lg text-[11px] font-semibold transition-all flex items-center gap-1.5 cursor-pointer border border-slate-700"
            title="Open Camera Barcode Scanner [F3]"
          >
            <span className="px-1.5 py-0.2 bg-teal-600 text-white rounded font-mono font-bold text-[10px]">F3</span>
            <span>Scan</span>
          </button>

          {onOpenAIAssistant && (
            <button
              type="button"
              onClick={onOpenAIAssistant}
              className="px-2.5 py-1 bg-gradient-to-r from-teal-700 to-emerald-700 hover:from-teal-600 hover:to-emerald-600 active:scale-95 text-white rounded-lg text-[11px] font-semibold transition-all flex items-center gap-1.5 cursor-pointer border border-teal-500/50"
              title="Open Dr. Maya AI Pharmacy Assistant [F4]"
            >
              <span className="px-1.5 py-0.2 bg-amber-400 text-slate-900 rounded font-mono font-extrabold text-[10px]">F4</span>
              <span>Ask AI</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => handleCompleteSaleAction('printer')}
            disabled={cart.length === 0}
            className="px-2.5 py-1 bg-indigo-900/80 hover:bg-indigo-800 active:scale-95 text-indigo-100 rounded-lg text-[11px] font-semibold transition-all flex items-center gap-1.5 cursor-pointer border border-indigo-700 disabled:opacity-40"
            title="Give Bill via Printer [F9]"
          >
            <span className="px-1.5 py-0.2 bg-indigo-500 text-white rounded font-mono font-bold text-[10px]">F9</span>
            <span>Print</span>
          </button>

          <button
            type="button"
            onClick={() => handleCompleteSaleAction('whatsapp')}
            disabled={cart.length === 0}
            className="px-2.5 py-1 bg-emerald-900/80 hover:bg-emerald-800 active:scale-95 text-emerald-100 rounded-lg text-[11px] font-semibold transition-all flex items-center gap-1.5 cursor-pointer border border-emerald-600 disabled:opacity-40"
            title="Send Direct WhatsApp Bill (Zero download/drag) [F10]"
          >
            <span className="px-1.5 py-0.2 bg-emerald-500 text-white rounded font-mono font-bold text-[10px]">F10</span>
            <span>WhatsApp Bill</span>
          </button>
        </div>
      </div>

      {/* Search Input Bar with Integrated Scan Button */}
      <div className="relative bg-white rounded-xl border border-slate-200/90 shadow-2xs">
        <div className="flex items-center px-3.5 py-1.5">
          <Search className="w-4 h-4 text-slate-400 mr-2.5 shrink-0" />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search Medicine by Name, Generic, or Barcode... [F2 to focus]"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full py-2 text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-none bg-transparent"
          />

          {/* Integrated Scan Button on the right */}
          <button
            type="button"
            onClick={onOpenBarcodeScanner}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#00897b] hover:bg-[#00796b] text-white rounded-lg text-xs font-bold transition-all shadow-xs shrink-0 cursor-pointer"
          >
            <Scan className="w-3.5 h-3.5" />
            <span>Scan</span>
            <span className="text-[10px] bg-white/20 px-1 py-0.2 rounded font-mono">F3</span>
          </button>
        </div>

        {/* Autocomplete Dropdown */}
        {showSearchResults && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-30 max-h-72 overflow-y-auto divide-y divide-slate-100">
            {searchResults.map(({ medicine, batch }, idx) => (
              <button
                key={`${medicine.id}-${batch.batchNumber}-${idx}`}
                type="button"
                onClick={() => addItemToCart(medicine, batch)}
                className="w-full text-left p-3 hover:bg-emerald-50/70 flex items-center justify-between transition-colors group cursor-pointer"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-900 group-hover:text-emerald-700">
                      {medicine.brandName}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.2 bg-slate-100 text-slate-600 rounded uppercase font-bold">
                      {medicine.dosageForm}
                    </span>
                    {medicine.isScheduleDrug && (
                      <span className="text-[10px] px-1 py-0.2 bg-amber-100 text-amber-800 rounded font-bold">
                        {medicine.scheduleClass}
                      </span>
                    )}
                    {(medicine.allowLooseDispensing === false || batch.allowLooseDispensing === false) && (
                      <span className="text-[10px] px-1 py-0.2 bg-amber-100 text-amber-800 rounded font-semibold border border-amber-200">
                        Full Pack Only
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-500">{medicine.genericName} ({medicine.strength})</div>
                  <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                    Batch: <b className="text-slate-700">{batch.batchNumber}</b> • Exp: <b className="text-slate-700">{batch.expiryDate}</b> • Rack: {batch.rackLocation}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-extrabold text-emerald-700">₹{batch.mrp.toFixed(2)}</div>
                  <div className={`text-[10px] font-bold ${batch.stock < 15 ? 'text-rose-600' : 'text-slate-500'}`}>
                    {canDispenseLoose(medicine, batch)
                      ? `${getAvailableLooseQuantity(batch.stock, batch.packSize || medicine.packSize || 1)} ${getLooseUnitLabel(medicine.dosageForm)} available`
                      : `${batch.stock} packs left`}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Main Grid: Left Cart (7 cols) + Right Checkout (5 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        
        {/* Left: Billing Cart Box */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden flex flex-col">
          <div className="p-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/40">
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-800 text-xs sm:text-sm">Billing Cart Items</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#d4edda] text-[#155724]">
                {cart.length} Medicines
              </span>
            </div>

            {cart.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setCart([]);
                  setPrescriptionVerified(false);
                }}
                className="text-xs text-rose-600 hover:text-rose-700 font-semibold"
              >
                Clear Cart
              </button>
            )}
          </div>

          {cart.length === 0 ? (
            <div className="p-16 flex flex-col items-center justify-center text-center">
              <div className="text-slate-300 mb-3">
                <ShoppingCart className="w-12 h-12 stroke-[1.5]" />
              </div>
              <h4 className="font-bold text-slate-700 text-sm">Cart is currently empty.</h4>
              <p className="text-xs text-slate-400 mt-1 max-w-sm leading-relaxed">
                Search medicines above or scan barcode to add products. First-Expiry-First-Out (FEFO) batch will be auto-selected.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-semibold text-[10px] uppercase tracking-wider">
                    <th className="p-3">Medicine & Salt</th>
                    <th className="p-3">Batch & Exp</th>
                    <th className="p-3 text-center">Qty / Pack or Unit</th>
                    <th className="p-3 text-right">Price / Pack or Unit</th>
                    <th className="p-3 text-right">Total (₹)</th>
                    <th className="p-3 text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                  {cart.map((item, idx) => {
                    const medicine = medicines.find(m => m.id === item.medicineId);
                    const batch = medicine?.batches.find(b => b.batchNumber === item.batchNumber);
                    const looseAllowed = !!medicine && !!batch && canDispenseLoose(medicine, batch);
                    const packLabel = item.dosageForm === 'Tablet' ? 'Full strip' : 'Full pack';
                    const looseLabel = item.dosageForm === 'Tablet'
                      ? 'Loose tabs'
                      : item.dosageForm === 'Capsule'
                        ? 'Loose capsules'
                        : 'Loose units';
                    return (
                    <tr key={`${item.medicineId}-${item.batchNumber}-${idx}`} className="hover:bg-slate-50/50">
                      <td className="p-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-slate-900">{item.brandName}</span>
                          <span className="px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 font-mono text-[9px] font-semibold border border-slate-200">
                            HSN: {item.hsnCode || 'Not provided'}
                          </span>
                          <span className={`px-1.5 py-0.2 rounded font-mono text-[9px] font-bold border ${
                            item.gstRate === 0
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                              : 'bg-amber-50 text-amber-800 border-amber-300'
                          }`}>
                            GST: {item.gstRate === 0 ? '0% Nil' : `${item.gstRate}%`}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-500">{item.genericName} ({item.strength})</div>
                        <div className="mt-2 inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                          {(['pack', 'loose'] as const).map(mode => {
                            const isDisabled = mode === 'loose' && !looseAllowed;
                            return (
                              <button
                                key={mode}
                                type="button"
                                onClick={() => updateDispenseMode(idx, mode)}
                                disabled={isDisabled}
                                aria-pressed={(item.dispenseMode || 'pack') === mode}
                                title={isDisabled
                                  ? 'Enable loose dispensing in the medicine settings and check that pack size is greater than 1.'
                                  : undefined}
                                className={`rounded-md px-2 py-1 text-[10px] font-bold transition-colors ${
                                  (item.dispenseMode || 'pack') === mode
                                    ? 'bg-[#00897b] text-white shadow-sm'
                                    : isDisabled
                                      ? 'cursor-not-allowed text-slate-400'
                                      : 'text-slate-600 hover:bg-white'
                                }`}
                              >
                                {mode === 'pack' ? packLabel : looseLabel}
                              </button>
                            );
                          })}
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="font-mono font-bold text-slate-700">{item.batchNumber}</div>
                        <div className="font-mono text-[10px] text-slate-400">{item.expiryDate}</div>
                      </td>
                      <td className="p-3 text-center">
                        <div className="inline-flex items-center border border-slate-200 rounded-lg overflow-hidden bg-white">
                          <button
                            type="button"
                            onClick={() => updateItemQty(idx, -1)}
                            className="p-1 hover:bg-slate-100 text-slate-600"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="px-2 font-bold text-xs min-w-[20px] text-center">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => updateItemQty(idx, 1)}
                            className="p-1 hover:bg-slate-100 text-slate-600"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      </td>
                      <td className="p-3 text-right font-mono">₹{item.mrp.toFixed(2)}</td>
                      <td className="p-3 text-right font-extrabold text-slate-900 font-mono">
                        ₹{(item.quantity * item.mrp).toFixed(2)}
                      </td>
                      <td className="p-3 text-center">
                        <button
                          type="button"
                          onClick={() => removeItem(idx)}
                          className="p-1 text-slate-400 hover:text-rose-600"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right: Checkout Sidebar Panels */}
        <div className="lg:col-span-5 space-y-4">
          
          {/* Panel 1: Customer & WhatsApp Details (Matching Image 1) */}
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-4 space-y-3">
            <div className="flex items-center justify-between pb-1">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                <User className="w-3.5 h-3.5 text-[#009688]" />
                <span>Customer & WhatsApp Details</span>
              </div>
              <span className="text-[11px] text-slate-400">Needed for WhatsApp Bill</span>
            </div>

            {/* Row 1: Name and WhatsApp Mobile */}
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                  Customer / Patient Name
                </label>
                <input
                  type="text"
                  value={customerName}
                  onChange={e => setCustomerName(e.target.value)}
                  placeholder="Walk-in Customer"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs bg-slate-50/40 hover:bg-white focus:bg-white focus:outline-[#009688]"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-600 block mb-1 flex items-center gap-1">
                  <Phone className="w-3 h-3 text-[#009688]" />
                  <span>WhatsApp Mobile (Optional)</span>
                </label>
                <input
                  type="tel"
                  value={customerPhone}
                  onChange={e => handlePhoneChange(e.target.value)}
                  placeholder="10-digit Mobile (e.g. 9876543210)"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs bg-slate-50/40 hover:bg-white focus:bg-white font-mono focus:outline-[#009688]"
                />
              </div>
            </div>

            {/* Row 2: Doctor and Doctor Reg Number */}
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                  Prescribing Doctor
                </label>
                <input
                  type="text"
                  value={doctorName}
                  onChange={e => setDoctorName(e.target.value)}
                  placeholder="Dr. Name (if Rx)"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs bg-slate-50/40 hover:bg-white focus:bg-white focus:outline-[#009688]"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                  Doctor Reg. Number
                </label>
                <input
                  type="text"
                  value={doctorRegNo}
                  onChange={e => setDoctorRegNo(e.target.value)}
                  placeholder="State Medical Council Reg"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs bg-slate-50/40 hover:bg-white focus:bg-white focus:outline-[#009688]"
                />
              </div>
            </div>

            {/* Pharmacist verification check */}
            <div className="p-2.5 rounded-xl border border-slate-200/80 bg-slate-50/60">
              <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={prescriptionVerified}
                  disabled={!canVerifyPrescription}
                  onChange={e => setPrescriptionVerified(e.target.checked)}
                  className="rounded text-[#009688] focus:ring-[#009688] cursor-pointer"
                />
                <span className="text-[11px] font-medium leading-tight text-slate-700">
                  {canVerifyPrescription
                    ? `Prescription inspected by ${activeStaff.name} (Reg. ${activeStaff.pharmacistRegNo})`
                    : 'A registered pharmacist must sign in to verify prescription medicines.'}
                </span>
              </label>
            </div>
          </div>

          {/* Panel 2: Payment Mode (Matching Image 1) */}
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800">Payment Mode</span>
              <span className="text-xs font-bold font-mono text-[#00897b]">
                UPI ID: {settings.upiId || 'Not configured'}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'Cash', label: 'Cash', icon: Wallet },
                { id: 'UPI / QR', label: 'UPI / QR', icon: Smartphone },
                { id: 'Card POS', label: 'External card terminal', icon: CreditCard },
              ].map(m => {
                const Icon = m.icon;
                const isSelected = paymentMode === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      setPaymentMode(m.id as PaymentMethod);
                      setExternalPaymentRef('');
                    }}
                    className={`py-3 px-2 rounded-xl border text-center flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      isSelected
                        ? 'border-[#00897b] bg-[#e0f2f1]/50 text-[#00796b] font-bold shadow-2xs ring-1 ring-[#00897b]'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 font-medium'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="text-[11px]">{m.label}</span>
                  </button>
                );
              })}
            </div>
            {paymentMode === 'Card POS' && (
              <div className="space-y-1.5">
                <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2">
                  This app is not connected to a card terminal. Complete the charge on your terminal and verify it before recording the sale.
                </p>
                <label htmlFor="card-transaction-reference" className="block text-[11px] font-semibold text-slate-700">
                  Card transaction reference *
                </label>
                <input
                  id="card-transaction-reference"
                  value={externalPaymentRef}
                  onChange={event => setExternalPaymentRef(event.target.value)}
                  minLength={4}
                  maxLength={50}
                  autoComplete="off"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono"
                  placeholder="Enter the reference from the card terminal"
                />
              </div>
            )}
          </div>

          {/* Panel 3: Extra Customer Discount (Matching Image 1 & Image 2) */}
          <div className="bg-[#fffdf5] rounded-2xl border border-[#ffe082]/80 shadow-2xs p-4 space-y-3">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-[#ffa000] text-white flex items-center justify-center shrink-0 shadow-xs">
                  <Gift className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 text-xs">Extra Customer Discount</h4>
                  <p className="text-[11px] text-slate-500">
                    Apply courtesy or custom concession to the customer
                  </p>
                </div>
              </div>

              {/* Flat vs Pct toggle button */}
              <div className="flex items-center bg-white border border-slate-200 rounded-xl p-0.5 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setDiscountType('flat')}
                  className={`px-2.5 py-1 rounded-lg transition-all ${
                    discountType === 'flat'
                      ? 'bg-[#e67e22] text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  ₹ Flat
                </button>
                <button
                  type="button"
                  onClick={() => setDiscountType('pct')}
                  className={`px-2.5 py-1 rounded-lg transition-all ${
                    discountType === 'pct'
                      ? 'bg-[#e67e22] text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  % Pct
                </button>
              </div>
            </div>

            {/* Quick Concession Preset Buttons */}
            <div className="flex items-center gap-1.5 pt-1">
              {[10, 20, 50, 100].map(amt => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => handleQuickPreset(amt)}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition-all shadow-2xs"
                >
                  ₹{amt}
                </button>
              ))}

              <button
                type="button"
                onClick={handleRoundOffPreset}
                className="px-3 py-1.5 rounded-xl border border-[#009688]/60 bg-white hover:bg-[#e0f2f1] text-[#00796b] text-xs font-bold transition-all shadow-2xs ml-auto"
              >
                Round Off
              </button>
            </div>

            {/* Concession Inputs */}
            <div className="grid grid-cols-2 gap-2.5 pt-1">
              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                  Concession Amount {discountType === 'flat' ? '(₹)' : '(%)'}
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-xs font-bold text-slate-400">
                    {discountType === 'flat' ? '₹' : '%'}
                  </span>
                  <input
                    type="number"
                    min="0"
                    max={discountType === 'pct' ? 100 : subtotal}
                    step="any"
                    value={concessionAmount}
                    onChange={e => setConcessionAmount(e.target.value)}
                    placeholder="e.g. 25"
                    className="w-full pl-7 pr-3 py-2 border border-slate-200 bg-white rounded-xl text-xs font-mono font-bold focus:outline-[#e67e22]"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                  Concession Reason / Note
                </label>
                <input
                  type="text"
                  value={concessionReason}
                  onChange={e => setConcessionReason(e.target.value)}
                  placeholder="e.g. Senior Citizen, Loyal Patient"
                  className="w-full px-3 py-2 border border-slate-200 bg-white rounded-xl text-xs focus:outline-[#e67e22]"
                />
              </div>
            </div>
          </div>

          {/* Panel 4: Dark Navy Bill Generation & Summary Box (Matching Image 2) */}
          <div className="bg-[#0b1528] text-white rounded-2xl p-5 border border-slate-800 shadow-xl space-y-4">
            
            {/* Financial Lines */}
            <div className="space-y-2 text-xs text-slate-300">
              <div className="flex justify-between items-center">
                <span>Subtotal (MRP Gross)</span>
                <span className="font-mono text-sm font-semibold text-white">
                  ₹{subtotal.toFixed(2)}
                </span>
              </div>

              <div className="flex justify-between items-center text-[#00e676]">
                <span>Discount Allowed</span>
                <span className="font-mono text-sm font-semibold">
                  - ₹{totalDiscountAllowed.toFixed(2)}
                </span>
              </div>

              <div className="flex justify-between items-center text-slate-300">
                <span>GST (CGST + SGST)</span>
                <span className="font-mono text-sm font-semibold">
                  + ₹{totalGst.toFixed(2)}
                </span>
              </div>
            </div>

            {/* Divider */}
            <div className="border-t border-slate-800 pt-3 flex items-baseline justify-between">
              <span className="text-sm font-bold tracking-wider uppercase text-white">
                NET PAYABLE
              </span>
              <span className="text-3xl font-extrabold text-[#00e5ff] font-mono tracking-tight">
                ₹{netPayable.toFixed(2)}
              </span>
            </div>

            {/* Bill Generation Method Section */}
            <div className="space-y-2.5 pt-1">
              <div className="text-center text-[10px] font-bold uppercase tracking-wider text-slate-400">
                SELECT BILL GENERATION METHOD:
              </div>

              {/* Two buttons row */}
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => handleCompleteSaleAction('printer')}
                  disabled={isProcessing}
                  className="py-2.5 px-3 rounded-xl bg-[#1a237e] hover:bg-[#283593] text-white text-xs font-bold transition-all shadow-md flex items-center justify-center gap-1.5 cursor-pointer active:scale-98 disabled:opacity-50"
                  title="Give invoice via printer [F9]"
                >
                  <Printer className="w-4 h-4" />
                  <span>Give via Printer</span>
                  <span className="text-[10px] bg-white/20 px-1 py-0.2 rounded font-mono">F9</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleCompleteSaleAction('whatsapp')}
                  disabled={isProcessing}
                  className="py-2.5 px-3 rounded-xl bg-[#004d40] hover:bg-[#00695c] text-[#a7f3d0] hover:text-white text-xs font-bold transition-all shadow-md flex items-center justify-center gap-1.5 cursor-pointer active:scale-98 disabled:opacity-50"
                  title="Direct WhatsApp bill without download or dragging [F10]"
                >
                  <Share2 className="w-4 h-4" />
                  <span>Direct WhatsApp</span>
                  <span className="text-[10px] bg-white/20 px-1 py-0.2 rounded font-mono">F10</span>
                </button>
              </div>

              {/* Full-width complete button */}
              <button
                type="button"
                onClick={() => handleCompleteSaleAction('review')}
                disabled={isProcessing}
                className="w-full py-3 bg-[#132238] hover:bg-[#1a2f4d] border border-slate-700/80 text-slate-200 hover:text-white font-bold rounded-xl text-xs sm:text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-98 disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4 text-[#00e676]" />
                <span>Complete Sale & Review Invoice</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* DIRECT WHATSAPP NUMBER MODAL (NO DOWNLOADS, NO DRAGGING) */}
      {showWhatsAppPrompt && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-4 bg-emerald-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Share2 className="w-5 h-5" />
                <h3 className="font-bold text-sm">Direct WhatsApp Bill Dispatch</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowWhatsAppPrompt(false)}
                className="p-1 hover:bg-emerald-700 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 leading-relaxed">
                Enter the customer's 10-digit WhatsApp number. The complete itemized bill will open directly in their WhatsApp chat — <strong>no downloading files and no dragging required!</strong>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Customer WhatsApp Mobile Number
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-xs font-bold text-slate-400 font-mono">+91</span>
                  <input
                    ref={whatsAppPromptInputRef}
                    type="tel"
                    autoFocus
                    placeholder="Enter 10-digit number (e.g. 9845012345)"
                    value={tempWhatsAppNumber}
                    onChange={e => setTempWhatsAppNumber(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleConfirmWhatsAppPrompt();
                    }}
                    className="w-full pl-12 pr-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono font-bold text-slate-800"
                  />
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowWhatsAppPrompt(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmWhatsAppPrompt}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer flex items-center gap-1.5 active:scale-95"
                >
                  <Share2 className="w-4 h-4" />
                  <span>Send Directly 📲</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
