import React, { useState } from 'react';
import { 
  CalendarClock, 
  AlertTriangle, 
  ShieldAlert, 
  CheckCircle2, 
  Search, 
  Filter, 
  Sparkles,
  QrCode,
  ArrowRight
} from 'lucide-react';
import { Medicine, BatchInfo } from '../../types/pharmacy';
import { sound } from '../../utils/sound';
import { getDaysUntilExpiry } from '../../utils/dateUtils';

interface BatchesExpiryViewProps {
  medicines: Medicine[];
  onOpenQRModal: (medicine: Medicine, batch: BatchInfo) => void;
  onUpdateMedicine: (medicine: Medicine) => void;
}

export const BatchesExpiryView: React.FC<BatchesExpiryViewProps> = ({
  medicines,
  onOpenQRModal,
  onUpdateMedicine,
}) => {
  const [filterMode, setFilterMode] = useState<'all' | '30' | '60' | '90' | 'expired'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Collect all batches with their parent medicine
  const allBatchesList: {
    medicine: Medicine;
    batch: BatchInfo;
    daysLeft: number;
    status: 'Expired' | 'Critical (<30d)' | 'Warning (<60d)' | 'Attention (<90d)' | 'Safe';
  }[] = [];

  medicines.forEach(m => {
    m.batches.forEach(b => {
      const daysLeft = getDaysUntilExpiry(b.expiryDate);

      let status: 'Expired' | 'Critical (<30d)' | 'Warning (<60d)' | 'Attention (<90d)' | 'Safe' = 'Safe';
      if (daysLeft <= 0) status = 'Expired';
      else if (daysLeft <= 30) status = 'Critical (<30d)';
      else if (daysLeft <= 60) status = 'Warning (<60d)';
      else if (daysLeft <= 90) status = 'Attention (<90d)';

      allBatchesList.push({
        medicine: m,
        batch: b,
        daysLeft,
        status,
      });
    });
  });

  // Sort by FEFO (First Expiry First Out)
  allBatchesList.sort((a, b) => a.daysLeft - b.daysLeft);

  // Filter
  const filtered = allBatchesList.filter(item => {
    const q = searchQuery.toLowerCase().trim();
    const matchSearch = !q ||
      (item.medicine.brandName || '').toLowerCase().includes(q) ||
      (item.medicine.genericName || '').toLowerCase().includes(q) ||
      (item.batch.batchNumber || '').toLowerCase().includes(q) ||
      (item.batch.barcode && item.batch.barcode.includes(q));

    if (!matchSearch) return false;

    if (filterMode === 'all') return true;
    if (filterMode === 'expired') return item.daysLeft <= 0;
    if (filterMode === '30') return item.daysLeft > 0 && item.daysLeft <= 30;
    if (filterMode === '60') return item.daysLeft > 0 && item.daysLeft <= 60;
    if (filterMode === '90') return item.daysLeft > 0 && item.daysLeft <= 90;
    return true;
  });

  // Metrics
  const expiredCount = allBatchesList.filter(b => b.daysLeft <= 0).length;
  const criticalCount = allBatchesList.filter(b => b.daysLeft > 0 && b.daysLeft <= 90).length;
  const totalValuation = allBatchesList.reduce((acc, b) => acc + b.batch.stock * b.batch.purchasePrice, 0);

  const handleQuarantine = (targetMed: Medicine, targetBatch: BatchInfo) => {
    sound.playWarningBeep();
    if (confirm(`Quarantine batch ${targetBatch.batchNumber} of ${targetMed.brandName}? Stock will be moved to Quarantine and removed from active POS counter.`)) {
      const updatedBatches = targetMed.batches.filter(b => b.batchNumber !== targetBatch.batchNumber);
      onUpdateMedicine({ ...targetMed, batches: updatedBatches });
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      {/* Header */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-slate-800">Batch & Expiry Management (FEFO)</h2>
            <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
              Drugs & Cosmetics Act Enforced
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Automatic First Expiry First Out batch prioritization & regulatory quarantine tracking
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-xs text-slate-500">Total Batch Valuation</div>
            <div className="text-sm font-extrabold text-slate-900 font-mono">₹{totalValuation.toFixed(2)}</div>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap gap-2 items-center justify-between bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
        <div className="flex flex-wrap gap-1.5">
          {[
            { id: 'all', label: `All Active Batches (${allBatchesList.length})` },
            { id: '30', label: `Expiring within 30 Days (${allBatchesList.filter(b => b.daysLeft > 0 && b.daysLeft <= 30).length})` },
            { id: '60', label: `Within 60 Days (${allBatchesList.filter(b => b.daysLeft > 0 && b.daysLeft <= 60).length})` },
            { id: '90', label: `Within 90 Days (${allBatchesList.filter(b => b.daysLeft > 0 && b.daysLeft <= 90).length})` },
            { id: 'expired', label: `Expired / Quarantine (${expiredCount})` },
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setFilterMode(f.id as typeof filterMode)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                filterMode === f.id
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search batch or medicine..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-emerald-600"
          />
        </div>
      </div>

      {/* Batches Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 font-semibold text-slate-600 uppercase text-[10px] tracking-wider">
                <th className="p-3">Medicine & Brand</th>
                <th className="p-3">Batch Number</th>
                <th className="p-3">Expiry Date</th>
                <th className="p-3 text-center">Days Left</th>
                <th className="p-3 text-right">Cost (₹)</th>
                <th className="p-3 text-right">Selling MRP (₹)</th>
                <th className="p-3 text-center">Stock Available</th>
                <th className="p-3 text-right">Batch Valuation</th>
                <th className="p-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
              {filtered.map((item, idx) => {
                const batchVal = item.batch.stock * item.batch.purchasePrice;

                return (
                  <tr key={`${item.medicine.id}-${item.batch.batchNumber}-${idx}`} className="hover:bg-slate-50/60 transition-colors">
                    <td className="p-3">
                      <div className="font-bold text-slate-900">{item.medicine.brandName}</div>
                      <div className="text-[10px] text-slate-500">{item.medicine.genericName}</div>
                      <div className="text-[9px] text-slate-400 font-mono">Rack: {item.batch.rackLocation}</div>
                    </td>

                    <td className="p-3 font-mono font-bold text-slate-800">
                      {item.batch.batchNumber}
                    </td>

                    <td className="p-3 font-mono font-bold text-slate-700">
                      {item.batch.expiryDate}
                    </td>

                    <td className="p-3 text-center">
                      {item.daysLeft <= 0 ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-rose-100 text-rose-800 border border-rose-300">
                          EXPIRED
                        </span>
                      ) : item.daysLeft <= 30 ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-rose-50 text-rose-700 border border-rose-200">
                          {item.daysLeft} days
                        </span>
                      ) : item.daysLeft <= 60 ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                          {item.daysLeft} days
                        </span>
                      ) : item.daysLeft <= 90 ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-yellow-100 text-yellow-800">
                          {item.daysLeft} days
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                          {item.daysLeft} days
                        </span>
                      )}
                    </td>

                    <td className="p-3 text-right font-mono text-slate-600">
                      ₹{item.batch.purchasePrice.toFixed(2)}
                    </td>

                    <td className="p-3 text-right font-extrabold text-slate-900 font-mono">
                      ₹{item.batch.mrp.toFixed(2)}
                    </td>

                    <td className="p-3 text-center font-bold">
                      <span className={item.batch.stock < 15 ? 'text-rose-600' : 'text-slate-800'}>
                        {item.batch.stock} packs
                      </span>
                    </td>

                    <td className="p-3 text-right font-bold text-slate-900 font-mono">
                      ₹{batchVal.toFixed(2)}
                    </td>

                    <td className="p-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => onOpenQRModal(item.medicine, item.batch)}
                          className="p-1 rounded text-slate-500 hover:text-emerald-700 hover:bg-slate-100"
                          title="View QR Label"
                        >
                          <QrCode className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleQuarantine(item.medicine, item.batch)}
                          className="px-2 py-1 rounded bg-rose-50 hover:bg-rose-100 text-rose-700 text-[10px] font-bold border border-rose-200 transition-colors"
                        >
                          Quarantine
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
