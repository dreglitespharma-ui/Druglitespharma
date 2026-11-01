import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { X, CheckCircle2, ArrowRight } from 'lucide-react';

interface UPIPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  amount: number;
  billNumber: string;
  upiId: string;
  merchantName: string;
  onPaymentSuccess: (transactionRef: string) => void;
}

export const UPIPaymentModal: React.FC<UPIPaymentModalProps> = ({
  isOpen,
  onClose,
  amount,
  billNumber,
  upiId,
  merchantName,
  onPaymentSuccess,
}) => {
  const [qrUrl, setQrUrl] = useState<string>('');
  const [qrError, setQrError] = useState<string>('');
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [transactionRef, setTransactionRef] = useState<string>('');
  const isValidUpiId = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z0-9.-]{2,64}$/.test(upiId.trim());

  useEffect(() => {
    setTransactionRef('');
    setQrUrl('');
    setQrError('');
    if (isOpen && amount > 0 && isValidUpiId) {
      const upiUri = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(merchantName)}&am=${amount.toFixed(2)}&cu=INR&tn=${encodeURIComponent(`Pharmacy Bill ${billNumber}`)}`;

      QRCode.toDataURL(upiUri, {
        width: 300,
        margin: 2,
        color: {
          dark: '#0f172a',
          light: '#ffffff',
        },
      })
        .then(url => setQrUrl(url))
        .catch(err => {
          console.error('Failed to generate UPI QR:', err);
          setQrError('Could not generate the payment QR. Check the store UPI ID and try again.');
        });
    }
  }, [isOpen, amount, billNumber, isValidUpiId, upiId, merchantName]);

  if (!isOpen) return null;

  const handleConfirmPayment = () => {
    const reference = transactionRef.trim();
    if (!/^[a-zA-Z0-9-]{6,50}$/.test(reference)) {
      return;
    }
    setIsVerifying(true);
    try {
      onPaymentSuccess(reference);
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-emerald-50/60">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold text-xs">
              UPI
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-sm">Scan & Pay via any UPI App</h3>
              <p className="text-[11px] text-slate-500">Scan the QR and verify payment in your merchant app</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 flex flex-col items-center text-center">
          {/* Amount Display */}
          <div className="mb-3">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
              TOTAL AMOUNT PAYABLE
            </span>
            <div className="text-3xl font-extrabold text-emerald-600">
              ₹{amount.toFixed(2)}
            </div>
          </div>

          {/* QR Container */}
          {!isValidUpiId ? (
            <div role="alert" className="w-full p-4 rounded-xl border border-amber-300 bg-amber-50 text-sm text-amber-900">
              Enter a valid store UPI ID in Settings before accepting UPI payments.
            </div>
          ) : (
            <div className="p-3 bg-white rounded-2xl border-2 border-emerald-500/80 shadow-md">
            {qrError ? (
              <div role="alert" className="w-52 h-52 flex items-center justify-center text-xs text-rose-700">
                {qrError}
              </div>
            ) : qrUrl ? (
              <img src={qrUrl} alt="UPI QR" className="w-52 h-52 rounded-lg" />
            ) : (
              <div className="w-52 h-52 flex items-center justify-center text-xs text-slate-400">
                Generating Dynamic UPI QR...
              </div>
            )}
            </div>
          )}

          <div className="mt-3 text-xs text-slate-600 font-medium">
            Merchant: <span className="font-bold text-slate-800">{merchantName}</span>
          </div>
          <div className="text-[11px] font-mono text-slate-500">
            UPI VPA: {upiId}
          </div>

          {isValidUpiId && (
            <div className="mt-4 w-full text-left space-y-2">
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2">
                This QR does not confirm payment automatically. Verify the amount is credited in your merchant app before completing the bill.
              </p>
              <label htmlFor="upi-transaction-reference" className="block text-xs font-semibold text-slate-700">
                UPI transaction reference / UTR *
              </label>
              <input
                id="upi-transaction-reference"
                value={transactionRef}
                onChange={event => setTransactionRef(event.target.value)}
                minLength={6}
                maxLength={50}
                required
                autoComplete="off"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono"
                placeholder="Enter the reference from the verified payment"
              />
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-3">
          <button
            onClick={onClose}
            className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 rounded-lg hover:bg-slate-100 transition-colors"
          >
            Cancel
          </button>

          <button
            onClick={handleConfirmPayment}
            disabled={isVerifying || !isValidUpiId || !qrUrl || !/^[a-zA-Z0-9-]{6,50}$/.test(transactionRef.trim())}
            className="flex-1 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer active:scale-98 disabled:opacity-50"
          >
            {isVerifying ? (
              <>
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                <span>Saving payment reference...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>Confirm payment received</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
