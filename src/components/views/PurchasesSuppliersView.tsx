import React, { useState } from 'react';
import { 
  Truck, 
  Plus, 
  Building2, 
  Phone, 
  Receipt, 
  X, 
  CheckCircle2, 
  Clock, 
  ShieldCheck, 
  Boxes, 
  Calendar,
  FileSpreadsheet,
  AlertCircle,
  Sparkles,
  Bot
} from 'lucide-react';
import { Supplier, PurchaseInward, InwardItem, DosageForm, MedicineCategory, Medicine } from '../../types/pharmacy';
import { sound } from '../../utils/sound';
import { AIService } from '../../utils/aiService';

interface PurchasesSuppliersViewProps {
  suppliers: Supplier[];
  purchases: PurchaseInward[];
  medicines?: Medicine[];
  onAddSupplier: (sup: Supplier) => void;
  onAddPurchaseInward: (inward: PurchaseInward) => void;
  onOpenAIInvoiceScanner?: (initialImage?: string) => void;
}

export const PurchasesSuppliersView: React.FC<PurchasesSuppliersViewProps> = ({
  suppliers,
  purchases,
  medicines = [],
  onAddSupplier,
  onAddPurchaseInward,
  onOpenAIInvoiceScanner,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'inward' | 'suppliers'>('inward');
  const [isAddSupplierOpen, setIsAddSupplierOpen] = useState<boolean>(false);
  const [isInwardModalOpen, setIsInwardModalOpen] = useState<boolean>(false);

  // Supplier Form State
  const [firmName, setFirmName] = useState<string>('');
  const [contactPerson, setContactPerson] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [gstin, setGstin] = useState<string>('');
  const [drugLicenseNo, setDrugLicenseNo] = useState<string>('');
  const [creditDays, setCreditDays] = useState<number>(0);
  const [address, setAddress] = useState<string>('');
  const [city, setCity] = useState<string>('');
  const [state, setState] = useState<string>('');

  const [selectedSupplierId, setSelectedSupplierId] = useState<string>(suppliers[0]?.id || '');
  const [supplierInvoiceNo, setSupplierInvoiceNo] = useState<string>('');
  const [invoiceDate, setInvoiceDate] = useState<string>('');
  const [paymentStatus, setPaymentStatus] = useState<'Paid' | 'Credit Pending' | ''>('');
  const [billImageUrl, setBillImageUrl] = useState<string>('');
  const [billImageName, setBillImageName] = useState<string>('');
  const [previewLightbox, setPreviewLightbox] = useState<{ url: string; title: string } | null>(null);
  const [isSavingInward, setIsSavingInward] = useState<boolean>(false);

  const handleInvoiceFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        alert('Invoice files must be 10 MB or smaller.');
        e.target.value = '';
        return;
      }
      if (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(file.type)) {
        alert('Invoice files must be JPG, PNG, WebP, or PDF.');
        e.target.value = '';
        return;
      }
      setBillImageName(file.name);
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setBillImageUrl(event.target.result as string);
          sound.playBarcodeBeep();
        }
      };
      reader.onerror = () => {
        console.error('[Purchases] Failed to read supplier invoice file.');
        alert('Could not read the selected invoice. Please try again.');
      };
      reader.readAsDataURL(file);
    }
  };

  const [isAiAutofilling, setIsAiAutofilling] = useState<boolean>(false);
  const [aiAutofillMessage, setAiAutofillMessage] = useState<string | null>(null);

  const handleAutofillWithAI = async (providedImage?: string) => {
    const targetImage = providedImage || billImageUrl;
    if (!targetImage) {
      if (onOpenAIInvoiceScanner) {
        onOpenAIInvoiceScanner();
      } else {
        alert('Please upload or select an invoice photo first.');
      }
      return;
    }

    setIsAiAutofilling(true);
    setAiAutofillMessage('Reading invoice items with Gemini 3.8 Flash Vision OCR...');
    sound.playKeyPress();

    try {
      const parsed = await AIService.parseInvoice(targetImage, 'image/jpeg', medicines);
      if (parsed && parsed.items && parsed.items.length > 0) {
        // Match supplier if found
        const matchedSup = suppliers.find(s => 
          s.firmName.toLowerCase().includes((parsed.supplier.firmName || '').toLowerCase()) ||
          (parsed.supplier.firmName && parsed.supplier.firmName.toLowerCase().includes(s.firmName.toLowerCase()))
        );
        if (matchedSup) {
          setSelectedSupplierId(matchedSup.id);
        }

        if (parsed.supplier.invoiceNo) {
          setSupplierInvoiceNo(parsed.supplier.invoiceNo);
        }
        if (parsed.supplier.invoiceDate) {
          setInvoiceDate(parsed.supplier.invoiceDate);
        }

        const formattedItems: InwardItem[] = parsed.items.map(it => {
          const packSize = Number(it.packSize) || 0;
          const freeQty = Number(it.freeQty) || 0;
          const quantity = Number(it.quantity) || 0;
          const purchaseCost = Number(it.purchaseCost) || 0;
          const sellingMrp = Number(it.sellingMrp) || 0;
          const unitMrp = it.unitMrp || (packSize ? Math.round((sellingMrp / packSize) * 100) / 100 : 0);
          const totalBaseUnits = (quantity + freeQty) * packSize;

          return {
            medicineName: it.medicineName,
            genericName: it.genericName || '',
            dosageForm: it.dosageForm,
            strength: it.strength || '',
            category: it.category,
            batchNumber: it.batchNumber || '',
            mfgDate: it.mfgDate || '',
            expiryDate: it.expiryDate || '',
            quantity,
            freeQty,
            packSize,
            packUnit: it.packUnit || '',
            unitMrp,
            totalBaseUnits,
            purchaseCost,
            sellingMrp,
            gstRate: (it.gstRate !== undefined && !isNaN(Number(it.gstRate))) ? Number(it.gstRate) : 0,
            hsnCode: it.hsnCode || '',
            rackLocation: it.rackLocation || '',
            barcode: '',
          };
        });

        setInwardItems(formattedItems);
        sound.playSuccessChime();
        setAiAutofillMessage(`✓ Auto-filled ${formattedItems.length} items from invoice!`);
        setTimeout(() => setAiAutofillMessage(null), 5000);
      }
    } catch (err: any) {
      sound.playWarningBeep();
      alert(`AI Auto-fill failed: ${err.message}`);
    } finally {
      setIsAiAutofilling(false);
    }
  };

  const [inwardItems, setInwardItems] = useState<InwardItem[]>([]);

  const handleAddLineItem = () => {
    setInwardItems(prev => [
      ...prev,
      {
        medicineName: '',
        genericName: '',
        dosageForm: 'Tablet',
        strength: '',
        category: 'Analgesics & Antipyretics',
        batchNumber: '',
        mfgDate: '',
        expiryDate: '',
        quantity: 0,
        packSize: 0,
        purchaseCost: 0,
        sellingMrp: 0,
        gstRate: 12,
        rackLocation: '',
        barcode: '',
      },
    ]);
  };

  const updateInwardLine = (index: number, field: keyof InwardItem, value: unknown) => {
    setInwardItems(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const removeInwardLine = (index: number) => {
    setInwardItems(prev => prev.filter((_, i) => i !== index));
  };

  // Compute inward totals
  let inwardTaxable = 0;
  let inwardGst = 0;
  inwardItems.forEach(it => {
    const lineCost = (it.quantity || 0) * (it.purchaseCost || 0);
    const lineGst = lineCost * ((it.gstRate || 0) / 100);
    inwardTaxable += lineCost;
    inwardGst += lineGst;
  });
  const inwardNet = inwardTaxable + inwardGst;

  const handleSupplierSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!firmName.trim()) return;

    const newSup: Supplier = {
      id: `sup-${Date.now()}`,
      firmName,
      contactPerson,
      phone,
      gstin,
      drugLicenseNo,
      creditDays: Number(creditDays) || 0,
      address,
      city,
      state,
      totalPurchases: 0,
      outstandingBalance: 0,
    };

    onAddSupplier(newSup);
    sound.playSuccessChime();
    setIsAddSupplierOpen(false);
  };

  const handleInwardSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (inwardItems.length === 0) {
      alert('Please enter at least one medicine item');
      return;
    }

    const sup = suppliers.find(s => s.id === selectedSupplierId);
    if (!sup || !supplierInvoiceNo.trim() || !invoiceDate || !paymentStatus) {
      alert('Select a supplier and enter the actual supplier invoice number, invoice date, and payment status.');
      return;
    }
    if (purchases.some(purchase =>
      purchase.supplierId === sup.id &&
      typeof purchase.supplierInvoiceNo === 'string' &&
      purchase.supplierInvoiceNo.trim().toLowerCase() === supplierInvoiceNo.trim().toLowerCase()
    )) {
      alert('This supplier invoice number has already been recorded.');
      return;
    }

    const invalidItemIndex = inwardItems.findIndex(item =>
      !item.medicineName.trim() ||
      !item.batchNumber.trim() ||
      !item.expiryDate ||
      item.expiryDate < new Date().toISOString().slice(0, 7) ||
      !Number.isInteger(item.packSize) ||
      item.packSize! < 1 ||
      !Number.isInteger(item.quantity) ||
      item.quantity < 1 ||
      item.purchaseCost < 0 ||
      item.sellingMrp < 0
    );
    if (invalidItemIndex !== -1) {
      alert(`Complete the medicine name, batch number, expiry, pack size, quantity, and prices for item ${invalidItemIndex + 1}.`);
      return;
    }

    const newInward: PurchaseInward = {
      id: `inward-${Date.now()}`,
      inwardNumber: `GRN/${new Date().getFullYear()}/${Math.floor(1000 + Math.random() * 9000)}`,
      supplierId: sup.id,
      supplierName: sup.firmName,
      supplierInvoiceNo,
      invoiceDate,
      receivedDate: new Date().toISOString().split('T')[0],
      billImageUrl: billImageUrl || undefined,
      items: inwardItems,
      taxableTotal: inwardTaxable,
      gstTotal: inwardGst,
      netBillAmount: inwardNet,
      paymentStatus,
    };

    setIsSavingInward(true);
    try {
      onAddPurchaseInward(newInward);
      sound.playSuccessChime();
      setBillImageUrl('');
      setBillImageName('');
      setSelectedSupplierId('');
      setSupplierInvoiceNo('');
      setInvoiceDate('');
      setPaymentStatus('');
      setInwardItems([]);
      setIsInwardModalOpen(false);
    } catch (error) {
      console.error('[Purchases] Failed to save supplier invoice:', error);
      alert(error instanceof Error ? error.message : 'Could not save this inward invoice.');
    } finally {
      setIsSavingInward(false);
    }
  };

  const openPurchaseInvoice = async (purchase: PurchaseInward) => {
    if (!purchase.billImageUrl) return;
    setPreviewLightbox({ url: purchase.billImageUrl, title: `Invoice #${purchase.supplierInvoiceNo} - ${purchase.supplierName}` });
  };
  const isPdfPreview = (url: string) =>
    url.startsWith('data:application/pdf') || url.split('?')[0].toLowerCase().endsWith('.pdf');

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      {/* Header */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-800">Purchases & Supplier Inward</h2>
          <p className="text-xs text-slate-500">
            Pharmaceutical Distributor Inward, Batch Registration & Credit Ledger
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsAddSupplierOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold transition-colors"
          >
            <Building2 className="w-3.5 h-3.5 text-slate-500" />
            <span>+ Register Supplier</span>
          </button>

          <button
            onClick={() => setIsInwardModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-98"
          >
            <Truck className="w-4 h-4" />
            <span>+ Manual Bill Entry</span>
          </button>

          {onOpenAIInvoiceScanner && (
            <button
              onClick={() => onOpenAIInvoiceScanner()}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gradient-to-r from-teal-600 via-emerald-600 to-teal-700 hover:from-teal-700 hover:to-emerald-800 text-white text-xs font-bold transition-all shadow-sm cursor-pointer active:scale-98"
              title="Upload invoice photo to auto-fill inventory line items and batches"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-200" />
              <span>✨ AI Invoice Auto-Fill</span>
            </button>
          )}
        </div>
      </div>

      {/* Sub Tabs */}
      <div className="flex gap-2 border-b border-slate-200">
        <button
          onClick={() => setActiveSubTab('inward')}
          className={`px-4 py-2 text-xs font-bold border-b-2 transition-all ${
            activeSubTab === 'inward'
              ? 'border-emerald-600 text-emerald-800'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Recorded Purchases ({purchases.length})
        </button>
        <button
          onClick={() => setActiveSubTab('suppliers')}
          className={`px-4 py-2 text-xs font-bold border-b-2 transition-all ${
            activeSubTab === 'suppliers'
              ? 'border-emerald-600 text-emerald-800'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Suppliers Directory ({suppliers.length})
        </button>
      </div>

      {/* Sub-tab 1: Inward Bills List */}
      {activeSubTab === 'inward' && (
        <div className="space-y-4">
          {purchases.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">
              <Receipt className="w-10 h-10 mx-auto text-slate-300 mb-2" />
              <p className="text-sm font-bold text-slate-700">No goods inward bills recorded yet</p>
              <p className="text-xs text-slate-400 mt-1">
                Click "+ Receive Goods Inward" to register your distributor invoices and update inventory batches.
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 font-semibold text-slate-600 uppercase text-[10px] tracking-wider">
                    <th className="p-3">GRN & Date</th>
                    <th className="p-3">Supplier Name</th>
                    <th className="p-3">Supplier Invoice #</th>
                    <th className="p-3">Medicines Inwarded</th>
                    <th className="p-3 text-right">Taxable (₹)</th>
                    <th className="p-3 text-right">GST (₹)</th>
                    <th className="p-3 text-right">Net Bill (₹)</th>
                    <th className="p-3 text-center">Payment</th>
                    <th className="p-3 text-center">Invoice Doc</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                  {purchases.map(p => (
                    <tr key={p.id} className="hover:bg-slate-50/60">
                      <td className="p-3">
                        <div className="font-bold text-slate-900">{p.inwardNumber}</div>
                        <div className="text-[10px] text-slate-400">{p.receivedDate}</div>
                      </td>
                      <td className="p-3 font-semibold text-slate-800">{p.supplierName}</td>
                      <td className="p-3 font-mono font-bold text-slate-700">{p.supplierInvoiceNo}</td>
                      <td className="p-3">
                        <div className="text-xs text-slate-700 font-bold">{p.items.length} items</div>
                        <div className="text-[10px] text-slate-500">
                          {p.items.map(it => it.medicineName).slice(0, 2).join(', ')}...
                        </div>
                      </td>
                      <td className="p-3 text-right font-mono">₹{p.taxableTotal.toFixed(2)}</td>
                      <td className="p-3 text-right font-mono">₹{p.gstTotal.toFixed(2)}</td>
                      <td className="p-3 text-right font-extrabold text-slate-900 font-mono">
                        ₹{p.netBillAmount.toFixed(2)}
                      </td>
                      <td className="p-3 text-center">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          p.paymentStatus === 'Paid'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}>
                          {p.paymentStatus}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        {p.billImageUrl ? (
                          <button
                            type="button"
                            onClick={() => void openPurchaseInvoice(p)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-300 font-bold text-[10px] transition-colors cursor-pointer"
                          >
                            <span>📄 View Bill</span>
                          </button>
                        ) : (
                          <span className="text-[10px] text-slate-400 font-mono">No File</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Sub-tab 2: Suppliers Directory Cards (Matching Video 1:50-1:56) */}
      {activeSubTab === 'suppliers' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {suppliers.map(sup => (
            <div key={sup.id} className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">{sup.firmName}</h3>
                  <p className="text-xs text-slate-500 font-medium">Contact: {sup.contactPerson}</p>
                </div>
                <span className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
                  <Building2 className="w-4 h-4" />
                </span>
              </div>

              <div className="space-y-1 text-xs text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-100 font-mono">
                <div>Phone: <b className="text-slate-800">{sup.phone}</b></div>
                <div className="truncate">GSTIN: {sup.gstin}</div>
                <div className="truncate">DL: {sup.drugLicenseNo}</div>
                <div>Credit Period: <b className="text-slate-800">{sup.creditDays} days</b></div>
              </div>

              <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                <div>
                  <span className="text-[10px] text-slate-400 block font-semibold uppercase">TOTAL PURCHASES</span>
                  <span className="font-bold text-slate-900 font-mono">₹{sup.totalPurchases.toFixed(2)}</span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-slate-400 block font-semibold uppercase">OUTSTANDING DUE</span>
                  <span className={`font-bold font-mono ${sup.outstandingBalance > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                    ₹{sup.outstandingBalance.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal: Register New Supplier (Video 1:52 - 1:54) */}
      {isAddSupplierOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center">
                  <Building2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-sm">Register New Pharmaceutical Supplier</h3>
                  <p className="text-[11px] text-slate-500">Authorized Wholesale Distributor</p>
                </div>
              </div>
              <button
                onClick={() => setIsAddSupplierOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSupplierSubmit} className="p-5 space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Supplier / Firm Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Apex Medical Supplies"
                  value={firmName}
                  onChange={e => setFirmName(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs focus:outline-emerald-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Contact Person</label>
                  <input
                    type="text"
                    placeholder="e.g. Deepak Agarwal"
                    value={contactPerson}
                    onChange={e => setContactPerson(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs focus:outline-emerald-600"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Mobile Phone *</label>
                  <input
                    type="tel"
                    required
                    placeholder="e.g. 98201 11223"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs focus:outline-emerald-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">GSTIN Number</label>
                  <input
                    type="text"
                    placeholder="29AABCA5566K1Z9"
                    value={gstin}
                    onChange={e => setGstin(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs uppercase focus:outline-emerald-600"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Drug License (DL No.)</label>
                  <input
                    type="text"
                    placeholder="KA-BLR-20B/21B-88391"
                    value={drugLicenseNo}
                    onChange={e => setDrugLicenseNo(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs focus:outline-emerald-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Credit Period (Days)</label>
                  <input
                    type="number"
                    value={creditDays}
                    onChange={e => setCreditDays(Number(e.target.value))}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs focus:outline-emerald-600"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">City</label>
                  <input
                    type="text"
                    value={city}
                    onChange={e => setCity(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs focus:outline-emerald-600"
                  />
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddSupplierOpen(false)}
                  className="px-3 py-1.5 border border-slate-200 text-slate-700 rounded-lg text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-xs cursor-pointer"
                >
                  Save Supplier
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Receive Goods Inward (Supplier Bill & Batch Registration) (Video 1:57 - 2:04) */}
      {isInwardModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-3xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center">
                  <Truck className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-sm">Receive Goods Inward (Supplier Bill & Batch Registration)</h3>
                  <p className="text-[11px] text-slate-500">Auto-updates Inventory Stock & FEFO Batches</p>
                </div>
              </div>
              <button
                onClick={() => setIsInwardModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleInwardSubmit} className="p-6 overflow-y-auto space-y-4">
              {/* Top Details */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div className="sm:col-span-2">
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Distributor / Supplier *</label>
                  <select
                    value={selectedSupplierId}
                    onChange={e => setSelectedSupplierId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:outline-emerald-600 bg-white"
                  >
                    <option value="">Select a supplier</option>
                    {suppliers.map(s => (
                      <option key={s.id} value={s.id}>{s.firmName} ({s.contactPerson})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Supplier Bill # *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. INV-88210"
                    value={supplierInvoiceNo}
                    onChange={e => setSupplierInvoiceNo(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:outline-emerald-600 uppercase font-mono"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Bill Date</label>
                  <input
                    type="date"
                    required
                    value={invoiceDate}
                    onChange={e => setInvoiceDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:outline-emerald-600"
                  />
                </div>
              </div>

              {/* Upload Supplier Invoice Document Box */}
              <div className="p-3.5 bg-slate-50 border border-dashed border-emerald-300 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Receipt className="w-4 h-4 text-emerald-600" />
                    <span className="text-xs font-bold text-slate-800">
                      Upload Supplier Invoice / Physical Bill Photo
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono">PNG, JPG, PDF up to 10MB</span>
                </div>

                {billImageUrl ? (
                  <div className="flex items-center justify-between p-2.5 bg-white rounded-lg border border-emerald-200">
                    <div className="flex items-center gap-3">
                      {isPdfPreview(billImageUrl) ? (
                        <div className="w-12 h-12 rounded-md border border-slate-200 bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-500">
                          PDF
                        </div>
                      ) : (
                        <img
                          src={billImageUrl}
                          alt="Uploaded invoice preview"
                          className="w-12 h-12 object-cover rounded-md border border-slate-200 cursor-pointer shadow-xs"
                          onClick={() => setPreviewLightbox({ url: billImageUrl, title: `Bill Photo: ${billImageName || supplierInvoiceNo}` })}
                        />
                      )}
                      <div>
                        <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                          <span>{billImageName || 'Supplier_Tax_Invoice.jpg'}</span>
                          <span className="text-[10px] px-1.5 py-0.2 bg-emerald-100 text-emerald-800 rounded font-bold">
                            Attached ✓
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setPreviewLightbox({ url: billImageUrl, title: `Bill Photo: ${billImageName || supplierInvoiceNo}` })}
                          className="text-[11px] text-emerald-700 font-semibold hover:underline mt-0.5 block"
                        >
                          Click to preview full invoice
                        </button>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setBillImageUrl('');
                        setBillImageName('');
                      }}
                      className="text-xs text-rose-600 hover:text-rose-700 font-bold px-2 py-1 hover:bg-rose-50 rounded"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 bg-white p-3 rounded-lg border border-slate-200">
                    <label className="flex-1 flex flex-col items-center justify-center p-3 border-2 border-dashed border-slate-300 hover:border-emerald-500 rounded-lg cursor-pointer bg-slate-50/50 hover:bg-emerald-50/30 transition-all text-center">
                      <span className="text-xs font-bold text-slate-700">Choose invoice photo or drop file here</span>
                      <span className="text-[11px] text-slate-400 mt-0.5">Click to browse from computer / camera</span>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,application/pdf"
                        onChange={handleInvoiceFileUpload}
                        className="hidden"
                      />
                    </label>
                  </div>
                )}

                {/* AI Auto-Fill Trigger inside Inward Modal */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pt-1 border-t border-emerald-100">
                  <button
                    type="button"
                    onClick={() => handleAutofillWithAI()}
                    disabled={isAiAutofilling}
                    className="px-3.5 py-1.5 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer transition-all active:scale-98"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-200" />
                    <span>{isAiAutofilling ? 'AI Reading Bill...' : 'Auto-Fill Items using AI'}</span>
                  </button>

                  {aiAutofillMessage ? (
                    <span className="text-xs font-semibold text-emerald-700 animate-pulse">
                      {aiAutofillMessage}
                    </span>
                  ) : (
                    <span className="text-[11px] text-slate-500">
                      Gemini 3.8 Flash Vision OCR extracts brand name, HSN, batches, pack sizes, expiry & costs
                    </span>
                  )}
                </div>
              </div>

              {/* Items Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Medicines & Batches Inwarded
                  </span>
                  <button
                    type="button"
                    onClick={handleAddLineItem}
                    className="px-2.5 py-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-300 rounded-md text-xs font-bold transition-colors"
                  >
                    + Add Item Line
                  </button>
                </div>

                <div className="p-3 space-y-3 max-h-72 overflow-y-auto">
                  {inwardItems.map((item, idx) => (
                    <div key={idx} className="p-3 bg-slate-50/70 border border-slate-200 rounded-lg space-y-2">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div>
                          <label className="text-[10px] font-semibold text-slate-600 block">Medicine Name *</label>
                          <input
                            type="text"
                            required
                            placeholder="e.g. Dolo 650"
                            value={item.medicineName}
                            onChange={e => updateInwardLine(idx, 'medicineName', e.target.value)}
                            className="w-full px-2 py-1 border border-slate-300 rounded text-xs focus:outline-emerald-600"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold text-slate-600 block">Generic / Salt</label>
                          <input
                            type="text"
                            placeholder="e.g. Paracetamol 650mg"
                            value={item.genericName}
                            onChange={e => updateInwardLine(idx, 'genericName', e.target.value)}
                            className="w-full px-2 py-1 border border-slate-300 rounded text-xs focus:outline-emerald-600"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-1">
                          <div>
                            <label className="text-[10px] font-semibold text-slate-600 block">Batch No *</label>
                            <input
                              type="text"
                              required
                              value={item.batchNumber}
                              onChange={e => updateInwardLine(idx, 'batchNumber', e.target.value)}
                              className="w-full px-2 py-1 border border-slate-300 rounded text-xs font-mono uppercase focus:outline-emerald-600"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-semibold text-slate-600 block">Exp Date *</label>
                            <input
                              type="month"
                              required
                              value={item.expiryDate}
                              onChange={e => updateInwardLine(idx, 'expiryDate', e.target.value)}
                              className="w-full px-2 py-1 border border-slate-300 rounded text-xs font-mono text-rose-600 focus:outline-emerald-600"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-7 gap-2 items-center">
                        <div>
                          <label className="text-[10px] font-semibold text-slate-600 block">HSN Code</label>
                          <input
                            type="text"
                            placeholder="30049099"
                            value={item.hsnCode || ''}
                            onChange={e => updateInwardLine(idx, 'hsnCode', e.target.value)}
                            className="w-full px-2 py-1 border border-slate-300 rounded text-xs font-mono font-bold focus:outline-emerald-600"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold text-slate-600 block">Pack Size</label>
                          <input
                            type="number"
                            min="1"
                            required
                            value={item.packSize ?? ''}
                            onChange={e => {
                              const ps = Number(e.target.value) || 0;
                              updateInwardLine(idx, 'packSize', ps);
                              updateInwardLine(idx, 'unitMrp', ps > 0 ? Math.round((item.sellingMrp / ps) * 100) / 100 : 0);
                            }}
                            className="w-full px-2 py-1 border border-slate-300 rounded text-xs font-mono focus:outline-emerald-600"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold text-slate-600 block">Packs (Qty)</label>
                          <input
                            type="number"
                            min="1"
                            required
                            value={item.quantity}
                            onChange={e => updateInwardLine(idx, 'quantity', Number(e.target.value))}
                            className="w-full px-2 py-1 border border-slate-300 rounded text-xs font-mono font-bold focus:outline-emerald-600"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold text-slate-600 block">Free Packs</label>
                          <input
                            type="number"
                            min="0"
                            placeholder="0"
                            value={item.freeQty || 0}
                            onChange={e => updateInwardLine(idx, 'freeQty', Number(e.target.value))}
                            className="w-full px-2 py-1 border border-slate-300 rounded text-xs font-mono focus:outline-emerald-600"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold text-slate-600 block">Cost/Pack (₹)</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={item.purchaseCost}
                            onChange={e => updateInwardLine(idx, 'purchaseCost', Number(e.target.value))}
                            className="w-full px-2 py-1 border border-slate-300 rounded text-xs font-mono focus:outline-emerald-600"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold text-slate-600 block">Pack MRP (₹)</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            required
                            value={item.sellingMrp}
                            onChange={e => {
                              const mrp = Number(e.target.value) || 0;
                              updateInwardLine(idx, 'sellingMrp', mrp);
                              updateInwardLine(idx, 'unitMrp', item.packSize ? Math.round((mrp / item.packSize) * 100) / 100 : 0);
                            }}
                            className="w-full px-2 py-1 border border-slate-300 rounded text-xs font-mono focus:outline-emerald-600"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold text-slate-600 block">GST %</label>
                          <select
                            value={item.gstRate}
                            onChange={e => updateInwardLine(idx, 'gstRate', Number(e.target.value))}
                            className="w-full px-2 py-1 border border-slate-300 rounded text-xs focus:outline-emerald-600 bg-white"
                          >
                            {[0, 5, 12, 18, 28].map(r => <option key={r} value={r}>{r}%</option>)}
                          </select>
                        </div>
                      </div>
                      <div className="flex items-center justify-between pt-1 text-[11px] text-slate-500 border-t border-slate-200/60">
                        <span>
                          Loose Tablet MRP: <b className="text-emerald-700 font-mono">₹{(item.packSize ? item.sellingMrp / item.packSize : 0).toFixed(2)}</b> per unit • Total Base Units: <b className="text-slate-800 font-mono">{(item.quantity + (item.freeQty || 0)) * (item.packSize || 0)}</b>
                        </span>
                        <button
                          type="button"
                          onClick={() => removeInwardLine(idx)}
                          className="text-xs text-rose-600 hover:text-rose-700 font-semibold"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Summary and Payment */}
              <div className="p-4 bg-slate-900 text-slate-200 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="flex items-center gap-4 text-xs">
                  <div>
                    <span className="text-slate-400 block text-[10px]">Taxable Amount</span>
                    <span className="font-mono font-bold">₹{inwardTaxable.toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">GST Total</span>
                    <span className="font-mono font-bold">₹{inwardGst.toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="text-emerald-400 block text-[10px] uppercase font-bold">NET INWARD BILL</span>
                    <span className="font-mono text-lg font-extrabold text-emerald-400">₹{inwardNet.toFixed(2)}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={paymentStatus}
                    required
                    onChange={e => setPaymentStatus(e.target.value as 'Paid' | 'Credit Pending' | '')}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs font-semibold"
                  >
                    <option value="">Select payment status</option>
                    <option value="Paid">Mark Paid</option>
                    <option value="Credit Pending">Credit Pending</option>
                  </select>

                  <button
                    type="submit"
                    disabled={isSavingInward}
                    className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 text-slate-950 font-bold rounded-lg text-xs transition-colors cursor-pointer"
                  >
                    {isSavingInward ? 'Saving invoice…' : 'Confirm & Update Stock'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Lightbox for Viewing Attached Supplier Invoices */}
      {previewLightbox && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <Receipt className="w-4 h-4 text-emerald-600" />
                <h3 className="font-bold text-slate-800 text-sm">{previewLightbox.title}</h3>
              </div>
              <button
                onClick={() => setPreviewLightbox(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 overflow-auto flex items-center justify-center bg-slate-100/60 max-h-[75vh]">
              {isPdfPreview(previewLightbox.url) ? (
                <iframe
                  src={previewLightbox.url}
                  title={previewLightbox.title}
                  className="w-full h-[70vh] rounded-lg border border-slate-200 bg-white"
                />
              ) : (
                <img
                  src={previewLightbox.url}
                  alt="Full invoice"
                  className="max-h-[70vh] object-contain rounded-lg border border-slate-200 shadow-md"
                />
              )}
            </div>
            <div className="p-3 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button
                onClick={() => setPreviewLightbox(null)}
                className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-semibold"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
