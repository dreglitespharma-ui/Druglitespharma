import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  X, 
  Scan, 
  Camera, 
  Keyboard, 
  CheckCircle2, 
  AlertTriangle, 
  ShoppingCart, 
  Sparkles, 
  Upload, 
  Plus, 
  Zap, 
  Eye,
  RefreshCw,
  QrCode,
  Check,
  Maximize2,
  Sliders
} from 'lucide-react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { Medicine, BatchInfo } from '../types/pharmacy';
import { sound } from '../utils/sound';

interface BarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  medicines: Medicine[];
  onSelectMedicine?: (medicine: Medicine, batch: BatchInfo) => void;
  onViewInCatalog?: (medicine: Medicine) => void;
  onRegisterNewWithBarcode?: (barcode: string) => void;
  onBarcodeScanned?: (barcode: string) => void;
}

interface DecodedDetails {
  rawCode: string;
  matchedMedicine: Medicine | null;
  matchedBatch: BatchInfo | null;
  parsedMetadata?: {
    brand?: string;
    generic?: string;
    strength?: string;
    batch?: string;
    exp?: string;
    mrp?: number;
    barcode?: string;
  };
}

// Supported barcode and 2D formats for pharmaceutical packages
const ALL_SUPPORTED_FORMATS: Html5QrcodeSupportedFormats[] = [
  Html5QrcodeSupportedFormats.QR_CODE,
  Html5QrcodeSupportedFormats.DATA_MATRIX,
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.CODE_93,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.ITF,
  Html5QrcodeSupportedFormats.CODABAR,
  Html5QrcodeSupportedFormats.AZTEC,
  Html5QrcodeSupportedFormats.PDF_417,
];

export const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({
  isOpen,
  onClose,
  medicines,
  onSelectMedicine,
  onViewInCatalog,
  onRegisterNewWithBarcode,
  onBarcodeScanned,
}) => {
  const [activeMode, setActiveMode] = useState<'camera' | 'upload' | 'manual' | 'presets'>('camera');
  const [manualCode, setManualCode] = useState<string>('');
  const [decodedResult, setDecodedResult] = useState<DecodedDetails | null>(null);
  const [scanSuccessNotification, setScanSuccessNotification] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');
  
  // Camera state
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [availableCameras, setAvailableCameras] = useState<{ id: string; label: string }[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [torchOn, setTorchOn] = useState<boolean>(false);
  
  // Scanner configuration toggles
  const [autoAddToCart, setAutoAddToCart] = useState<boolean>(true);
  const [continuousScan, setContinuousScan] = useState<boolean>(false);
  const [uploadStatus, setUploadStatus] = useState<string>('');
  const [uploadedPreview, setUploadedPreview] = useState<string | null>(null);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const nativeDetectorIntervalRef = useRef<number | null>(null);
  const videoObserverRef = useRef<MutationObserver | null>(null);
  const isStartingRef = useRef<boolean>(false);
  const isStoppingRef = useRef<boolean>(false);
  const lastScannedTimeRef = useRef<number>(0);
  const lastScannedCodeRef = useRef<string>('');

  // Keep references to frequently changing props to prevent camera re-renders
  const autoAddToCartRef = useRef(autoAddToCart);
  autoAddToCartRef.current = autoAddToCart;
  const continuousScanRef = useRef(continuousScan);
  continuousScanRef.current = continuousScan;
  const onSelectMedicineRef = useRef(onSelectMedicine);
  onSelectMedicineRef.current = onSelectMedicine;
  const onBarcodeScannedRef = useRef(onBarcodeScanned);
  onBarcodeScannedRef.current = onBarcodeScanned;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const selectedCameraIdRef = useRef(selectedCameraId);
  selectedCameraIdRef.current = selectedCameraId;

  // Safely stop running scanner without triggering onabort throw
  const stopScanner = useCallback(async () => {
    if (isStoppingRef.current) return;
    isStoppingRef.current = true;

    if (videoObserverRef.current) {
      try {
        videoObserverRef.current.disconnect();
      } catch (_) {}
      videoObserverRef.current = null;
    }

    if (nativeDetectorIntervalRef.current) {
      window.clearInterval(nativeDetectorIntervalRef.current);
      nativeDetectorIntervalRef.current = null;
    }

    const container = document.getElementById('barcode-interactive-reader');
    if (container) {
      const vids = container.querySelectorAll('video');
      vids.forEach(v => {
        try {
          v.onabort = null;
          v.onerror = null;
        } catch (_) {}
      });
    }

    if (scannerRef.current) {
      const scanner = scannerRef.current;
      scannerRef.current = null;
      try {
        if (scanner.isScanning) {
          await scanner.stop();
        }
      } catch (err) {
        console.warn('Scanner stop notice:', err);
      }
      try {
        await scanner.clear();
      } catch (err) {
        console.warn('Scanner clear notice:', err);
      }
    }

    if (container) {
      const vids = container.querySelectorAll('video');
      vids.forEach(video => {
        try {
          video.onabort = null;
          video.onerror = null;
          video.pause();
          if (video.srcObject) {
            const stream = video.srcObject as MediaStream;
            stream.getTracks().forEach(track => {
              try { track.stop(); } catch (_) {}
            });
            video.srcObject = null;
          }
        } catch (_) {}
      });
    }

    setCameraActive(false);
    setTorchOn(false);
    isStoppingRef.current = false;
  }, []);

  /**
   * Smart Parser: handles raw 1D numbers, JSON QR codes, pipe-delimited text, and GS1 DataMatrix
   */
  const parseScannedCode = useCallback((raw: string): DecodedDetails => {
    const trimmed = raw.trim();
    let parsedMeta: DecodedDetails['parsedMetadata'] = undefined;
    let candidateBarcodes: string[] = [trimmed];
    let candidateBatches: string[] = [trimmed];
    let candidateBrands: string[] = [trimmed];

    // 1. Try parsing JSON (generated by MedicineQRModal)
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        const obj = JSON.parse(trimmed);
        parsedMeta = {
          brand: obj.brand || obj.brandName || obj.name,
          generic: obj.generic || obj.genericName,
          strength: obj.strength,
          batch: obj.batch || obj.batchNumber,
          exp: obj.exp || obj.expiryDate,
          mrp: typeof obj.mrp === 'number' ? obj.mrp : parseFloat(obj.mrp) || undefined,
          barcode: obj.barcode,
        };
        if (parsedMeta.barcode) candidateBarcodes.unshift(parsedMeta.barcode);
        if (parsedMeta.batch) candidateBatches.unshift(parsedMeta.batch);
        if (parsedMeta.brand) candidateBrands.unshift(parsedMeta.brand);
      } catch (_) {}
    }

    // 2. Try parsing Pipe-delimited (e.g., MED:Dolo 650|BATCH:DL-123|BARCODE:890...)
    if (trimmed.includes('|') || trimmed.includes(':')) {
      const parts = trimmed.split('|');
      const tempMeta: any = {};
      parts.forEach(p => {
        const [k, v] = p.split(':');
        if (k && v) {
          const key = k.trim().toUpperCase();
          const val = v.trim();
          if (key.includes('MED') || key.includes('BRAND')) tempMeta.brand = val;
          if (key.includes('BATCH')) tempMeta.batch = val;
          if (key.includes('BARCODE') || key.includes('CODE')) tempMeta.barcode = val;
          if (key.includes('MRP')) tempMeta.mrp = parseFloat(val);
          if (key.includes('EXP')) tempMeta.exp = val;
        }
      });
      if (tempMeta.barcode || tempMeta.batch || tempMeta.brand) {
        parsedMeta = { ...parsedMeta, ...tempMeta };
        if (tempMeta.barcode) candidateBarcodes.unshift(tempMeta.barcode);
        if (tempMeta.batch) candidateBatches.unshift(tempMeta.batch);
        if (tempMeta.brand) candidateBrands.unshift(tempMeta.brand);
      }
    }

    // 3. Try parsing GS1 Application Identifiers (e.g. (01)08901234567890(17)261231(10)BATCH123)
    if (trimmed.includes('(01)') || trimmed.includes('(10)')) {
      const gtinMatch = trimmed.match(/\(01\)(\d+)/);
      const batchMatch = trimmed.match(/\(10\)([^\(\)]+)/);
      if (gtinMatch && gtinMatch[1]) {
        // Remove leading 0 if 14-digit GTIN
        const cleanGtin = gtinMatch[1].length === 14 && gtinMatch[1].startsWith('0') 
          ? gtinMatch[1].slice(1) 
          : gtinMatch[1];
        candidateBarcodes.unshift(cleanGtin);
      }
      if (batchMatch && batchMatch[1]) {
        candidateBatches.unshift(batchMatch[1]);
      }
    }

    // Lookup across store formulary
    for (const med of medicines) {
      for (const batch of med.batches) {
        // Direct barcode match
        for (const cb of candidateBarcodes) {
          if (!cb) continue;
          if (batch.barcode === cb) {
            return { rawCode: trimmed, matchedMedicine: med, matchedBatch: batch, parsedMetadata: parsedMeta };
          }
          // Handle 13-digit vs 12-digit UPC/EAN leading zero variations
          if (
            (cb.length === 13 && cb.startsWith('0') && batch.barcode === cb.slice(1)) ||
            (batch.barcode.length === 13 && batch.barcode.startsWith('0') && batch.barcode.slice(1) === cb)
          ) {
            return { rawCode: trimmed, matchedMedicine: med, matchedBatch: batch, parsedMetadata: parsedMeta };
          }
        }

        // Direct batch match
        for (const cbt of candidateBatches) {
          if (cbt && batch.batchNumber.toLowerCase() === cbt.toLowerCase()) {
            return { rawCode: trimmed, matchedMedicine: med, matchedBatch: batch, parsedMetadata: parsedMeta };
          }
        }

        // Brand name exact match
        for (const cbr of candidateBrands) {
          if (cbr && med.brandName.toLowerCase() === cbr.toLowerCase()) {
            return { rawCode: trimmed, matchedMedicine: med, matchedBatch: batch, parsedMetadata: parsedMeta };
          }
        }
      }
    }

    // No match found in current formulary
    return {
      rawCode: trimmed,
      matchedMedicine: null,
      matchedBatch: null,
      parsedMetadata: parsedMeta,
    };
  }, [medicines]);

  // Neutralize video onabort thrown by html5-qrcode
  const sanitizeVideoElement = (v: HTMLVideoElement) => {
    try {
      v.onabort = null;
      v.onerror = null;
      try {
        Object.defineProperty(v, 'onabort', {
          get: () => null,
          set: () => {},
          configurable: true,
          enumerable: true,
        });
      } catch (_) {}
    } catch (_) {}
  };

  /**
   * Handle decoded string from any source (camera, image, gun, manual)
   */
  const handleDecodedBarcode = useCallback((code: string) => {
    const trimmed = code.trim();
    if (!trimmed) return;

    // Debounce duplicate scans within 1.2s if continuous mode
    const now = Date.now();
    if (now - lastScannedTimeRef.current < 1200 && lastScannedCodeRef.current === trimmed) {
      return;
    }
    lastScannedTimeRef.current = now;
    lastScannedCodeRef.current = trimmed;

    sound.playBarcodeBeep();
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try { navigator.vibrate(120); } catch (_) {}
    }

    // If modal was opened specifically for single-input callback (e.g. from Add Medicine form):
    if (onBarcodeScannedRef.current) {
      stopScanner();
      onBarcodeScannedRef.current(trimmed);
      onCloseRef.current();
      return;
    }

    const result = parseScannedCode(trimmed);
    setDecodedResult(result);
    setErrorMsg('');

    // If auto-add to cart is active and item was matched:
    if (autoAddToCartRef.current && result.matchedMedicine && result.matchedBatch && onSelectMedicineRef.current) {
      onSelectMedicineRef.current(result.matchedMedicine, result.matchedBatch);
      setScanSuccessNotification(`Added ${result.matchedMedicine.brandName} (${result.matchedBatch.batchNumber}) to Cart!`);
      setTimeout(() => setScanSuccessNotification(null), 3000);

      if (!continuousScanRef.current) {
        stopScanner();
        onCloseRef.current();
        return;
      }
    } else if (!continuousScanRef.current) {
      // Pause or stop camera so user can inspect card
      stopScanner();
    }
  }, [parseScannedCode, stopScanner]);

  /**
   * Start Optical Camera Scanner with All 1D and 2D Formats
   */
  const startCameraScanner = useCallback(async (targetCamId?: string) => {
    if (isStartingRef.current) return;
    isStartingRef.current = true;
    setCameraError(null);
    setErrorMsg('');

    await stopScanner();

    // Small delay to ensure modal element is in DOM
    setTimeout(async () => {
      const container = document.getElementById('barcode-interactive-reader');
      if (!container) {
        isStartingRef.current = false;
        return;
      }

      try {
        let devices: { id: string; label: string }[] = [];
        try {
          devices = await Html5Qrcode.getCameras();
          if (devices && devices.length > 0) {
            setAvailableCameras(devices);
          }
        } catch {
          // Camera enumeration requires permission
        }

        // Observe video element insertion to neutralize onabort throw
        if (videoObserverRef.current) {
          try { videoObserverRef.current.disconnect(); } catch (_) {}
        }
        const observer = new MutationObserver((mutations) => {
          mutations.forEach((m) => {
            m.addedNodes.forEach((node) => {
              if (node instanceof HTMLVideoElement) {
                sanitizeVideoElement(node);
              } else if (node instanceof HTMLElement) {
                const vids = node.querySelectorAll('video');
                vids.forEach((v) => sanitizeVideoElement(v));
              }
            });
          });
        });
        observer.observe(container, { childList: true, subtree: true });
        videoObserverRef.current = observer;

        // CRITICAL FIX: Pass formatsToSupport in constructor so Html5Qrcode decodes both 1D and 2D barcodes
        const html5QrCode = new Html5Qrcode('barcode-interactive-reader', {
          formatsToSupport: ALL_SUPPORTED_FORMATS,
          verbose: false,
          experimentalFeatures: {
            useBarCodeDetectorIfSupported: true,
          },
        });
        scannerRef.current = html5QrCode;

        // Camera Scan Config: Scan full frame area with high FPS
        const scanConfig = {
          fps: 25,
          qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
            const width = Math.floor(Math.max(220, Math.min(viewfinderWidth * 0.85, 480)));
            const height = Math.floor(Math.max(160, Math.min(viewfinderHeight * 0.65, 300)));
            return { width, height };
          },
          aspectRatio: 1.333333,
          disableFlip: false,
        };

        const camIdToUse = targetCamId || selectedCameraIdRef.current;
        let started = false;

        if (camIdToUse) {
          try {
            await html5QrCode.start(
              { deviceId: { exact: camIdToUse } },
              scanConfig,
              (decodedText) => handleDecodedBarcode(decodedText),
              () => {}
            );
            started = true;
          } catch (err) {
            console.warn('Selected camera ID failed, attempting environment camera...', err);
          }
        }

        if (!started) {
          try {
            // Mobile environment facing (rear camera)
            await html5QrCode.start(
              { facingMode: 'environment' },
              scanConfig,
              (decodedText) => handleDecodedBarcode(decodedText),
              () => {}
            );
            started = true;
          } catch (envErr) {
            console.warn('Environment facingMode failed, attempting user camera...', envErr);
            try {
              // User facing (laptop / desktop webcam)
              await html5QrCode.start(
                { facingMode: 'user' },
                scanConfig,
                (decodedText) => handleDecodedBarcode(decodedText),
                () => {}
              );
              started = true;
            } catch (userErr) {
              if (devices && devices.length > 0) {
                await html5QrCode.start(
                  devices[0].id,
                  scanConfig,
                  (decodedText) => handleDecodedBarcode(decodedText),
                  () => {}
                );
                started = true;
              } else {
                throw userErr;
              }
            }
          }
        }

        // Sanitize any video elements created
        const vids = container.querySelectorAll('video');
        vids.forEach((v) => sanitizeVideoElement(v));

        setCameraActive(true);

        // Hardware-accelerated native BarcodeDetector loop for instant scanning at 15fps
        if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
          try {
            let formats = [
              'qr_code', 'ean_13', 'ean_8', 'code_128', 'code_39', 
              'code_93', 'upc_a', 'upc_e', 'data_matrix', 'itf', 'aztec', 'pdf417'
            ];
            try {
              const supported = await (window as any).BarcodeDetector.getSupportedFormats();
              if (Array.isArray(supported) && supported.length > 0) {
                formats = formats.filter(f => supported.includes(f));
              }
            } catch (_) {}

            const detector = new (window as any).BarcodeDetector({ formats });
            const videoElem = container.querySelector('video');
            if (videoElem) {
              nativeDetectorIntervalRef.current = window.setInterval(async () => {
                if (!videoElem || videoElem.paused || videoElem.readyState < 2) return;
                try {
                  const codes = await detector.detect(videoElem);
                  if (codes && codes.length > 0 && codes[0]?.rawValue) {
                    handleDecodedBarcode(codes[0].rawValue);
                  }
                } catch (_) {}
              }, 90);
            }
          } catch (detErr) {
            console.warn('Native BarcodeDetector loop setup note:', detErr);
          }
        }
      } catch (err: any) {
        console.error('Camera initialization error:', err);
        setCameraActive(false);
        const isPermission = 
          err?.message?.includes('Permission') || 
          err?.name === 'NotAllowedError' || 
          err?.name === 'PermissionDeniedError';
        setCameraError(
          isPermission
            ? 'Camera permission was denied. Please allow camera access in browser settings, or use "Upload Photo" / "Barcode Gun / Manual" or "Quick Test".'
            : 'Could not access optical camera. Switch camera device above or use "Upload Photo" / "Quick Test".'
        );
      } finally {
        isStartingRef.current = false;
      }
    }, 120);
  }, [stopScanner, handleDecodedBarcode]);

  useEffect(() => {
    if (!isOpen) {
      stopScanner();
      setDecodedResult(null);
      setErrorMsg('');
      setCameraError(null);
      setUploadStatus('');
      setUploadedPreview(null);
      return;
    }

    if (activeMode === 'camera') {
      startCameraScanner();
    } else {
      stopScanner();
    }

    return () => {
      stopScanner();
    };
  }, [isOpen, activeMode, startCameraScanner, stopScanner]);

  const handleCameraChange = async (newCamId: string) => {
    setSelectedCameraId(newCamId);
    await startCameraScanner(newCamId);
  };

  const toggleTorch = async () => {
    if (!scannerRef.current || !cameraActive) return;
    try {
      await (scannerRef.current as any).applyVideoConstraints({
        advanced: [{ torch: !torchOn }]
      });
      setTorchOn(!torchOn);
    } catch {
      // Torch not supported on current device
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim()) return;
    handleDecodedBarcode(manualCode);
  };

  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadStatus('Scanning packaging image for 1D barcodes and 2D QR codes...');
    setErrorMsg('');

    // Preview image
    const reader = new FileReader();
    reader.onload = (ev) => {
      setUploadedPreview(ev.target?.result as string);
    };
    reader.readAsDataURL(file);

    // Method 1: Hardware-accelerated BarcodeDetector on image bitmap
    if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
      try {
        const bitmap = await createImageBitmap(file);
        const detector = new (window as any).BarcodeDetector();
        const detected = await detector.detect(bitmap);
        if (detected && detected.length > 0 && detected[0]?.rawValue) {
          setUploadStatus('');
          handleDecodedBarcode(detected[0].rawValue);
          return;
        }
      } catch (_) {}
    }

    // Method 2: Fallback to Html5Qrcode with all 1D and 2D formats configured
    try {
      let tempContainer = document.getElementById('barcode-file-temp-viewport');
      if (!tempContainer) {
        tempContainer = document.createElement('div');
        tempContainer.id = 'barcode-file-temp-viewport';
        tempContainer.style.display = 'none';
        document.body.appendChild(tempContainer);
      }
      const tempScanner = new Html5Qrcode('barcode-file-temp-viewport', {
        formatsToSupport: ALL_SUPPORTED_FORMATS,
        verbose: false,
      });
      const decodedText = await tempScanner.scanFile(file, true);
      try { await tempScanner.clear(); } catch (_) {}
      setUploadStatus('');
      handleDecodedBarcode(decodedText);
    } catch (err) {
      setUploadStatus('');
      sound.playWarningBeep();
      setErrorMsg('No clear barcode or QR code detected. Ensure good lighting, crop close to the barcode/QR code, or use "Barcode Gun / Manual" or "Quick Test".');
    }
  };

  const handleAddToCart = () => {
    if (decodedResult?.matchedMedicine && decodedResult?.matchedBatch && onSelectMedicine) {
      sound.playSuccessChime();
      onSelectMedicine(decodedResult.matchedMedicine, decodedResult.matchedBatch);
      onClose();
    }
  };

  const handleViewInCatalog = () => {
    if (decodedResult?.matchedMedicine && onViewInCatalog) {
      sound.playSuccessChime();
      onViewInCatalog(decodedResult.matchedMedicine);
      onClose();
    }
  };

  const handleRegisterNew = () => {
    const codeToRegister = decodedResult?.parsedMetadata?.barcode || decodedResult?.rawCode;
    if (codeToRegister && onRegisterNewWithBarcode) {
      sound.playSuccessChime();
      onRegisterNewWithBarcode(codeToRegister);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl max-w-xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* Hidden temp container for scanFile */}
        <div id="barcode-file-temp-viewport" className="hidden" />

        {/* Header */}
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#00897b] to-teal-700 text-white flex items-center justify-center shadow-xs">
              <Scan className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-slate-800 text-sm sm:text-base">
                  High-Speed Barcode & QR Scanner
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                  1D + 2D Multi-Format
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                EAN-13, EAN-8, Code 128, Code 39, UPC, GS1 DataMatrix & Medicine QR Codes
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Tabs */}
        <div className="flex items-center border-b border-slate-200 px-4 bg-slate-50/70 overflow-x-auto shrink-0">
          <button
            onClick={() => setActiveMode('camera')}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-t-lg transition-colors border-b-2 shrink-0 cursor-pointer ${
              activeMode === 'camera'
                ? 'border-[#00897b] text-[#00796b] bg-emerald-50/50'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            <span>Live Camera</span>
          </button>

          <button
            onClick={() => setActiveMode('upload')}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-t-lg transition-colors border-b-2 shrink-0 cursor-pointer ${
              activeMode === 'upload'
                ? 'border-[#00897b] text-[#00796b] bg-emerald-50/50'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Upload Photo</span>
          </button>

          <button
            onClick={() => setActiveMode('manual')}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-t-lg transition-colors border-b-2 shrink-0 cursor-pointer ${
              activeMode === 'manual'
                ? 'border-[#00897b] text-[#00796b] bg-emerald-50/50'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Keyboard className="w-3.5 h-3.5" />
            <span>Barcode Gun / Manual</span>
          </button>

          <button
            onClick={() => setActiveMode('presets')}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-t-lg transition-colors border-b-2 shrink-0 cursor-pointer ${
              activeMode === 'presets'
                ? 'border-[#00897b] text-[#00796b] bg-emerald-50/50'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Quick Test Barcodes</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
          
          {/* Scanner Option Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-100/70 border border-slate-200 text-xs">
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-1.5 cursor-pointer text-slate-700 font-medium">
                <input
                  type="checkbox"
                  checked={autoAddToCart}
                  onChange={e => setAutoAddToCart(e.target.checked)}
                  className="rounded text-teal-600 focus:ring-teal-500 w-3.5 h-3.5"
                />
                <span>⚡ Instant Add to Cart on Scan</span>
              </label>

              <label className="flex items-center gap-1.5 cursor-pointer text-slate-700 font-medium">
                <input
                  type="checkbox"
                  checked={continuousScan}
                  onChange={e => setContinuousScan(e.target.checked)}
                  className="rounded text-teal-600 focus:ring-teal-500 w-3.5 h-3.5"
                />
                <span>Continuous Scan Mode</span>
              </label>
            </div>

            <span className="text-[11px] text-slate-500 hidden sm:inline">
              Point at packaging box, strip or bottle
            </span>
          </div>

          {/* Quick Success Toast Banner */}
          {scanSuccessNotification && (
            <div className="p-3 bg-emerald-600 text-white rounded-xl text-xs font-bold flex items-center justify-between shadow-md animate-in slide-in-from-top">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-200" />
                <span>{scanSuccessNotification}</span>
              </div>
              <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded">Ready for next</span>
            </div>
          )}

          {/* CAMERA SCANNER MODE */}
          {activeMode === 'camera' && (
            <div className="space-y-3">
              {/* Controls bar */}
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5 text-slate-600">
                  <span className={`w-2 h-2 rounded-full ${cameraActive ? 'bg-emerald-500 animate-pulse' : 'bg-amber-400'}`} />
                  <span className="font-medium text-[11px]">
                    {cameraActive ? 'Active: scanning 1D & 2D codes...' : 'Starting camera feed...'}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {availableCameras.length > 1 && (
                    <select
                      value={selectedCameraId}
                      onChange={e => handleCameraChange(e.target.value)}
                      className="px-2 py-1 text-[11px] border border-slate-200 rounded-md bg-white text-slate-700 font-medium"
                    >
                      {availableCameras.map(cam => (
                        <option key={cam.id} value={cam.id}>
                          {cam.label || `Camera ${cam.id.slice(0, 5)}`}
                        </option>
                      ))}
                    </select>
                  )}

                  <button
                    type="button"
                    onClick={() => startCameraScanner()}
                    className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs flex items-center gap-1 cursor-pointer"
                    title="Restart / Refresh Camera"
                  >
                    <RefreshCw className="w-3 h-3" />
                  </button>

                  <button
                    type="button"
                    onClick={toggleTorch}
                    className={`p-1.5 rounded-lg border text-xs flex items-center gap-1 transition-colors cursor-pointer ${
                      torchOn 
                        ? 'bg-amber-100 border-amber-300 text-amber-800' 
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                    title="Toggle Flashlight / Torch"
                  >
                    <Zap className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {/* Viewport for Html5Qrcode */}
              <div className="relative w-full min-h-[260px] max-h-[340px] bg-slate-950 rounded-xl overflow-hidden border-2 border-slate-800 shadow-inner flex items-center justify-center">
                <div 
                  id="barcode-interactive-reader" 
                  className="w-full h-full min-h-[260px] flex items-center justify-center overflow-hidden"
                />

                {/* Laser scanline HUD overlay */}
                <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
                  <div className="w-64 sm:w-72 h-36 border-2 border-emerald-400/80 rounded-xl relative">
                    <div className="absolute top-0 left-0 w-4 h-4 border-t-3 border-l-3 border-emerald-400" />
                    <div className="absolute top-0 right-0 w-4 h-4 border-t-3 border-r-3 border-emerald-400" />
                    <div className="absolute bottom-0 left-0 w-4 h-4 border-b-3 border-l-3 border-emerald-400" />
                    <div className="absolute bottom-0 right-0 w-4 h-4 border-b-3 border-r-3 border-emerald-400" />
                    {/* Animated scanning laser line */}
                    <div className="w-full h-0.5 bg-red-500 shadow-[0_0_10px_#ef4444] animate-bounce mt-16" />
                  </div>
                  <span className="text-[10px] text-emerald-200 bg-slate-900/90 px-3 py-1 rounded-full mt-2 font-mono border border-emerald-500/30">
                    Align medicine barcode or QR sticker within target
                  </span>
                </div>
              </div>

              {cameraError && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                  <div className="space-y-1">
                    <p className="font-semibold">{cameraError}</p>
                    <p className="text-[11px] text-amber-700">
                      Tip: You can use the "Upload Photo" tab to take a picture of the barcode, or "Barcode Gun / Manual" or "Quick Test Barcodes".
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* UPLOAD PHOTO MODE */}
          {activeMode === 'upload' && (
            <div className="space-y-3">
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-300 hover:border-[#00897b] rounded-xl p-8 text-center cursor-pointer transition-colors bg-slate-50/50 hover:bg-emerald-50/20 flex flex-col items-center justify-center space-y-2"
              >
                <div className="w-12 h-12 rounded-xl bg-emerald-100 text-[#00897b] flex items-center justify-center">
                  <Upload className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-xs font-bold text-slate-800 block">
                    Click to select medicine packaging photo or drag & drop
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Supports JPG, PNG, WEBP of barcode, carton QR, or medicine strip
                  </span>
                </div>
              </div>

              <input
                type="file"
                ref={fileInputRef}
                accept="image/*"
                className="hidden"
                onChange={handleImageFileChange}
              />

              {uploadStatus && (
                <div className="p-3 bg-emerald-50 text-emerald-800 rounded-xl text-xs flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-emerald-600" />
                  <span>{uploadStatus}</span>
                </div>
              )}

              {uploadedPreview && (
                <div className="p-2 border border-slate-200 rounded-xl bg-slate-50 flex items-center gap-3">
                  <img src={uploadedPreview} alt="Uploaded packaging" className="w-16 h-16 object-cover rounded-lg border" />
                  <div className="text-xs">
                    <span className="font-bold text-slate-800 block">Uploaded Photo Loaded</span>
                    <span className="text-slate-500 text-[11px]">Click box above to try another photo</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* MANUAL / BARCODE GUN MODE */}
          {activeMode === 'manual' && (
            <form onSubmit={handleManualSubmit} className="space-y-3">
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <label className="text-xs font-bold text-slate-700 block">
                  Scan with USB Barcode Gun or Enter Code:
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    autoFocus
                    placeholder="e.g. 8901148201205 or batch number..."
                    value={manualCode}
                    onChange={e => setManualCode(e.target.value)}
                    className="flex-1 px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00897b] bg-white font-mono"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 bg-[#00897b] hover:bg-[#00796b] text-white rounded-lg text-xs font-semibold transition-colors shadow-xs cursor-pointer"
                  >
                    Lookup
                  </button>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Tip: USB handheld barcode guns automatically type the barcode digits and press Enter.
                </p>
              </div>
            </form>
          )}

          {/* PRESETS MODE */}
          {activeMode === 'presets' && (
            <div className="space-y-4">
              <div>
                <span className="text-xs font-bold text-slate-700 block mb-1">
                  Click Any Test Barcode (Simulate Physical Scan):
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {[
                    { name: 'Dolo 650 (EAN-13)', code: '8901148201205', desc: 'Standard 1D Barcode' },
                    { name: 'Augmentin 625 (EAN-13)', code: '8901088012345', desc: 'GS1 Pharmaceutical' },
                    { name: 'Azithral 500 (Code 128)', code: 'AZ-500-BATCH', desc: 'Carton Barcode 128' },
                    { name: 'Pantocid 40 (EAN-13)', code: '8904561237890', desc: 'Retail Strip EAN' },
                    { name: 'Crocin 650 (EAN-13)', code: '8901117204918', desc: 'Fast Relief Pack' },
                    { name: 'Dolo 650 QR Label (JSON)', code: '{"brand":"Dolo 650","batch":"DL-481","barcode":"8901148201205","mrp":35.0}', desc: 'Medicine QR Sticker' }
                  ].map(p => (
                    <button
                      key={p.code}
                      onClick={() => handleDecodedBarcode(p.code)}
                      className="p-2.5 border border-slate-200 rounded-xl hover:border-emerald-500 hover:bg-emerald-50 text-left transition-all cursor-pointer group"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-800 group-hover:text-emerald-700">{p.name}</span>
                        <span className="text-[10px] text-emerald-700 bg-emerald-100 px-1.5 py-0.2 rounded font-mono">
                          {p.desc}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono truncate mt-0.5">{p.code}</div>
                    </button>
                  ))}
                </div>
              </div>

              {medicines.length > 0 && (
                <div>
                  <span className="text-xs font-bold text-slate-700 block mb-1">
                    Registered Medicines in Your Current Store ({medicines.length}):
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto p-1">
                    {medicines.map(m => (
                      <button
                        key={m.id}
                        onClick={() => handleDecodedBarcode(m.batches[0]?.barcode || m.brandName)}
                        className="p-2.5 text-left border border-slate-200 rounded-xl hover:border-emerald-500 hover:bg-emerald-50/50 transition-all flex items-center justify-between group cursor-pointer"
                      >
                        <div>
                          <div className="text-xs font-bold text-slate-800 group-hover:text-emerald-700">
                            {m.brandName}
                          </div>
                          <div className="text-[10px] text-slate-500 font-mono">
                            Barcode: {m.batches[0]?.barcode} • Batch: {m.batches[0]?.batchNumber}
                          </div>
                        </div>
                        <span className="text-xs font-extrabold text-[#00897b]">
                          ₹{m.batches[0]?.mrp.toFixed(2)}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Error Message */}
          {errorMsg && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* MATCHED MEDICINE CARD */}
          {decodedResult?.matchedMedicine && decodedResult?.matchedBatch && (
            <div className="p-4 bg-emerald-50/90 border-2 border-[#00897b] rounded-xl space-y-3 animate-in fade-in">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-900">
                      {decodedResult.matchedMedicine.brandName}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-200 text-emerald-800 font-bold uppercase">
                      {decodedResult.matchedMedicine.dosageForm}
                    </span>
                    {decodedResult.matchedMedicine.isScheduleDrug && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-semibold">
                        {decodedResult.matchedMedicine.scheduleClass}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-600 mt-0.5">{decodedResult.matchedMedicine.genericName}</p>
                </div>
                <div className="text-right">
                  <div className="text-base font-black text-[#00897b]">
                    ₹{decodedResult.matchedBatch.mrp.toFixed(2)}
                  </div>
                  <div className="text-[10px] text-slate-500">MRP per pack</div>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-2 text-center text-xs border-t border-emerald-200/60 pt-2.5">
                <div className="bg-white/90 p-1.5 rounded border border-emerald-100">
                  <span className="text-[10px] text-slate-400 block">Batch</span>
                  <span className="font-mono font-bold text-slate-800">{decodedResult.matchedBatch.batchNumber}</span>
                </div>
                <div className="bg-white/90 p-1.5 rounded border border-emerald-100">
                  <span className="text-[10px] text-slate-400 block">Expiry</span>
                  <span className="font-mono font-bold text-slate-800">{decodedResult.matchedBatch.expiryDate}</span>
                </div>
                <div className="bg-white/90 p-1.5 rounded border border-emerald-100">
                  <span className="text-[10px] text-slate-400 block">Stock Avail.</span>
                  <span className="font-bold text-[#00897b]">{decodedResult.matchedBatch.stock} units</span>
                </div>
                <div className="bg-white/90 p-1.5 rounded border border-emerald-100">
                  <span className="text-[10px] text-slate-400 block">Rack</span>
                  <span className="font-bold text-slate-700">{decodedResult.matchedBatch.rackLocation}</span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                {onSelectMedicine && (
                  <button
                    type="button"
                    onClick={handleAddToCart}
                    className="w-full py-2.5 bg-[#00897b] hover:bg-[#00796b] text-white rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-xs cursor-pointer active:scale-98"
                  >
                    <ShoppingCart className="w-4 h-4" />
                    <span>Add Item to Billing Cart</span>
                  </button>
                )}

                {onViewInCatalog && (
                  <button
                    type="button"
                    onClick={handleViewInCatalog}
                    className="w-full py-2.5 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-xs cursor-pointer active:scale-98"
                  >
                    <Eye className="w-4 h-4 text-slate-600" />
                    <span>View / Edit in Catalogue</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* NEW / UNREGISTERED BARCODE CARD */}
          {decodedResult && !decodedResult.matchedMedicine && (
            <div className="p-4 bg-sky-50 border-2 border-sky-400 rounded-xl space-y-3 animate-in fade-in">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-sky-600 shrink-0" />
                    <span className="text-xs font-bold text-sky-900">New Barcode Scanned!</span>
                  </div>
                  <p className="text-[11px] text-sky-700 mt-0.5 font-mono break-all">
                    Code: {decodedResult.rawCode}
                  </p>
                </div>
              </div>

              {decodedResult.parsedMetadata && (
                <div className="p-2.5 bg-white rounded-lg border border-sky-200 text-xs space-y-1">
                  <span className="text-[10px] font-bold text-slate-500 uppercase">QR Metadata Extracted:</span>
                  <div className="font-bold text-slate-800">
                    {decodedResult.parsedMetadata.brand} ({decodedResult.parsedMetadata.strength})
                  </div>
                  <div className="text-[11px] text-slate-600">
                    Batch: {decodedResult.parsedMetadata.batch} • Exp: {decodedResult.parsedMetadata.exp} • MRP: ₹{decodedResult.parsedMetadata.mrp}
                  </div>
                </div>
              )}

              {onRegisterNewWithBarcode && (
                <button
                  type="button"
                  onClick={handleRegisterNew}
                  className="w-full py-2.5 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-xs cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Register New Medicine with this Barcode</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-500 shrink-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-slate-600">Shortcuts:</span>
            <kbd className="px-1.5 py-0.5 bg-white border border-slate-300 rounded font-mono text-[10px]">F3</kbd>
            <span>Scan</span>
            <kbd className="px-1.5 py-0.5 bg-white border border-slate-300 rounded font-mono text-[10px]">Esc</kbd>
            <span>Close</span>
          </div>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 font-semibold cursor-pointer"
          >
            Close Scanner
          </button>
        </div>
      </div>
    </div>
  );
};
