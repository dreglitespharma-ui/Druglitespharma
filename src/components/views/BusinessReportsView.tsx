import React, { useState } from 'react';
import { BarChart3, Download, Printer, FileText, TrendingUp, IndianRupee, Layers, ShieldCheck, Search, Filter, CheckCircle2 } from 'lucide-react';
import { SaleBill, Medicine, PurchaseInward, StoreExpense } from '../../types/pharmacy';
import { getDaysUntilExpiry } from '../../utils/dateUtils';

interface BusinessReportsViewProps {
  bills: SaleBill[];
  medicines: Medicine[];
  purchases: PurchaseInward[];
  expenses: StoreExpense[];
}

export const BusinessReportsView: React.FC<BusinessReportsViewProps> = ({
  bills,
  medicines,
  purchases,
  expenses,
}) => {
  const [activeTab, setActiveTab] = useState<'sales' | 'pnl' | 'gst' | 'stock' | 'expiry'>('sales');
  const [gstSearch, setGstSearch] = useState('');
  const [selectedSlabFilter, setSelectedSlabFilter] = useState<'all' | '0' | '5' | '12' | '18'>('all');
  const [gstViewMode, setGstViewMode] = useState<'matrix' | 'cards'>('matrix');

  // Sales Totals
  const totalSalesRevenue = bills.reduce((acc, b) => acc + b.netPayable, 0);
  const totalTaxableSales = bills.reduce((acc, b) => acc + b.taxableAmount, 0);
  const totalCgstCollected = bills.reduce((acc, b) => acc + b.cgstAmount, 0);
  const totalSgstCollected = bills.reduce((acc, b) => acc + b.sgstAmount, 0);

  // Multi-Slab GST Calculations (0%, 5%, 12%, 18%)
  const slabDefinitions = [
    { rate: 0, label: '0% (Nil / Exempt)', dotColor: 'bg-amber-500' },
    { rate: 5, label: '5% GST', dotColor: 'bg-emerald-500' },
    { rate: 12, label: '12% GST', dotColor: 'bg-blue-500' },
    { rate: 18, label: '18% GST', dotColor: 'bg-purple-500' },
  ];

  // Bill-wise matrix data for the eVitalRx Multi-Slab grid (Image 1)
  const billMatrixData = bills.map(b => {
    let slab0Base = 0;
    let slab5Base = 0;
    let slab5Sgst = 0;
    let slab5Cgst = 0;
    let slab12Base = 0;
    let slab12Sgst = 0;
    let slab12Cgst = 0;
    let slab18Base = 0;
    let slab18Sgst = 0;
    let slab18Cgst = 0;

    b.items.forEach(it => {
      const lineGross = it.quantity * it.mrp;
      const lineDisc = lineGross * ((it.discountPercent || 0) / 100);
      const lineNet = lineGross - lineDisc;
      const r = it.gstRate !== undefined && !isNaN(Number(it.gstRate)) ? Number(it.gstRate) : 12;

      if (r === 0) {
        slab0Base += lineNet;
      } else if (r === 5) {
        const taxable = lineNet / 1.05;
        const tax = lineNet - taxable;
        slab5Base += taxable;
        slab5Sgst += tax / 2;
        slab5Cgst += tax / 2;
      } else if (r === 12) {
        const taxable = lineNet / 1.12;
        const tax = lineNet - taxable;
        slab12Base += taxable;
        slab12Sgst += tax / 2;
        slab12Cgst += tax / 2;
      } else if (r === 18) {
        const taxable = lineNet / 1.18;
        const tax = lineNet - taxable;
        slab18Base += taxable;
        slab18Sgst += tax / 2;
        slab18Cgst += tax / 2;
      } else {
        const taxable = lineNet / 1.12;
        const tax = lineNet - taxable;
        slab12Base += taxable;
        slab12Sgst += tax / 2;
        slab12Cgst += tax / 2;
      }
    });

    return {
      id: b.id,
      billNumber: b.billNumber,
      timestamp: b.timestamp,
      customerName: b.customerName || 'Counter Sale',
      customerPhone: b.customerPhone || 'Retail B2C',
      cess: 0,
      slab0Base,
      slab5Base,
      slab5Sgst,
      slab5Cgst,
      slab5Igst: 0,
      slab12Base,
      slab12Sgst,
      slab12Cgst,
      slab12Igst: 0,
      slab18Base,
      slab18Sgst,
      slab18Cgst,
      slab18Igst: 0,
      netPayable: b.netPayable,
    };
  });

  // Calculate rate-wise summary table matching user's Image 4
  const rateSlabSummaries = slabDefinitions.map(def => {
    let itemCount = 0;
    let taxableTurnover = 0;
    let cgst = 0;
    let sgst = 0;
    let totalInvoiceValue = 0;
    const billsInThisSlab = new Set<string>();

    bills.forEach(b => {
      let billHasSlab = false;
      b.items.forEach(it => {
        const r = it.gstRate !== undefined && !isNaN(Number(it.gstRate)) ? Number(it.gstRate) : 12;
        if (r === def.rate) {
          billHasSlab = true;
          itemCount += it.quantity;
          const lineGross = it.quantity * it.mrp;
          const lineDisc = lineGross * ((it.discountPercent || 0) / 100);
          const lineNet = lineGross - lineDisc;

          if (r === 0) {
            taxableTurnover += lineNet;
            totalInvoiceValue += lineNet;
          } else {
            const taxFactor = 1 + (r / 100);
            const lineTaxable = lineNet / taxFactor;
            const lineTax = lineNet - lineTaxable;
            taxableTurnover += lineTaxable;
            cgst += lineTax / 2;
            sgst += lineTax / 2;
            totalInvoiceValue += lineNet;
          }
        }
      });
      if (billHasSlab) {
        billsInThisSlab.add(b.id);
      }
    });

    const totalTax = cgst + sgst;

    return {
      rate: def.rate,
      label: def.label,
      dotColor: def.dotColor,
      itemCount,
      billCount: billsInThisSlab.size,
      taxableTurnover,
      cgst,
      sgst,
      igst: 0,
      totalTax,
      totalInvoiceValue,
    };
  });

  const totalSlabItems = rateSlabSummaries.reduce((sum, s) => sum + s.itemCount, 0);
  const totalSlabTaxable = rateSlabSummaries.reduce((sum, s) => sum + s.taxableTurnover, 0);
  const totalSlabCgst = rateSlabSummaries.reduce((sum, s) => sum + s.cgst, 0);
  const totalSlabSgst = rateSlabSummaries.reduce((sum, s) => sum + s.sgst, 0);
  const totalSlabTax = rateSlabSummaries.reduce((sum, s) => sum + s.totalTax, 0);
  const totalSlabInvoiceValue = rateSlabSummaries.reduce((sum, s) => sum + s.totalInvoiceValue, 0);

  // Filtered matrix bills
  const filteredMatrixBills = billMatrixData.filter(b => {
    const q = gstSearch.toLowerCase().trim();
    const matchesSearch = !q ||
      (b.billNumber || '').toLowerCase().includes(q) ||
      (b.customerName || '').toLowerCase().includes(q) ||
      (b.customerPhone || '').toLowerCase().includes(q);

    if (!matchesSearch) return false;

    if (selectedSlabFilter === '0') return b.slab0Base > 0;
    if (selectedSlabFilter === '5') return b.slab5Base > 0;
    if (selectedSlabFilter === '12') return b.slab12Base > 0;
    if (selectedSlabFilter === '18') return b.slab18Base > 0;
    return true;
  });

  // Cost of Goods Sold (COGS)
  let totalCOGS = 0;
  bills.forEach(b => {
    b.items.forEach(it => {
      totalCOGS += it.quantity * it.purchasePrice;
    });
  });

  const grossProfit = Math.max(0, totalSalesRevenue - totalCOGS);
  const totalOperatingExpenses = expenses.reduce((acc, e) => acc + e.amount, 0);
  const netOperatingProfit = grossProfit - totalOperatingExpenses;

  // Inventory valuation
  let totalStockValuation = 0;
  let totalStockUnits = 0;
  medicines.forEach(m => {
    m.batches.forEach(b => {
      totalStockValuation += b.stock * b.purchasePrice;
      totalStockUnits += b.stock;
    });
  });

  // Export to CSV
  const handleExportCSV = () => {
    let csvContent = 'data:text/csv;charset=utf-8,';
    if (activeTab === 'sales') {
      csvContent += 'Bill Number,Timestamp,Customer,Doctor,Payment Mode,Taxable Amount,CGST,SGST,Net Payable\n';
      bills.forEach(b => {
        csvContent += `"${b.billNumber}","${b.timestamp}","${b.customerName || 'Walk-in'}","${b.doctorName || 'N/A'}","${b.paymentMethod}",${b.taxableAmount.toFixed(2)},${b.cgstAmount.toFixed(2)},${b.sgstAmount.toFixed(2)},${b.netPayable.toFixed(2)}\n`;
      });
    } else if (activeTab === 'gst') {
      csvContent += 'RATE-WISE TAXABLE TURNOVER & TAX LIABILITY BREAKDOWN (GSTR-1 Table 7 / GSTR-3B Table 3.1)\n';
      csvContent += 'Tax Rate Slab,Items / Bill Count,Taxable Turnover,CGST,SGST,IGST,Total Tax,Total Invoice Value\n';
      rateSlabSummaries.forEach(s => {
        csvContent += `"${s.label}",${s.itemCount},${s.taxableTurnover.toFixed(2)},${s.cgst.toFixed(2)},${s.sgst.toFixed(2)},${s.igst.toFixed(2)},${s.totalTax.toFixed(2)},${s.totalInvoiceValue.toFixed(2)}\n`;
      });
      csvContent += `TOTAL,${totalSlabItems},${totalSlabTaxable.toFixed(2)},${totalSlabCgst.toFixed(2)},${totalSlabSgst.toFixed(2)},0.00,${totalSlabTax.toFixed(2)},${totalSlabInvoiceValue.toFixed(2)}\n\n`;
      csvContent += 'CONSOLIDATED MULTI-SLAB GST SALES REGISTER (eVitalRx Grid)\n';
      csvContent += 'Bill No,Bill Date,Customer Name,CESS,0% Base,5% Base,5% SGST,5% CGST,12% Base,12% SGST,12% CGST,18% Base,18% SGST,18% CGST,Total Amount\n';
      billMatrixData.forEach(b => {
        csvContent += `"${b.billNumber}","${b.timestamp}","${b.customerName}",0.00,${b.slab0Base.toFixed(2)},${b.slab5Base.toFixed(2)},${b.slab5Sgst.toFixed(2)},${b.slab5Cgst.toFixed(2)},${b.slab12Base.toFixed(2)},${b.slab12Sgst.toFixed(2)},${b.slab12Cgst.toFixed(2)},${b.slab18Base.toFixed(2)},${b.slab18Sgst.toFixed(2)},${b.slab18Cgst.toFixed(2)},${b.netPayable.toFixed(2)}\n`;
      });
    } else {
      csvContent += 'Medicine,Generic,Batch,Stock Units,Purchase Cost,Selling MRP,Valuation\n';
      medicines.forEach(m => {
        m.batches.forEach(b => {
          csvContent += `"${m.brandName}","${m.genericName}","${b.batchNumber}",${b.stock},${b.purchasePrice.toFixed(2)},${b.mrp.toFixed(2)},${(b.stock * b.purchasePrice).toFixed(2)}\n`;
        });
      });
    }

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `pharmacy_report_${activeTab}_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      {/* Header */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-800">Business Reports & Financial Audit</h2>
          <p className="text-xs text-slate-500">
            GST GSTR-1 Audit, Profit & Loss Ledger, and Realized Margins
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors"
          >
            <Printer className="w-3.5 h-3.5 text-slate-500" />
            <span>Print Report</span>
          </button>

          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-98"
          >
            <Download className="w-4 h-4" />
            <span>Export to CSV / Excel</span>
          </button>
        </div>
      </div>

      {/* Sub Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200">
        {[
          { id: 'sales', label: 'All Sales Transactions' },
          { id: 'pnl', label: 'Profit & Loss (P&L)' },
          { id: 'gst', label: 'GST Tax (GSTR-1)' },
          { id: 'stock', label: 'Batch Stock Valuation' },
          { id: 'expiry', label: 'Expiry Risk Exposure' },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id as typeof activeTab)}
            className={`px-4 py-2 text-xs font-bold border-b-2 transition-all ${
              activeTab === t.id
                ? 'border-emerald-600 text-emerald-800'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab 1: Sales Transactions */}
      {activeTab === 'sales' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 font-semibold text-slate-600 uppercase text-[10px] tracking-wider">
                <th className="p-3">Bill Number</th>
                <th className="p-3">Timestamp</th>
                <th className="p-3">Customer / Patient</th>
                <th className="p-3">Doctor</th>
                <th className="p-3 text-center">Payment Mode</th>
                <th className="p-3 text-right">Taxable (₹)</th>
                <th className="p-3 text-right">CGST+SGST (₹)</th>
                <th className="p-3 text-right">Net Payable (₹)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
              {bills.map(b => (
                <tr key={b.id} className="hover:bg-slate-50/60">
                  <td className="p-3 font-mono font-bold text-slate-900">{b.billNumber}</td>
                  <td className="p-3 text-slate-500 font-mono text-[11px]">{b.timestamp}</td>
                  <td className="p-3">
                    <div className="font-bold text-slate-800">{b.customerName || 'Walk-in'}</div>
                    <div className="text-[10px] text-slate-400 font-mono">{b.customerPhone}</div>
                  </td>
                  <td className="p-3 text-slate-600">{b.doctorName || 'Self'}</td>
                  <td className="p-3 text-center">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                      {b.paymentMethod}
                    </span>
                  </td>
                  <td className="p-3 text-right font-mono">₹{b.taxableAmount.toFixed(2)}</td>
                  <td className="p-3 text-right font-mono">₹{(b.cgstAmount + b.sgstAmount).toFixed(2)}</td>
                  <td className="p-3 text-right font-extrabold text-emerald-700 font-mono">
                    ₹{b.netPayable.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab 2: Profit & Loss Statement */}
      {activeTab === 'pnl' && (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs max-w-2xl mx-auto space-y-4">
          <div className="border-b border-slate-200 pb-3">
            <h3 className="font-bold text-slate-900 text-sm">Pharmacy Profit & Loss Statement</h3>
            <p className="text-xs text-slate-500">Realized Gross Margin & Operational Overheads</p>
          </div>

          <div className="space-y-3 text-xs">
            <div className="flex justify-between py-2 border-b border-slate-100 font-bold text-slate-800">
              <span>Gross Retail Sales Turnover:</span>
              <span className="font-mono text-emerald-700">₹{totalSalesRevenue.toFixed(2)}</span>
            </div>

            <div className="flex justify-between py-2 border-b border-slate-100 text-slate-600">
              <span>Less: Cost of Goods Sold (Purchase Basis):</span>
              <span className="font-mono text-rose-600">-₹{totalCOGS.toFixed(2)}</span>
            </div>

            <div className="flex justify-between py-2 bg-emerald-50 px-3 rounded-lg font-bold text-emerald-900">
              <span>GROSS PROFIT:</span>
              <span className="font-mono">₹{grossProfit.toFixed(2)}</span>
            </div>

            <div className="flex justify-between py-2 border-b border-slate-100 text-slate-600">
              <span>Less: Operating Expenses (Rent, BESCOM Power, Staff, Bags):</span>
              <span className="font-mono text-rose-600">-₹{totalOperatingExpenses.toFixed(2)}</span>
            </div>

            <div className="flex justify-between py-3 border-t-2 border-slate-900 text-sm font-extrabold text-slate-900">
              <span>NET PHARMACY PROFIT:</span>
              <span className={`font-mono text-base ${netOperatingProfit >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                ₹{netOperatingProfit.toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: GST GSTR-1 & Multi-Slab Breakdown */}
      {activeTab === 'gst' && (
        <div className="space-y-6">
          {/* Top Stat Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200 text-xs shadow-2xs">
              <span className="text-slate-400 block font-semibold uppercase text-[10px] tracking-wider">
                Total Taxable Value
              </span>
              <span className="text-xl font-extrabold text-slate-900 font-mono mt-1 block">
                ₹{totalSlabTaxable.toFixed(2)}
              </span>
              <span className="text-[10px] text-slate-500 mt-0.5 block">Net pre-tax turnover</span>
            </div>

            <div className="bg-white p-4 rounded-xl border border-emerald-200/80 bg-emerald-50/20 text-xs shadow-2xs">
              <span className="text-emerald-700 block font-semibold uppercase text-[10px] tracking-wider">
                0% Nil / Exempt Value
              </span>
              <span className="text-xl font-extrabold text-emerald-800 font-mono mt-1 block">
                ₹{(rateSlabSummaries.find(s => s.rate === 0)?.taxableTurnover || 0).toFixed(2)}
              </span>
              <span className="text-[10px] text-emerald-600 mt-0.5 block">Exempt life-saving drugs</span>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 text-xs shadow-2xs">
              <span className="text-slate-400 block font-semibold uppercase text-[10px] tracking-wider">
                Output CGST + SGST
              </span>
              <span className="text-xl font-extrabold text-[#00897b] font-mono mt-1 block">
                ₹{totalSlabTax.toFixed(2)}
              </span>
              <span className="text-[10px] text-slate-500 mt-0.5 block">
                CGST: ₹{totalSlabCgst.toFixed(2)} | SGST: ₹{totalSlabSgst.toFixed(2)}
              </span>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 text-xs shadow-2xs">
              <span className="text-slate-400 block font-semibold uppercase text-[10px] tracking-wider">
                Total Invoice Value
              </span>
              <span className="text-xl font-extrabold text-slate-900 font-mono mt-1 block">
                ₹{totalSlabInvoiceValue.toFixed(2)}
              </span>
              <span className="text-[10px] text-slate-500 mt-0.5 block">{bills.length} Total Sales Invoices</span>
            </div>
          </div>

          {/* Section 1: Rate-Wise Taxable Turnover & Tax Liability Breakdown (Exact match to User Image 4) */}
          <div className="bg-[#fffdf5] border border-amber-300/80 rounded-2xl p-5 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-amber-200/80">
              <div>
                <h3 className="text-base font-extrabold text-slate-900 tracking-tight">
                  Rate-Wise Taxable Turnover & Tax Liability Breakdown
                </h3>
                <p className="text-xs text-amber-900/80 font-medium mt-0.5">
                  Directly maps to GSTR-1 Table 7 (B2C Small) and GSTR-3B Table 3.1.
                </p>
              </div>

              <button
                type="button"
                onClick={handleExportCSV}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-300 bg-white hover:bg-amber-50 text-amber-900 text-xs font-bold transition-all shadow-2xs cursor-pointer active:scale-98"
              >
                <Download className="w-3.5 h-3.5 text-amber-700" />
                <span>Export Slabs PDF / Excel</span>
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-amber-200 text-slate-700 font-bold text-[11px]">
                    <th className="py-2.5 px-3">Tax Rate Slab</th>
                    <th className="py-2.5 px-3 text-center">Items / Bill Count</th>
                    <th className="py-2.5 px-3 text-right">Taxable Turnover (₹)</th>
                    <th className="py-2.5 px-3 text-right">CGST (₹)</th>
                    <th className="py-2.5 px-3 text-right">SGST (₹)</th>
                    <th className="py-2.5 px-3 text-right">IGST (₹)</th>
                    <th className="py-2.5 px-3 text-right font-extrabold text-amber-950">Total Tax (₹)</th>
                    <th className="py-2.5 px-3 text-right font-extrabold">Total Invoice Value (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-amber-100 font-medium text-slate-800">
                  {rateSlabSummaries.map(slab => (
                    <tr key={slab.rate} className="hover:bg-amber-100/40 transition-colors">
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-amber-600 inline-block shrink-0" />
                          <span className="font-bold text-slate-900 text-xs">{slab.label}</span>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-center font-mono text-slate-700">
                        {slab.itemCount}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-slate-900">
                        ₹{slab.taxableTurnover.toFixed(2)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-slate-700">
                        ₹{slab.cgst.toFixed(2)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-slate-700">
                        ₹{slab.sgst.toFixed(2)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-slate-500">
                        ₹{slab.igst.toFixed(2)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-extrabold text-rose-700">
                        ₹{slab.totalTax.toFixed(2)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-extrabold text-slate-950">
                        ₹{slab.totalInvoiceValue.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-amber-300/90 font-extrabold text-slate-950 bg-amber-100/60">
                    <td className="py-3 px-3 uppercase tracking-wider text-xs">
                      TOTAL
                    </td>
                    <td className="py-3 px-3 text-center font-mono">
                      {totalSlabItems}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-xs">
                      ₹{totalSlabTaxable.toFixed(2)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-xs">
                      ₹{totalSlabCgst.toFixed(2)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-xs">
                      ₹{totalSlabSgst.toFixed(2)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-xs">
                      ₹0.00
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-rose-700 text-xs">
                      ₹{totalSlabTax.toFixed(2)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-xs">
                      ₹{totalSlabInvoiceValue.toFixed(2)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Section 2: Consolidated Multi-Slab GST Sales Bills Register (eVitalRx Grid Layout from User Image 1) */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden space-y-3">
            <div className="p-4 border-b border-slate-200 bg-slate-50/70 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
              <div>
                <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <FileText className="w-4 h-4 text-[#00897b]" />
                  <span>GST Sales Bills Register (eVitalRx Multi-Slab Matrix)</span>
                </h4>
                <p className="text-[11px] text-slate-500">
                  Consolidated breakdown per bill showing CESS, 0%, 5%, 12%, and 18% Base, CGST & SGST components
                </p>
              </div>

              {/* Filters Toolbar */}
              <div className="flex items-center gap-2 flex-wrap w-full md:w-auto">
                {/* Search */}
                <div className="relative flex-1 md:w-52">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                  <input
                    type="text"
                    value={gstSearch}
                    onChange={e => setGstSearch(e.target.value)}
                    placeholder="Search bill or customer..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-[#00897b] bg-white"
                  />
                </div>

                {/* Quick Slab Filter */}
                <div className="flex items-center gap-1 bg-slate-200/60 p-0.5 rounded-lg text-[11px]">
                  {[
                    { id: 'all', label: 'All Slabs' },
                    { id: '0', label: '0%' },
                    { id: '5', label: '5%' },
                    { id: '12', label: '12%' },
                    { id: '18', label: '18%' },
                  ].map(tab => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setSelectedSlabFilter(tab.id as any)}
                      className={`px-2 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                        selectedSlabFilter === tab.id
                          ? 'bg-white text-slate-900 shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={handleExportCSV}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#00897b] hover:bg-[#00796b] text-white text-xs font-bold transition-all shadow-2xs cursor-pointer active:scale-98"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download</span>
                </button>
              </div>
            </div>

            {/* Matrix Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  {/* Top Header Grouping */}
                  <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-600 font-bold uppercase text-[9px] tracking-wider text-center">
                    <th className="py-2 px-3 text-left" colSpan={3}>Bill Details</th>
                    <th className="py-2 px-2 border-l border-slate-200">CESS</th>
                    <th className="py-2 px-2 border-l border-slate-200 bg-amber-50/50 text-amber-900" colSpan={1}>
                      0% Slab
                    </th>
                    <th className="py-2 px-2 border-l border-slate-200 bg-emerald-50/50 text-emerald-900" colSpan={4}>
                      5% Slab
                    </th>
                    <th className="py-2 px-2 border-l border-slate-200 bg-blue-50/50 text-blue-900" colSpan={4}>
                      12% Slab
                    </th>
                    <th className="py-2 px-2 border-l border-slate-200 bg-purple-50/50 text-purple-900" colSpan={4}>
                      18% Slab
                    </th>
                    <th className="py-2 px-3 text-right border-l border-slate-200">Total</th>
                  </tr>
                  {/* Sub Header */}
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold text-[10px]">
                    <th className="py-2 px-3">Bill No.</th>
                    <th className="py-2 px-2">Bill Date</th>
                    <th className="py-2 px-3">Customer Name</th>
                    <th className="py-2 px-2 text-right border-l border-slate-200 font-mono">₹</th>
                    
                    {/* 0% */}
                    <th className="py-2 px-2 text-right border-l border-slate-200 bg-amber-50/30 font-mono">Base</th>
                    
                    {/* 5% */}
                    <th className="py-2 px-2 text-right border-l border-slate-200 bg-emerald-50/30 font-mono">Base</th>
                    <th className="py-2 px-2 text-right bg-emerald-50/30 font-mono">SGST</th>
                    <th className="py-2 px-2 text-right bg-emerald-50/30 font-mono">CGST</th>
                    <th className="py-2 px-2 text-right bg-emerald-50/30 font-mono">IGST</th>

                    {/* 12% */}
                    <th className="py-2 px-2 text-right border-l border-slate-200 bg-blue-50/30 font-mono">Base</th>
                    <th className="py-2 px-2 text-right bg-blue-50/30 font-mono">SGST</th>
                    <th className="py-2 px-2 text-right bg-blue-50/30 font-mono">CGST</th>
                    <th className="py-2 px-2 text-right bg-blue-50/30 font-mono">IGST</th>

                    {/* 18% */}
                    <th className="py-2 px-2 text-right border-l border-slate-200 bg-purple-50/30 font-mono">Base</th>
                    <th className="py-2 px-2 text-right bg-purple-50/30 font-mono">SGST</th>
                    <th className="py-2 px-2 text-right bg-purple-50/30 font-mono">CGST</th>
                    <th className="py-2 px-2 text-right bg-purple-50/30 font-mono">IGST</th>

                    <th className="py-2 px-3 text-right border-l border-slate-200 font-bold font-mono">Total (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-800 text-[11px]">
                  {filteredMatrixBills.length === 0 ? (
                    <tr>
                      <td colSpan={18} className="py-8 text-center text-slate-400">
                        No invoices found matching selected filter.
                      </td>
                    </tr>
                  ) : (
                    filteredMatrixBills.map(b => (
                      <tr key={b.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-2 px-3 font-mono font-bold text-slate-900 whitespace-nowrap">
                          {b.billNumber}
                        </td>
                        <td className="py-2 px-2 font-mono text-[10px] text-slate-500 whitespace-nowrap">
                          {b.timestamp.split(' ')[0]}
                        </td>
                        <td className="py-2 px-3">
                          <span className="font-semibold text-slate-800">{b.customerName}</span>
                          <span className="text-[10px] text-slate-400 block font-mono">{b.customerPhone}</span>
                        </td>
                        <td className="py-2 px-2 text-right font-mono border-l border-slate-200 text-slate-400">
                          ₹0
                        </td>

                        {/* 0% */}
                        <td className="py-2 px-2 text-right font-mono border-l border-slate-200 bg-amber-50/20 font-semibold text-slate-800">
                          {b.slab0Base > 0 ? `₹${b.slab0Base.toFixed(2)}` : '₹0'}
                        </td>

                        {/* 5% */}
                        <td className="py-2 px-2 text-right font-mono border-l border-slate-200 bg-emerald-50/20 font-semibold text-slate-800">
                          {b.slab5Base > 0 ? `₹${b.slab5Base.toFixed(2)}` : '₹0'}
                        </td>
                        <td className="py-2 px-2 text-right font-mono bg-emerald-50/20 text-emerald-700">
                          {b.slab5Sgst > 0 ? `₹${b.slab5Sgst.toFixed(2)}` : '₹0'}
                        </td>
                        <td className="py-2 px-2 text-right font-mono bg-emerald-50/20 text-emerald-700">
                          {b.slab5Cgst > 0 ? `₹${b.slab5Cgst.toFixed(2)}` : '₹0'}
                        </td>
                        <td className="py-2 px-2 text-right font-mono bg-emerald-50/20 text-slate-400">
                          ₹0
                        </td>

                        {/* 12% */}
                        <td className="py-2 px-2 text-right font-mono border-l border-slate-200 bg-blue-50/20 font-semibold text-slate-800">
                          {b.slab12Base > 0 ? `₹${b.slab12Base.toFixed(2)}` : '₹0'}
                        </td>
                        <td className="py-2 px-2 text-right font-mono bg-blue-50/20 text-blue-700">
                          {b.slab12Sgst > 0 ? `₹${b.slab12Sgst.toFixed(2)}` : '₹0'}
                        </td>
                        <td className="py-2 px-2 text-right font-mono bg-blue-50/20 text-blue-700">
                          {b.slab12Cgst > 0 ? `₹${b.slab12Cgst.toFixed(2)}` : '₹0'}
                        </td>
                        <td className="py-2 px-2 text-right font-mono bg-blue-50/20 text-slate-400">
                          ₹0
                        </td>

                        {/* 18% */}
                        <td className="py-2 px-2 text-right font-mono border-l border-slate-200 bg-purple-50/20 font-semibold text-slate-800">
                          {b.slab18Base > 0 ? `₹${b.slab18Base.toFixed(2)}` : '₹0'}
                        </td>
                        <td className="py-2 px-2 text-right font-mono bg-purple-50/20 text-purple-700">
                          {b.slab18Sgst > 0 ? `₹${b.slab18Sgst.toFixed(2)}` : '₹0'}
                        </td>
                        <td className="py-2 px-2 text-right font-mono bg-purple-50/20 text-purple-700">
                          {b.slab18Cgst > 0 ? `₹${b.slab18Cgst.toFixed(2)}` : '₹0'}
                        </td>
                        <td className="py-2 px-2 text-right font-mono bg-purple-50/20 text-slate-400">
                          ₹0
                        </td>

                        {/* Total */}
                        <td className="py-2 px-3 text-right font-mono font-bold text-slate-900 border-l border-slate-200">
                          ₹{b.netPayable.toFixed(2)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-100 border-t-2 border-slate-300 font-extrabold text-slate-900 text-[10px]">
                    <td className="py-3 px-3 uppercase tracking-wider" colSpan={3}>
                      Total ({filteredMatrixBills.length} Bills)
                    </td>
                    <td className="py-3 px-2 text-right font-mono border-l border-slate-200">
                      ₹0
                    </td>
                    <td className="py-3 px-2 text-right font-mono border-l border-slate-200 bg-amber-50 text-slate-900">
                      ₹{filteredMatrixBills.reduce((s, b) => s + b.slab0Base, 0).toFixed(2)}
                    </td>

                    <td className="py-3 px-2 text-right font-mono border-l border-slate-200 bg-emerald-50 text-slate-900">
                      ₹{filteredMatrixBills.reduce((s, b) => s + b.slab5Base, 0).toFixed(2)}
                    </td>
                    <td className="py-3 px-2 text-right font-mono bg-emerald-50 text-emerald-800">
                      ₹{filteredMatrixBills.reduce((s, b) => s + b.slab5Sgst, 0).toFixed(2)}
                    </td>
                    <td className="py-3 px-2 text-right font-mono bg-emerald-50 text-emerald-800">
                      ₹{filteredMatrixBills.reduce((s, b) => s + b.slab5Cgst, 0).toFixed(2)}
                    </td>
                    <td className="py-3 px-2 text-right font-mono bg-emerald-50 text-slate-400">
                      ₹0
                    </td>

                    <td className="py-3 px-2 text-right font-mono border-l border-slate-200 bg-blue-50 text-slate-900">
                      ₹{filteredMatrixBills.reduce((s, b) => s + b.slab12Base, 0).toFixed(2)}
                    </td>
                    <td className="py-3 px-2 text-right font-mono bg-blue-50 text-blue-800">
                      ₹{filteredMatrixBills.reduce((s, b) => s + b.slab12Sgst, 0).toFixed(2)}
                    </td>
                    <td className="py-3 px-2 text-right font-mono bg-blue-50 text-blue-800">
                      ₹{filteredMatrixBills.reduce((s, b) => s + b.slab12Cgst, 0).toFixed(2)}
                    </td>
                    <td className="py-3 px-2 text-right font-mono bg-blue-50 text-slate-400">
                      ₹0
                    </td>

                    <td className="py-3 px-2 text-right font-mono border-l border-slate-200 bg-purple-50 text-slate-900">
                      ₹{filteredMatrixBills.reduce((s, b) => s + b.slab18Base, 0).toFixed(2)}
                    </td>
                    <td className="py-3 px-2 text-right font-mono bg-purple-50 text-purple-800">
                      ₹{filteredMatrixBills.reduce((s, b) => s + b.slab18Sgst, 0).toFixed(2)}
                    </td>
                    <td className="py-3 px-2 text-right font-mono bg-purple-50 text-purple-800">
                      ₹{filteredMatrixBills.reduce((s, b) => s + b.slab18Cgst, 0).toFixed(2)}
                    </td>
                    <td className="py-3 px-2 text-right font-mono bg-purple-50 text-slate-400">
                      ₹0
                    </td>

                    <td className="py-3 px-3 text-right font-mono font-black text-slate-900 border-l border-slate-200 text-xs">
                      ₹{filteredMatrixBills.reduce((s, b) => s + b.netPayable, 0).toFixed(2)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: Stock Valuation */}
      {activeTab === 'stock' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center text-xs">
            <span className="font-bold text-slate-800">Total Store Assets: {totalStockUnits} units in stock</span>
            <span className="font-extrabold text-slate-900 font-mono text-sm">
              Valuation: ₹{totalStockValuation.toFixed(2)}
            </span>
          </div>

          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 font-semibold text-slate-600 uppercase text-[10px] tracking-wider">
                <th className="p-3">Medicine Brand</th>
                <th className="p-3">Batch Number</th>
                <th className="p-3">Expiry</th>
                <th className="p-3 text-center">Stock Units</th>
                <th className="p-3 text-right">Cost Price (₹)</th>
                <th className="p-3 text-right">Retail MRP (₹)</th>
                <th className="p-3 text-right">Asset Valuation (₹)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
              {medicines.flatMap(m =>
                m.batches.map(b => (
                  <tr key={`${m.id}-${b.batchNumber}`} className="hover:bg-slate-50/60">
                    <td className="p-3 font-bold text-slate-900">{m.brandName}</td>
                    <td className="p-3 font-mono">{b.batchNumber}</td>
                    <td className="p-3 font-mono">{b.expiryDate}</td>
                    <td className="p-3 text-center font-bold">{b.stock}</td>
                    <td className="p-3 text-right font-mono">₹{b.purchasePrice.toFixed(2)}</td>
                    <td className="p-3 text-right font-mono">₹{b.mrp.toFixed(2)}</td>
                    <td className="p-3 text-right font-extrabold text-slate-900 font-mono">
                      ₹{(b.stock * b.purchasePrice).toFixed(2)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab 5: Expiry Risk Exposure */}
      {activeTab === 'expiry' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 space-y-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-600" />
            <h3 className="font-bold text-slate-900 text-sm">Expiry Risk Exposure Audit</h3>
          </div>
          <p className="text-xs text-slate-600">
            Batches nearing expiry (&lt; 90 days) require clearance or return to supplier under distributor warranty agreement.
          </p>

          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-600 uppercase text-[10px]">
                <th className="p-3">Medicine</th>
                <th className="p-3">Batch</th>
                <th className="p-3">Expiry</th>
                <th className="p-3 text-center">Remaining Stock</th>
                <th className="p-3 text-right">Cost Exposure (₹)</th>
                <th className="p-3 text-center">Recommendation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {medicines.flatMap(m =>
                m.batches
                  .filter(b => {
                    const diffDays = getDaysUntilExpiry(b.expiryDate);
                    return diffDays <= 120;
                  })
                  .map(b => (
                    <tr key={`${m.id}-${b.batchNumber}`}>
                      <td className="p-3 font-bold text-slate-800">{m.brandName}</td>
                      <td className="p-3 font-mono">{b.batchNumber}</td>
                      <td className="p-3 font-mono text-rose-600 font-bold">{b.expiryDate}</td>
                      <td className="p-3 text-center font-bold">{b.stock}</td>
                      <td className="p-3 text-right font-mono font-bold text-rose-600">
                        ₹{(b.stock * b.purchasePrice).toFixed(2)}
                      </td>
                      <td className="p-3 text-center">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                          Return to Distributor
                        </span>
                      </td>
                    </tr>
                  ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
