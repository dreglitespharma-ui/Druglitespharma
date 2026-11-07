import React, { Suspense, lazy, useState, useEffect, useRef } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { Lock, Sparkles, Bot, Upload, Plus } from 'lucide-react';
import { Sidebar, ActiveTab } from './components/Sidebar';
import { Header } from './components/Header';

const BarcodeScannerModal = lazy(() => import('./components/BarcodeScannerModal').then(module => ({ default: module.BarcodeScannerModal })));
const MedicineQRModal = lazy(() => import('./components/MedicineQRModal').then(module => ({ default: module.MedicineQRModal })));
const UPIPaymentModal = lazy(() => import('./components/UPIPaymentModal').then(module => ({ default: module.UPIPaymentModal })));
const InvoicePrintModal = lazy(() => import('./components/InvoicePrintModal').then(module => ({ default: module.InvoicePrintModal })));
const PharmaAIAssistantModal = lazy(() => import('./components/PharmaAIAssistantModal').then(module => ({ default: module.PharmaAIAssistantModal })));
const DashboardView = lazy(() => import('./components/views/DashboardView').then(module => ({ default: module.DashboardView })));
const PosBillingView = lazy(() => import('./components/views/PosBillingView').then(module => ({ default: module.PosBillingView })));
const MedicineCatalogView = lazy(() => import('./components/views/MedicineCatalogView').then(module => ({ default: module.MedicineCatalogView })));
const BatchesExpiryView = lazy(() => import('./components/views/BatchesExpiryView').then(module => ({ default: module.BatchesExpiryView })));
const PurchasesSuppliersView = lazy(() => import('./components/views/PurchasesSuppliersView').then(module => ({ default: module.PurchasesSuppliersView })));
const PrescriptionLogView = lazy(() => import('./components/views/PrescriptionLogView').then(module => ({ default: module.PrescriptionLogView })));
const CustomerCrmView = lazy(() => import('./components/views/CustomerCrmView').then(module => ({ default: module.CustomerCrmView })));
const ExpensesCashView = lazy(() => import('./components/views/ExpensesCashView').then(module => ({ default: module.ExpensesCashView })));
const BusinessReportsView = lazy(() => import('./components/views/BusinessReportsView').then(module => ({ default: module.BusinessReportsView })));
const StaffManagementView = lazy(() => import('./components/views/StaffManagementView').then(module => ({ default: module.StaffManagementView })));
const SettingsBackupView = lazy(() => import('./components/views/SettingsBackupView').then(module => ({ default: module.SettingsBackupView })));
import { LoginScreen } from './components/LoginScreen';
import { sound } from './utils/sound';

import { StorageService } from './utils/storage';
import { auth } from './firebase/config';
import { FirestoreSyncService } from './firebase/firestoreService';
import { Medicine, BatchInfo, SaleBill, Supplier, PurchaseInward, Customer, StoreExpense, StaffMember, StoreSettings, AuditLogEntry } from './types/pharmacy';

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isAppInitializing, setIsAppInitializing] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<ActiveTab>('pos');
  const [isMobileNavOpen, setIsMobileNavOpen] = useState<boolean>(false);

  // Application Data State
  const [settings, setSettings] = useState<StoreSettings>(StorageService.getSettings());
  const [staffList, setStaffList] = useState<StaffMember[]>(StorageService.getStaff());
  const [activeStaff, setActiveStaff] = useState<StaffMember>(StorageService.getActiveStaff());
  const [medicines, setMedicines] = useState<Medicine[]>(StorageService.getMedicines());
  const [suppliers, setSuppliers] = useState<Supplier[]>(StorageService.getSuppliers());
  const [purchases, setPurchases] = useState<PurchaseInward[]>(StorageService.getPurchases());
  const [customers, setCustomers] = useState<Customer[]>(StorageService.getCustomers());
  const [bills, setBills] = useState<SaleBill[]>(StorageService.getBills());
  const [expenses, setExpenses] = useState<StoreExpense[]>(StorageService.getExpenses());
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>(StorageService.getAuditLogs());
  const [cloudStatus, setCloudStatus] = useState(StorageService.getCloudStatus());

  // Modals State
  const [isBarcodeScannerOpen, setIsBarcodeScannerOpen] = useState<boolean>(false);
  const [isAIAssistantOpen, setIsAIAssistantOpen] = useState<boolean>(false);
  const [aiAssistantInitialInvoice, setAiAssistantInitialInvoice] = useState<string | null>(null);
  
  const [qrLabelModalData, setQrLabelModalData] = useState<{
    isOpen: boolean;
    medicine: Medicine | null;
    batch: BatchInfo | null;
  }>({
    isOpen: false,
    medicine: null,
    batch: null,
  });

  const [upiModalData, setUpiModalData] = useState<{
    isOpen: boolean;
    amount: number;
    billNumber: string;
    onPaid: (txRef: string) => void;
  }>({
    isOpen: false,
    amount: 0,
    billNumber: '',
    onPaid: () => {},
  });

  const [invoiceModalBill, setInvoiceModalBill] = useState<SaleBill | null>(null);
  const [initialBarcodeForNewMed, setInitialBarcodeForNewMed] = useState<string | null>(null);
  const [scannerInputCallback, setScannerInputCallback] = useState<((code: string) => void) | null>(null);
  const [pendingCartItem, setPendingCartItem] = useState<{ medicine: Medicine; batch: BatchInfo; timestamp: number } | null>(null);
  const [isCloudSyncing, setIsCloudSyncing] = useState<boolean>(false);
  const sessionStartInProgress = useRef(false);
  const sessionUserUid = useRef<string | null>(null);
  const accountRegistrationInProgress = useRef(false);

  // Sync state refresh
  const refreshAllData = () => {
    setSettings(StorageService.getSettings());
    setStaffList(StorageService.getStaff());
    setActiveStaff(StorageService.getActiveStaff());
    setMedicines(StorageService.getMedicines());
    setSuppliers(StorageService.getSuppliers());
    setPurchases(StorageService.getPurchases());
    setCustomers(StorageService.getCustomers());
    setBills(StorageService.getBills());
    setExpenses(StorageService.getExpenses());
    setAuditLogs(StorageService.getAuditLogs());
  };

  const startAuthenticatedSession = async (staff: StaffMember): Promise<void> => {
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error('Your Firebase session expired. Sign in again.');
    if (sessionStartInProgress.current || sessionUserUid.current === uid) return;
    sessionStartInProgress.current = true;
    setIsAppInitializing(true);
    setIsCloudSyncing(true);
    try {
      await StorageService.init(staff);
      StorageService.setActiveStaff(staff.id);
      setActiveStaff(staff);
      const result = await StorageService.syncFromCloudAuthoritative();
      if (!result.success) {
        throw new Error(StorageService.getCloudStatus().error || 'Firestore is unavailable. Reconnect before using pharmacy records.');
      }
      refreshAllData();
      setIsAuthenticated(true);
      sessionUserUid.current = uid;
      setActiveTab('pos');
      sound.playSuccessChime();
      if (result.success) {
        showShortcutToast(`Connected to pharmacy database • ${result.medicineCount} medicines ready`);
      } else {
        showShortcutToast('Cloud sync is unavailable. Check your connection before processing sales.');
      }
    } finally {
      sessionStartInProgress.current = false;
      setIsAppInitializing(false);
      setIsCloudSyncing(false);
    }
  };

  // Restore Firebase sessions and keep the app locked after Firebase sign-out.
  useEffect(() => {
    let disposed = false;
    const unsubscribe = StorageService.subscribe(() => {
      if (!disposed) {
        refreshAllData();
        setCloudStatus(StorageService.getCloudStatus());
      }
    });
    void StorageService.removeStoredStaffPasswords().catch(error => {
      console.error('[App] Failed to remove legacy staff passwords from local storage:', error);
    });
    const unsubscribeAuth = onAuthStateChanged(auth, user => {
      if (accountRegistrationInProgress.current) {
        if (!user) accountRegistrationInProgress.current = false;
        return;
      }

      if (!user) {
        FirestoreSyncService.stopRealtimeSync();
        sessionUserUid.current = null;
        if (!disposed) {
          setIsAuthenticated(false);
          setIsAppInitializing(false);
        }
        return;
      }

      if (sessionStartInProgress.current) return;
      void FirestoreSyncService.getAuthenticatedStaff()
        .then(staff => {
          if (!disposed) return startAuthenticatedSession(staff);
        })
        .catch(async error => {
          console.error('[App] Could not restore the Firebase staff session:', error);
          if (!disposed) setIsAppInitializing(false);
          await signOut(auth).catch(signOutError => {
            console.error('[App] Failed to clear an unauthorized Firebase session:', signOutError);
          });
        });
    });

    return () => {
      disposed = true;
      unsubscribe();
      unsubscribeAuth();
    };
  }, []);

  const [shortcutToast, setShortcutToast] = useState<string | null>(null);

  const showShortcutToast = (message: string) => {
    setShortcutToast(message);
    setTimeout(() => {
      setShortcutToast(prev => (prev === message ? null : prev));
    }, 2800);
  };

  // Keyboard Shortcuts (F1: POS New Bill, F2: Search Meds, F3: Barcode Scan, F4: AI Assistant, F5: Refresh, F9: Print, F10: WhatsApp, Esc: Close)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Guard: Block all shortcuts when locked/unauthenticated
      if (!isAuthenticated) return;

      if (e.key === 'F1') {
        e.preventDefault();
        e.stopPropagation();
        setActiveTab('pos');
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('pharmacy:new-bill'));
          window.dispatchEvent(new CustomEvent('pharmacy:focus-search'));
        }, 70);
        sound.playKeyPress();
        showShortcutToast('⌨️ [F1] POS Billing Counter & New Bill');
      } else if (e.key === 'F2') {
        e.preventDefault();
        e.stopPropagation();
        setActiveTab('pos');
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('pharmacy:focus-search'));
        }, 70);
        sound.playKeyPress();
        showShortcutToast('⌨️ [F2] Medicine Search Focused');
      } else if (e.key === 'F3') {
        e.preventDefault();
        e.stopPropagation();
        setIsBarcodeScannerOpen(true);
        sound.playKeyPress();
        showShortcutToast('⌨️ [F3] Barcode Camera Scanner');
      } else if (e.key === 'F4') {
        e.preventDefault();
        e.stopPropagation();
        setIsAIAssistantOpen(prev => !prev);
        sound.playKeyPress();
        showShortcutToast('⌨️ [F4] Dr. Maya AI Pharmacy Assistant');
      } else if (e.key === 'F5') {
        e.preventDefault();
        e.stopPropagation();
        refreshAllData();
        sound.playSuccessChime();
        showShortcutToast('⌨️ [F5] Pharmacy Inventory & Data Refreshed');
      } else if (e.key === 'F9') {
        e.preventDefault();
        e.stopPropagation();
        window.dispatchEvent(new CustomEvent('pharmacy:action-printer'));
        showShortcutToast('⌨️ [F9] Finalize Sale via Printer');
      } else if (e.key === 'F10') {
        e.preventDefault();
        e.stopPropagation();
        window.dispatchEvent(new CustomEvent('pharmacy:action-whatsapp'));
        showShortcutToast('⌨️ [F10] Direct WhatsApp Bill Dispatch');
      } else if (e.key === 'Escape') {
        setIsBarcodeScannerOpen(false);
        setIsAIAssistantOpen(false);
        setInvoiceModalBill(null);
        setUpiModalData(prev => ({ ...prev, isOpen: false }));
        setQrLabelModalData(prev => ({ ...prev, isOpen: false }));
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isAuthenticated]);

  // Handlers
  const handleSwitchStaff = (staffId: string) => {
    const staff = staffList.find(member => member.id === staffId);
    if (!staff) return;
    void handleLogout();
  };

  const handleUpdateSettings = (newSettings: StoreSettings) => {
    StorageService.saveSettings(newSettings);
    setSettings(newSettings);
    setAuditLogs(StorageService.getAuditLogs());
  };

  const handleAddMedicine = (newMed: Medicine) => {
    StorageService.addMedicine(newMed);
    setMedicines(StorageService.getMedicines());
    setAuditLogs(StorageService.getAuditLogs());
  };

  const handleUpdateMedicine = async (updatedMed: Medicine) => {
    await StorageService.updateMedicineAndSync(updatedMed);
    setMedicines(StorageService.getMedicines());
    setAuditLogs(StorageService.getAuditLogs());
  };

  const handleDeleteMedicine = (id: string) => {
    StorageService.deleteMedicine(id);
    setMedicines(StorageService.getMedicines());
    setAuditLogs(StorageService.getAuditLogs());
  };

  const handleAddSupplier = (sup: Supplier) => {
    StorageService.addSupplier(sup);
    setSuppliers(StorageService.getSuppliers());
    setAuditLogs(StorageService.getAuditLogs());
  };

  const handleAddPurchaseInward = (inward: PurchaseInward) => {
    StorageService.addPurchaseInward(inward);
    setPurchases(StorageService.getPurchases());
    setMedicines(StorageService.getMedicines());
    setSuppliers(StorageService.getSuppliers());
    setAuditLogs(StorageService.getAuditLogs());
  };

  const handleDeleteAllPurchaseInvoices = async () => {
    const deletedCount = await StorageService.deleteAllPurchasesAndSync();
    setPurchases(StorageService.getPurchases());
    setAuditLogs(StorageService.getAuditLogs());
    showShortcutToast(`Deleted ${deletedCount} purchase invoices`);
  };

  const handleAddCustomer = (cust: Customer) => {
    StorageService.addCustomer(cust);
    setCustomers(StorageService.getCustomers());
    setAuditLogs(StorageService.getAuditLogs());
  };

  const handleUpdateCustomer = (cust: Customer) => {
    StorageService.updateCustomer(cust);
    setCustomers(StorageService.getCustomers());
    setAuditLogs(StorageService.getAuditLogs());
  };

  const handleAddExpense = (exp: StoreExpense) => {
    StorageService.addExpense(exp);
    setExpenses(StorageService.getExpenses());
    setAuditLogs(StorageService.getAuditLogs());
  };

  const handleAddStaff = (newStaff: StaffMember) => {
    const list = [...staffList, newStaff];
    StorageService.saveStaff(list);
    setStaffList(list);
    StorageService.addAuditLog('STAFF_CREATED', `Created staff account ${newStaff.name} (${newStaff.role})`);
    setAuditLogs(StorageService.getAuditLogs());
  };

  const handleUpdateStaff = (updatedStaff: StaffMember) => {
    const list = staffList.map(s => s.id === updatedStaff.id ? updatedStaff : s);
    StorageService.saveStaff(list);
    setStaffList(list);
    if (activeStaff.id === updatedStaff.id) {
      setActiveStaff(updatedStaff);
    }
    StorageService.addAuditLog('STAFF_UPDATED', `Updated staff account ${updatedStaff.name}`);
    setAuditLogs(StorageService.getAuditLogs());
  };

  const handleDeleteStaff = (staffId: string) => {
    const target = staffList.find(s => s.id === staffId);
    if (!target) return;
    const updated = staffList.filter(s => s.id !== staffId);
    StorageService.saveStaff(updated);
    setStaffList(updated);
    if (activeStaff.id === staffId && updated.length > 0) {
      StorageService.setActiveStaff(updated[0].id);
      setActiveStaff(updated[0]);
    }
    StorageService.addAuditLog('STAFF_DELETED', `Deleted staff account ${target.name} (@${target.username})`);
    setAuditLogs(StorageService.getAuditLogs());
  };

  const handleCompleteSale = (bill: SaleBill) => {
    StorageService.addBill(bill);
    setBills(StorageService.getBills());
    setMedicines(StorageService.getMedicines());
    setCustomers(StorageService.getCustomers());
    setAuditLogs(StorageService.getAuditLogs());
  };

  // View titles and subtitles
  const viewMeta: Record<ActiveTab, { title: string; subtitle: string }> = {
    dashboard: {
      title: 'Medical Store Dashboard',
      subtitle: `${settings.storeName} • Live Cashier Terminal`,
    },
    pos: {
      title: 'POS Billing Counter',
      subtitle: 'Fast optical barcode checkout, GPay/PhonePe UPI QR and GST Tax Invoice',
    },
    catalog: {
      title: 'Medicine Catalogue & Formulary',
      subtitle: 'Comprehensive brand, salt composition, HSN codes and packaging registry',
    },
    batches: {
      title: 'Batch & Expiry Management (FEFO)',
      subtitle: 'First Expiry First Out protocol & statutory quarantine compliance',
    },
    purchases: {
      title: 'Purchases & Supplier Inward',
      subtitle: 'Pharmaceutical wholesale inward bills, distributor credit and batch intake',
    },
    prescription: {
      title: 'Prescription & Dispensing Register',
      subtitle: 'Drugs & Cosmetics Act Schedule H / H1 mandatory statutory log',
    },
    customers: {
      title: 'Customer & Patient CRM',
      subtitle: 'Patient health profiles, chronic medication history and WhatsApp refills',
    },
    expenses: {
      title: 'Operating Expenses & Cash Tally Register',
      subtitle: 'Petty cash reconciliation, utility bills, rent and staff outgoings',
    },
    reports: {
      title: 'Business Reports & Financial Audit',
      subtitle: 'P&L statements, GSTR-1 tax ledger, and inventory asset valuation',
    },
    staff: {
      title: 'Staff Management & Access Control',
      subtitle: 'Pharmacist council registration, role privileges and cashier shifts',
    },
    settings: {
      title: 'Pharmacy Settings, Licensing & Backups',
      subtitle: 'Form 20B/21B licenses, GSTIN, and Master JSON archive engine',
    },
  };

  const handleLoginSuccess = async (staff: StaffMember, _rememberDevice: boolean) => {
    await startAuthenticatedSession(staff);
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      sessionUserUid.current = null;
      setIsAuthenticated(false);
      FirestoreSyncService.stopRealtimeSync();
      sound.playWarningBeep();
      showShortcutToast('🔒 Terminal Locked & Logged Out');
    } catch (error) {
      console.error('[App] Could not sign out of Firebase:', error);
      window.alert('Sign-out failed. Check your connection and try again before leaving this terminal.');
    }
  };

  if (isAppInitializing) {
    return (
      <div className="min-h-screen bg-[#ecf2f1] flex flex-col items-center justify-center p-6 text-center select-none font-sans animate-in fade-in duration-150">
        <div className="w-16 h-16 rounded-[22px] bg-[#00796b] text-white flex items-center justify-center shadow-lg shadow-teal-950/20 mb-4 animate-pulse">
          <Plus className="w-10 h-10 text-white" strokeWidth={3.5} />
        </div>
        <div className="flex items-center justify-center gap-1.5 leading-none mb-1.5">
          <span className="text-2xl font-black text-slate-900 tracking-tight">DRUGS LITES</span>
          <span className="text-2xl font-black text-[#00796b] tracking-tight">PHARMA</span>
        </div>
        <p className="text-xs text-slate-600 font-semibold mb-4">
          Licensed Medical Store Management & Point of Sale (Form 20B/21B)
        </p>
        <div className="flex items-center gap-2.5 px-4 py-2 rounded-full bg-white border border-teal-200 text-teal-800 text-xs font-bold shadow-xs">
          <div className="w-3.5 h-3.5 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" />
          <span>Checking pharmacy staff sign-in...</span>
        </div>
        <p className="text-[11px] text-slate-400 mt-3 font-medium">
          Verifying your account before opening the pharmacy workspace
        </p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <LoginScreen
        onRegistrationFlowChange={inProgress => {
          accountRegistrationInProgress.current = inProgress;
        }}
        onLoginSuccess={(staff, rememberDevice) => {
          return handleLoginSuccess(staff, rememberDevice);
        }}
      />
    );
  }

  return (
    <div className="flex h-dvh min-h-0 bg-slate-100 text-slate-800 font-sans antialiased overflow-hidden">
      {/* Sidebar */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenPos={() => setActiveTab('pos')}
        isMobileOpen={isMobileNavOpen}
        onCloseMobile={() => setIsMobileNavOpen(false)}
        activeStaff={activeStaff}
        isCloudConnected={cloudStatus.isConnected}
        onOpenAIAssistant={() => {
          setAiAssistantInitialInvoice(null);
          setIsAIAssistantOpen(true);
        }}
        onLogout={handleLogout}
      />

      {/* Main Container */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
        {/* Header */}
        <Header
          title={viewMeta[activeTab].title}
          subtitle={viewMeta[activeTab].subtitle}
          activeStaff={activeStaff}
          allStaff={staffList}
          onSwitchStaff={handleSwitchStaff}
          settings={settings}
          onOpenPos={() => setActiveTab('pos')}
          onLogout={handleLogout}
          onToggleMobileMenu={() => setIsMobileNavOpen(!isMobileNavOpen)}
          onOpenAIAssistant={() => {
            setAiAssistantInitialInvoice(null);
            setIsAIAssistantOpen(true);
          }}
        />

        {/* Dynamic View Content */}
        <main className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
          <Suspense fallback={<div className="p-6 text-sm text-slate-500" role="status">Loading pharmacy screen...</div>}>
          {activeTab === 'dashboard' && (
            <DashboardView
              medicines={medicines}
              bills={bills}
              purchases={purchases}
              expenses={expenses}
              onNavigateToTab={(tab) => setActiveTab(tab as ActiveTab)}
              onOpenPos={() => setActiveTab('pos')}
            />
          )}

          {activeTab === 'pos' && (
            <PosBillingView
              medicines={medicines}
              customers={customers}
              activeStaff={activeStaff}
              settings={settings}
              onCompleteSale={handleCompleteSale}
              onOpenBarcodeScanner={() => setIsBarcodeScannerOpen(true)}
              onOpenAIAssistant={() => setIsAIAssistantOpen(true)}
              onOpenUpiModal={(amount, billNumber, onPaid) => {
                setUpiModalData({
                  isOpen: true,
                  amount,
                  billNumber,
                  onPaid,
                });
              }}
              onOpenInvoiceModal={(bill) => {
                setInvoiceModalBill(bill);
              }}
              pendingCartItem={pendingCartItem}
              onClearPendingCartItem={() => setPendingCartItem(null)}
            />
          )}

          {activeTab === 'catalog' && (
            <MedicineCatalogView
              medicines={medicines}
              onAddMedicine={handleAddMedicine}
              onUpdateMedicine={handleUpdateMedicine}
              onDeleteMedicine={handleDeleteMedicine}
              onOpenBarcodeScanner={() => {
                setScannerInputCallback(null);
                setIsBarcodeScannerOpen(true);
              }}
              onOpenBarcodeScannerForInput={(callback) => {
                setScannerInputCallback(() => callback);
                setIsBarcodeScannerOpen(true);
              }}
              initialBarcodeForNewMed={initialBarcodeForNewMed}
              onClearInitialBarcode={() => setInitialBarcodeForNewMed(null)}
              onOpenQRLabelModal={(med, batch) => {
                setQrLabelModalData({
                  isOpen: true,
                  medicine: med,
                  batch,
                });
              }}
              onDataRefresh={refreshAllData}
            />
          )}

          {activeTab === 'batches' && (
            <BatchesExpiryView
              medicines={medicines}
              onOpenQRModal={(med, batch) => {
                setQrLabelModalData({
                  isOpen: true,
                  medicine: med,
                  batch,
                });
              }}
              onUpdateMedicine={handleUpdateMedicine}
            />
          )}

          {activeTab === 'purchases' && (
            <PurchasesSuppliersView
              suppliers={suppliers}
              purchases={purchases}
              medicines={medicines}
              onAddSupplier={handleAddSupplier}
              onAddPurchaseInward={handleAddPurchaseInward}
              onDeleteAllPurchaseInvoices={handleDeleteAllPurchaseInvoices}
              onOpenAIInvoiceScanner={(initialImg) => {
                setAiAssistantInitialInvoice(initialImg || null);
                setIsAIAssistantOpen(true);
              }}
            />
          )}

          {activeTab === 'prescription' && (
            <PrescriptionLogView
              bills={bills}
              settings={settings}
            />
          )}

          {activeTab === 'customers' && (
            <CustomerCrmView
              customers={customers}
              bills={bills}
              settings={settings}
              onAddCustomer={handleAddCustomer}
              onUpdateCustomer={handleUpdateCustomer}
            />
          )}

          {activeTab === 'expenses' && (
            <ExpensesCashView
              expenses={expenses}
              activeStaff={activeStaff}
              onAddExpense={handleAddExpense}
            />
          )}

          {activeTab === 'reports' && (
            <BusinessReportsView
              bills={bills}
              medicines={medicines}
              purchases={purchases}
              expenses={expenses}
            />
          )}

          {activeTab === 'staff' && (
            <StaffManagementView
              staffList={staffList}
              activeStaff={activeStaff}
              onAddStaff={handleAddStaff}
              onUpdateStaff={handleUpdateStaff}
              onDeleteStaff={handleDeleteStaff}
              onSwitchStaff={handleSwitchStaff}
            />
          )}

          {activeTab === 'settings' && (
            activeStaff.role === 'Admin' ? (
              <SettingsBackupView
                settings={settings}
                auditLogs={auditLogs}
                onUpdateSettings={handleUpdateSettings}
                onDatabaseRestored={refreshAllData}
              />
            ) : (
              <div className="p-6 max-w-xl mx-auto my-12 bg-white rounded-2xl border border-slate-200 shadow-xl p-8 text-center space-y-4">
                <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto border border-amber-200">
                  <Lock className="w-7 h-7" />
                </div>
                <h3 className="text-lg font-bold text-slate-900">Store Owner / Admin Privileges Required</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Pharmacy Settings, Drug Licensing (Form 20B/21B), GSTIN, and Master Database Backups can only be handled by an authorized Store Owner or Administrator.
                </p>
                <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-2">
                  <button
                    onClick={() => {
                      const adminUser = staffList.find(s => s.role === 'Admin');
                      if (adminUser) handleSwitchStaff(adminUser.id);
                    }}
                    className="px-4 py-2 bg-[#00796b] hover:bg-[#00695c] text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
                  >
                    Switch to Owner / Admin Account
                  </button>
                  <button
                    onClick={() => setActiveTab('dashboard')}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
                  >
                    Return to Dashboard
                  </button>
                </div>
              </div>
            )
          )}
          </Suspense>
        </main>
      </div>

      {/* Modals */}
      {/* 1. Barcode & QR Scanner Modal */}
      <Suspense fallback={null}>
      {isBarcodeScannerOpen && <BarcodeScannerModal
        isOpen={isBarcodeScannerOpen}
        onClose={() => {
          setIsBarcodeScannerOpen(false);
          setScannerInputCallback(null);
        }}
        medicines={medicines}
        onBarcodeScanned={(scannedBarcode) => {
          if (scannerInputCallback) {
            scannerInputCallback(scannedBarcode);
            setScannerInputCallback(null);
            setIsBarcodeScannerOpen(false);
          }
        }}
        onRegisterNewWithBarcode={(barcode) => {
          setIsBarcodeScannerOpen(false);
          setInitialBarcodeForNewMed(barcode);
          setActiveTab('catalog');
        }}
        onSelectMedicine={(medicine, batch) => {
          setPendingCartItem({ medicine, batch, timestamp: Date.now() });
          setActiveTab('pos');
          setIsBarcodeScannerOpen(false);
        }}
        onViewInCatalog={(_medicine) => {
          setActiveTab('catalog');
          setIsBarcodeScannerOpen(false);
        }}
      />}

      {/* 3. Medicine Batch QR Code Sticker Modal */}
      {qrLabelModalData.isOpen && <MedicineQRModal
        isOpen={qrLabelModalData.isOpen}
        onClose={() => setQrLabelModalData({ isOpen: false, medicine: null, batch: null })}
        medicine={qrLabelModalData.medicine}
        batch={qrLabelModalData.batch}
      />}

      {/* 4. Dynamic UPI QR Payment Modal */}
      {upiModalData.isOpen && <UPIPaymentModal
        isOpen={upiModalData.isOpen}
        onClose={() => setUpiModalData(prev => ({ ...prev, isOpen: false }))}
        amount={upiModalData.amount}
        billNumber={upiModalData.billNumber}
        upiId={settings.upiId}
        merchantName={settings.storeName}
        onPaymentSuccess={(txRef) => {
          setUpiModalData(prev => ({ ...prev, isOpen: false }));
          upiModalData.onPaid(txRef);
        }}
      />}

      {/* 5. Invoice & Thermal Print Receipt Modal */}
      {invoiceModalBill !== null && <InvoicePrintModal
        isOpen={invoiceModalBill !== null}
        onClose={() => setInvoiceModalBill(null)}
        bill={invoiceModalBill}
        settings={settings}
      />}

      {/* 6. Pharma AI Assistant & Invoice Auto-Filler Modal */}
      {isAIAssistantOpen && <PharmaAIAssistantModal
        isOpen={isAIAssistantOpen}
        onClose={() => {
          setIsAIAssistantOpen(false);
          setAiAssistantInitialInvoice(null);
        }}
        medicines={medicines}
        onDataRefresh={refreshAllData}
        onNavigateTab={(tab) => setActiveTab(tab)}
        initialInvoiceImage={aiAssistantInitialInvoice}
      />}
      </Suspense>

      {/* Floating AI Assistant Trigger Button (Bottom Right) */}
      <button
        onClick={() => {
          setAiAssistantInitialInvoice(null);
          setIsAIAssistantOpen(true);
        }}
        className="fixed bottom-5 right-5 z-40 group flex items-center gap-2.5 px-4 py-3 bg-gradient-to-r from-teal-600 via-emerald-600 to-teal-700 hover:from-teal-700 hover:to-emerald-800 text-white rounded-full shadow-2xl hover:shadow-teal-900/40 transition-all cursor-pointer transform hover:scale-105 active:scale-95 border-2 border-white/20 backdrop-blur-md"
        title="Ask Dr. Maya — Pharma AI Assistant & Invoice Auto-Filler [F4]"
      >
        <div className="relative">
          <Sparkles className="w-5 h-5 text-amber-200" />
          <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-300 animate-ping" />
        </div>
        <div className="flex flex-col text-left">
          <span className="text-xs font-black tracking-wide leading-tight">Dr. Maya AI</span>
          <span className="text-[10px] text-teal-100 font-medium leading-none">Invoice & Inventory Copilot</span>
        </div>
        <span className="ml-1 text-[10px] bg-white/20 px-1.5 py-0.5 rounded font-mono font-bold hidden sm:inline">
          F4
        </span>
      </button>

      {/* Global Keyboard Shortcut HUD Toast Notification */}
      {shortcutToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-slate-900/95 text-white px-5 py-2.5 rounded-full text-xs font-bold shadow-2xl border border-teal-500/50 backdrop-blur-md flex items-center gap-2.5 animate-in fade-in slide-in-from-top-3">
          <span className="w-2 h-2 rounded-full bg-teal-400 animate-ping" />
          <span>{shortcutToast}</span>
        </div>
      )}

      {/* Firestore connection check while restoring a session */}
      {isCloudSyncing && (
        <div className="fixed top-4 right-4 z-50 bg-slate-900/95 text-white px-4 py-2.5 rounded-2xl text-xs font-bold shadow-2xl border border-teal-500/50 backdrop-blur-md flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
          <div className="w-3.5 h-3.5 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" />
          <div className="flex flex-col">
            <span className="text-xs font-bold text-white">Checking Firestore</span>
            <span className="text-[10px] text-teal-300 font-medium">Loading authorized pharmacy records...</span>
          </div>
        </div>
      )}
    </div>
  );
}
