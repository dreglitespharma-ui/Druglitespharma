import React, { useEffect, useState, useRef } from 'react';
import QRCode from 'qrcode';
import JsBarcode from 'jsbarcode';
import { X, QrCode, Printer, Download, Copy, Check, ShieldCheck, Barcode, Layers } from 'lucide-react';
import { Medicine, BatchInfo } from '../types/pharmacy';

interface MedicineQRModalProps {
  isOpen: boolean;
  onClose: () => void;
  medicine: Medicine | null;
  batch: BatchInfo | null;
}

export const MedicineQRModal: React.FC<MedicineQRModalProps> = ({
  isOpen,
  onClose,
  medicine,
  batch,
}) => {
  const [qrUrl, setQrUrl] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);
  const [labelFormat, setLabelFormat] = useState<'qr' | 'barcode' | 'combined'>('combined');
  const barcodeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const printableAreaRef = useRef<HTMLDivElement | null>(null);

  // Generate QR Code data URL
  useEffect(() => {
    if (isOpen && medicine && batch) {
      const payload = JSON.stringify({
        brand: medicine.brandName,
        generic: medicine.genericName,
        strength: medicine.strength,
        batch: batch.batchNumber,
        mfg: batch.mfgDate,
        exp: batch.expiryDate,
        mrp: batch.mrp,
        barcode: batch.barcode,
        hsn: medicine.hsnCode,
      });

      QRCode.toDataURL(payload, {
        width: 320,
        margin: 2,
        color: {
          dark: '#0f172a',
          light: '#ffffff',
        },
      })
        .then(url => setQrUrl(url))
        .catch(err => console.error('QR code generation error:', err));
    }
  }, [isOpen, medicine, batch]);

  // Generate 1D Barcode with JsBarcode
  useEffect(() => {
    if (isOpen && batch?.barcode && barcodeCanvasRef.current) {
      try {
        const isEan13 = batch.barcode.length === 13 && /^\d+$/.test(batch.barcode);
        JsBarcode(barcodeCanvasRef.current, batch.barcode, {
          format: isEan13 ? 'EAN13' : 'CODE128',
          lineColor: '#0f172a',
          width: 1.8,
          height: 52,
          displayValue: true,
          fontSize: 12,
          margin: 6,
          background: '#ffffff',
        });
      } catch (err) {
        // Fallback to Code 128 if EAN13 checksum fails
        try {
          if (barcodeCanvasRef.current) {
            JsBarcode(barcodeCanvasRef.current, batch.barcode, {
              format: 'CODE128',
              lineColor: '#0f172a',
              width: 1.8,
              height: 52,
              displayValue: true,
              fontSize: 12,
              margin: 6,
              background: '#ffffff',
            });
          }
        } catch (innerErr) {
          console.warn('JsBarcode render note:', innerErr);
        }
      }
    }
  }, [isOpen, batch, labelFormat]);

  if (!isOpen || !medicine || !batch) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(
      `MED:${medicine.brandName}|BATCH:${batch.batchNumber}|EXP:${batch.expiryDate}|MRP:${batch.mrp}|BARCODE:${batch.barcode}`
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (labelFormat === 'qr' && qrUrl) {
      const a = document.createElement('a');
      a.href = qrUrl;
      a.download = `${medicine.brandName.replace(/\s+/g, '_')}_${batch.batchNumber}_QR.png`;
      a.click();
    } else if (barcodeCanvasRef.current) {
      const a = document.createElement('a');
      a.href = barcodeCanvasRef.current.toDataURL('image/png');
      a.download = `${medicine.brandName.replace(/\s+/g, '_')}_${batch.batchNumber}_BARCODE.png`;
      a.click();
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center">
              <QrCode className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-sm">Medicine Label & Barcode Generator</h3>
              <p className="text-[11px] text-slate-500">GS1 2D QR Code & 1D Linear Barcode</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Format Selector Tabs */}
        <div className="flex items-center border-b border-slate-200 px-4 bg-slate-50 text-xs">
          <button
            onClick={() => setLabelFormat('combined')}
            className={`flex items-center gap-1.5 px-3 py-2 font-semibold border-b-2 cursor-pointer transition-colors ${
              labelFormat === 'combined'
                ? 'border-emerald-600 text-emerald-800 bg-emerald-50/50'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Combined Sticker</span>
          </button>
          <button
            onClick={() => setLabelFormat('barcode')}
            className={`flex items-center gap-1.5 px-3 py-2 font-semibold border-b-2 cursor-pointer transition-colors ${
              labelFormat === 'barcode'
                ? 'border-emerald-600 text-emerald-800 bg-emerald-50/50'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Barcode className="w-3.5 h-3.5" />
            <span>1D Barcode</span>
          </button>
          <button
            onClick={() => setLabelFormat('qr')}
            className={`flex items-center gap-1.5 px-3 py-2 font-semibold border-b-2 cursor-pointer transition-colors ${
              labelFormat === 'qr'
                ? 'border-emerald-600 text-emerald-800 bg-emerald-50/50'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <QrCode className="w-3.5 h-3.5" />
            <span>2D QR Code</span>
          </button>
        </div>

        {/* Content */}
        <div className="p-5 flex flex-col items-center">
          {/* Printable Sticker Preview Box */}
          <div 
            ref={printableAreaRef}
            className="w-full bg-slate-50 border-2 border-dashed border-slate-300 rounded-xl p-4 flex flex-col items-center text-center shadow-xs"
          >
            <div className="text-xs font-black text-slate-900 tracking-wide uppercase">
              {medicine.brandName} <span className="text-emerald-700">({medicine.strength})</span>
            </div>
            <div className="text-[11px] text-slate-500 font-medium">
              {medicine.genericName} • {medicine.dosageForm}
            </div>

            {/* Visual Code Area */}
            <div className="my-3 p-3 bg-white rounded-xl border border-slate-200 shadow-xs flex flex-col items-center justify-center min-w-[200px]">
              
              {/* Combined or 1D Barcode */}
              {(labelFormat === 'combined' || labelFormat === 'barcode') && (
                <div className="mb-2 flex flex-col items-center">
                  <canvas ref={barcodeCanvasRef} className="max-w-full h-auto rounded" />
                </div>
              )}

              {/* Combined or 2D QR Code */}
              {(labelFormat === 'combined' || labelFormat === 'qr') && (
                <div className="flex flex-col items-center">
                  {qrUrl ? (
                    <img 
                      src={qrUrl} 
                      alt="Medicine QR" 
                      className={`rounded ${labelFormat === 'combined' ? 'w-28 h-28' : 'w-44 h-44'}`} 
                    />
                  ) : (
                    <div className="w-28 h-28 flex items-center justify-center text-xs text-slate-400">
                      Generating QR...
                    </div>
                  )}
                  <span className="text-[9px] font-mono text-slate-400 mt-1">
                    Scan with optical camera or phone
                  </span>
                </div>
              )}
            </div>

            {/* Batch & Pricing Details Table */}
            <div className="w-full grid grid-cols-2 gap-2 text-left bg-white p-2.5 rounded-lg border border-slate-200 text-xs">
              <div>
                <span className="text-[10px] text-slate-400 block font-semibold uppercase">Batch No</span>
                <span className="font-mono font-bold text-slate-800">{batch.batchNumber}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block font-semibold uppercase">Expiry Date</span>
                <span className="font-mono font-bold text-rose-600">{batch.expiryDate}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block font-semibold uppercase">MRP (Incl. Tax)</span>
                <span className="font-bold text-slate-900">₹{batch.mrp.toFixed(2)}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block font-semibold uppercase">Rack Location</span>
                <span className="font-bold text-slate-700">{batch.rackLocation || 'Shelf A-1'}</span>
              </div>
            </div>
          </div>

          <div className="mt-3 flex items-center gap-2 text-xs text-emerald-800 bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-200">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span className="text-[11px] font-medium">GS1 Healthcare & ISO Compliant Barcode Standards</span>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
          <button
            onClick={handleDownload}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 text-xs font-semibold transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span>Download PNG</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 text-xs font-semibold transition-colors cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-500" />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>

            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors shadow-xs cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Sticker</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
