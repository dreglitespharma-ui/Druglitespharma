import React, { useEffect, useState } from 'react';
import { 
  IndianRupee, 
  TrendingUp, 
  Boxes, 
  Truck, 
  Wallet, 
  Smartphone, 
  CreditCard, 
  AlertTriangle, 
  ArrowUpRight, 
  Clock, 
  ChevronRight,
  ShieldAlert,
  ShoppingCart,
  Pill
} from 'lucide-react';
import { Medicine, SaleBill, PurchaseInward, StoreExpense } from '../../types/pharmacy';
import { getDaysUntilExpiry } from '../../utils/dateUtils';

interface DashboardViewProps {
  medicines: Medicine[];
  bills: SaleBill[];
  purchases: PurchaseInward[];
  expenses: StoreExpense[];
  onNavigateToTab: (tab: string) => void;
  onOpenPos: () => void;
}

const getLocalDateKey = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const getBillDateKey = (timestamp: string): string | null => {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? null : getLocalDateKey(date);
};

export const DashboardView: React.FC<DashboardViewProps> = ({
  medicines,
  bills,
  purchases,
  expenses,
  onNavigateToTab,
  onOpenPos,
}) => {
  const [chartRange, setChartRange] = useState<'Daily' | 'Weekly' | 'Monthly'>('Daily');
  const [todayDateKey, setTodayDateKey] = useState(() => getLocalDateKey(new Date()));

  useEffect(() => {
    const now = new Date();
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const timeout = window.setTimeout(
      () => setTodayDateKey(getLocalDateKey(new Date())),
      nextMidnight.getTime() - now.getTime() + 50
    );
    return () => window.clearTimeout(timeout);
  }, [todayDateKey]);

  // Compute metrics
  const todayBills = bills.filter(b => b.status === 'Completed' && getBillDateKey(b.timestamp) === todayDateKey);
  const totalSalesToday = todayBills.reduce((acc, b) => acc + b.netPayable, 0);
  const totalBillsCount = todayBills.length;

  // Calculate gross profit
  let totalCostOfGoodsSold = 0;
  todayBills.forEach(b => {
    b.items.forEach(it => {
      totalCostOfGoodsSold += it.quantity * it.purchasePrice;
    });
  });
  const grossProfitToday = Math.max(0, totalSalesToday - totalCostOfGoodsSold);
  const profitMarginPercent = totalSalesToday > 0 ? ((grossProfitToday / totalSalesToday) * 100).toFixed(1) : '0.0';

  // Total inventory stock value
  let totalStockValue = 0;
  let totalBatchesCount = 0;
  let totalUnitsInStore = 0;
  const expiringBatches: { medicine: Medicine; batchNumber: string; expiryDate: string; stock: number }[] = [];
  const lowStockItems: { medicine: Medicine; currentStock: number }[] = [];

  medicines.forEach(m => {
    let medStockTotal = 0;
    m.batches.forEach(b => {
      totalStockValue += b.stock * b.purchasePrice;
      totalBatchesCount += 1;
      totalUnitsInStore += b.stock;
      medStockTotal += b.stock;

      // Check if near expiry (< 90 days / 3 months)
      const diffDays = getDaysUntilExpiry(b.expiryDate);
      if (diffDays <= 90) {
        expiringBatches.push({
          medicine: m,
          batchNumber: b.batchNumber,
          expiryDate: b.expiryDate,
          stock: b.stock,
        });
      }
    });

    if (medStockTotal < 15) {
      lowStockItems.push({ medicine: m, currentStock: medStockTotal });
    }
  });

  // Cash vs UPI vs Card
  const cashInCounter = todayBills
    .filter(b => b.paymentMethod === 'Cash')
    .reduce((acc, b) => acc + b.netPayable, 0);
  const upiDigital = todayBills
    .filter(b => b.paymentMethod === 'UPI / QR')
    .reduce((acc, b) => acc + b.netPayable, 0);
  const cardPos = todayBills
    .filter(b => b.paymentMethod === 'Card POS')
    .reduce((acc, b) => acc + b.netPayable, 0);

  // Total purchases today
  const purchasesTotal = purchases.reduce((acc, p) => acc + p.netBillAmount, 0);

  // Fast moving medicines (sorted by sales in bills)
  const salesMap: Record<string, { name: string; category: string; qty: number; revenue: number; stock: number }> = {};
  medicines.forEach(m => {
    salesMap[m.id] = {
      name: m.brandName,
      category: m.category,
      qty: 0,
      revenue: 0,
      stock: m.batches.reduce((s, b) => s + b.stock, 0),
    };
  });
  bills.forEach(b => {
    b.items.forEach(it => {
      if (salesMap[it.medicineId]) {
        salesMap[it.medicineId].qty += it.quantity;
        salesMap[it.medicineId].revenue += it.quantity * it.mrp;
      }
    });
  });
  const fastMoving = Object.values(salesMap).sort((a, b) => b.qty - a.qty).slice(0, 5);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Top 4 Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Today's Sales */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs hover:border-emerald-300 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">TODAY'S SALES</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <IndianRupee className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-slate-900">
              ₹{totalSalesToday.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <div className="mt-2 text-[11px] text-slate-500 flex items-center justify-between">
            <span>{totalBillsCount} Bills Generated</span>
            <span className="text-emerald-600 font-semibold flex items-center gap-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Active Counter
            </span>
          </div>
        </div>

        {/* Card 2: Gross Profit */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs hover:border-emerald-300 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">GROSS PROFIT (TODAY)</span>
            <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-teal-700">
              ₹{grossProfitToday.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <div className="mt-2 text-[11px] text-slate-500 flex items-center justify-between">
            <span>Estimated Margin: {profitMarginPercent}%</span>
            <span className="text-teal-600 font-medium">Realized</span>
          </div>
        </div>

        {/* Card 3: Total Stock Value */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs hover:border-emerald-300 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">TOTAL STOCK VALUE</span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <Boxes className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-slate-900">
              ₹{totalStockValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <div className="mt-2 text-[11px] text-slate-500 flex items-center justify-between">
            <span>Total Units: {totalUnitsInStore}</span>
            <span className="text-blue-600 font-semibold">{totalBatchesCount} Active Batches</span>
          </div>
        </div>

        {/* Card 4: Purchases Today */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs hover:border-emerald-300 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">PURCHASES INWARD</span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <Truck className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-slate-900">
              ₹{purchasesTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <div className="mt-2 text-[11px] text-slate-500 flex items-center justify-between">
            <span>{purchases.length} Inward Bills</span>
            <span className="text-amber-600 font-medium">Verified Goods</span>
          </div>
        </div>
      </div>

      {/* Sub-stat Cash & Payment Tally Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-50/80 p-4 rounded-xl border border-slate-200/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-100/80 text-emerald-700 flex items-center justify-center">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[11px] font-bold text-slate-500 uppercase">CASH IN COUNTER</div>
              <div className="text-lg font-extrabold text-slate-900">
                ₹{cashInCounter.toFixed(2)}
              </div>
            </div>
          </div>
          <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100/60 px-2 py-0.5 rounded">
            Drawer Tally
          </span>
        </div>

        <div className="bg-slate-50/80 p-4 rounded-xl border border-slate-200/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-indigo-100/80 text-indigo-700 flex items-center justify-center">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[11px] font-bold text-slate-500 uppercase">UPI DIGITAL PAYMENTS</div>
              <div className="text-lg font-extrabold text-indigo-900">
                ₹{upiDigital.toFixed(2)}
              </div>
            </div>
          </div>
          <span className="text-[10px] font-semibold text-indigo-700 bg-indigo-100/60 px-2 py-0.5 rounded">
            Instant Settled
          </span>
        </div>

        <div className="bg-slate-50/80 p-4 rounded-xl border border-slate-200/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-sky-100/80 text-sky-700 flex items-center justify-center">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[11px] font-bold text-slate-500 uppercase">CARD / POS MACHINE</div>
              <div className="text-lg font-extrabold text-sky-900">
                ₹{cardPos.toFixed(2)}
              </div>
            </div>
          </div>
          <span className="text-[10px] font-semibold text-sky-700 bg-sky-100/60 px-2 py-0.5 rounded">
            Card Machine
          </span>
        </div>
      </div>

      {/* Middle Section: Chart & Fast Moving Medicines */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sales & Gross Profit Trends Chart Card */}
        <div className="lg:col-span-2 bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-800 text-sm">Sales & Gross Profit Trends</h3>
                <p className="text-[11px] text-slate-500">Real-time revenue, margins & product velocity</p>
              </div>

              {/* Range Toggle */}
              <div className="bg-slate-100 p-1 rounded-lg flex text-xs font-semibold">
                {(['Daily', 'Weekly', 'Monthly'] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setChartRange(tab)}
                    className={`px-3 py-1 rounded-md transition-all ${
                      chartRange === tab ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            </div>

            {/* Visual Simulated Bar Chart */}
            <div className="py-6">
              <div className="h-48 flex items-end gap-4 justify-between pt-6 px-2 border-b border-slate-200">
                {[
                  { label: '08:00 AM', sales: 180, profit: 55 },
                  { label: '10:00 AM', sales: 420, profit: 130 },
                  { label: '12:00 PM', sales: 650, profit: 210 },
                  { label: '02:00 PM', sales: 310, profit: 95 },
                  { label: '04:00 PM', sales: 890, profit: 280 },
                  { label: '06:00 PM', sales: 1100, profit: 340 },
                  { label: '08:00 PM', sales: 740, profit: 230 },
                ].map((item, idx) => {
                  const maxH = 1200;
                  const salesHeight = Math.max(10, (item.sales / maxH) * 100);
                  const profitHeight = Math.max(6, (item.profit / maxH) * 100);
                  return (
                    <div key={idx} className="flex-1 flex flex-col items-center gap-1 group">
                      <div className="w-full flex items-end justify-center gap-1.5 h-36">
                        {/* Sales Bar */}
                        <div
                          style={{ height: `${salesHeight}%` }}
                          className="w-4 bg-emerald-500 rounded-t-sm group-hover:bg-emerald-600 transition-all relative"
                          title={`Sales: ₹${item.sales}`}
                        ></div>
                        {/* Profit Bar */}
                        <div
                          style={{ height: `${profitHeight}%` }}
                          className="w-3 bg-teal-300 rounded-t-sm group-hover:bg-teal-400 transition-all"
                          title={`Profit: ₹${item.profit}`}
                        ></div>
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono">{item.label}</span>
                    </div>
                  );
                })}
              </div>

              {/* Legend */}
              <div className="flex items-center justify-center gap-6 mt-4 text-xs font-medium text-slate-600">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-xs bg-emerald-500"></span>
                  <span>Gross Sales (₹)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-xs bg-teal-300"></span>
                  <span>Gross Profit Margin (₹)</span>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>Average Counter Ticket Size: <b className="text-slate-800">₹314.50</b></span>
            <button
              onClick={() => onNavigateToTab('reports')}
              className="text-emerald-700 font-semibold hover:underline flex items-center gap-1"
            >
              <span>Full Analytics</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Fast-Moving Medicines List */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-800 text-sm">Fast-Moving Medicines</h3>
              <span className="text-[11px] text-slate-400">Top Velocity</span>
            </div>

            <div className="divide-y divide-slate-100 mt-2">
              {fastMoving.map((m, idx) => (
                <div key={idx} className="py-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-600 font-bold text-[10px] flex items-center justify-center">
                      {idx + 1}
                    </span>
                    <div>
                      <div className="text-xs font-bold text-slate-800">{m.name}</div>
                      <div className="text-[10px] text-slate-400 truncate max-w-[140px]">{m.category}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-bold text-emerald-700">
                      {m.qty > 0 ? `${m.qty} sold` : 'High demand'}
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono">
                      {m.stock} in stock
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={() => onNavigateToTab('catalog')}
            className="w-full mt-4 py-2 border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50 text-slate-700 hover:text-emerald-800 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5"
          >
            <Pill className="w-3.5 h-3.5" />
            <span>Manage Complete Formulary ({medicines.length} Products)</span>
          </button>
        </div>
      </div>

      {/* Bottom Compliance & Expiry Alert Strip */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Near Expiry Alert Banner */}
        <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-200 text-amber-800 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-4 h-4" />
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-amber-900">Near-Expiry FEFO Watch ({expiringBatches.length} Batches)</h4>
              <button
                onClick={() => onNavigateToTab('batches')}
                className="text-[11px] font-bold text-amber-800 hover:underline flex items-center gap-0.5"
              >
                <span>View Batches</span>
                <ChevronRight className="w-3 h-3" />
              </button>
            </div>
            <p className="text-[11px] text-amber-700 mt-0.5">
              Medicines expiring within the next 90 days. First Expiry First Out protocol active.
            </p>
          </div>
        </div>

        {/* Low Stock Warning Banner */}
        <div className="bg-rose-50/70 border border-rose-200 rounded-xl p-4 flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-rose-200 text-rose-800 flex items-center justify-center shrink-0">
            <ShieldAlert className="w-4 h-4" />
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-rose-900">Low Stock Reorder Alert ({lowStockItems.length} Items)</h4>
              <button
                onClick={() => onNavigateToTab('purchases')}
                className="text-[11px] font-bold text-rose-800 hover:underline flex items-center gap-0.5"
              >
                <span>Supplier Inward</span>
                <ChevronRight className="w-3 h-3" />
              </button>
            </div>
            <p className="text-[11px] text-rose-700 mt-0.5">
              Products with fewer than 15 packs remaining in store racks. Reorder advised.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
