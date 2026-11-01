import React, { useState } from 'react';
import { FileText, ShieldCheck, Printer, Search, Download, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { SaleBill, StoreSettings } from '../../types/pharmacy';

interface PrescriptionLogViewProps {
  bills: SaleBill[];
  settings: StoreSettings;
}

export const PrescriptionLogView: React.FC<PrescriptionLogViewProps> = ({ bills, settings }) => {
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Extract all dispensed items from bills that required prescription
  const prescriptionDispenses = bills.flatMap(bill => {
    return bill.items
      .filter(item => item.isScheduleDrug || bill.doctorName)
      .map(item => ({
        billId: bill.billNumber,
        timestamp: bill.timestamp,
        patientName: bill.customerName || 'Walk-in Customer',
        patientPhone: bill.customerPhone || 'N/A',
        doctorName: bill.doctorName || 'Consulting Physician',
        medicineName: item.brandName,
        genericName: item.genericName,
        dosageForm: item.dosageForm,
        strength: item.strength,
        batchNumber: item.batchNumber,
        expiryDate: item.expiryDate,
        quantity: item.quantity,
        pharmacistName: bill.cashierName,
        isVerified: bill.isPrescriptionVerified,
      }));
  });

  const filtered = prescriptionDispenses.filter(p => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      (p.patientName || '').toLowerCase().includes(q) ||
      (p.doctorName || '').toLowerCase().includes(q) ||
      (p.medicineName || '').toLowerCase().includes(q) ||
      (p.batchNumber || '').toLowerCase().includes(q) ||
      (p.billId || '').toLowerCase().includes(q)
    );
  });

  const handlePrintRegister = () => {
    window.print();
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      {/* Header */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-slate-800">Prescription & Dispensing Register</h2>
            <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
              Schedule H & H1 Statutory Log
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Rule 65 Drugs and Cosmetics Rules Mandatory Register for Drug Inspector Audit
          </p>
        </div>

        <button
          onClick={handlePrintRegister}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-98"
        >
          <Printer className="w-4 h-4" />
          <span>Print Statutory Register</span>
        </button>
      </div>

      {/* Statutory Rule Banner (Matching Video 2:06-2:08) */}
      <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-xl flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
        <div className="text-xs text-emerald-900 leading-relaxed">
          <b className="font-bold">Statutory Pharmacy Compliance (Rule 65):</b> Under Rule 65 of the Drugs and Cosmetics Rules, sales of Schedule H & H1 formulations must record the Prescribing Medical Practitioner, Patient Details, Formulation Batch Number, Dispensing Date, and Registered Pharmacist signature. Retain records for a minimum of 2 years.
        </div>
      </div>

      {/* Search Bar */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search patient, doctor, medicine, or batch in prescription log..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-emerald-600"
          />
        </div>
        <span className="text-xs font-semibold text-slate-500">
          Total Dispenses: <b className="text-slate-800">{filtered.length}</b>
        </span>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <FileText className="w-10 h-10 mx-auto text-slate-300 mb-2" />
            <p className="text-sm font-bold text-slate-700">No prescription records found</p>
            <p className="text-xs text-slate-400 mt-1">
              Sales involving Schedule H/H1 medicines will be automatically logged here.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 font-semibold text-slate-600 uppercase text-[10px] tracking-wider">
                  <th className="p-3">Date & Time</th>
                  <th className="p-3">Bill ID</th>
                  <th className="p-3">Patient Name & Phone</th>
                  <th className="p-3">Prescribing Doctor</th>
                  <th className="p-3">Medicine & Salt</th>
                  <th className="p-3">Batch & Expiry</th>
                  <th className="p-3 text-center">Qty Dispensed</th>
                  <th className="p-3 text-center">Pharmacist Sign</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                {filtered.map((item, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/60">
                    <td className="p-3 text-slate-500 text-[11px] whitespace-nowrap">
                      {item.timestamp}
                    </td>
                    <td className="p-3 font-mono font-bold text-slate-800">
                      {item.billId}
                    </td>
                    <td className="p-3">
                      <div className="font-bold text-slate-900">{item.patientName}</div>
                      <div className="text-[10px] text-slate-500 font-mono">{item.patientPhone || 'Walk-in'}</div>
                    </td>
                    <td className="p-3 font-semibold text-slate-800">
                      {item.doctorName}
                    </td>
                    <td className="p-3">
                      <div className="font-bold text-slate-900">{item.medicineName} ({item.strength})</div>
                      <div className="text-[10px] text-slate-500">{item.genericName}</div>
                    </td>
                    <td className="p-3 font-mono text-[11px]">
                      <span className="font-bold text-slate-800">{item.batchNumber}</span>
                      <span className="text-slate-400 block">{item.expiryDate}</span>
                    </td>
                    <td className="p-3 text-center font-bold text-slate-900">
                      {item.quantity}
                    </td>
                    <td className="p-3 text-center">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                        <CheckCircle2 className="w-3 h-3" />
                        Verified ({item.pharmacistName.split(' ')[0]})
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
