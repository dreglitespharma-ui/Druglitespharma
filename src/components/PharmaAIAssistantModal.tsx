import React, { useState, useRef, useEffect } from 'react';
import { 
  Sparkles, 
  Bot, 
  X, 
  Send, 
  Upload, 
  Camera, 
  FileText, 
  CheckCircle2, 
  AlertCircle, 
  ArrowRight, 
  Boxes, 
  Pill, 
  RefreshCw, 
  Sliders, 
  Plus, 
  Check, 
  HelpCircle,
  TrendingUp,
  Receipt,
  FileCheck,
  AlertTriangle,
  Clock,
  Layers,
  ChevronDown,
  ChevronUp,
  Brain,
  ExternalLink,
  ShieldCheck,
  Loader2,
  ShoppingCart,
  PackageCheck,
  PackagePlus,
  Building2
} from 'lucide-react';
import { 
  Medicine, 
  PurchaseInward, 
  ParsedInvoice, 
  ParsedInvoiceItem, 
  AIAssistantMessage, 
  AIAssistantAction,
  BatchInfo
} from '../types/pharmacy';
import { AIService } from '../utils/aiService';
import { StorageService } from '../utils/storage';
import { sound } from '../utils/sound';

const getInvoiceLineAmounts = (item: ParsedInvoiceItem) => {
  const quantity = Number(item.quantity) || 0;
  const purchaseCost = Number(item.purchaseCost) || 0;
  const gstRate = Number(item.gstRate) || 0;
  const taxableCents = Number.isFinite(item.taxableAmount)
    ? Math.round(Number(item.taxableAmount) * 100)
    : Math.round(quantity * purchaseCost * 100);
  const gstCents = Number.isFinite(item.gstAmount)
    ? Math.round(Number(item.gstAmount) * 100)
    : Math.round(taxableCents * gstRate / 100);
  return { taxableCents, gstCents };
};

const calculateInvoiceTotals = (items: readonly ParsedInvoiceItem[]) => {
  const { taxableCents, gstCents } = items.reduce(
    (totals, item) => {
      if (item.selected === false) return totals;
      const lineAmounts = getInvoiceLineAmounts(item);
      return {
        taxableCents: totals.taxableCents + lineAmounts.taxableCents,
        gstCents: totals.gstCents + lineAmounts.gstCents,
      };
    },
    { taxableCents: 0, gstCents: 0 }
  );
  return {
    totalTaxable: taxableCents / 100,
    totalGst: gstCents / 100,
    netAmount: (taxableCents + gstCents) / 100,
  };
};

interface PharmaAIAssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
  medicines: Medicine[];
  onDataRefresh: () => void;
  onNavigateTab?: (tab: any) => void;
  initialInvoiceImage?: string | null;
}

export const PharmaAIAssistantModal: React.FC<PharmaAIAssistantModalProps> = ({
  isOpen,
  onClose,
  medicines,
  onDataRefresh,
  onNavigateTab,
  initialInvoiceImage,
}) => {
  const [activeTab, setActiveTab] = useState<'chat' | 'invoice' | 'adjuster'>('chat');
  
  // Chat State
  const [messages, setMessages] = useState<AIAssistantMessage[]>([
    {
      id: 'welcome-1',
      sender: 'assistant',
      text: `Hello! I am **Dr. Maya**, the pharmacy inventory assistant.\n\nI can summarize the inventory data provided to me and help draft invoice entries. AI output may be inaccurate: verify every invoice field against the original document before saving. This assistant does not replace a licensed pharmacist or provide clinical advice.`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      thinking: 'AI-generated inventory and invoice suggestions require human verification. No live inventory check has been performed yet.',
      quickReplies: [
        'Check low stock medicines',
        'Check stock for Dolo 650',
        'Expiring batches in 90 days',
        'Upload distributor invoice'
      ]
    }
  ]);
  const [inputMessage, setInputMessage] = useState<string>('');
  const [isAiThinking, setIsAiThinking] = useState<boolean>(false);
  const [attachedImageForChat, setAttachedImageForChat] = useState<{ base64: string; name: string } | null>(null);
  const [expandedThinking, setExpandedThinking] = useState<Record<string, boolean>>({
    'welcome-1': false,
  });

  const toggleThinking = (msgId: string) => {
    setExpandedThinking(prev => ({
      ...prev,
      [msgId]: !prev[msgId],
    }));
  };

  // Quick inline stock increment / decrement for inventory cards
  const handleInlineStockAdjustment = (medicineId: string, medicineName: string, batchNumber: string, delta: number) => {
    sound.playKeyPress();
    const action: AIAssistantAction = {
      type: 'ADJUST_STOCK',
      medicineId,
      medicineName,
      batchNumber,
      deltaStock: delta,
      reason: `Quick adjustment via Dr. Maya (${delta > 0 ? '+' : ''}${delta} units)`,
    };
    const res = AIService.executeAssistantAction(action);
    if (res.success) {
      onDataRefresh();
    } else {
      alert(res.message);
    }
  };

  // Invoice Auto-Fill Workspace State
  const [invoiceImage, setInvoiceImage] = useState<string | null>(initialInvoiceImage || null);
  const [invoicePageImages, setInvoicePageImages] = useState<string[]>(initialInvoiceImage ? [initialInvoiceImage] : []);
  const [invoiceImageName, setInvoiceImageName] = useState<string>('');
  const [isParsingInvoice, setIsParsingInvoice] = useState<boolean>(false);
  const [parsedInvoice, setParsedInvoice] = useState<ParsedInvoice | null>(null);
  const [parseStepMessage, setParseStepMessage] = useState<string>('');
  const [autoFillSuccessResult, setAutoFillSuccessResult] = useState<any | null>(null);
  const [showInvoiceImagePreview, setShowInvoiceImagePreview] = useState<boolean>(false);
  const [isApplyingInvoice, setIsApplyingInvoice] = useState<boolean>(false);
  const [invoicePaymentStatus, setInvoicePaymentStatus] = useState<PurchaseInward['paymentStatus'] | ''>('');
  const [invoiceReviewed, setInvoiceReviewed] = useState(false);

  // Quick Adjuster Workspace State
  const [adjusterSearch, setAdjusterSearch] = useState<string>('');
  const [selectedMedForAdjustment, setSelectedMedForAdjustment] = useState<Medicine | null>(null);
  const [selectedBatchNumber, setSelectedBatchNumber] = useState<string>('');
  const [adjustmentType, setAdjustmentType] = useState<'add' | 'subtract' | 'set'>('add');
  const [adjustmentAmount, setAdjustmentAmount] = useState<number>(10);
  const [adjustmentReason, setAdjustmentReason] = useState<string>('Physical count verification');
  const [adjustmentSuccessMsg, setAdjustmentSuccessMsg] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const invoiceFileInputRef = useRef<HTMLInputElement>(null);
  const invoiceContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat
  useEffect(() => {
    if (activeTab === 'chat') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isAiThinking, activeTab]);

  // If opened with initial invoice image, switch straight to invoice tab and parse
  useEffect(() => {
    if (initialInvoiceImage) {
      setInvoiceImage(initialInvoiceImage);
      setInvoicePageImages([initialInvoiceImage]);
      setActiveTab('invoice');
      triggerInvoiceParse([{ base64: initialInvoiceImage, mimeType: 'image/jpeg' }]);
    }
  }, [initialInvoiceImage]);

  if (!isOpen) return null;

  // --- Handlers for Chat ---
  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputMessage).trim();
    if (!text && !attachedImageForChat) return;

    sound.playKeyPress();

    const userMsg: AIAssistantMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      image: attachedImageForChat?.base64,
    };

    setMessages(prev => [...prev, userMsg]);
    setInputMessage('');
    const currentAttachment = attachedImageForChat;
    setAttachedImageForChat(null);
    setIsAiThinking(true);

    try {
      // Build context for the AI with full inventory
      const lowStockMeds = medicines
        .filter(m => m.batches.reduce((s, b) => s + b.stock, 0) < 20)
        .slice(0, 10)
        .map(m => ({
          name: m.brandName,
          totalStock: m.batches.reduce((s, b) => s + b.stock, 0),
          category: m.category,
        }));

      const expiringBatches = medicines.flatMap(m => 
        m.batches.filter(b => {
          const exp = new Date(b.expiryDate + '-01');
          const now = new Date();
          const diffDays = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          return diffDays <= 90;
        }).map(b => ({
          medicine: m.brandName,
          batchNumber: b.batchNumber,
          expiryDate: b.expiryDate,
          stock: b.stock,
          rackLocation: b.rackLocation,
        }))
      ).slice(0, 10);

      const bills = StorageService.getBills();
      const today = new Date().toISOString().split('T')[0];
      const todayBills = bills.filter(b => b.timestamp && b.timestamp.includes(today));
      const todayRevenue = todayBills.reduce((s, b) => s + b.netPayable, 0);

      const inventorySnapshot = medicines.map(m => ({
        id: m.id,
        brandName: m.brandName,
        genericName: m.genericName,
        strength: m.strength,
        dosageForm: m.dosageForm,
        category: m.category,
        totalStock: m.batches.reduce((s, b) => s + b.stock, 0),
        batches: m.batches.map(b => ({
          batchNumber: b.batchNumber,
          stock: b.stock,
          expiryDate: b.expiryDate,
          rackLocation: b.rackLocation,
          mrp: b.mrp,
          purchasePrice: b.purchasePrice,
        })),
      }));

      const response = await AIService.chatWithAssistant({
        message: text,
        history: messages.slice(-6).map(m => ({
          role: m.sender,
          text: m.text,
        })),
        context: {
          storeName: StorageService.getSettings().storeName,
          totalMedicines: medicines.length,
          medicineNames: medicines.map(m => m.brandName),
          allMedicines: inventorySnapshot,
          inventorySnapshot: inventorySnapshot.slice(0, 50),
          lowStockMedicines: lowStockMeds,
          expiringBatches,
          todaySalesCount: todayBills.length,
          todayRevenue: Math.round(todayRevenue),
        },
        attachedImage: currentAttachment ? {
          base64: currentAttachment.base64,
          mimeType: currentAttachment.base64.match(/^data:(image\/(?:jpeg|png|webp)|application\/pdf);base64,/i)?.[1] || 'image/jpeg',
        } : undefined,
      });

      const assistantMsgId = `ai-${Date.now()}`;
      const assistantMsg: AIAssistantMessage = {
        id: assistantMsgId,
        sender: 'assistant',
        text: response.reply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        thinking: response.thinking,
        inventoryMatches: response.inventoryMatches,
        actions: response.suggestedActions,
        quickReplies: response.quickReplies,
      };

      setMessages(prev => [...prev, assistantMsg]);
      if (response.thinking) {
        setExpandedThinking(prev => ({ ...prev, [assistantMsgId]: true }));
      }
      sound.playSuccessChime();
    } catch (err: any) {
      setMessages(prev => [
        ...prev,
        {
          id: `ai-err-${Date.now()}`,
          sender: 'assistant',
          text: `⚠️ I encountered an issue: ${err.message || 'Please try again.'}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setIsAiThinking(false);
    }
  };

  const handleExecuteAction = (action: AIAssistantAction, messageId: string, actionIndex: number) => {
    sound.playKeyPress();

    if (action.type === 'NAVIGATE_TAB' && action.tab && onNavigateTab) {
      onNavigateTab(action.tab);
      onClose();
      return;
    }

    if (action.type === 'OPEN_INVOICE_UPLOAD') {
      setActiveTab('invoice');
      return;
    }

    const result = AIService.executeAssistantAction(action);
    if (result.success) {
      onDataRefresh();
      // Mark action as applied
      setMessages(prev => prev.map(msg => {
        if (msg.id === messageId && msg.actions) {
          const updatedActions = [...msg.actions];
          updatedActions[actionIndex] = { ...updatedActions[actionIndex], applied: true };
          return { ...msg, actions: updatedActions };
        }
        return msg;
      }));
    } else {
      sound.playWarningBeep();
      alert(`Action error: ${result.message}`);
    }
  };

  // --- Handlers for Invoice Parser ---
  const handleInvoiceFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;
    if (files.length > 10) {
      alert('Upload no more than 10 invoice pages at a time.');
      return;
    }

    try {
      const selectedImages = await Promise.all(files.map(file => new Promise<{ base64: string; mimeType: string }>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result !== 'string') {
            reject(new Error(`Could not read ${file.name}.`));
            return;
          }
          resolve({ base64: reader.result, mimeType: file.type || 'image/jpeg' });
        };
        reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
        reader.readAsDataURL(file);
      })));

      const payloadSize = selectedImages.reduce((total, image) => total + image.base64.length, 0);
      if (payloadSize > 22 * 1024 * 1024) {
        alert('These pages are too large to upload together. Use a smaller PDF or split the pages into smaller groups.');
        return;
      }

      const pageImages = selectedImages.map(image => image.base64);
      setInvoiceImageName(files.map(file => file.name).join(', '));
      setInvoicePageImages(pageImages);
      setInvoiceImage(pageImages[0]);
      setInvoiceReviewed(false);
      triggerInvoiceParse(selectedImages);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Could not read the selected invoice pages.');
    }
  };

  const triggerInvoiceParse = async (images: Array<{ base64: string; mimeType: string }>) => {
    setIsParsingInvoice(true);
    setAutoFillSuccessResult(null);
    setInvoicePaymentStatus('');
    setInvoiceReviewed(false);
    setParseStepMessage('Connecting to Gemini Flash...');

    const timer1 = setTimeout(() => {
      setParseStepMessage('Scanning distributor header & supplier details...');
    }, 900);

    const timer2 = setTimeout(() => {
      setParseStepMessage('Extracting medicine line items, batches, expiry & MRPs...');
    }, 2000);

    const timer3 = setTimeout(() => {
      setParseStepMessage(`Cross-referencing with ${medicines.length} items in your pharmacy catalog...`);
    }, 3200);

    try {
      const result = await AIService.parseInvoice(images, 'image/jpeg', medicines);
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);

      // Enhance items with selected flag and rack location defaults
      const itemsWithDefaults = result.items.map(item => ({
        ...item,
        selected: true,
        rackLocation: item.rackLocation || '',
      }));

      setParsedInvoice({
        ...result,
        items: itemsWithDefaults,
        rawImage: images[0]?.base64,
      });

      sound.playSuccessChime();
    } catch (err: any) {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
      sound.playWarningBeep();
      alert(`Invoice parsing failed: ${err.message}`);
    } finally {
      setIsParsingInvoice(false);
      setParseStepMessage('');
    }
  };

  const handleApplyInvoiceToInventory = async () => {
    if (!parsedInvoice || parsedInvoice.items.length === 0) return;
    if (!invoicePaymentStatus) {
      alert('Choose the invoice payment status before adding these items.');
      return;
    }

    sound.playKeyPress();

    const selectedItems = parsedInvoice.items.filter(i => i.selected !== false);
    if (selectedItems.length === 0) {
      alert('Please select at least one medicine item to add.');
      return;
    }

    setIsApplyingInvoice(true);

    try {
      const invoiceToApply: ParsedInvoice = {
        ...parsedInvoice,
        items: selectedItems,
        ...calculateInvoiceTotals(selectedItems),
      };

      const result = AIService.applyInvoiceToInventory(invoiceToApply, undefined, invoicePaymentStatus);
      if (result && result.success) {
        sound.playSuccessChime();
        setAutoFillSuccessResult(result);
        
        // Notify parent views (Catalog, Batches, Purchases) to reload fresh live data
        onDataRefresh();

        // Also post a notification message to the AI Chat feed
        setMessages(prev => [
          ...prev,
          {
            id: `inward-notif-${Date.now()}`,
            sender: 'assistant',
            text: `🎉 **Goods Inward #${result.inwardNumber} Applied!**\n\n• **${result.itemsCount} line items** received from **${parsedInvoice.supplier?.firmName || 'Supplier'}**\n• **${result.updatedMedicinesCount} existing medicines** replenished with new stock\n• **${result.newMedicinesCount} new products** automatically created in your catalog\n• Total invoice value: **₹${result.totalAmount.toFixed(2)}**`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            quickReplies: ['Check inventory catalog', 'View inward bills', 'Go to POS counter'],
          },
        ]);

        // Clear the review table so the celebratory success screen renders immediately
        setParsedInvoice(null);
        setInvoiceImage(null);
        setInvoicePageImages([]);

        // Smooth scroll to top of workspace
        if (invoiceContainerRef.current) {
          invoiceContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
        }
      } else {
        alert(result?.message || 'Could not add these invoice items. Verify the extracted data and try again.');
      }
    } catch (err: any) {
      console.error('Failed to apply invoice:', err);
      sound.playWarningBeep();
      alert(`Auto-fill error: ${err.message || 'Failed to save inward items'}`);
    } finally {
      setIsApplyingInvoice(false);
    }
  };

  const handleItemFieldChange = (index: number, field: keyof ParsedInvoiceItem, value: any) => {
    if (!parsedInvoice) return;
    const updatedItems = [...parsedInvoice.items];
    const updatedItem = { ...updatedItems[index], [field]: value };
    if (field === 'sellingMrp') {
      updatedItem.unitMrp = Math.round((Number(value || 0) / Number(updatedItem.packSize || 1)) * 100) / 100;
    } else if (field === 'quantity' || field === 'purchaseCost') {
      updatedItem.taxableAmount = Math.round(Number(updatedItem.quantity || 0) * Number(updatedItem.purchaseCost || 0) * 100) / 100;
      updatedItem.gstAmount = Math.round(updatedItem.taxableAmount * Number(updatedItem.gstRate || 0)) / 100;
    } else if (field === 'gstRate') {
      const taxableAmount = Number.isFinite(updatedItem.taxableAmount)
        ? Number(updatedItem.taxableAmount)
        : Math.round(Number(updatedItem.quantity || 0) * Number(updatedItem.purchaseCost || 0) * 100) / 100;
      updatedItem.taxableAmount = taxableAmount;
      updatedItem.gstAmount = Math.round(taxableAmount * Number(updatedItem.gstRate || 0)) / 100;
    }
    updatedItems[index] = updatedItem;

    // Recompute totals
    setParsedInvoice({
      ...parsedInvoice,
      items: updatedItems,
      ...calculateInvoiceTotals(updatedItems),
    });
  };

  const handleRemoveInvoiceItem = (index: number) => {
    if (!parsedInvoice) return;
    const updatedItems = parsedInvoice.items.filter((_, i) => i !== index);
    setParsedInvoice({
      ...parsedInvoice,
      items: updatedItems,
      ...calculateInvoiceTotals(updatedItems),
    });
  };

  // --- Handlers for Quick Adjuster ---
  const filteredMedsForAdjuster = medicines.filter(m => 
    m.brandName.toLowerCase().includes(adjusterSearch.toLowerCase()) ||
    m.genericName.toLowerCase().includes(adjusterSearch.toLowerCase())
  );

  const handleApplyManualAdjustment = () => {
    if (!selectedMedForAdjustment) {
      alert('Please select a medicine.');
      return;
    }
    const batch = selectedMedForAdjustment.batches.find(b => b.batchNumber === selectedBatchNumber) 
      || selectedMedForAdjustment.batches[0];

    if (!batch) {
      alert('Selected medicine has no batches.');
      return;
    }

    let newStock = batch.stock;
    if (adjustmentType === 'add') newStock = batch.stock + adjustmentAmount;
    else if (adjustmentType === 'subtract') newStock = Math.max(0, batch.stock - adjustmentAmount);
    else if (adjustmentType === 'set') newStock = Math.max(0, adjustmentAmount);

    const action: AIAssistantAction = {
      type: 'ADJUST_STOCK',
      medicineId: selectedMedForAdjustment.id,
      medicineName: selectedMedForAdjustment.brandName,
      batchNumber: batch.batchNumber,
      newStock,
      reason: adjustmentReason,
    };

    const res = AIService.executeAssistantAction(action);
    if (res.success) {
      setAdjustmentSuccessMsg(res.message);
      onDataRefresh();
      setTimeout(() => setAdjustmentSuccessMsg(null), 4000);
    } else {
      alert(res.message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl h-[90vh] max-h-[820px] flex flex-col overflow-hidden border border-slate-200">
        
        {/* Top Header */}
        <div className="px-5 py-3.5 bg-gradient-to-r from-teal-700 via-emerald-700 to-teal-800 text-white flex items-center justify-between shrink-0 shadow-md">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-white/15 backdrop-blur-md flex items-center justify-center text-teal-200 border border-white/20 shadow-inner">
              <Bot className="w-6 h-6 text-teal-100" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base font-bold tracking-tight text-white">Dr. Maya — Pharma AI Assistant</h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-400/20 text-emerald-200 border border-emerald-300/30 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse" />
                  Gemini Flash
                </span>
              </div>
              <p className="text-xs text-teal-100/90 font-medium">
                Multimodal Invoice Reader • Inventory Auto-Filler • Stock & Batch Adjustments
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-teal-100 hover:text-white transition-colors cursor-pointer"
              title="Close Assistant"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Navigation Bar */}
        <div className="bg-slate-50 border-b border-slate-200 px-5 flex items-center justify-between shrink-0">
          <div className="flex space-x-1">
            <button
              onClick={() => { setActiveTab('chat'); sound.playKeyPress(); }}
              className={`px-4 py-2.5 text-xs font-semibold flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
                activeTab === 'chat'
                  ? 'border-teal-600 text-teal-700 bg-white shadow-xs'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              <Bot className="w-4 h-4" />
              AI Assistant Chat
            </button>

            <button
              onClick={() => { setActiveTab('invoice'); sound.playKeyPress(); }}
              className={`px-4 py-2.5 text-xs font-semibold flex items-center gap-2 border-b-2 transition-all cursor-pointer relative ${
                activeTab === 'invoice'
                  ? 'border-teal-600 text-teal-700 bg-white shadow-xs'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              <Receipt className="w-4 h-4 text-emerald-600" />
              Smart Invoice Auto-Fill
              <span className="px-1.5 py-0.2 rounded-md bg-emerald-100 text-emerald-800 text-[9px] font-bold">
                NEW
              </span>
            </button>

            <button
              onClick={() => { setActiveTab('adjuster'); sound.playKeyPress(); }}
              className={`px-4 py-2.5 text-xs font-semibold flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
                activeTab === 'adjuster'
                  ? 'border-teal-600 text-teal-700 bg-white shadow-xs'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              <Sliders className="w-4 h-4 text-teal-600" />
              Quick Stock Adjuster
            </button>
          </div>

          <div className="hidden sm:flex items-center text-xs text-slate-500 gap-1.5 font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            Connected to Pharmacy Database ({medicines.length} products)
          </div>
        </div>

        {/* Tab Body */}
        <div className="flex-1 overflow-hidden flex flex-col bg-slate-50/50">

          {/* ================= TAB 1: AI ASSISTANT CHAT ================= */}
          {activeTab === 'chat' && (
            <div className="flex-1 flex flex-col h-full overflow-hidden">
              {/* Message List */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
                {messages.map(msg => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`max-w-[85%] sm:max-w-[78%] flex gap-2.5 ${msg.sender === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                      {msg.sender === 'assistant' ? (
                        <div className="w-8 h-8 rounded-full bg-teal-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                          <Bot className="w-4 h-4" />
                        </div>
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-slate-700 text-white flex items-center justify-center shrink-0 shadow-xs text-xs font-bold">
                          You
                        </div>
                      )}

                      <div className="space-y-2">
                        <div
                          className={`p-3.5 rounded-2xl text-xs sm:text-[13px] leading-relaxed shadow-xs ${
                            msg.sender === 'user'
                              ? 'bg-teal-600 text-white rounded-tr-none'
                              : 'bg-white text-slate-800 border border-slate-200/80 rounded-tl-none'
                          }`}
                        >
                          {msg.image && (
                            <div className="mb-2.5 rounded-lg overflow-hidden border border-slate-200 max-h-48">
                              <img src={msg.image} alt="Attachment" className="w-full object-cover" />
                            </div>
                          )}

                          {/* Gemini Step-by-Step Thinking Process */}
                          {msg.thinking && (
                            <div className="mb-2.5 rounded-xl border border-indigo-200/90 bg-gradient-to-r from-indigo-50/80 via-purple-50/40 to-indigo-50/80 overflow-hidden text-xs shadow-2xs">
                              <button
                                type="button"
                                onClick={() => toggleThinking(msg.id)}
                                className="w-full px-3 py-1.5 flex items-center justify-between text-indigo-950 font-semibold hover:bg-indigo-100/50 transition-colors cursor-pointer text-left"
                              >
                                <span className="flex items-center gap-1.5 text-[11px]">
                                  <Brain className="w-3.5 h-3.5 text-indigo-600 animate-pulse" />
                                  <span className="font-bold tracking-tight">Gemini Thinking Process</span>
                                  <span className="text-[10px] text-indigo-500 font-normal hidden sm:inline">• Live Inventory Check</span>
                                </span>
                                <span className="flex items-center gap-1 text-[10px] text-indigo-600 font-bold">
                                  {expandedThinking[msg.id] ? 'Hide thoughts' : 'Show reasoning'}
                                  <ChevronDown className={`w-3 h-3 transition-transform ${expandedThinking[msg.id] ? 'rotate-180' : ''}`} />
                                </span>
                              </button>
                              {expandedThinking[msg.id] && (
                                <div className="px-3 pb-2.5 pt-1.5 text-[11px] text-slate-700 border-t border-indigo-100/80 bg-white/90 whitespace-pre-wrap leading-relaxed font-mono">
                                  {msg.thinking}
                                </div>
                              )}
                            </div>
                          )}

                          <div className="whitespace-pre-wrap font-sans">
                            {msg.text.split('\n').map((line, idx) => {
                              // Highlight bold elements
                              return (
                                <p key={idx} className={line.startsWith('•') || line.startsWith('-') ? 'ml-2 my-0.5' : 'my-1'}>
                                  {line}
                                </p>
                              );
                            })}
                          </div>

                          {/* Live Inventory Cards (Checked in Real Time) */}
                          {msg.inventoryMatches && msg.inventoryMatches.length > 0 && (
                            <div className="space-y-2 mt-3 pt-2.5 border-t border-slate-100">
                              <div className="flex items-center justify-between text-[11px] font-bold text-slate-700">
                                <span className="flex items-center gap-1.5 text-teal-700">
                                  <Boxes className="w-3.5 h-3.5" />
                                  Database Inventory Matches ({msg.inventoryMatches.length})
                                </span>
                                <span className="text-[10px] text-slate-400">Live stock values</span>
                              </div>

                              {msg.inventoryMatches.map((med, medIdx) => (
                                <div
                                  key={medIdx}
                                  className="bg-slate-50/90 border border-slate-200 rounded-xl p-3 text-xs space-y-2"
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <div>
                                      <div className="flex items-center gap-1.5">
                                        <span className="font-bold text-slate-900 text-xs">{med.brandName}</span>
                                        <span className="text-[10px] font-semibold text-slate-500 bg-white border border-slate-200 px-1.5 py-0.2 rounded">
                                          {med.strength} • {med.dosageForm}
                                        </span>
                                      </div>
                                      <div className="text-[10px] text-slate-500 truncate mt-0.5">
                                        {med.genericName}
                                      </div>
                                    </div>

                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${
                                      med.totalStock > 20
                                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                        : med.totalStock > 0
                                        ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                        : 'bg-rose-100 text-rose-800 border border-rose-200'
                                    }`}>
                                      {med.totalStock} units in stock
                                    </span>
                                  </div>

                                  {/* Batches Breakdown Table */}
                                  {med.batches && med.batches.length > 0 && (
                                    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden text-[10px]">
                                      <div className="grid grid-cols-4 bg-slate-100/70 p-1.5 font-semibold text-slate-600">
                                        <span>Batch #</span>
                                        <span className="text-center">Expiry</span>
                                        <span className="text-center">Rack</span>
                                        <span className="text-right">Stock / MRP</span>
                                      </div>
                                      {med.batches.slice(0, 3).map((b: any, bIdx: number) => (
                                        <div key={bIdx} className="grid grid-cols-4 p-1.5 border-t border-slate-100 items-center">
                                          <span className="font-mono font-bold text-slate-800 truncate">{b.batchNumber}</span>
                                          <span className="text-center text-slate-600">{b.expiryDate}</span>
                                          <span className="text-center text-slate-600">{b.rackLocation || 'Rack A'}</span>
                                          <div className="text-right">
                                            <strong className="text-emerald-700">{b.stock}</strong> <span className="text-slate-400">/ ₹{b.mrp}</span>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}

                                  {/* Inline Quick Stock Adjustments */}
                                  <div className="flex items-center justify-between pt-1 gap-2">
                                    <div className="flex items-center gap-1.5">
                                      <button
                                        type="button"
                                        onClick={() => handleInlineStockAdjustment(med.id, med.brandName, med.batches?.[0]?.batchNumber, 10)}
                                        className="px-2 py-1 rounded bg-teal-50 hover:bg-teal-100 border border-teal-200 text-teal-800 text-[10px] font-bold cursor-pointer"
                                        title="Add 10 units to stock"
                                      >
                                        +10 Stock
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleInlineStockAdjustment(med.id, med.brandName, med.batches?.[0]?.batchNumber, -5)}
                                        className="px-2 py-1 rounded bg-red-50 hover:bg-red-100 border border-red-200 text-red-800 text-[10px] font-bold cursor-pointer"
                                        title="Deduct 5 units from stock"
                                      >
                                        -5 Stock
                                      </button>
                                    </div>

                                    {onNavigateTab && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          onNavigateTab('pos');
                                          onClose();
                                        }}
                                        className="text-[10px] font-bold text-indigo-700 hover:text-indigo-800 flex items-center gap-1 cursor-pointer"
                                      >
                                        <span>Sell in POS</span>
                                        <ExternalLink className="w-3 h-3" />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}

                          <div className={`text-[10px] mt-1 text-right ${msg.sender === 'user' ? 'text-teal-200' : 'text-slate-400'}`}>
                            {msg.timestamp}
                          </div>
                        </div>

                        {/* Interactive Action Cards */}
                        {msg.actions && msg.actions.length > 0 && (
                          <div className="space-y-2">
                            {msg.actions.map((act, actIdx) => (
                              <div
                                key={actIdx}
                                className="bg-emerald-50/90 border border-emerald-200 rounded-xl p-3 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5"
                              >
                                <div className="space-y-0.5">
                                  <div className="flex items-center gap-1.5">
                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-600 text-white uppercase tracking-wider">
                                      {act.type.replace('_', ' ')}
                                    </span>
                                    <span className="text-xs font-bold text-slate-900">
                                      {act.medicineName || act.tab || 'Operation'}
                                    </span>
                                  </div>
                                  <p className="text-[11px] text-slate-600">
                                    {act.type === 'ADJUST_STOCK' && `Adjust quantity to ${act.newStock} units (Batch: ${act.batchNumber || 'Primary'})`}
                                    {act.type === 'UPDATE_PRICE' && `Update MRP to ₹${act.newMrp}`}
                                    {act.type === 'UPDATE_EXPIRY' && `Update expiry to ${act.newExpiryDate}`}
                                    {act.type === 'NAVIGATE_TAB' && `Switch view to ${act.tab}`}
                                    {act.type === 'OPEN_INVOICE_UPLOAD' && `Open Invoice Scanner`}
                                  </p>
                                </div>

                                <button
                                  disabled={act.applied}
                                  onClick={() => handleExecuteAction(act, msg.id, actIdx)}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 ${
                                    act.applied
                                      ? 'bg-emerald-200 text-emerald-800 cursor-default'
                                      : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs'
                                  }`}
                                >
                                  {act.applied ? (
                                    <>
                                      <Check className="w-3.5 h-3.5" />
                                      Applied
                                    </>
                                  ) : (
                                    <>
                                      <Sparkles className="w-3.5 h-3.5" />
                                      Apply Now
                                    </>
                                  )}
                                </button>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Quick Replies */}
                        {msg.quickReplies && msg.quickReplies.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {msg.quickReplies.map((qr, qrIdx) => (
                              <button
                                key={qrIdx}
                                onClick={() => handleSendMessage(qr)}
                                className="px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 hover:bg-teal-50 hover:text-teal-700 hover:border-teal-300 border border-slate-200 text-slate-700 transition-colors cursor-pointer"
                              >
                                {qr}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}

                {isAiThinking && (
                  <div className="flex justify-start">
                    <div className="flex items-center gap-3 bg-gradient-to-r from-indigo-50/90 via-purple-50/60 to-teal-50/90 border border-indigo-200/90 rounded-2xl rounded-tl-none p-3.5 shadow-xs max-w-md">
                      <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-indigo-600 to-teal-600 text-white flex items-center justify-center animate-spin">
                        <Brain className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-indigo-950 font-bold tracking-tight">Gemini Thinking...</span>
                          <span className="px-1.5 py-0.2 rounded-full text-[9px] font-mono font-bold bg-indigo-100 text-indigo-800">
                            Reasoning
                          </span>
                        </div>
                        <span className="text-[11px] text-indigo-700/90 animate-pulse font-medium block mt-0.5">
                          Inspecting database, checking batch levels, rack locations & FEFO expiry...
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Chat Input Bar */}
              <div className="p-3 sm:p-4 bg-white border-t border-slate-200 shrink-0">
                {attachedImageForChat && (
                  <div className="mb-2 px-3 py-1.5 rounded-lg bg-teal-50 border border-teal-200 flex items-center justify-between text-xs text-teal-800">
                    <span className="flex items-center gap-1.5 truncate">
                      <FileText className="w-3.5 h-3.5 shrink-0" />
                      Attached: {attachedImageForChat.name}
                    </span>
                    <button
                      onClick={() => setAttachedImageForChat(null)}
                      className="p-1 hover:text-red-600 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSendMessage();
                  }}
                  className="flex items-center gap-2"
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept="image/*,application/pdf"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onload = (ev) => {
                          setAttachedImageForChat({
                            base64: ev.target?.result as string,
                            name: file.name,
                          });
                        };
                        reader.readAsDataURL(file);
                      }
                    }}
                  />

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="p-2.5 rounded-xl border border-slate-200 text-slate-500 hover:text-teal-600 hover:bg-teal-50 hover:border-teal-300 transition-colors cursor-pointer"
                    title="Attach Invoice or Medicine Photo"
                  >
                    <Upload className="w-4 h-4" />
                  </button>

                  <input
                    type="text"
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    placeholder="Ask Dr. Maya or command: 'Adjust Paracetamol 650 stock to 120'..."
                    className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-slate-50/70"
                  />

                  <button
                    type="submit"
                    disabled={(!inputMessage.trim() && !attachedImageForChat) || isAiThinking}
                    className="px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer shrink-0"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Send</span>
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* ================= TAB 2: SMART INVOICE AUTO-FILL ================= */}
          {activeTab === 'invoice' && (
            <div ref={invoiceContainerRef} className="flex-1 flex flex-col h-full overflow-y-auto p-4 sm:p-6 space-y-5">
              
              {/* Header Banner */}
              <div className="bg-gradient-to-r from-emerald-500 to-teal-600 rounded-2xl p-5 text-white shadow-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Receipt className="w-5 h-5 text-emerald-100" />
                    <h3 className="text-base font-bold">AI Distributor Invoice Scanner & Auto-Filler</h3>
                  </div>
                  <p className="text-xs text-emerald-100/90 max-w-xl">
                    Upload a PDF or up to 10 page images from your wholesale medicine invoice. Review extracted quantities, prices, batches, expiry dates, and totals before adding anything to inventory.
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <input
                    type="file"
                    ref={invoiceFileInputRef}
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    multiple
                    className="hidden"
                    onChange={handleInvoiceFileChange}
                  />
                  <button
                    onClick={() => invoiceFileInputRef.current?.click()}
                    className="px-4 py-2 rounded-xl bg-white text-emerald-800 hover:bg-emerald-50 font-semibold text-xs shadow-sm flex items-center gap-2 transition-colors cursor-pointer"
                  >
                    <Upload className="w-4 h-4 text-emerald-700" />
                    Upload Invoice File
                  </button>
                </div>
              </div>

              {/* Invoice upload and extraction */}
              {!invoiceImage && !isParsingInvoice && !parsedInvoice && !autoFillSuccessResult && (
                <div className="space-y-4">
                  <div 
                    onClick={() => invoiceFileInputRef.current?.click()}
                    className="border-2 border-dashed border-emerald-300 hover:border-emerald-500 bg-emerald-50/40 hover:bg-emerald-50/80 rounded-2xl p-8 text-center transition-all cursor-pointer flex flex-col items-center justify-center space-y-3"
                  >
                    <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center shadow-xs">
                      <Receipt className="w-7 h-7" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-800">
                        Click to select a PDF or multiple invoice page images
                      </h4>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Supports PDF, JPG, PNG, and WEBP (up to 10 pages)
                      </p>
                    </div>
                  </div>

                  <div className="bg-amber-50 rounded-xl border border-amber-200 p-4 text-xs text-amber-900">
                    AI extraction is a draft only. Check every quantity, batch, expiry, price, and tax value against the original invoice before saving.
                  </div>
                </div>
              )}

              {/* Parsing Progress Indicator */}
              {isParsingInvoice && (
                <div className="bg-white rounded-2xl border border-emerald-200 p-8 text-center space-y-4 shadow-sm animate-pulse">
                  <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
                    <Sparkles className="w-7 h-7 animate-spin" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-base font-bold text-slate-800">
                      Analyzing Pharmaceutical Invoice...
                    </h4>
                    <p className="text-xs text-emerald-700 font-medium">
                      {parseStepMessage || 'Reading lines and calculating totals...'}
                    </p>
                  </div>
                </div>
              )}

              {/* Success Notification Result (Full Celebration Card) */}
              {autoFillSuccessResult && (
                <div className="bg-gradient-to-br from-emerald-600 via-teal-700 to-emerald-800 text-white rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 animate-in fade-in zoom-in duration-200">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-white/15 pb-6">
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center text-white shrink-0 shadow-inner">
                        <CheckCircle2 className="w-8 h-8 text-emerald-200" />
                      </div>
                      <div>
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-400/20 text-emerald-100 text-[11px] font-bold uppercase tracking-wider mb-1">
                          <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                          <span>Inward Voucher Live in Database</span>
                        </div>
                        <h4 className="text-xl sm:text-2xl font-black tracking-tight text-white">
                          Successfully Auto-Filled into Inventory!
                        </h4>
                        <p className="text-xs sm:text-sm text-emerald-100/90 mt-0.5">
                          Supplier Inward Bill <strong>#{autoFillSuccessResult.inwardNumber}</strong> created with <strong>{autoFillSuccessResult.itemsCount} medicines</strong>. Stock & FEFO batches updated live!
                        </p>
                      </div>
                    </div>

                    <div className="text-right bg-white/10 px-4 py-2.5 rounded-2xl backdrop-blur-xs border border-white/10 shrink-0">
                      <span className="text-[10px] text-emerald-200 uppercase font-semibold block">Total Inward Value</span>
                      <span className="text-xl font-mono font-black text-white">₹{autoFillSuccessResult.totalAmount.toFixed(2)}</span>
                    </div>
                  </div>

                  {/* 4 Stat Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-white/10 backdrop-blur-xs p-3.5 rounded-xl border border-white/10">
                      <span className="text-[10px] text-emerald-200 uppercase font-semibold block">Total Items Inwarded</span>
                      <span className="text-lg sm:text-xl font-mono font-black text-white mt-1 block">{autoFillSuccessResult.itemsCount} Medicines</span>
                    </div>
                    <div className="bg-white/10 backdrop-blur-xs p-3.5 rounded-xl border border-white/10">
                      <span className="text-[10px] text-emerald-200 uppercase font-semibold block">New Products Created</span>
                      <span className="text-lg sm:text-xl font-mono font-black text-amber-200 mt-1 block">+{autoFillSuccessResult.newMedicinesCount} Products</span>
                    </div>
                    <div className="bg-white/10 backdrop-blur-xs p-3.5 rounded-xl border border-white/10">
                      <span className="text-[10px] text-emerald-200 uppercase font-semibold block">Existing Stock Replenished</span>
                      <span className="text-lg sm:text-xl font-mono font-black text-emerald-200 mt-1 block">{autoFillSuccessResult.updatedMedicinesCount} Medicines</span>
                    </div>
                    <div className="bg-white/10 backdrop-blur-xs p-3.5 rounded-xl border border-white/10">
                      <span className="text-[10px] text-emerald-200 uppercase font-semibold block">FEFO Protocol</span>
                      <span className="text-xs font-bold text-teal-100 mt-2 block">✓ Expiry Sorted Live</span>
                    </div>
                  </div>

                  {/* Quick Action Navigation Buttons */}
                  <div className="flex flex-wrap items-center gap-3 pt-2">
                    <button
                      onClick={() => {
                        if (onNavigateTab) onNavigateTab('pos');
                        onClose();
                      }}
                      className="px-5 py-3 rounded-xl bg-white text-emerald-900 hover:bg-emerald-50 text-xs font-bold shadow-lg flex items-center gap-2 cursor-pointer transition-transform active:scale-95"
                    >
                      <ShoppingCart className="w-4 h-4 text-emerald-700" />
                      <span>Start Selling in POS</span>
                    </button>

                    <button
                      onClick={() => {
                        if (onNavigateTab) onNavigateTab('catalog');
                        onClose();
                      }}
                      className="px-4 py-3 rounded-xl bg-emerald-950/40 hover:bg-emerald-950/60 text-white text-xs font-bold border border-white/20 flex items-center gap-2 cursor-pointer transition-colors"
                    >
                      <Pill className="w-4 h-4 text-emerald-300" />
                      <span>View Medicine Catalogue</span>
                    </button>

                    <button
                      onClick={() => {
                        if (onNavigateTab) onNavigateTab('batches');
                        onClose();
                      }}
                      className="px-4 py-3 rounded-xl bg-emerald-950/40 hover:bg-emerald-950/60 text-white text-xs font-bold border border-white/20 flex items-center gap-2 cursor-pointer transition-colors"
                    >
                      <Boxes className="w-4 h-4 text-teal-300" />
                      <span>View Batches & Stock</span>
                    </button>

                    <button
                      onClick={() => {
                        setAutoFillSuccessResult(null);
                        setParsedInvoice(null);
                        setInvoiceImage(null);
                        setInvoicePageImages([]);
                        setInvoiceReviewed(false);
                      }}
                      className="px-4 py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold border border-white/15 flex items-center gap-2 cursor-pointer ml-auto transition-colors"
                    >
                      <RefreshCw className="w-4 h-4" />
                      <span>Scan Another Invoice</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Parsed Invoice Review Table */}
              {parsedInvoice && (
                <div className="space-y-4">
                  
                  {/* Supplier & Invoice Summary Bar */}
                  <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs grid grid-cols-2 sm:grid-cols-5 gap-3">
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase">Distributor / Supplier</span>
                      <p className="text-xs font-bold text-slate-900 truncate">
                        {parsedInvoice.supplier.firmName || 'Pharma Distributor'}
                      </p>
                      <span className="text-[10px] text-slate-500 font-mono">
                        GSTIN: {parsedInvoice.supplier.gstin || 'Not detected'}
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase">Invoice No & Date</span>
                      <p className="text-xs font-bold text-slate-900 font-mono">
                        #{parsedInvoice.supplier.invoiceNo || 'INV-001'}
                      </p>
                      <span className="text-[10px] text-slate-500">{parsedInvoice.supplier.invoiceDate}</span>
                    </div>

                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase">Medicines / Base Units</span>
                      <p className="text-xs font-bold text-emerald-700">
                        {parsedInvoice.items.length} Items ({parsedInvoice.items.reduce((s, it) => s + (it.totalBaseUnits || (it.quantity * (it.packSize || 10))), 0)} Units)
                      </p>
                      <span className="text-[10px] text-slate-500">
                        {parsedInvoice.items.filter(i => i.matchType === 'exact').length} matched catalog • {parsedInvoice.items.filter(i => i.matchType !== 'exact').length} new
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase">Net Payable</span>
                      <p className="text-sm font-black text-slate-900 font-mono">
                        ₹{parsedInvoice.netAmount.toFixed(2)}
                      </p>
                      <span className="text-[10px] text-slate-500 font-mono">Taxable: ₹{parsedInvoice.totalTaxable.toFixed(2)}</span>
                    </div>

                    <div className="flex flex-col justify-center items-start sm:items-end">
                      <span className="text-[10px] font-bold text-slate-400 uppercase">AI Vision OCR Engine</span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-100 text-teal-800 border border-teal-200 mt-0.5 inline-flex items-center gap-1">
                        <Sparkles className="w-3 h-3 text-teal-600" />
                        {parsedInvoice.aiEngine || 'Gemini Flash Vision OCR'}
                      </span>
                      {invoiceImage && (
                        <button
                          type="button"
                          onClick={() => setShowInvoiceImagePreview(!showInvoiceImagePreview)}
                          className="text-[11px] text-teal-700 hover:text-teal-900 font-semibold underline mt-1 cursor-pointer"
                        >
                          {showInvoiceImagePreview ? 'Hide Original Bill' : `View Original Bill (${invoicePageImages.length} page${invoicePageImages.length === 1 ? '' : 's'})`}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Optional Side-by-side or collapsible image preview */}
                  {showInvoiceImagePreview && invoiceImage && (
                    <div className="bg-slate-900 text-white rounded-xl p-3 border border-slate-700 flex flex-col items-center">
                      <div className="w-full flex items-center justify-between pb-2 text-xs">
                        <span className="font-bold flex items-center gap-1.5 text-teal-300">
                          <Receipt className="w-4 h-4" />
                          Attached Distributor Invoice Document
                        </span>
                        <button
                          type="button"
                          onClick={() => setShowInvoiceImagePreview(false)}
                          className="text-slate-400 hover:text-white"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="max-h-96 overflow-auto w-full flex flex-col items-center gap-3 bg-slate-950 rounded-lg p-2">
                        {invoicePageImages.map((page, index) => (
                          <div key={index} className="w-full flex flex-col items-center gap-1">
                            <span className="text-[10px] text-slate-300">Page {index + 1}</span>
                            {page.startsWith('data:application/pdf') ? (
                              <iframe title={`Invoice PDF page ${index + 1}`} src={page} className="w-full h-80 rounded border border-slate-700" />
                            ) : (
                              <img
                                src={page}
                                alt={`Distributor Invoice page ${index + 1}`}
                                className="max-h-72 object-contain rounded border border-slate-700 shadow-md"
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {parsedInvoice.validationWarnings && parsedInvoice.validationWarnings.length > 0 && (
                    <div className="bg-amber-50 border border-amber-300 text-amber-950 rounded-xl p-3 space-y-1">
                      <p className="text-xs font-bold">Invoice totals need checking</p>
                      {parsedInvoice.validationWarnings.map((warning, index) => (
                        <p key={index} className="text-xs">{warning}</p>
                      ))}
                    </div>
                  )}

                  {/* Line Items Table */}
                  <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
                    <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <label className="flex items-center gap-1.5 text-xs font-bold text-slate-800 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={parsedInvoice.items.every(i => i.selected !== false)}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setParsedInvoice({
                                ...parsedInvoice,
                                items: parsedInvoice.items.map(it => ({ ...it, selected: checked })),
                                ...calculateInvoiceTotals(parsedInvoice.items.map(it => ({ ...it, selected: checked }))),
                              });
                            }}
                            className="rounded text-teal-600 focus:ring-teal-500"
                          />
                          <span>Select All Line Items ({parsedInvoice.items.length})</span>
                        </label>
                        <span className="text-[11px] text-slate-500 hidden sm:inline">
                          • {parsedInvoice.items.filter(i => i.selected !== false).length} selected for inward
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <label className="flex items-center gap-1.5 text-slate-700 font-semibold">
                          Payment status
                          <select
                            value={invoicePaymentStatus}
                            onChange={event => setInvoicePaymentStatus(event.target.value as PurchaseInward['paymentStatus'] | '')}
                            className="rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                          >
                            <option value="">Choose…</option>
                            <option value="Paid">Paid</option>
                            <option value="Credit Pending">Credit Pending</option>
                            <option value="Partially Paid">Partially Paid</option>
                          </select>
                        </label>
                        <span className="text-[11px] text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 hidden md:inline">
                          Pack & Loose Unit Price = MRP ÷ Pack Size
                        </span>
                        <button
                          type="button"
                          disabled={isApplyingInvoice || !invoicePaymentStatus || !invoiceReviewed || parsedInvoice.items.filter(i => i.selected !== false).length === 0}
                          onClick={handleApplyInvoiceToInventory}
                          className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs shadow-xs flex items-center gap-1.5 cursor-pointer transition-transform active:scale-95"
                          title="Auto-Fill selected items into inventory immediately"
                        >
                          {isApplyingInvoice ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                              <span>Auto-Filling...</span>
                            </>
                          ) : (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Quick Approve ({parsedInvoice.items.filter(i => i.selected !== false).length})</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="overflow-x-auto max-h-96">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead className="bg-slate-100/80 text-slate-600 font-semibold border-b border-slate-200 text-[11px] sticky top-0 z-10">
                          <tr>
                            <th className="py-2 px-2.5 text-center">Inward</th>
                            <th className="py-2 px-2.5">Medicine & Generic Formulation</th>
                            <th className="py-2 px-2">HSN Code</th>
                            <th className="py-2 px-2">Batch / Lot</th>
                            <th className="py-2 px-2">Expiry</th>
                            <th className="py-2 px-2 text-center">Pack Size</th>
                            <th className="py-2 px-2 text-center">Qty + Free</th>
                            <th className="py-2 px-2 text-right">Net Cost / Pack (ex GST)</th>
                            <th className="py-2 px-2 text-right">Pack MRP</th>
                            <th className="py-2 px-2 text-right">Unit MRP</th>
                            <th className="py-2 px-2 text-center">GST</th>
                            <th className="py-2 px-2.5 text-right">Line Net (₹)</th>
                            <th className="py-2 px-2 text-center"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {parsedInvoice.items.map((item, idx) => {
                            const isSelected = item.selected !== false;
                            const packSize = item.packSize || 10;
                            const freeQty = item.freeQty || 0;
                            const totalBaseUnits = (item.quantity + freeQty) * packSize;
                            const unitMrp = item.unitMrp || Math.round((item.sellingMrp / packSize) * 100) / 100;
                            const lineAmounts = getInvoiceLineAmounts(item);

                            return (
                              <tr 
                                key={idx} 
                                className={`transition-colors ${isSelected ? 'hover:bg-slate-50/80' : 'bg-slate-100/50 opacity-60'}`}
                              >
                                <td className="py-2 px-2.5 text-center">
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={(e) => handleItemFieldChange(idx, 'selected', e.target.checked)}
                                    className="rounded text-teal-600 focus:ring-teal-500 cursor-pointer"
                                  />
                                </td>

                                <td className="py-2 px-2.5 min-w-[190px]">
                                  <div className="flex items-center gap-1.5">
                                    <input
                                      type="text"
                                      value={item.medicineName}
                                      onChange={(e) => handleItemFieldChange(idx, 'medicineName', e.target.value)}
                                      className="font-bold text-slate-900 border border-transparent hover:border-slate-300 focus:border-teal-500 rounded px-1 py-0.5 w-full text-xs"
                                    />
                                    {item.matchType === 'exact' ? (
                                      <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-100 text-emerald-800 shrink-0" title="Matched existing catalog">
                                        Matched
                                      </span>
                                    ) : (
                                      <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-blue-100 text-blue-800 shrink-0" title="Will create new medicine">
                                        +New
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[10px] text-slate-500 truncate px-1">
                                    {item.genericName} • {item.dosageForm} ({item.strength})
                                  </div>
                                </td>

                                <td className="py-2 px-2">
                                  <input
                                    type="text"
                                    value={item.hsnCode || '30049099'}
                                    onChange={(e) => handleItemFieldChange(idx, 'hsnCode', e.target.value)}
                                    className="font-mono text-slate-800 border border-slate-200 rounded px-1.5 py-0.5 w-20 text-[11px] font-bold text-center focus:border-teal-500"
                                    placeholder="30049099"
                                  />
                                </td>

                                <td className="py-2 px-2">
                                  <input
                                    type="text"
                                    value={item.batchNumber}
                                    onChange={(e) => handleItemFieldChange(idx, 'batchNumber', e.target.value.toUpperCase())}
                                    className="font-mono text-slate-800 border border-slate-200 rounded px-1.5 py-0.5 w-22 text-xs font-bold uppercase focus:border-teal-500"
                                  />
                                </td>

                                <td className="py-2 px-2">
                                  <input
                                    type="text"
                                    value={item.expiryDate}
                                    onChange={(e) => handleItemFieldChange(idx, 'expiryDate', e.target.value)}
                                    placeholder="YYYY-MM"
                                    className="font-mono text-slate-800 border border-slate-200 rounded px-1.5 py-0.5 w-20 text-xs text-center focus:border-teal-500"
                                  />
                                </td>

                                <td className="py-2 px-2 text-center">
                                  <div className="flex items-center justify-center gap-1">
                                    <input
                                      type="number"
                                      min="1"
                                      value={packSize}
                                      onChange={(e) => {
                                        const p = Math.max(1, parseInt(e.target.value, 10) || 1);
                                        const newUnitMrp = Math.round((item.sellingMrp / p) * 100) / 100;
                                        const newTotalUnits = (item.quantity + freeQty) * p;
                                        handleItemFieldChange(idx, 'packSize', p);
                                        handleItemFieldChange(idx, 'unitMrp', newUnitMrp);
                                        handleItemFieldChange(idx, 'totalBaseUnits', newTotalUnits);
                                      }}
                                      className="font-mono text-slate-800 border border-slate-200 rounded px-1 py-0.5 w-12 text-center text-xs font-semibold"
                                    />
                                    <span className="text-[10px] text-slate-400">units</span>
                                  </div>
                                </td>

                                <td className="py-2 px-2 text-center">
                                  <div className="inline-flex items-center gap-1">
                                    <input
                                      type="number"
                                      min="1"
                                      value={item.quantity}
                                      onChange={(e) => {
                                        const q = Math.max(1, parseInt(e.target.value, 10) || 1);
                                        const newTotalUnits = (q + freeQty) * packSize;
                                        handleItemFieldChange(idx, 'quantity', q);
                                        handleItemFieldChange(idx, 'totalBaseUnits', newTotalUnits);
                                      }}
                                      className="text-slate-900 font-bold border border-slate-200 rounded px-1 py-0.5 w-12 text-xs text-center"
                                      title="Billed Packs"
                                    />
                                    {freeQty > 0 ? (
                                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1 py-0.5 rounded border border-emerald-200" title="Free Scheme Packs">
                                        +{freeQty}
                                      </span>
                                    ) : (
                                      <input
                                        type="number"
                                        min="0"
                                        placeholder="+0"
                                        value={freeQty || ''}
                                        onChange={(e) => {
                                          const f = Math.max(0, parseInt(e.target.value, 10) || 0);
                                          const newTotalUnits = (item.quantity + f) * packSize;
                                          handleItemFieldChange(idx, 'freeQty', f);
                                          handleItemFieldChange(idx, 'totalBaseUnits', newTotalUnits);
                                        }}
                                        className="text-slate-500 border border-dashed border-slate-300 rounded px-1 py-0.5 w-10 text-[10px] text-center"
                                        title="Bonus / Free Scheme Qty"
                                      />
                                    )}
                                  </div>
                                  <div className="text-[9px] text-slate-400 font-mono">
                                    ={totalBaseUnits} total
                                  </div>
                                </td>

                                <td className="py-2 px-2 text-right">
                                  <div className="flex items-center justify-end">
                                    <span className="text-slate-400 mr-0.5">₹</span>
                                    <input
                                      type="number"
                                      step="0.0001"
                                      value={item.purchaseCost}
                                      onChange={(e) => handleItemFieldChange(idx, 'purchaseCost', parseFloat(e.target.value) || 0)}
                                      className="text-slate-800 border border-slate-200 rounded px-1 py-0.5 w-16 text-xs text-right font-mono"
                                    />
                                  </div>
                                </td>

                                <td className="py-2 px-2 text-right">
                                  <div className="flex items-center justify-end">
                                    <span className="text-slate-400 mr-0.5">₹</span>
                                    <input
                                      type="number"
                                      step="0.01"
                                      value={item.sellingMrp}
                                      onChange={(e) => handleItemFieldChange(idx, 'sellingMrp', parseFloat(e.target.value) || 0)}
                                      className="text-emerald-700 font-bold border border-slate-200 rounded px-1 py-0.5 w-16 text-xs text-right font-mono"
                                    />
                                  </div>
                                </td>

                                <td className="py-2 px-2 text-right font-mono">
                                  <span className="text-xs font-bold text-teal-700" title="Loose Tablet Selling Price">
                                    ₹{unitMrp.toFixed(2)}
                                  </span>
                                  <span className="text-[9px] text-slate-400 block">/tab</span>
                                </td>

                                <td className="py-2 px-2 text-center">
                                  <select
                                    value={item.gstRate !== undefined ? item.gstRate : 12}
                                    onChange={(e) => handleItemFieldChange(idx, 'gstRate', Number(e.target.value))}
                                    className="border border-slate-200 rounded px-1.5 py-0.5 text-xs text-slate-700 bg-white font-medium focus:border-teal-500 focus:outline-none cursor-pointer"
                                  >
                                    <option value={0}>0%</option>
                                    <option value={5}>5%</option>
                                    <option value={12}>12%</option>
                                    <option value={18}>18%</option>
                                    <option value={28}>28%</option>
                                  </select>
                                </td>

                                <td className="py-2 px-2.5 text-right font-mono font-bold text-slate-900">
                                  ₹{((lineAmounts.taxableCents + lineAmounts.gstCents) / 100).toFixed(2)}
                                </td>

                                <td className="py-2 px-2 text-center">
                                  <button
                                    onClick={() => handleRemoveInvoiceItem(idx)}
                                    className="p-1 text-slate-400 hover:text-red-600 rounded cursor-pointer"
                                    title="Remove Item"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Action Bar */}
                    <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
                      <div className="text-xs text-slate-700">
                        <span>Items to Import: <strong className="text-slate-900 font-bold">{parsedInvoice.items.filter(i => i.selected !== false).length} of {parsedInvoice.items.length}</strong></span>
                        <span className="mx-2 text-slate-300">•</span>
                        <span>Total Payable: <strong className="text-slate-900 font-mono font-bold">₹{parsedInvoice.netAmount.toFixed(2)}</strong> (incl. ₹{parsedInvoice.totalGst.toFixed(2)} GST)</span>
                        <label className="mt-2 flex items-start gap-2 text-[11px] leading-4 text-slate-600 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={invoiceReviewed}
                            onChange={event => setInvoiceReviewed(event.target.checked)}
                            className="mt-0.5 rounded text-teal-600 focus:ring-teal-500"
                          />
                          I checked the selected items and totals against every uploaded invoice page.
                        </label>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setParsedInvoice(null);
                            setInvoiceImage(null);
                            setInvoicePageImages([]);
                            setInvoiceReviewed(false);
                          }}
                          className="px-3.5 py-2 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-semibold cursor-pointer"
                        >
                          Cancel / Reset
                        </button>

                        <button
                          type="button"
                          disabled={isApplyingInvoice || !invoicePaymentStatus || !invoiceReviewed || parsedInvoice.items.filter(i => i.selected !== false).length === 0}
                          onClick={handleApplyInvoiceToInventory}
                          className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-700 hover:to-teal-800 disabled:opacity-50 text-white text-xs font-bold shadow-md flex items-center gap-2 cursor-pointer transition-transform active:scale-95"
                        >
                          {isApplyingInvoice ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin text-white" />
                              <span>Auto-Filling Live Inventory...</span>
                            </>
                          ) : (
                            <>
                              <CheckCircle2 className="w-4 h-4" />
                              <span>Approve & Auto-Fill Inventory ({parsedInvoice.items.filter(i => i.selected !== false).length} items)</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ================= TAB 3: QUICK STOCK ADJUSTER ================= */}
          {activeTab === 'adjuster' && (
            <div className="flex-1 flex flex-col h-full overflow-y-auto p-4 sm:p-6 space-y-5">
              
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-teal-600" />
                    Quick Inventory Stock & Batch Adjuster
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Instantly update medicine stock quantities, correct count variances, or adjust batch pricing with real-time audit logging.
                  </p>
                </div>

                {adjustmentSuccessMsg && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    {adjustmentSuccessMsg}
                  </div>
                )}

                {/* Search Medicine */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">Select Medicine to Adjust</label>
                  <input
                    type="text"
                    placeholder="Search brand name or generic salt..."
                    value={adjusterSearch}
                    onChange={(e) => setAdjusterSearch(e.target.value)}
                    className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />

                  {adjusterSearch && (
                    <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-xl bg-white divide-y divide-slate-100 shadow-sm mt-1">
                      {filteredMedsForAdjuster.slice(0, 8).map(med => (
                        <div
                          key={med.id}
                          onClick={() => {
                            setSelectedMedForAdjustment(med);
                            setSelectedBatchNumber(med.batches[0]?.batchNumber || '');
                            setAdjusterSearch('');
                          }}
                          className="p-2.5 hover:bg-teal-50 cursor-pointer flex items-center justify-between text-xs"
                        >
                          <div>
                            <span className="font-bold text-slate-900">{med.brandName}</span>
                            <span className="text-[11px] text-slate-500 ml-2">({med.strength} • {med.dosageForm})</span>
                          </div>
                          <span className="text-slate-600 font-semibold">
                            Stock: {med.batches.reduce((s, b) => s + b.stock, 0)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {selectedMedForAdjustment && (
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-sm font-bold text-slate-900">{selectedMedForAdjustment.brandName}</h4>
                        <p className="text-xs text-slate-500">{selectedMedForAdjustment.genericName} • {selectedMedForAdjustment.dosageForm}</p>
                      </div>
                      <button
                        onClick={() => setSelectedMedForAdjustment(null)}
                        className="text-xs text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        Change
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-semibold text-slate-700 block mb-1">Select Batch</label>
                        <select
                          value={selectedBatchNumber}
                          onChange={(e) => setSelectedBatchNumber(e.target.value)}
                          className="w-full text-xs p-2 rounded-lg border border-slate-200 bg-white"
                        >
                          {selectedMedForAdjustment.batches.map(b => (
                            <option key={b.batchNumber} value={b.batchNumber}>
                              Batch {b.batchNumber} (Stock: {b.stock}, Exp: {b.expiryDate}, MRP: ₹{b.mrp})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="text-xs font-semibold text-slate-700 block mb-1">Adjustment Mode</label>
                        <div className="grid grid-cols-3 gap-1">
                          <button
                            type="button"
                            onClick={() => setAdjustmentType('add')}
                            className={`py-1.5 text-xs font-semibold rounded-lg border cursor-pointer ${
                              adjustmentType === 'add' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-700 border-slate-200'
                            }`}
                          >
                            + Add Stock
                          </button>
                          <button
                            type="button"
                            onClick={() => setAdjustmentType('subtract')}
                            className={`py-1.5 text-xs font-semibold rounded-lg border cursor-pointer ${
                              adjustmentType === 'subtract' ? 'bg-red-600 text-white border-red-600' : 'bg-white text-slate-700 border-slate-200'
                            }`}
                          >
                            - Deduct Stock
                          </button>
                          <button
                            type="button"
                            onClick={() => setAdjustmentType('set')}
                            className={`py-1.5 text-xs font-semibold rounded-lg border cursor-pointer ${
                              adjustmentType === 'set' ? 'bg-teal-600 text-white border-teal-600' : 'bg-white text-slate-700 border-slate-200'
                            }`}
                          >
                            = Set Exact
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-semibold text-slate-700 block mb-1">Quantity</label>
                        <input
                          type="number"
                          min="1"
                          value={adjustmentAmount}
                          onChange={(e) => setAdjustmentAmount(parseInt(e.target.value) || 0)}
                          className="w-full text-xs p-2 rounded-lg border border-slate-200 bg-white font-bold"
                        />
                      </div>

                      <div>
                        <label className="text-xs font-semibold text-slate-700 block mb-1">Reason / Notes</label>
                        <select
                          value={adjustmentReason}
                          onChange={(e) => setAdjustmentReason(e.target.value)}
                          className="w-full text-xs p-2 rounded-lg border border-slate-200 bg-white"
                        >
                          <option value="Physical count verification">Physical count verification</option>
                          <option value="Supplier goods inward">Supplier goods inward</option>
                          <option value="Damage / breakage deduction">Damage / breakage deduction</option>
                          <option value="Expired stock quarantine">Expired stock quarantine</option>
                          <option value="Customer return / exchange">Customer return / exchange</option>
                        </select>
                      </div>
                    </div>

                    <button
                      onClick={handleApplyManualAdjustment}
                      className="w-full py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-semibold text-xs flex items-center justify-center gap-2 shadow-sm cursor-pointer transition-colors"
                    >
                      <Check className="w-4 h-4" />
                      Apply Stock Adjustment
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
