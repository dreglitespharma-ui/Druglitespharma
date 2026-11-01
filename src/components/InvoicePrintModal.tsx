import React, { useRef, useState } from 'react';
import { X, Printer, Share2, Download, Check, ShieldCheck, QrCode, FileText } from 'lucide-react';
import { SaleBill, StoreSettings } from '../types/pharmacy';
import { downloadInvoicePDF } from '../utils/pdfInvoice';
import { sendDirectWhatsAppInvoice } from '../utils/whatsappInvoice';

interface InvoicePrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  bill: SaleBill | null;
  settings: StoreSettings;
}

export const InvoicePrintModal: React.FC<InvoicePrintModalProps> = ({
  isOpen,
  onClose,
  bill,
  settings,
}) => {
  const [printFormat, setPrintFormat] = useState<'thermal' | 'a4'>('thermal');
  const [pdfDownloaded, setPdfDownloaded] = useState<boolean>(false);
  const [whatsAppPhone, setWhatsAppPhone] = useState<string>(bill?.customerPhone || '');
  const [whatsAppStatus, setWhatsAppStatus] = useState<string | null>(null);
  const printAreaRef = useRef<HTMLDivElement | null>(null);

  if (!isOpen || !bill) return null;

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPDF = () => {
    downloadInvoicePDF(bill, settings);
    setPdfDownloaded(true);
    setTimeout(() => setPdfDownloaded(false), 3000);
  };

  const handleDirectWhatsAppShare = (overridePhone?: string) => {
    const target = overridePhone || whatsAppPhone || bill.customerPhone || '';
    const result = sendDirectWhatsAppInvoice(bill, settings, target);
    if (!result.success) {
      setWhatsAppStatus(`⚠️ ${result.error || 'Please enter valid 10-digit mobile number'}`);
      return;
    }
    setWhatsAppStatus(`✓ WhatsApp opened for +${result.phone}! Digital bill sent directly without downloads.`);
    setTimeout(() => setWhatsAppStatus(null), 6000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[95vh]">
        {/* Header */}
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center">
              <Printer className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-sm">Pharmacy Tax Invoice</h3>
              <p className="text-[11px] text-slate-500">Bill #{bill.billNumber}</p>
            </div>
          </div>

          {/* Format Switcher */}
          <div className="flex items-center gap-2">
            <div className="bg-slate-200/80 p-0.5 rounded-lg flex text-xs font-semibold">
              <button
                onClick={() => setPrintFormat('thermal')}
                className={`px-3 py-1 rounded-md transition-colors ${
                  printFormat === 'thermal' ? 'bg-white text-slate-800 shadow-xs' : 'text-slate-600'
                }`}
              >
                POS Thermal (80mm)
              </button>
              <button
                onClick={() => setPrintFormat('a4')}
                className={`px-3 py-1 rounded-md transition-colors ${
                  printFormat === 'a4' ? 'bg-white text-slate-800 shadow-xs' : 'text-slate-600'
                }`}
              >
                A4 Tax Invoice
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors ml-2"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Direct WhatsApp Dispatch Banner (Zero Download, Zero Dragging) */}
        <div className="bg-emerald-50/90 border-b border-emerald-200/80 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="font-bold text-emerald-950 flex items-center gap-1.5">
              <Share2 className="w-3.5 h-3.5 text-emerald-600" />
              Direct WhatsApp Dispatch:
            </span>
            <input
              type="tel"
              placeholder="Enter customer WhatsApp number (e.g. 9845012345)"
              value={whatsAppPhone}
              onChange={e => setWhatsAppPhone(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleDirectWhatsAppShare();
              }}
              className="bg-white px-2.5 py-1 border border-emerald-300 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500 w-56 font-mono"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleDirectWhatsAppShare()}
              className="px-3.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs transition-all shadow-xs cursor-pointer flex items-center gap-1.5 active:scale-95"
            >
              <span>Send Directly to WhatsApp</span>
              <span className="text-[10px] bg-emerald-800/40 px-1 py-0.2 rounded font-mono">📲 Direct</span>
            </button>
          </div>
        </div>

        {whatsAppStatus && (
          <div className="px-4 py-1.5 bg-emerald-100 text-emerald-900 text-xs font-semibold border-b border-emerald-200 flex items-center justify-between">
            <span>{whatsAppStatus}</span>
            <button onClick={() => setWhatsAppStatus(null)} className="text-emerald-700 hover:text-emerald-900 font-bold ml-2">×</button>
          </div>
        )}

        {/* Printable Preview Body */}
        <div className="p-6 overflow-y-auto bg-slate-100/60 flex justify-center">
          {printFormat === 'thermal' ? (
            /* 80mm POS Thermal Receipt Preview */
            <div 
              ref={printAreaRef}
              className="w-80 bg-white p-5 rounded-lg shadow-sm border border-slate-200 font-mono text-xs text-slate-800 space-y-3"
            >
              {/* Receipt Header */}
              <div className="text-center pb-2 border-b border-dashed border-slate-300">
                <div className="font-extrabold text-sm uppercase tracking-wider text-slate-900">{settings.storeName}</div>
                <div className="text-[10px] text-slate-600">{settings.tagline}</div>
                <div className="text-[10px] text-slate-500 mt-1">{settings.addressLine1}, {settings.city}</div>
                <div className="text-[10px] text-slate-500">Ph: {settings.phone}</div>
                {Boolean(settings.dl20b || settings.dl21b) && (
                  <div className="text-[9px] text-slate-600 mt-1 font-bold">
                    {[settings.dl20b && `20B: ${settings.dl20b}`, settings.dl21b && `21B: ${settings.dl21b}`].filter(Boolean).join(' / ')}
                  </div>
                )}
                {settings.gstin && <div className="text-[9px] text-slate-600 font-bold">GSTIN: {settings.gstin}</div>}
              </div>

              {/* Bill Details */}
              <div className="text-[10px] space-y-0.5 border-b border-dashed border-slate-300 pb-2">
                <div className="flex justify-between">
                  <span>INVOICE:</span>
                  <span className="font-bold">{bill.billNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span>DATE:</span>
                  <span>{bill.timestamp}</span>
                </div>
                <div className="flex justify-between">
                  <span>PATIENT:</span>
                  <span className="font-bold">{bill.customerName || 'Walk-in Retail'}</span>
                </div>
                {bill.customerPhone && (
                  <div className="flex justify-between">
                    <span>PHONE:</span>
                    <span>{bill.customerPhone}</span>
                  </div>
                )}
                {bill.doctorName && (
                  <div className="flex justify-between">
                    <span>DOCTOR:</span>
                    <span>{bill.doctorName}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>CASHIER:</span>
                  <span>{bill.cashierName}</span>
                </div>
                {bill.isPrescriptionVerified && (
                  <div className="flex justify-between">
                    <span>PHARMACIST:</span>
                    <span>{bill.pharmacistName} ({bill.pharmacistRegNo})</span>
                  </div>
                )}
              </div>

              {/* Items Table */}
              <div className="space-y-1.5 border-b border-dashed border-slate-300 pb-2">
                <div className="flex justify-between text-[10px] font-bold border-b border-slate-200 pb-1">
                  <span>ITEM / BATCH / EXP</span>
                  <span>QTY / PACK OR UNIT x PRICE</span>
                  <span>TOTAL</span>
                </div>
                {bill.items.map((it, idx) => (
                  <div key={idx} className="text-[10px]">
                    <div className="font-bold flex items-center justify-between">
                      <span>{it.brandName}</span>
                      <span>₹{(it.quantity * it.mrp).toFixed(2)}</span>
                    </div>
                    <div className="text-[9px] text-slate-500 flex justify-between">
                      <span>HSN:{it.hsnCode || 'Not provided'} B:{it.batchNumber} E:{it.expiryDate}</span>
                      <span>
                        {it.quantity} {it.dispenseMode === 'loose'
                          ? (it.dosageForm === 'Tablet' ? 'tabs' : it.dosageForm === 'Capsule' ? 'capsules' : 'units')
                          : (it.packUnit || 'pack')} x {it.mrp.toFixed(2)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Bill Totals */}
              <div className="text-[10px] space-y-1 border-b border-dashed border-slate-300 pb-2">
                <div className="flex justify-between">
                  <span>Subtotal MRP:</span>
                  <span>₹{bill.subtotal.toFixed(2)}</span>
                </div>
                {bill.totalDiscount > 0 && (
                  <div className="flex justify-between text-emerald-700 font-bold">
                    <span>Discount:</span>
                    <span>-₹{bill.totalDiscount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>Taxable Value:</span>
                  <span>₹{bill.taxableAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>CGST:</span>
                  <span>₹{bill.cgstAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>SGST:</span>
                  <span>₹{bill.sgstAmount.toFixed(2)}</span>
                </div>
                {bill.roundOff !== 0 && (
                  <div className="flex justify-between">
                    <span>Round Off:</span>
                    <span>{bill.roundOff > 0 ? `+₹${bill.roundOff.toFixed(2)}` : `-₹${Math.abs(bill.roundOff).toFixed(2)}`}</span>
                  </div>
                )}
                <div className="flex justify-between text-xs font-extrabold pt-1 border-t border-slate-300 text-slate-900">
                  <span>NET PAYABLE:</span>
                  <span className="text-sm">₹{bill.netPayable.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-[9px] text-slate-500 pt-0.5">
                  <span>PAYMENT MODE:</span>
                  <span className="font-bold uppercase text-slate-700">{bill.paymentMethod}</span>
                </div>
                {bill.paymentRef && (
                  <div className="text-[9px] text-slate-500">Ref: {bill.paymentRef}</div>
                )}
              </div>

              {/* Footer */}
              <div className="text-center text-[9px] text-slate-500 pt-1 space-y-0.5">
                <div>
                  {bill.isPrescriptionVerified
                    ? `Prescription checked by ${bill.pharmacistName} (Reg. ${bill.pharmacistRegNo}).`
                    : 'Pharmacist review is not recorded on this invoice.'}
                </div>
                <div>Please retain this invoice for your records.</div>
                <div className="font-bold text-slate-700">*** GET WELL SOON ***</div>
              </div>
            </div>
          ) : (
            /* A4 Full GST Tax Invoice Preview */
            <div className="w-full bg-white p-6 rounded-lg shadow-sm border border-slate-200 text-xs text-slate-800 space-y-4 font-sans">
              <div className="flex justify-between items-start border-b-2 border-slate-800 pb-3">
                <div>
                  <h2 className="text-base font-extrabold text-slate-900 uppercase tracking-tight">{settings.storeName}</h2>
                  <p className="text-[11px] text-slate-600">
                    {[settings.addressLine1, settings.addressLine2, settings.city, settings.state, settings.pincode].filter(Boolean).join(', ')}
                  </p>
                  {(settings.phone || settings.email) && (
                    <p className="text-[11px] text-slate-600">
                      {[settings.phone && `Phone: ${settings.phone}`, settings.email && `Email: ${settings.email}`].filter(Boolean).join(' | ')}
                    </p>
                  )}
                  {([settings.dl20b && `Form 20B: ${settings.dl20b}`, settings.dl21b && `Form 21B: ${settings.dl21b}`, settings.gstin && `GSTIN: ${settings.gstin}`].filter(Boolean).length > 0) && (
                    <p className="text-[11px] font-bold text-emerald-800 mt-1">
                      {[settings.dl20b && `Form 20B: ${settings.dl20b}`, settings.dl21b && `Form 21B: ${settings.dl21b}`, settings.gstin && `GSTIN: ${settings.gstin}`].filter(Boolean).join(' | ')}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <span className="px-2 py-0.5 bg-slate-900 text-white font-bold text-[10px] rounded uppercase tracking-wider block mb-1">
                    {settings.gstin ? 'RETAIL TAX INVOICE' : 'RETAIL SALES INVOICE'}
                  </span>
                  <p className="font-mono font-bold text-slate-900 text-sm">#{bill.billNumber}</p>
                  <p className="text-slate-500 text-[11px]">{bill.timestamp}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Billed To (Patient)</span>
                  <p className="font-bold text-slate-800">{bill.customerName || 'Walk-in Retail Customer'}</p>
                  <p className="text-slate-600">Mobile: {bill.customerPhone || 'N/A'}</p>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Doctor / Prescriber</span>
                  <p className="font-bold text-slate-800">{bill.doctorName || 'Self / Over-The-Counter'}</p>
                  <p className="text-[11px] text-emerald-700 font-medium">
                    {bill.isPrescriptionVerified
                      ? `✓ Verified by ${bill.pharmacistName} (Reg. ${bill.pharmacistRegNo})`
                      : 'Pharmacist review not recorded'}
                  </p>
                </div>
              </div>

              {/* Table */}
              <table className="w-full text-left border-collapse border border-slate-200 text-xs">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-200 font-semibold text-slate-700">
                    <th className="p-2 border-r border-slate-200">#</th>
                    <th className="p-2 border-r border-slate-200">Medicine & Generic Name</th>
                    <th className="p-2 border-r border-slate-200 font-mono">HSN</th>
                    <th className="p-2 border-r border-slate-200">Batch</th>
                    <th className="p-2 border-r border-slate-200">Exp</th>
                    <th className="p-2 border-r border-slate-200 text-center">Qty / Pack or Unit</th>
                    <th className="p-2 border-r border-slate-200 text-right">Price / Pack or Unit</th>
                    <th className="p-2 border-r border-slate-200 text-right">Disc %</th>
                    <th className="p-2 border-r border-slate-200 text-right">GST %</th>
                    <th className="p-2 text-right">Amount (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  {bill.items.map((it, idx) => (
                    <tr key={idx} className="border-b border-slate-200 hover:bg-slate-50/50">
                      <td className="p-2 border-r border-slate-200 text-slate-500">{idx + 1}</td>
                      <td className="p-2 border-r border-slate-200">
                        <div className="font-bold text-slate-800">{it.brandName} ({it.strength})</div>
                        <div className="text-[10px] text-slate-500">{it.genericName}</div>
                      </td>
                      <td className="p-2 border-r border-slate-200 font-mono font-bold text-slate-700">{it.hsnCode || 'Not provided'}</td>
                      <td className="p-2 border-r border-slate-200 font-mono">{it.batchNumber}</td>
                      <td className="p-2 border-r border-slate-200 font-mono">{it.expiryDate}</td>
                      <td className="p-2 border-r border-slate-200 text-center font-bold">
                        {it.quantity} {it.dispenseMode === 'loose'
                          ? (it.dosageForm === 'Tablet' ? 'tabs' : it.dosageForm === 'Capsule' ? 'capsules' : 'units')
                          : (it.packUnit || 'pack')}
                      </td>
                      <td className="p-2 border-r border-slate-200 text-right">₹{it.mrp.toFixed(2)}</td>
                      <td className="p-2 border-r border-slate-200 text-right">{it.discountPercent}%</td>
                      <td className="p-2 border-r border-slate-200 text-right">{it.gstRate}%</td>
                      <td className="p-2 text-right font-bold">₹{(it.quantity * it.mrp * (1 - it.discountPercent / 100)).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Summary Bottom */}
              <div className="flex justify-between items-start pt-2">
                <div className="text-[11px] text-slate-500 max-w-xs space-y-1">
                  <p>Invoice details are based on the records entered by the store.</p>
                  <p className="font-bold text-slate-700">Dispensed by: {bill.cashierName}</p>
                </div>
                <div className="w-64 space-y-1.5 text-xs">
                  <div className="flex justify-between text-slate-600">
                    <span>Subtotal MRP:</span>
                    <span>₹{bill.subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Discount:</span>
                    <span>-₹{bill.totalDiscount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Taxable Amount:</span>
                    <span>₹{bill.taxableAmount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>CGST + SGST:</span>
                    <span>₹{(bill.cgstAmount + bill.sgstAmount).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-extrabold text-sm border-t border-slate-300 pt-1 text-slate-900">
                    <span>NET PAYABLE:</span>
                    <span className="text-emerald-700">₹{bill.netPayable.toFixed(2)}</span>
                  </div>
                  <div className="text-[11px] text-slate-500 text-right">
                    Paid via {bill.paymentMethod}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleDirectWhatsAppShare()}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-95"
              title="Send digital tax invoice directly to customer on WhatsApp (Zero downloads / zero dragging)"
            >
              <Share2 className="w-4 h-4" />
              <span>Send WhatsApp Directly</span>
            </button>

            <button
              onClick={handleDownloadPDF}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#00796b] hover:bg-[#00695c] text-white text-xs font-bold transition-all shadow-xs cursor-pointer"
              title="Download Tax Invoice as PDF"
            >
              {pdfDownloaded ? <Check className="w-4 h-4" /> : <Download className="w-4 h-4" />}
              <span>{pdfDownloaded ? 'PDF Downloaded' : 'Download PDF Invoice'}</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold transition-all shadow-xs cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Print Invoice</span>
            </button>
            <button
              onClick={onClose}
              className="px-3.5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
