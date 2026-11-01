import React, { useState } from 'react';
import { Wallet, Plus, IndianRupee, Zap, Package, X, CheckCircle2, Calendar } from 'lucide-react';
import { StoreExpense, StaffMember } from '../../types/pharmacy';
import { sound } from '../../utils/sound';

interface ExpensesCashViewProps {
  expenses: StoreExpense[];
  activeStaff: StaffMember;
  onAddExpense: (expense: StoreExpense) => void;
}

export const ExpensesCashView: React.FC<ExpensesCashViewProps> = ({
  expenses,
  activeStaff,
  onAddExpense,
}) => {
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [category, setCategory] = useState<StoreExpense['category']>('Tea & Refreshment');
  const [amount, setAmount] = useState<number>(150);
  const [paymentMode, setPaymentMode] = useState<StoreExpense['paymentMode']>('Cash');
  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [description, setDescription] = useState<string>('');
  const [receiptNumber, setReceiptNumber] = useState<string>('');

  const totalExpenses = expenses.reduce((acc, e) => acc + e.amount, 0);
  const utilityExpenses = expenses
    .filter(e => e.category === 'Electricity & Utilities' || e.category === 'Rent')
    .reduce((acc, e) => acc + e.amount, 0);
  const packagingExpenses = expenses
    .filter(e => e.category === 'Packaging & Consumables' || e.category === 'Tea & Refreshment')
    .reduce((acc, e) => acc + e.amount, 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (amount <= 0) return;

    const newExp: StoreExpense = {
      id: `exp-${Date.now()}`,
      date,
      category,
      amount: Number(amount),
      paymentMode,
      recordedBy: activeStaff.name,
      description: description || `${category} expense`,
      receiptNumber: receiptNumber || undefined,
    };

    onAddExpense(newExp);
    sound.playSuccessChime();
    setIsModalOpen(false);

    setAmount(100);
    setDescription('');
    setReceiptNumber('');
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      {/* Header */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-800">Operating Expenses & Cash Tally Register</h2>
          <p className="text-xs text-slate-500">
            Daily Store Overheads, Utility Bills, Cash Drawer Reconciliations
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-98"
        >
          <Plus className="w-4 h-4" />
          <span>+ Record Expense</span>
        </button>
      </div>

      {/* Top 3 KPI Cards (Matching Video 2:18) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500 uppercase">
            <span>TOTAL EXPENSES</span>
            <Wallet className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-2xl font-extrabold text-rose-600 mt-2 font-mono">
            ₹{totalExpenses.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Pharmacy operational outgoings</p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500 uppercase">
            <span>RENT & UTILITIES</span>
            <Zap className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-extrabold text-slate-900 mt-2 font-mono">
            ₹{utilityExpenses.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Shop lease, BESCOM electricity, AC</p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500 uppercase">
            <span>PACKAGING & CONSUMABLES</span>
            <Package className="w-4 h-4 text-teal-500" />
          </div>
          <div className="text-2xl font-extrabold text-slate-900 mt-2 font-mono">
            ₹{packagingExpenses.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Medicine bags, thermal rolls, sanitizers</p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 font-semibold text-slate-600 uppercase text-[10px] tracking-wider">
                <th className="p-3">Expense Date</th>
                <th className="p-3">Category</th>
                <th className="p-3">Description / Remarks</th>
                <th className="p-3 text-right">Amount (₹)</th>
                <th className="p-3 text-center">Payment Mode</th>
                <th className="p-3">Recorded By</th>
                <th className="p-3">Voucher / Receipt #</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
              {expenses.map(exp => (
                <tr key={exp.id} className="hover:bg-slate-50/60">
                  <td className="p-3 text-slate-500 font-mono text-[11px]">{exp.date}</td>
                  <td className="p-3">
                    <span className="px-2 py-0.5 rounded font-bold text-[10px] bg-slate-100 text-slate-700">
                      {exp.category}
                    </span>
                  </td>
                  <td className="p-3 text-slate-700 font-medium">{exp.description}</td>
                  <td className="p-3 text-right font-extrabold text-rose-600 font-mono">
                    ₹{exp.amount.toFixed(2)}
                  </td>
                  <td className="p-3 text-center">
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-800">
                      {exp.paymentMode}
                    </span>
                  </td>
                  <td className="p-3 text-slate-600">{exp.recordedBy}</td>
                  <td className="p-3 text-slate-400 font-mono text-[11px]">
                    {exp.receiptNumber || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Record Store Expense Modal (Matching Video 2:22 - 2:25) */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center">
                  <Wallet className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-sm">Record Store Expense</h3>
                  <p className="text-[11px] text-slate-500">Operating Outgoings & Petty Cash</p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Expense Category *</label>
                <select
                  value={category}
                  onChange={e => setCategory(e.target.value as StoreExpense['category'])}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs focus:outline-emerald-600 bg-white"
                >
                  {[
                    'Rent',
                    'Electricity & Utilities',
                    'Staff Salary',
                    'Tea & Refreshment',
                    'Packaging & Consumables',
                    'Store Maintenance',
                    'Software & Tech',
                    'Miscellaneous',
                  ].map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Amount (₹) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    required
                    value={amount}
                    onChange={e => setAmount(Number(e.target.value))}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-mono font-bold focus:outline-emerald-600"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Payment Mode</label>
                  <select
                    value={paymentMode}
                    onChange={e => setPaymentMode(e.target.value as StoreExpense['paymentMode'])}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs focus:outline-emerald-600 bg-white"
                  >
                    <option value="Cash">Cash in Drawer</option>
                    <option value="UPI / Bank">UPI / Bank Transfer</option>
                    <option value="Card">Credit / Debit Card</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Expense Date</label>
                <input
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs focus:outline-emerald-600"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Description / Remarks</label>
                <input
                  type="text"
                  placeholder="e.g. October BESCOM Power Bill or Daily tea"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs focus:outline-emerald-600"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Receipt / Voucher Number</label>
                <input
                  type="text"
                  placeholder="e.g. BESCOM/88210"
                  value={receiptNumber}
                  onChange={e => setReceiptNumber(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-mono focus:outline-emerald-600"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3 py-1.5 border border-slate-200 text-slate-700 rounded-lg text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-xs cursor-pointer"
                >
                  Save Expense
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
