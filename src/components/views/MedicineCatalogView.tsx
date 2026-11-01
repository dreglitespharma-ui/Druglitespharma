import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, 
  Search, 
  Scan, 
  QrCode, 
  Filter, 
  Pill, 
  Edit3, 
  Trash2, 
  AlertCircle, 
  CheckCircle2, 
  X, 
  Sparkles,
  Archive,
  Layers,
  Camera,
  AlertTriangle,
  Upload,
  DollarSign,
  Boxes,
  IndianRupee
} from 'lucide-react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { Medicine, BatchInfo, MedicineCategory, DosageForm, ScheduleClass } from '../../types/pharmacy';
import { sound } from '../../utils/sound';
import { StorageService } from '../../utils/storage';

interface MedicineCatalogViewProps {
  medicines: Medicine[];
  onAddMedicine: (med: Medicine) => void;
  onUpdateMedicine: (med: Medicine) => void;
  onDeleteMedicine: (id: string) => void;
  onOpenBarcodeScanner: () => void;
  onOpenQRLabelModal: (medicine: Medicine, batch: BatchInfo) => void;
  initialBarcodeForNewMed?: string | null;
  onClearInitialBarcode?: () => void;
  onOpenBarcodeScannerForInput?: (onScanned: (code: string) => void) => void;
  onDataRefresh?: () => void;
}

export const MedicineCatalogView: React.FC<MedicineCatalogViewProps> = ({
  medicines,
  onAddMedicine,
  onUpdateMedicine,
  onDeleteMedicine,
  onOpenBarcodeScanner,
  onOpenQRLabelModal,
  initialBarcodeForNewMed,
  onClearInitialBarcode,
  onOpenBarcodeScannerForInput,
  onDataRefresh,
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [editingMed, setEditingMed] = useState<Medicine | null>(null);
  const [formError, setFormError] = useState<string>('');
  const [medToDelete, setMedToDelete] = useState<Medicine | null>(null);
  const [scannedBarcodeBadge, setScannedBarcodeBadge] = useState<string | null>(null);
  const [isPhotoScanning, setIsPhotoScanning] = useState<boolean>(false);
  const [isInlineCameraOpen, setIsInlineCameraOpen] = useState<boolean>(false);
  const inlineFileInputRef = useRef<HTMLInputElement | null>(null);
  const inlineScannerRef = useRef<Html5Qrcode | null>(null);
  const inlineDetectorTimerRef = useRef<number | null>(null);

  // Form fields
  const [brandName, setBrandName] = useState<string>('');
  const [genericName, setGenericName] = useState<string>('');
  const [category, setCategory] = useState<MedicineCategory>('Analgesics & Antipyretics');
  const [dosageForm, setDosageForm] = useState<DosageForm>('Tablet');
  const [strength, setStrength] = useState<string>('');
  const [manufacturer, setManufacturer] = useState<string>('');
  const [purchasePrice, setPurchasePrice] = useState<number>(0);
  const [mrp, setMrp] = useState<number>(0);
  const [gstRate, setGstRate] = useState<number>(12);
  const [hsnCode, setHSNCode] = useState<string>('');
  const [isScheduleDrug, setIsScheduleDrug] = useState<boolean>(false);
  const [scheduleClass, setScheduleClass] = useState<ScheduleClass>('OTC');
  const [packSize, setPackSize] = useState<number>(10);
  const [packUnit, setPackUnit] = useState<string>('Strip of 10');
  const [allowLooseDispensing, setAllowLooseDispensing] = useState<boolean>(false);
  const [storageCondition, setStorageCondition] = useState<string>('');
  const [reorderLevel, setReorderLevel] = useState<number>(0);
  const [selectedGstFilter, setSelectedGstFilter] = useState<string>('All');

  // Batch fields
  const [batchNumber, setBatchNumber] = useState<string>('');
  const [mfgDate, setMfgDate] = useState<string>('');
  const [expiryDate, setExpiryDate] = useState<string>('');
  const [initialStock, setInitialStock] = useState<number>(0);
  const [rackLocation, setRackLocation] = useState<string>('');
  const [barcode, setBarcode] = useState<string>('');

  const categoriesList: (MedicineCategory | 'All')[] = [
    'All',
    'Analgesics & Antipyretics',
    'Antibiotics & Antimicrobials',
    'Anti-infective & Antifungal',
    'Gastrointestinal & Antacids',
    'Cardiovascular & Antihypertensive',
    'Antidiabetic',
    'Respiratory & Anti-allergic',
    'Vitamins & Supplements',
    'Dermatology & Topicals',
    'Dermatological & Antifungal Topicals',
    'Urological & Nephrology',
    'Ophthalmological & Otic',
    'Musculoskeletal & Joint Care',
    'Hormones & Obstetrics / Gynecology',
    'CNS & Neurological',
    'Cosmetics & Personal Care',
    'FMCG, Food & Dairy'
  ];

  const getHsnSuggestions = (form: DosageForm): string[] => {
    if (form === 'Cosmetics') return ['3304', '330499', '3305', '3401'];
    if (form === 'Ice Cream') return ['2105', '210500', '2106', '1905'];
    return ['3004', '300490', '3006', '9018'];
  };

  const handleDosageFormChange = (newForm: DosageForm) => {
    setDosageForm(newForm);

    if (newForm === 'Cosmetics') {
      // Cosmetics Tax Slab Rule: Standard 18% GST (Chapter 33)
      setGstRate(18);
      setHSNCode('33049990');
      // Cosmetics Inventory Tracking Rule: Unit packaging, OTC non-scheduled, Room/Cool storage
      setPackSize(1);
      setPackUnit('1 Piece / Pack');
      setAllowLooseDispensing(false);
      setStorageCondition('Store below 25°C / Cool & Dry Place');
      setIsScheduleDrug(false);
      setScheduleClass('OTC');
      if (category === 'Analgesics & Antipyretics' || !category) {
        setCategory('Cosmetics & Personal Care');
      }
      if (!editingMed && rackLocation === 'Rack A-1') {
        setRackLocation('Rack C-Cosmetics');
      }
    } else if (newForm === 'Ice Cream') {
      // Ice Cream Tax Slab Rule: Standard 18% GST (HSN 2105: Ice cream and edible ice)
      setGstRate(18);
      setHSNCode('21050000');
      // Ice Cream Inventory Tracking Rule: Cold-Chain Deep Freeze (-18°C or below), Unit packaging
      setPackSize(1);
      setPackUnit('1 Cup / Tub / Bar');
      setAllowLooseDispensing(false);
      setStorageCondition('Deep Freeze (-18°C or below)');
      setIsScheduleDrug(false);
      setScheduleClass('OTC');
      if (category === 'Analgesics & Antipyretics' || !category) {
        setCategory('FMCG, Food & Dairy');
      }
      if (!editingMed && rackLocation === 'Rack A-1') {
        setRackLocation('Deep Freezer F-1');
      }
    } else if (newForm === 'Injection') {
      setGstRate(12);
      setHSNCode('30049099');
      setPackSize(1);
      setPackUnit('Vial / Ampoule');
      setAllowLooseDispensing(false);
      setStorageCondition('Refrigerated 2°C - 8°C (Cold Chain)');
      if (!editingMed && (rackLocation === 'Rack C-Cosmetics' || rackLocation === 'Deep Freezer F-1')) {
        setRackLocation('Cold Storage 2-8°C');
      }
    } else if (newForm === 'Syrup' || newForm === 'Suspension' || newForm === 'Drops' || newForm === 'Ointment' || newForm === 'Inhaler') {
      setGstRate(12);
      setHSNCode('30049099');
      setPackSize(1);
      if (newForm === 'Ointment') setPackUnit('Tube 15g');
      else if (newForm === 'Inhaler') setPackUnit('Canister (200 Doses)');
      else if (newForm === 'Drops') setPackUnit('Dropper Bottle 10ml');
      else setPackUnit('Bottle 100ml');
      setAllowLooseDispensing(false);
      setStorageCondition('Store below 25°C / Cool & Dry Place');
      if (!editingMed && (rackLocation === 'Rack C-Cosmetics' || rackLocation === 'Deep Freezer F-1')) {
        setRackLocation('Rack B-1');
      }
    } else {
      // Tablet / Capsule
      setGstRate(12);
      setHSNCode('30049099');
      setPackSize(10);
      setPackUnit('Strip of 10');
      setAllowLooseDispensing(true);
      setStorageCondition('Store below 25°C / Cool & Dry Place');
      if (!editingMed && (rackLocation === 'Rack C-Cosmetics' || rackLocation === 'Deep Freezer F-1')) {
        setRackLocation('Rack A-1');
      }
    }
  };

  // Auto-open Add modal when barcode is passed from optical scanner
  useEffect(() => {
    if (initialBarcodeForNewMed) {
      resetForm();
      setBarcode(initialBarcodeForNewMed);
      setScannedBarcodeBadge(`Optical Scanner Assigned Barcode: ${initialBarcodeForNewMed}`);
      setIsAddModalOpen(true);
      if (onClearInitialBarcode) {
        onClearInitialBarcode();
      }
    }
  }, [initialBarcodeForNewMed]);

  const resetForm = () => {
    setBrandName('');
    setGenericName('');
    setCategory('Analgesics & Antipyretics');
    setDosageForm('Tablet');
    setStrength('');
    setManufacturer('');
    setPurchasePrice(0);
    setMrp(0);
    setGstRate(12);
    setHSNCode('');
    setIsScheduleDrug(false);
    setScheduleClass('OTC');
    setBatchNumber('');
    setMfgDate('');
    setExpiryDate('');
    setInitialStock(0);
    setRackLocation('');
    setBarcode('');
    setPackSize(10);
    setPackUnit('Strip of 10');
    setAllowLooseDispensing(false);
    setStorageCondition('');
    setReorderLevel(0);
    setEditingMed(null);
    setFormError('');
    setScannedBarcodeBadge(null);
  };

  const openAddModal = () => {
    resetForm();
    setIsAddModalOpen(true);
  };

  const handleEditMed = (med: Medicine) => {
    setEditingMed(med);
    setBrandName(med.brandName);
    setGenericName(med.genericName);
    setCategory(med.category);
    setDosageForm(med.dosageForm);
    setStrength(med.strength);
    setManufacturer(med.manufacturer);
    setGstRate(med.gstRate !== undefined && !isNaN(Number(med.gstRate)) ? Number(med.gstRate) : 12);
    setHSNCode(med.hsnCode);
    setIsScheduleDrug(med.isScheduleDrug === true);
    setScheduleClass(med.scheduleClass || 'OTC');
    setPackSize(med.packSize || 10);
    setPackUnit(med.packUnit || `Strip of ${med.packSize || 10}`);
    setAllowLooseDispensing(
      med.allowLooseDispensing !== undefined
        ? med.allowLooseDispensing
        : (med.dosageForm === 'Tablet' || med.dosageForm === 'Capsule')
    );
    setStorageCondition(med.storageCondition || 'Store below 25°C / Cool & Dry Place');
    setReorderLevel(med.reorderLevel || 10);

    const firstBatch = med.batches[0];
    if (firstBatch) {
      setPurchasePrice(firstBatch.purchasePrice);
      setMrp(firstBatch.mrp);
      setBatchNumber(firstBatch.batchNumber);
      setMfgDate(firstBatch.mfgDate);
      setExpiryDate(firstBatch.expiryDate);
      setInitialStock(firstBatch.stock);
      setRackLocation(firstBatch.rackLocation);
      setBarcode(firstBatch.barcode);
    }
    setFormError('');
    setScannedBarcodeBadge(null);
    setIsAddModalOpen(true);
  };

  const stopInlineCamera = async () => {
    if (inlineDetectorTimerRef.current) {
      window.clearInterval(inlineDetectorTimerRef.current);
      inlineDetectorTimerRef.current = null;
    }
    const container = document.getElementById('med-catalog-inline-camera-reader');
    if (container) {
      const vids = container.querySelectorAll('video');
      vids.forEach(v => {
        try {
          v.onabort = null;
          v.onerror = null;
        } catch (_) {}
      });
    }
    if (inlineScannerRef.current) {
      const scanner = inlineScannerRef.current;
      inlineScannerRef.current = null;
      try {
        if (scanner.isScanning) {
          await scanner.stop();
        }
      } catch (_) {}
      try {
        await scanner.clear();
      } catch (_) {}
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
            stream.getTracks().forEach((track) => {
              try { track.stop(); } catch (_) {}
            });
            video.srcObject = null;
          }
        } catch (_) {}
      });
    }
    setIsInlineCameraOpen(false);
  };

  const startInlineCamera = async () => {
    setIsInlineCameraOpen(true);
    setFormError('');

    setTimeout(async () => {
      const container = document.getElementById('med-catalog-inline-camera-reader');
      if (!container) return;

      try {
        const scanner = new Html5Qrcode('med-catalog-inline-camera-reader');
        inlineScannerRef.current = scanner;

        const scanConfig = {
          fps: 15,
          qrbox: (w: number, h: number) => ({
            width: Math.min(w, 420),
            height: Math.min(h, 240),
          }),
          formatsToSupport: [
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.QR_CODE,
            Html5QrcodeSupportedFormats.DATA_MATRIX,
          ],
          experimentalFeatures: { useBarCodeDetectorIfSupported: false },
        };

        const handleScanned = (decoded: string) => {
          const trimmed = decoded.trim();
          if (trimmed) {
            setBarcode(trimmed);
            setScannedBarcodeBadge(`Scanned with Camera: ${trimmed}`);
            sound.playBarcodeBeep();
            stopInlineCamera();
          }
        };

        try {
          await scanner.start({ facingMode: 'environment' }, scanConfig, handleScanned, () => {});
        } catch {
          await scanner.start({ facingMode: 'user' }, scanConfig, handleScanned, () => {});
        }

        // Parallel hardware-accelerated BarcodeDetector
        if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
          try {
            const detector = new (window as any).BarcodeDetector();
            const videoElem = container.querySelector('video');
            if (videoElem) {
              inlineDetectorTimerRef.current = window.setInterval(async () => {
                if (!videoElem || videoElem.paused || videoElem.readyState < 2) return;
                try {
                  const codes = await detector.detect(videoElem);
                  if (codes && codes.length > 0 && codes[0]?.rawValue) {
                    handleScanned(codes[0].rawValue);
                  }
                } catch (_) {}
              }, 120);
            }
          } catch (_) {}
        }
      } catch (err) {
        console.warn('Inline camera start notice:', err);
        setIsInlineCameraOpen(false);
        setFormError('Camera access unavailable. You can use "Photo Upload" or "Fullscreen Scanner" / "Quick samples".');
      }
    }, 150);
  };

  const handleScanBarcodeForField = () => {
    // If inline camera is preferred or fullscreen modal:
    if (onOpenBarcodeScannerForInput) {
      onOpenBarcodeScannerForInput((scannedCode) => {
        setBarcode(scannedCode);
        setScannedBarcodeBadge(`Scanned from camera: ${scannedCode}`);
        sound.playBarcodeBeep();
      });
    } else {
      onOpenBarcodeScanner();
    }
  };

  const handleDirectImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsPhotoScanning(true);
    setFormError('');

    // Method 1: Hardware-accelerated native BarcodeDetector on image bitmap
    if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
      try {
        const bitmap = await createImageBitmap(file);
        const detector = new (window as any).BarcodeDetector();
        const detected = await detector.detect(bitmap);
        if (detected && detected.length > 0 && detected[0]?.rawValue) {
          const raw = detected[0].rawValue.trim();
          setIsPhotoScanning(false);
          setBarcode(raw);
          setScannedBarcodeBadge(`Photo Decoded Barcode: ${raw}`);
          sound.playBarcodeBeep();
          return;
        }
      } catch (_) {}
    }

    // Method 2: Html5Qrcode.scanFile fallback
    try {
      const html5QrCode = new Html5Qrcode('med-catalog-temp-file-viewport');
      const decodedText = await html5QrCode.scanFile(file, true);
      try { await html5QrCode.clear(); } catch (_) {}
      setIsPhotoScanning(false);
      setBarcode(decodedText.trim());
      setScannedBarcodeBadge(`Photo Decoded Barcode: ${decodedText.trim()}`);
      sound.playBarcodeBeep();
    } catch (err) {
      setIsPhotoScanning(false);
      sound.playWarningBeep();
      setFormError('Could not find a readable barcode in this image. Try taking a closer, well-lit photo of the barcode or use "Scan Camera" / "Quick samples".');
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!brandName.trim()) {
      setFormError('Please enter medicine brand name');
      return;
    }
    if (!Number.isFinite(mrp) || mrp <= 0) {
      setFormError('Please enter a valid selling MRP');
      return;
    }
    if (!Number.isFinite(purchasePrice) || purchasePrice < 0) {
      setFormError('Please enter a valid purchase cost');
      return;
    }
    if (!Number.isInteger(packSize) || packSize < 1) {
      setFormError('Please enter a valid pack size');
      return;
    }
    if (!batchNumber.trim() || !/^\d{4}-(0[1-9]|1[0-2])$/.test(expiryDate)) {
      setFormError('Please enter the actual batch number and expiry month');
      return;
    }
    if (!editingMed && expiryDate < new Date().toISOString().slice(0, 7)) {
      setFormError('Expired stock cannot be added to inventory');
      return;
    }
    if (mfgDate && !/^\d{4}-(0[1-9]|1[0-2])$/.test(mfgDate)) {
      setFormError('Please enter a valid manufacturing month');
      return;
    }
    if (!Number.isInteger(initialStock) || initialStock < 0) {
      setFormError('Please enter a valid initial stock quantity');
      return;
    }

    const effectivePackSize = Number(packSize);
    const effectiveMrp = Number(mrp);
    const effectiveCost = Number(purchasePrice);
    const effectiveUnitMrp = Math.round((effectiveMrp / effectivePackSize) * 100) / 100;
    const effectiveUnitCost = Math.round((effectiveCost / effectivePackSize) * 100) / 100;
    const safeGst = Number(gstRate);

    if (editingMed) {
      const updated: Medicine = {
        ...editingMed,
        brandName,
        genericName,
        category,
        dosageForm,
        strength,
        manufacturer,
        gstRate: safeGst,
        hsnCode,
        isScheduleDrug,
        scheduleClass: isScheduleDrug ? (scheduleClass === 'OTC' ? 'Schedule H' : scheduleClass) : 'OTC',
        packSize: effectivePackSize,
        packUnit: packUnit || `Strip of ${effectivePackSize}`,
        allowLooseDispensing,
        storageCondition: storageCondition || 'Store below 25°C',
        reorderLevel: Number(reorderLevel) || 10,
      };
      onUpdateMedicine(updated);
      sound.playSuccessChime();
    } else {
      const newMed: Medicine = {
        id: `med-${Date.now()}`,
        brandName,
        genericName,
        category,
        dosageForm,
        strength,
        manufacturer,
        gstRate: safeGst,
        hsnCode,
        isScheduleDrug,
        scheduleClass: isScheduleDrug ? (scheduleClass === 'OTC' ? 'Schedule H' : scheduleClass) : 'OTC',
        packSize: effectivePackSize,
        packUnit: packUnit || `Strip of ${effectivePackSize}`,
        allowLooseDispensing,
        storageCondition,
        reorderLevel: Number(reorderLevel) || 0,
        batches: [
          {
            batchNumber: batchNumber.trim(),
            mfgDate,
            expiryDate,
            purchasePrice: effectiveCost,
            mrp: effectiveMrp,
            stock: Number(initialStock),
            rackLocation,
            barcode,
            packSize: effectivePackSize,
            packUnit: packUnit || `Strip of ${effectivePackSize}`,
            allowLooseDispensing,
            unitMrp: allowLooseDispensing ? effectiveUnitMrp : undefined,
            unitPurchasePrice: allowLooseDispensing ? effectiveUnitCost : undefined,
          },
        ],
      };
      onAddMedicine(newMed);
      sound.playSuccessChime();
    }

    setIsAddModalOpen(false);
  };

  const filteredMedicines = medicines.filter(m => {
    const q = searchQuery.toLowerCase().trim();
    const matchSearch = !q ||
      (m.brandName || '').toLowerCase().includes(q) ||
      (m.genericName || '').toLowerCase().includes(q) ||
      (m.manufacturer || '').toLowerCase().includes(q) ||
      (m.hsnCode && m.hsnCode.includes(q)) ||
      (m.batches && m.batches.some(b => (b.barcode && b.barcode.includes(q)) || (b.batchNumber && b.batchNumber.toLowerCase().includes(q))));

    const matchCategory = selectedCategory === 'All' || m.category === selectedCategory;
    const matchGst = selectedGstFilter === 'All' ||
      (selectedGstFilter === '0' && m.gstRate === 0) ||
      (selectedGstFilter === '5' && m.gstRate === 5) ||
      (selectedGstFilter === '12' && (m.gstRate === 12 || m.gstRate === undefined)) ||
      (selectedGstFilter === '18' && m.gstRate === 18) ||
      (selectedGstFilter === '28' && m.gstRate === 28);

    return matchSearch && matchCategory && matchGst;
  });

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-5">
      {/* Top Header & Action Row */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
        <div>
          <h2 className="text-base font-bold text-slate-800">Medicine Catalogue & Formulary</h2>
          <p className="text-xs text-slate-500">
            {medicines.length} Medicines Active • Drugs & Cosmetics Formulary
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={onOpenBarcodeScanner}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
            title="Scan medicine barcode using camera or file"
          >
            <Scan className="w-4 h-4 text-[#00897b]" />
            <span>Scan Barcode / QR</span>
          </button>

          <button
            onClick={openAddModal}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#00897b] hover:bg-[#00796b] text-white text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-98"
          >
            <Plus className="w-4 h-4" />
            <span>+ Add Medicine (Manual)</span>
          </button>
        </div>
      </div>

      {/* Filters and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Search by brand name, generic salt, batch, manufacturer or barcode..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-[#00897b]"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto shrink-0 flex-wrap">
          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={selectedCategory}
              onChange={e => setSelectedCategory(e.target.value)}
              className="px-2.5 py-2 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:outline-[#00897b] bg-white"
            >
              {categoriesList.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <select
            value={selectedGstFilter}
            onChange={e => setSelectedGstFilter(e.target.value)}
            className="px-2.5 py-2 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 focus:outline-[#00897b] bg-white cursor-pointer"
            title="Filter by GST Slab Rate"
          >
            <option value="All">All GST Slabs</option>
            <option value="0">0% (Nil / Exempt)</option>
            <option value="5">5% GST</option>
            <option value="12">12% GST</option>
            <option value="18">18% GST</option>
            <option value="28">28% GST</option>
          </select>
        </div>
      </div>

      {/* Medicines Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px] tracking-wider">
                <th className="p-3">Medicine Brand & Composition</th>
                <th className="p-3">Category</th>
                <th className="p-3">Dosage & Pack</th>
                <th className="p-3">Schedule Class</th>
                <th className="p-3 text-center">GST %</th>
                <th className="p-3">Manufacturer</th>
                <th className="p-3 text-right">MRP</th>
                <th className="p-3 text-center">Batches & Stock</th>
                <th className="p-3 text-center">QR / Barcode</th>
                <th className="p-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredMedicines.map(med => {
                const totalStock = med.batches.reduce((sum, b) => sum + b.stock, 0);
                const primaryBatch = med.batches[0];

                return (
                  <tr key={med.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-800 text-xs">{med.brandName}</span>
                        <span className="px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 font-mono text-[10px] font-semibold border border-slate-200">
                          HSN: {med.hsnCode || 'Not provided'}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500">{med.genericName}</div>
                    </td>

                    <td className="p-3 text-slate-600 font-medium">{med.category}</td>

                    <td className="p-3 text-slate-600">
                      <div>
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-medium">
                          {med.dosageForm} {med.strength && `(${med.strength})`}
                        </span>
                        {med.packUnit && (
                          <span className="text-[10px] text-slate-500 block mt-0.5">
                            {med.packUnit}
                            {med.allowLooseDispensing === false && (
                              <span className="ml-1 px-1 py-0.2 rounded bg-amber-50 text-amber-700 border border-amber-200 text-[9px] font-semibold">
                                Sealed Pack
                              </span>
                            )}
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="p-3">
                      {med.isScheduleDrug ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                          {med.scheduleClass}
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800">
                          OTC
                        </span>
                      )}
                    </td>

                    <td className="p-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        (med.gstRate === 0) 
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200 font-extrabold' 
                          : med.gstRate === 5 
                          ? 'bg-teal-100 text-teal-800' 
                          : med.gstRate === 18 
                          ? 'bg-purple-100 text-purple-800' 
                          : med.gstRate === 28 
                          ? 'bg-rose-100 text-rose-800' 
                          : 'bg-blue-100 text-blue-800'
                      }`}>
                        {med.gstRate === 0 ? '0% Exempt' : `${med.gstRate ?? 12}%`}
                      </span>
                    </td>

                    <td className="p-3 text-slate-600">{med.manufacturer}</td>

                    <td className="p-3 text-right">
                      <div className="font-bold text-slate-800">
                        ₹{primaryBatch ? primaryBatch.mrp.toFixed(2) : '0.00'}
                      </div>
                      {(med.allowLooseDispensing === false) ? (
                        <div className="text-[10px] text-amber-700 font-semibold flex items-center justify-end gap-1 mt-0.5" title="Full Pack Only - Loose unit sale disabled">
                          <span>🔒 Full Pack Only</span>
                        </div>
                      ) : (med.packSize && med.packSize > 1) ? (
                        <div className="text-[10px] text-teal-700 font-semibold" title="Loose Unit Price = Pack MRP / Pack Size">
                          ₹{((primaryBatch?.unitMrp || (primaryBatch?.mrp || 0) / med.packSize)).toFixed(2)}/{med.dosageForm === 'Tablet' ? 'tab' : med.dosageForm === 'Capsule' ? 'cap' : 'unit'} ({med.packUnit || `Pack of ${med.packSize}`})
                        </div>
                      ) : (
                        <div className="text-[10px] text-slate-400">
                          {med.dosageForm === 'Ice Cream' ? 'per pack / tub' : med.dosageForm === 'Cosmetics' ? 'per piece' : 'per unit'}
                        </div>
                      )}
                    </td>

                    <td className="p-3 text-center">
                      <span
                        className={`px-2 py-0.5 rounded-full font-bold text-[11px] ${
                          totalStock > 20
                            ? 'bg-emerald-100 text-emerald-800'
                            : totalStock > 0
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {totalStock} units ({med.batches.length} {med.batches.length === 1 ? 'batch' : 'batches'})
                      </span>
                    </td>

                    <td className="p-3 text-center">
                      {primaryBatch && (
                        <div className="flex flex-col items-center gap-1">
                          <button
                            onClick={() => onOpenQRLabelModal(med, primaryBatch)}
                            className="flex items-center gap-1 px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-semibold transition-colors cursor-pointer"
                            title="Generate QR Barcode Printable Sticker"
                          >
                            <QrCode className="w-3 h-3 text-[#00897b]" />
                            <span>Sticker</span>
                          </button>
                          <span className="font-mono text-[9px] text-slate-400">
                            {primaryBatch.barcode}
                          </span>
                        </div>
                      )}
                    </td>

                    <td className="p-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => handleEditMed(med)}
                          className="p-1 text-slate-500 hover:text-[#00897b] hover:bg-slate-100 rounded transition-colors cursor-pointer"
                          title="Edit Medicine"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setMedToDelete(med)}
                          className="p-1 text-slate-400 hover:text-rose-600 hover:bg-slate-100 rounded transition-colors cursor-pointer"
                          title="Delete Medicine"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
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

      {/* In-App Delete Confirmation Modal */}
      {medToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-5 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Delete {medToDelete.brandName}?
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Are you sure you want to remove <span className="font-semibold text-slate-700">{medToDelete.brandName}</span> ({medToDelete.genericName}) and all linked batches from your store catalogue?
                </p>
              </div>
              <div className="flex items-center justify-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setMedToDelete(null)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-100 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onDeleteMedicine(medToDelete.id);
                    setMedToDelete(null);
                    sound.playWarningBeep();
                  }}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer shadow-xs"
                >
                  Yes, Delete Medicine
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Medicine Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-[#00897b] text-white flex items-center justify-center">
                  <Pill className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-sm">
                    {editingMed ? 'Edit Medicine Formulary Entry' : 'Register New Medicine to Formulary'}
                  </h3>
                  <p className="text-[11px] text-slate-500">Drugs & Cosmetics Act Schedule Database</p>
                </div>
              </div>
              <button
                onClick={() => {
                  stopInlineCamera();
                  setIsAddModalOpen(false);
                }}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Form Body */}
            <form onSubmit={handleFormSubmit} className="p-5 sm:p-6 overflow-y-auto space-y-4">
              {scannedBarcodeBadge && (
                <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-[#00796b] flex items-center gap-2 font-medium">
                  <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{scannedBarcodeBadge}</span>
                </div>
              )}

              {formError && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Row 1: Brand Name & Generic Name */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Medicine / Brand Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Dolo 650 or Augmentin 625 Duo"
                    value={brandName}
                    onChange={e => setBrandName(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-medium focus:outline-[#00897b]"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Generic Name & Composition *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Paracetamol 650mg"
                    value={genericName}
                    onChange={e => setGenericName(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-medium focus:outline-[#00897b]"
                  />
                </div>
              </div>

              {/* Row 2: Category, Dosage Form, Strength */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Therapeutic Category
                  </label>
                  <select
                    value={category}
                    onChange={e => setCategory(e.target.value as MedicineCategory)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:outline-[#00897b] bg-white"
                  >
                    {categoriesList.filter(c => c !== 'All').map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-slate-700">
                      Dosage Form *
                    </label>
                    <span className="text-[10px] text-[#00897b] font-semibold">
                      {dosageForm === 'Cosmetics'
                        ? 'Beauty & Personal Care'
                        : dosageForm === 'Ice Cream'
                        ? 'Frozen FMCG / Dairy'
                        : 'Medical Formulation'}
                    </span>
                  </div>
                  <select
                    value={dosageForm}
                    onChange={e => handleDosageFormChange(e.target.value as DosageForm)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:outline-[#00897b] bg-white font-medium"
                  >
                    <optgroup label="Medical Dosage Forms">
                      <option value="Tablet">Tablet</option>
                      <option value="Capsule">Capsule</option>
                      <option value="Syrup">Syrup</option>
                      <option value="Injection">Injection</option>
                      <option value="Ointment">Ointment</option>
                      <option value="Spray">Spray</option>
                      <option value="Drops">Drops</option>
                      <option value="Suspension">Suspension</option>
                      <option value="Inhaler">Inhaler</option>
                    </optgroup>
                    <optgroup label="Retail & FMCG Categories">
                      <option value="Cosmetics">Cosmetics</option>
                      <option value="Ice Cream">Ice Cream</option>
                    </optgroup>
                  </select>

                  {/* Active Inventory & Tax Slab Mapping Notification */}
                  <div className="mt-1">
                    {dosageForm === 'Cosmetics' && (
                      <span className="text-[10px] font-semibold text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200 block">
                        💄 Cosmetics Rule: 18% GST (HSN 3304) • Unit inventory tracking • OTC
                      </span>
                    )}
                    {dosageForm === 'Ice Cream' && (
                      <span className="text-[10px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200 block">
                        🍦 Ice Cream Rule: 18% GST (HSN 2105) • Deep Freeze (-18°C) Cold Chain • Unit inventory
                      </span>
                    )}
                    {dosageForm === 'Injection' && (
                      <span className="text-[10px] font-semibold text-teal-700 bg-teal-50 px-2 py-0.5 rounded border border-teal-200 block">
                        💉 Injection Rule: Cold Chain 2°C - 8°C Storage • 12% GST (HSN 3004)
                      </span>
                    )}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Strength / Volume / Variant
                  </label>
                  <input
                    type="text"
                    placeholder={
                      dosageForm === 'Cosmetics'
                        ? 'e.g. 50 ml, SPF 50+, 100 g'
                        : dosageForm === 'Ice Cream'
                        ? 'e.g. 100 ml, 750 ml Tub, Cone'
                        : 'e.g. 650 mg, 100 ml'
                    }
                    value={strength}
                    onChange={e => setStrength(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:outline-[#00897b]"
                  />
                </div>
              </div>

              {/* Packaging, Dispensing & Storage Section */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <div className="flex items-center justify-between pb-1 border-b border-slate-200">
                  <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-[#00897b]" />
                    Packaging, Unit Dispensing & Storage
                  </span>
                  <span className="text-[10px] text-slate-500 font-medium">
                    {dosageForm === 'Tablet' || dosageForm === 'Capsule'
                      ? 'Supports loose tablet/capsule dispensing'
                      : dosageForm === 'Ice Cream'
                      ? 'Cold-Chain Deep Freeze Inventory Tracking'
                      : dosageForm === 'Cosmetics'
                      ? 'Piece / Pack Unit Inventory Tracking'
                      : 'Unit Dispensing & Storage'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                      Pack Size (Units/Pack) *
                    </label>
                    <input
                      type="number"
                      min="1"
                      required
                      value={packSize}
                      onChange={e => {
                        const val = Math.max(1, Number(e.target.value) || 1);
                        setPackSize(val);
                        if (dosageForm === 'Tablet' || dosageForm === 'Capsule') {
                          setPackUnit(`Strip of ${val}`);
                        } else if (dosageForm === 'Ice Cream') {
                          setPackUnit(`Pack of ${val}`);
                        } else if (dosageForm === 'Cosmetics') {
                          setPackUnit(`${val} Piece / Pack`);
                        }
                      }}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-mono font-bold focus:outline-[#00897b]"
                    />
                    <span className="text-[9px] text-slate-400 mt-0.5 block">
                      {dosageForm === 'Tablet' || dosageForm === 'Capsule' ? 'e.g. 10 or 15 tabs' : 'e.g. 1 unit / piece'}
                    </span>
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                      Packaging Unit Label
                    </label>
                    <input
                      type="text"
                      placeholder={
                        dosageForm === 'Cosmetics'
                          ? 'e.g. 1 Piece, 50ml Jar'
                          : dosageForm === 'Ice Cream'
                          ? 'e.g. 1 Cup / Tub / Bar'
                          : 'e.g. Strip of 10, Bottle 100ml'
                      }
                      value={packUnit}
                      onChange={e => setPackUnit(e.target.value)}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs focus:outline-[#00897b]"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                      Storage Condition
                    </label>
                    <select
                      value={storageCondition}
                      onChange={e => setStorageCondition(e.target.value)}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs focus:outline-[#00897b] bg-white font-medium"
                    >
                      <option value="Store below 25°C / Cool & Dry Place">Store below 25°C / Cool & Dry Place</option>
                      <option value="Refrigerated 2°C - 8°C (Cold Chain)">Refrigerated 2°C - 8°C (Cold Chain)</option>
                      <option value="Deep Freeze (-18°C or below)">Deep Freeze (-18°C or below)</option>
                      <option value="Protect from Light & Moisture">Protect from Light & Moisture</option>
                      <option value="Room Temperature">Room Temperature</option>
                    </select>
                    {storageCondition === 'Deep Freeze (-18°C or below)' && (
                      <span className="text-[9px] text-blue-700 font-semibold mt-0.5 block">
                        ❄️ Sub-zero Frozen Storage
                      </span>
                    )}
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                      Reorder Alert Level (Packs)
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={reorderLevel}
                      onChange={e => setReorderLevel(Number(e.target.value) || 10)}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-mono focus:outline-[#00897b]"
                    />
                  </div>
                </div>

                {/* Loose Dispensing Choice: Toggle Switch + Radio Buttons */}
                <div className="pt-2.5 border-t border-slate-200/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                        Dispensing Mode Policy *
                      </span>
                      <p className="text-[10px] text-slate-500">
                        Choose whether loose/individual tablets or fractional units can be dispensed at the counter
                      </p>
                    </div>

                    {/* Clear interactive Toggle Switch */}
                    <div className="flex items-center gap-2 bg-white px-2.5 py-1 rounded-lg border border-slate-200 shadow-2xs">
                      <span className={`text-[10px] font-bold ${allowLooseDispensing ? 'text-teal-700' : 'text-slate-600'}`}>
                        {allowLooseDispensing ? 'Loose Dispensing Enabled' : 'Full Pack Only'}
                      </span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={allowLooseDispensing}
                        onClick={() => setAllowLooseDispensing(!allowLooseDispensing)}
                        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[#00897b] focus:ring-offset-1 ${
                          allowLooseDispensing ? 'bg-[#00897b]' : 'bg-slate-300'
                        }`}
                        title="Toggle loose dispensing vs full pack only"
                      >
                        <span
                          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                            allowLooseDispensing ? 'translate-x-4' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>
                  </div>

                  {/* Explicit Radio Buttons with Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <label
                      onClick={() => setAllowLooseDispensing(true)}
                      className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition-all ${
                        allowLooseDispensing
                          ? 'bg-teal-50/80 border-teal-500 shadow-xs ring-1 ring-teal-500/40 text-teal-950'
                          : 'bg-white border-slate-200 hover:bg-slate-50/80 text-slate-700'
                      }`}
                    >
                      <input
                        type="radio"
                        name="dispensingOption"
                        checked={allowLooseDispensing === true}
                        onChange={() => setAllowLooseDispensing(true)}
                        className="mt-0.5 w-4 h-4 text-[#00897b] focus:ring-[#00897b] accent-[#00897b] cursor-pointer"
                      />
                      <div className="flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <span className={`text-xs font-bold leading-tight ${allowLooseDispensing ? 'text-teal-900' : 'text-slate-800'}`}>
                            Allow Loose Dispensing (Sell individual tablets/units)
                          </span>
                          {allowLooseDispensing && (
                            <span className="shrink-0 text-[9px] font-bold px-1.5 py-0.2 rounded bg-teal-100 text-teal-800 border border-teal-200">
                              Selected
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-500 mt-1 leading-snug">
                          Cashiers can split strips or packs to sell exact tablet/capsule quantities requested by patients. Prorated unit price is active.
                        </p>
                      </div>
                    </label>

                    <label
                      onClick={() => setAllowLooseDispensing(false)}
                      className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition-all ${
                        !allowLooseDispensing
                          ? 'bg-amber-50/80 border-amber-500 shadow-xs ring-1 ring-amber-500/40 text-amber-950'
                          : 'bg-white border-slate-200 hover:bg-slate-50/80 text-slate-700'
                      }`}
                    >
                      <input
                        type="radio"
                        name="dispensingOption"
                        checked={allowLooseDispensing === false}
                        onChange={() => setAllowLooseDispensing(false)}
                        className="mt-0.5 w-4 h-4 text-amber-600 focus:ring-amber-500 accent-amber-600 cursor-pointer"
                      />
                      <div className="flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <span className={`text-xs font-bold leading-tight ${!allowLooseDispensing ? 'text-amber-950' : 'text-slate-800'}`}>
                            Full Pack Only (No loose dispensing)
                          </span>
                          {!allowLooseDispensing && (
                            <span className="shrink-0 text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 border border-amber-200">
                              Selected
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-500 mt-1 leading-snug">
                          Item must be sold strictly as a complete sealed pack ({packUnit || `Pack of ${packSize}`}). Loose unit sales and pack splitting are prohibited.
                        </p>
                      </div>
                    </label>
                  </div>
                </div>
              </div>

              {/* Pricing, HSN & GST Taxation Section */}
              <div className="p-3.5 bg-emerald-50/40 border border-emerald-200/80 rounded-xl space-y-3">
                <div className="flex items-center justify-between pb-1 border-b border-emerald-200/60">
                  <span className="text-xs font-bold text-emerald-950 uppercase tracking-wider flex items-center gap-1.5">
                    <IndianRupee className="w-3.5 h-3.5 text-[#00897b]" />
                    Pricing, HSN & GST Tax Slab Rates
                  </span>
                  <span className="text-[10px] text-emerald-700 font-bold">
                    {gstRate === 0 ? '✓ 0% GST (Nil / Exempt Life-Saving Drug)' : `${gstRate}% GST Applied`}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">
                      Manufacturer / Marketer
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Cipla, Micro Labs, Amul, L'Oréal"
                      value={manufacturer}
                      onChange={e => setManufacturer(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:outline-[#00897b] bg-white"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-semibold text-slate-700">
                        HSN / SAC Code
                      </label>
                      <span className="text-[10px] text-slate-500 font-mono font-medium">
                        {dosageForm === 'Cosmetics'
                          ? 'Ch. 33 (Cosmetics)'
                          : dosageForm === 'Ice Cream'
                          ? 'Ch. 21 (Edible Ice)'
                          : 'Ch. 30 (Pharma)'}
                      </span>
                    </div>
                    <input
                      type="text"
                      placeholder={dosageForm === 'Cosmetics' ? '33049990' : dosageForm === 'Ice Cream' ? '21050000' : '30049099'}
                      value={hsnCode}
                      onChange={e => setHSNCode(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-800 focus:outline-[#00897b] bg-white"
                    />
                    <div className="flex gap-1 mt-1">
                      {getHsnSuggestions(dosageForm).map(code => (
                        <button
                          key={code}
                          type="button"
                          onClick={() => setHSNCode(code)}
                          className={`text-[9px] px-1.5 py-0.5 rounded font-mono transition-colors cursor-pointer ${
                            hsnCode === code ? 'bg-emerald-100 text-emerald-800 font-bold' : 'bg-white hover:bg-slate-100 text-slate-600 border border-slate-200'
                          }`}
                        >
                          {code}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">
                      Purchase Cost (₹/pack)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      value={purchasePrice}
                      onChange={e => setPurchasePrice(Number(e.target.value))}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono focus:outline-[#00897b] bg-white"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">
                      Selling MRP (₹/pack) *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={mrp}
                      onChange={e => setMrp(Number(e.target.value))}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-900 focus:outline-[#00897b] bg-white"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">
                      GST Slab Rate %
                    </label>
                    <select
                      value={gstRate}
                      onChange={e => setGstRate(Number(e.target.value))}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:outline-[#00897b] bg-white font-bold"
                    >
                      <option value={0}>0% (Nil / Exempt)</option>
                      <option value={5}>5% GST</option>
                      <option value={12}>12% GST</option>
                      <option value={18}>18% GST</option>
                      <option value={28}>28% GST</option>
                    </select>

                    <div className="flex gap-1 mt-1">
                      {[0, 5, 12, 18, 28].map(r => (
                        <button
                          key={r}
                          type="button"
                          onClick={() => setGstRate(r)}
                          className={`text-[9px] px-1 py-0.5 rounded font-mono font-bold transition-all cursor-pointer ${
                            gstRate === r
                              ? r === 0 
                                ? 'bg-emerald-600 text-white' 
                                : 'bg-[#00897b] text-white'
                              : 'bg-white hover:bg-slate-100 text-slate-600 border border-slate-200'
                          }`}
                        >
                          {r}%
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Live Dispensing Calculations Bar */}
                <div className="p-2.5 bg-white border border-emerald-200/70 rounded-xl flex items-center justify-between text-xs flex-wrap gap-2">
                  <div className="flex items-center gap-3 flex-wrap">
                    {allowLooseDispensing ? (
                      <>
                        <div>
                          <span className="text-[10px] text-slate-400 block">Loose Unit MRP</span>
                          <span className="font-extrabold text-teal-800 font-mono text-sm">
                            ₹{(mrp / (packSize || 1)).toFixed(2)}
                          </span>
                          <span className="text-[10px] text-slate-500 font-medium">
                            {' '}/ {dosageForm === 'Tablet' ? 'tablet' : dosageForm === 'Capsule' ? 'capsule' : dosageForm === 'Cosmetics' ? 'item' : dosageForm === 'Ice Cream' ? 'pack' : 'unit'}
                          </span>
                        </div>

                        <div className="border-l border-slate-200 pl-3">
                          <span className="text-[10px] text-slate-400 block">Loose Purchase Cost</span>
                          <span className="font-bold text-slate-700 font-mono">
                            ₹{(purchasePrice / (packSize || 1)).toFixed(2)}
                          </span>
                          <span className="text-[10px] text-slate-400"> / unit</span>
                        </div>
                      </>
                    ) : (
                      <div>
                        <span className="text-[10px] text-amber-700 font-bold block flex items-center gap-1">
                          <span>🔒 Full Pack Only</span>
                        </span>
                        <span className="font-extrabold text-slate-800 font-mono text-sm">
                          ₹{Number(mrp).toFixed(2)}
                        </span>
                        <span className="text-[10px] text-slate-500 font-medium">
                          {' '}/ {packUnit || `Pack of ${packSize}`} (Loose dispensing blocked)
                        </span>
                      </div>
                    )}

                    <div className="border-l border-slate-200 pl-3">
                      <span className="text-[10px] text-slate-400 block">Gross Profit Margin</span>
                      <span className="font-extrabold text-emerald-700 font-mono">
                        +{purchasePrice > 0 ? (((mrp - purchasePrice) / purchasePrice) * 100).toFixed(1) : '0.0'}%
                      </span>
                    </div>
                  </div>

                  <div className="text-right flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      allowLooseDispensing
                        ? 'bg-teal-100 text-teal-800 border border-teal-200'
                        : 'bg-amber-100 text-amber-800 border border-amber-200'
                    }`}>
                      {allowLooseDispensing ? '✓ Loose Dispensing Active' : '🔒 Full Pack Only'}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      gstRate === 0
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                        : 'bg-slate-100 text-slate-700'
                    }`}>
                      {gstRate === 0 
                        ? '0% Tax Free' 
                        : `GST: ₹${(mrp - (mrp / (1 + gstRate / 100))).toFixed(2)} in MRP`}
                    </span>
                  </div>
                </div>
              </div>

              {/* Schedule Prescription Checkbox */}
              <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl space-y-2">
                <label className="flex items-center gap-2 cursor-pointer select-none text-xs font-bold text-amber-900">
                  <input
                    type="checkbox"
                    checked={isScheduleDrug}
                    onChange={e => {
                      setIsScheduleDrug(e.target.checked);
                      if (e.target.checked && scheduleClass === 'OTC') {
                        setScheduleClass('Schedule H');
                      }
                    }}
                    className="rounded text-emerald-600 focus:ring-emerald-500"
                  />
                  <span>Requires Doctor's Prescription (Schedule Drug)</span>
                </label>

                {isScheduleDrug && (
                  <div className="flex items-center gap-3 pt-1 text-xs">
                    <span className="text-amber-800 font-semibold">Statutory Classification:</span>
                    {(['Schedule H', 'Schedule H1', 'Schedule X'] as const).map(sc => (
                      <label key={sc} className="flex items-center gap-1 text-amber-900 cursor-pointer">
                        <input
                          type="radio"
                          name="scheduleClass"
                          value={sc}
                          checked={scheduleClass === sc}
                          onChange={() => setScheduleClass(sc)}
                        />
                        <span>{sc}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {/* Manufacturing & Expiry Date (Batch Inventory) Section */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <div className="flex items-center justify-between pb-1 border-b border-slate-200">
                  <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <Archive className="w-3.5 h-3.5 text-[#00897b]" />
                    Manufacturing & Expiry Date (Batch Inventory)
                  </span>
                  <span className="text-[10px] text-slate-500 font-medium">FEFO Tracking Enforced</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                      Batch Number *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. DL-9824"
                      value={batchNumber}
                      onChange={e => setBatchNumber(e.target.value)}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-mono focus:outline-[#00897b] uppercase"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                      Mfg Date (YYYY-MM)
                    </label>
                    <input
                      type="month"
                      value={mfgDate}
                      onChange={e => setMfgDate(e.target.value)}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-mono focus:outline-[#00897b]"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                      Expiry Date (YYYY-MM) *
                    </label>
                    <input
                      type="month"
                      required
                      value={expiryDate}
                      onChange={e => setExpiryDate(e.target.value)}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-mono focus:outline-[#00897b] text-rose-600 font-bold"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                      Initial Stock ({packUnit || 'Packs'})
                    </label>
                    <input
                      type="number"
                      min="0"
                      required
                      value={initialStock}
                      onChange={e => setInitialStock(Number(e.target.value))}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-mono font-bold focus:outline-[#00897b]"
                    />
                    <span className="text-[9px] text-teal-700 font-semibold mt-0.5 block">
                      {allowLooseDispensing
                        ? `= ${initialStock * (packSize || 1)} loose units`
                        : `= ${initialStock} complete sealed packs (Full pack only)`}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                      Rack / Shelf Location
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Rack A-1, Shelf 3"
                      value={rackLocation}
                      onChange={e => setRackLocation(e.target.value)}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs focus:outline-[#00897b]"
                    />
                  </div>

                  <div>
                    {/* Hidden container for file scanning */}
                    <div 
                      id="med-catalog-temp-file-viewport" 
                      style={{ position: 'absolute', width: '1px', height: '1px', opacity: 0, pointerEvents: 'none' }} 
                    />

                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] font-semibold text-slate-600">
                        EAN / Barcode Number
                      </label>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            if (isInlineCameraOpen) {
                              stopInlineCamera();
                            } else {
                              startInlineCamera();
                            }
                          }}
                          className={`flex items-center gap-1 text-[11px] font-bold px-1.5 py-0.5 rounded transition-colors cursor-pointer ${
                            isInlineCameraOpen 
                              ? 'bg-rose-100 text-rose-700 hover:bg-rose-200' 
                              : 'text-[#00897b] hover:bg-emerald-50'
                          }`}
                          title="Toggle live camera viewfinder right inside this form"
                        >
                          <Camera className="w-3 h-3" />
                          <span>{isInlineCameraOpen ? 'Close Live Camera' : 'Live Camera'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleScanBarcodeForField}
                          className="flex items-center gap-1 text-[11px] font-bold text-slate-500 hover:text-slate-800 hover:underline cursor-pointer"
                          title="Open full-screen scanner modal"
                        >
                          <Scan className="w-3 h-3 text-[#00897b]" />
                          <span>Fullscreen Scanner</span>
                        </button>
                      </div>
                    </div>

                    {/* Inline Live Camera Viewport */}
                    {isInlineCameraOpen && (
                      <div className="mb-2 relative rounded-xl overflow-hidden border-2 border-[#00897b] bg-slate-950 shadow-md">
                        <div 
                          id="med-catalog-inline-camera-reader" 
                          className="w-full h-44 flex items-center justify-center overflow-hidden"
                        />
                        {/* HUD scan overlay */}
                        <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
                          <div className="w-48 h-24 border-2 border-[#00b09b]/80 rounded-lg relative">
                            <div className="w-full h-0.5 bg-red-500 shadow-[0_0_8px_#ef4444] animate-bounce mt-10" />
                          </div>
                          <span className="text-[9px] text-emerald-200 bg-slate-900/85 px-2 py-0.5 rounded-full mt-1 font-mono">
                            Aim camera at barcode to auto-fill
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={stopInlineCamera}
                          className="absolute top-2 right-2 px-2 py-1 bg-slate-900/80 hover:bg-slate-900 text-white rounded text-[10px] font-bold cursor-pointer"
                        >
                          ✕ Close
                        </button>
                      </div>
                    )}

                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        placeholder="e.g. 8901088012345"
                        value={barcode}
                        onChange={e => setBarcode(e.target.value)}
                        className="flex-1 px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-mono focus:outline-[#00897b]"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (isInlineCameraOpen) {
                            stopInlineCamera();
                          } else {
                            startInlineCamera();
                          }
                        }}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer shrink-0 shadow-xs ${
                          isInlineCameraOpen
                            ? 'bg-rose-600 hover:bg-rose-700 text-white'
                            : 'bg-[#00897b] hover:bg-[#00796b] text-white'
                        }`}
                        title="Toggle live camera right inside this form"
                      >
                        <Camera className="w-3.5 h-3.5" />
                        <span>{isInlineCameraOpen ? 'Stop' : 'Camera'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleScanBarcodeForField}
                        className="px-2 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 cursor-pointer shrink-0"
                        title="Open full-screen scanner dialog"
                      >
                        <Scan className="w-3.5 h-3.5 text-[#00897b]" />
                        <span className="hidden sm:inline">Modal</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => inlineFileInputRef.current?.click()}
                        disabled={isPhotoScanning}
                        className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 cursor-pointer shrink-0"
                        title="Upload photo of medicine packaging to scan barcode"
                      >
                        <Upload className="w-3.5 h-3.5 text-slate-600" />
                        <span className="hidden sm:inline">{isPhotoScanning ? 'Reading...' : 'Photo'}</span>
                      </button>
                      <input
                        ref={inlineFileInputRef}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={handleDirectImageUpload}
                        className="hidden"
                      />
                    </div>

                    {/* Quick test barcode presets */}
                    <div className="flex items-center gap-1 pt-1.5 flex-wrap">
                      <span className="text-[10px] text-slate-400 font-medium">Quick samples:</span>
                      {[
                        { label: 'Dolo 650', code: '8901148201205' },
                        { label: 'Augmentin', code: '8901088012345' },
                        { label: 'Azithral', code: '8901234567890' },
                      ].map(sample => (
                        <button
                          key={sample.code}
                          type="button"
                          onClick={() => {
                            setBarcode(sample.code);
                            setScannedBarcodeBadge(`Selected Sample: ${sample.label} (${sample.code})`);
                            sound.playBarcodeBeep();
                          }}
                          className="px-1.5 py-0.5 rounded bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 text-slate-600 border border-slate-200 text-[10px] font-mono transition-colors cursor-pointer"
                        >
                          +{sample.label}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => {
                          const randomCode = `890${Math.floor(1000000000 + Math.random() * 9000000000)}`;
                          setBarcode(randomCode);
                          setScannedBarcodeBadge(`Generated EAN-13: ${randomCode}`);
                          sound.playBarcodeBeep();
                        }}
                        className="px-1.5 py-0.5 rounded bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 text-slate-600 border border-slate-200 text-[10px] transition-colors cursor-pointer"
                      >
                        ⚡ Random EAN
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Form Buttons */}
              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    stopInlineCamera();
                    setIsAddModalOpen(false);
                  }}
                  className="px-4 py-2 border border-slate-200 text-slate-700 hover:bg-slate-100 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#00897b] hover:bg-[#00796b] text-white rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-98"
                >
                  {editingMed ? 'Save Changes' : 'Save Medicine to Formulary'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
