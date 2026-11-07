import { 
  Medicine, 
  SaleBill, 
  Supplier, 
  PurchaseInward, 
  Customer, 
  StoreExpense, 
  StaffMember, 
  StoreSettings, 
  AuditLogEntry
} from '../types/pharmacy';
import { 
  INITIAL_SETTINGS, 
  INITIAL_STAFF, 
  INITIAL_SUPPLIERS, 
  INITIAL_MEDICINES, 
  INITIAL_CUSTOMERS, 
  INITIAL_BILLS, 
  INITIAL_EXPENSES, 
  INITIAL_AUDIT_LOGS 
} from '../data/initialData';
import { IDBStorage } from './idbStorage';
import { FirestoreSyncService } from '../firebase/firestoreService';
import { FIREBASE_PROJECT_ID, FIRESTORE_DATABASE_ID, testFirestoreConnection } from '../firebase/config';

export const STORAGE_KEYS = {
  SETTINGS: 'drugs_lites_settings_v2',
  STAFF: 'drugs_lites_staff_v2',
  ACTIVE_STAFF: 'drugs_lites_active_staff_v2',
  SUPPLIERS: 'drugs_lites_suppliers_v2',
  MEDICINES: 'drugs_lites_medicines_v2',
  CUSTOMERS: 'drugs_lites_customers_v2',
  BILLS: 'drugs_lites_bills_v2',
  PURCHASES: 'drugs_lites_purchases_v2',
  EXPENSES: 'drugs_lites_expenses_v2',
  AUDIT_LOGS: 'drugs_lites_audit_logs_v2',
  AUTH_REMEMBER: 'drugs_lites_auth_remember_v2',
};

// In-memory cache for synchronous React component reads
interface CacheStore {
  settings?: StoreSettings;
  staff?: StaffMember[];
  activeStaffId?: string;
  suppliers?: Supplier[];
  medicines?: Medicine[];
  customers?: Customer[];
  bills?: SaleBill[];
  purchases?: PurchaseInward[];
  expenses?: StoreExpense[];
  auditLogs?: AuditLogEntry[];
}

export interface CloudStatusInfo {
  isConnected: boolean;
  isSyncing: boolean;
  lastSyncTime: Date | null;
  error?: string;
  databaseName: string;
}

const memoryCache: CacheStore = {};
const subscribers: Set<() => void> = new Set();
let isInitialized = false;
let initPromise: Promise<void> | null = null;
let cloudOnlyPersistence = false;
let pendingLegacyMigration: CacheStore | null = null;
let canMigrateLegacyStaff = false;
let cloudStatus: CloudStatusInfo = {
  isConnected: false,
  isSyncing: false,
  lastSyncTime: null,
  databaseName: `${FIREBASE_PROJECT_ID}/${FIRESTORE_DATABASE_ID}`,
};

/**
 * Writes are allowed only during legacy migration; normal pharmacy data remains cloud-only.
 */
function safeLocalStorageSet(key: string, value: any): void {
  if (cloudOnlyPersistence) return;
  try {
    if (typeof value === 'string') {
      localStorage.setItem(key, value);
    } else {
      localStorage.setItem(key, JSON.stringify(value));
    }
  } catch (err: any) {
    console.warn(`[StorageService] Could not update legacy browser storage for key "${key}": ${err instanceof Error ? err.message : 'Storage unavailable'}. Firestore remains authoritative.`);
  }
}

/**
 * Synchronous seed helper for initial module evaluation
 */
function readLocalSync<T>(key: string, fallback: T): T {
  if (cloudOnlyPersistence) return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function sanitizeStaffList(staffList: StaffMember[]): StaffMember[] {
  if (!Array.isArray(staffList)) return [];
  return staffList.filter((staff): staff is StaffMember => Boolean(staff) && typeof staff === 'object')
    .map(staff => {
    const { password: _password, ...profile } = staff as StaffMember & { password?: string };
    return profile;
  });
}

function loadLocalStaff(): StaffMember[] {
  const staffList = readLocalSync(STORAGE_KEYS.STAFF, []);
  const sanitized = sanitizeStaffList(staffList);
  if (Array.isArray(staffList) && staffList.some(staff => staff && 'password' in staff)) {
    safeLocalStorageSet(STORAGE_KEYS.STAFF, sanitized);
  }
  return sanitized;
}

function mergeCloudAndLegacyRecords<T extends { id: string }>(
  cloudRecords: T[],
  legacyRecords: T[]
): { records: T[]; missingFromCloud: T[] } {
  const records = new Map<string, T>();
  cloudRecords.forEach(record => {
    if (record?.id) records.set(record.id, record);
  });
  const missingFromCloud: T[] = [];
  legacyRecords.forEach(record => {
    if (record?.id && !records.has(record.id)) {
      records.set(record.id, record);
      missingFromCloud.push(record);
    }
  });
  return { records: Array.from(records.values()), missingFromCloud };
}

async function clearLegacyBrowserData(): Promise<void> {
  await IDBStorage.clear();
  try {
    for (const key of Object.values(STORAGE_KEYS)) {
      localStorage.removeItem(key);
    }
    localStorage.removeItem('drugs_lites_idb_migrated_v2');
  } catch (error) {
    console.error('[StorageService] Firestore is connected, but legacy browser data could not be fully removed:', error);
    throw new Error('Legacy browser records could not be cleared after Firestore synchronization.');
  }
}

// Seed initial memory cache immediately from localStorage (or fallback defaults)
// so the very first React render has instant, flicker-free data.
memoryCache.settings = readLocalSync(STORAGE_KEYS.SETTINGS, INITIAL_SETTINGS);
memoryCache.staff = loadLocalStaff();
memoryCache.suppliers = readLocalSync(STORAGE_KEYS.SUPPLIERS, []);
memoryCache.medicines = readLocalSync(STORAGE_KEYS.MEDICINES, []);
memoryCache.customers = readLocalSync(STORAGE_KEYS.CUSTOMERS, []);
memoryCache.bills = readLocalSync(STORAGE_KEYS.BILLS, []);
memoryCache.purchases = readLocalSync(STORAGE_KEYS.PURCHASES, []);
memoryCache.expenses = readLocalSync(STORAGE_KEYS.EXPENSES, []);
memoryCache.auditLogs = readLocalSync(STORAGE_KEYS.AUDIT_LOGS, []);

export class StorageService {
  /**
   * Subscribe to storage updates (local + real-time cloud sync)
   */
  static subscribe(listener: () => void): () => void {
    subscribers.add(listener);
    return () => {
      subscribers.delete(listener);
    };
  }

  private static notifySubscribers(): void {
    subscribers.forEach(cb => {
      try {
        cb();
      } catch (e) {
        console.error('[StorageService] Error in subscriber callback:', e);
      }
    });
  }

  static getCloudStatus(): CloudStatusInfo {
    return cloudStatus;
  }

  static async removeStoredStaffPasswords(): Promise<void> {
    if (!IDBStorage.isAvailable()) return;
    const storedStaff = await IDBStorage.getItem<Array<StaffMember & { password?: string }>>(STORAGE_KEYS.STAFF);
    if (!storedStaff || !storedStaff.some(staff => staff && 'password' in staff)) return;
    const sanitized = sanitizeStaffList(storedStaff);
    await IDBStorage.setItem(STORAGE_KEYS.STAFF, sanitized);
    safeLocalStorageSet(STORAGE_KEYS.STAFF, sanitized);
  }

  /**
   * Migrate legacy browser records to Firestore, disable local persistence, and attach cloud listeners.
   */
  static async init(currentStaff?: StaffMember): Promise<void> {
    if (isInitialized) return;
    if (initPromise) return initPromise;

    initPromise = (async () => {
      try {
        // 1. Hydrate from IndexedDB first for instant local offline cache
        if (IDBStorage.isAvailable()) {
          const targetKeys = Object.values(STORAGE_KEYS);
          await IDBStorage.migrateFromLocalStorage(targetKeys);

          const [
            settings,
            staff,
            activeStaffId,
            suppliers,
            medicines,
            customers,
            bills,
            purchases,
            expenses,
            auditLogs,
          ] = await Promise.all([
            IDBStorage.getItem<StoreSettings>(STORAGE_KEYS.SETTINGS),
            IDBStorage.getItem<StaffMember[]>(STORAGE_KEYS.STAFF),
            IDBStorage.getItem<string>(STORAGE_KEYS.ACTIVE_STAFF),
            IDBStorage.getItem<Supplier[]>(STORAGE_KEYS.SUPPLIERS),
            IDBStorage.getItem<Medicine[]>(STORAGE_KEYS.MEDICINES),
            IDBStorage.getItem<Customer[]>(STORAGE_KEYS.CUSTOMERS),
            IDBStorage.getItem<SaleBill[]>(STORAGE_KEYS.BILLS),
            IDBStorage.getItem<PurchaseInward[]>(STORAGE_KEYS.PURCHASES),
            IDBStorage.getItem<StoreExpense[]>(STORAGE_KEYS.EXPENSES),
            IDBStorage.getItem<AuditLogEntry[]>(STORAGE_KEYS.AUDIT_LOGS),
          ]);

          if (settings) memoryCache.settings = settings;
          if (staff) {
            memoryCache.staff = sanitizeStaffList(staff);
            await IDBStorage.setItem(STORAGE_KEYS.STAFF, memoryCache.staff);
            safeLocalStorageSet(STORAGE_KEYS.STAFF, memoryCache.staff);
          }
          if (activeStaffId) memoryCache.activeStaffId = activeStaffId;
          if (suppliers) memoryCache.suppliers = suppliers;
          if (medicines) memoryCache.medicines = medicines;
          if (customers) memoryCache.customers = customers;
          if (bills) memoryCache.bills = bills;
          if (purchases) memoryCache.purchases = purchases;
          if (expenses) memoryCache.expenses = expenses;
          if (auditLogs) memoryCache.auditLogs = auditLogs;
        }

        pendingLegacyMigration = { ...memoryCache };
        canMigrateLegacyStaff = currentStaff?.role === 'Admin';
        cloudOnlyPersistence = true;
        IDBStorage.disablePersistence();

        // Test server connection as per Firebase skill mandate
        await testFirestoreConnection();

        // 2. Load authoritative records from Firestore into the in-memory session cache.
        FirestoreSyncService.startRealtimeSync({
          onMedicinesSync: (cloudMeds) => {
            memoryCache.medicines = cloudMeds;
            this.notifySubscribers();
          },
          onBillsSync: (cloudBills) => {
            memoryCache.bills = cloudBills;
            this.notifySubscribers();
          },
          onCustomersSync: (cloudCusts) => {
            memoryCache.customers = cloudCusts;
            this.notifySubscribers();
          },
          onSuppliersSync: (cloudSups) => {
            memoryCache.suppliers = cloudSups;
            this.notifySubscribers();
          },
          onPurchasesSync: (cloudPurchases) => {
            memoryCache.purchases = cloudPurchases;
            this.notifySubscribers();
          },
          onExpensesSync: (cloudExpenses) => {
            memoryCache.expenses = cloudExpenses;
            this.notifySubscribers();
          },
          onStaffSync: (cloudStaff) => {
            memoryCache.staff = sanitizeStaffList(cloudStaff);
            this.notifySubscribers();
          },
          onSettingsSync: (cloudSettings) => {
            if (cloudSettings) {
              memoryCache.settings = cloudSettings;
            }
            this.notifySubscribers();
          },
          onAuditLogsSync: (cloudLogs) => {
            memoryCache.auditLogs = cloudLogs;
            this.notifySubscribers();
          },
          onConnectionChange: (status) => {
            cloudStatus = {
              ...cloudStatus,
              ...status,
            };
            this.notifySubscribers();
          },
        });

        // 3. Migrate legacy browser records once, then remove the browser copy.
        const syncResult = await this.syncFromCloudAuthoritative();
        if (!syncResult.success) {
          throw new Error(cloudStatus.error || 'Firestore initialization failed.');
        }

        isInitialized = true;
        this.notifySubscribers();
      } catch (err: any) {
        console.error('[StorageService] Initialization error:', err);
        cloudStatus = {
          ...cloudStatus,
          isConnected: false,
          error: 'Cloud sync initialization failed. Check your network and account permissions.',
        };
        initPromise = null;
        this.notifySubscribers();
        throw err instanceof Error ? err : new Error('Cloud sync initialization failed.');
      }
    })();

    return initPromise;
  }

  /**
   * Forces an immediate, authoritative server fetch of all live medicines, purchases,
   * bills, customer records, and inventory batches from Cloud Firestore.
   * Loads Firestore records into the in-memory session cache and migrates legacy browser-only
   * records that are missing from Firestore.
   */
  static async syncFromCloudAuthoritative(): Promise<{
    success: boolean;
    medicineCount: number;
    billCount: number;
    purchaseCount: number;
    customerCount: number;
  }> {
    try {
      cloudStatus.isSyncing = true;
      this.notifySubscribers();

      // Do not report a successful sync when only browser-cached data is available.
      if (!await testFirestoreConnection()) {
        throw new Error('Firestore could not be reached.');
      }

      // Direct server collection pull
      const cloudData = await FirestoreSyncService.fetchAllFromCloud();

      // Merge legacy browser data only when a record is absent from Firestore.
      // Existing cloud records are always authoritative.
      const meds = mergeCloudAndLegacyRecords(cloudData.medicines, pendingLegacyMigration?.medicines || []);
      memoryCache.medicines = meds.records;
      if (meds.missingFromCloud.length > 0) {
        await FirestoreSyncService.saveMedicinesBulk(meds.missingFromCloud);
      }

      const bills = mergeCloudAndLegacyRecords(cloudData.bills, pendingLegacyMigration?.bills || []);
      memoryCache.bills = bills.records.sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
      if (bills.missingFromCloud.length > 0) {
        await FirestoreSyncService.saveBillsBulk(bills.missingFromCloud);
      }

      const purchases = mergeCloudAndLegacyRecords(cloudData.purchases, pendingLegacyMigration?.purchases || []);
      memoryCache.purchases = purchases.records;
      if (purchases.missingFromCloud.length > 0) {
        await FirestoreSyncService.savePurchasesBulk(purchases.missingFromCloud);
      }

      const customers = mergeCloudAndLegacyRecords(cloudData.customers, pendingLegacyMigration?.customers || []);
      memoryCache.customers = customers.records;
      if (customers.missingFromCloud.length > 0) {
        await FirestoreSyncService.saveCustomersBulk(customers.missingFromCloud);
      }

      const suppliers = mergeCloudAndLegacyRecords(cloudData.suppliers, pendingLegacyMigration?.suppliers || []);
      memoryCache.suppliers = suppliers.records;
      if (suppliers.missingFromCloud.length > 0) {
        await FirestoreSyncService.saveSuppliersBulk(suppliers.missingFromCloud);
      }

      const expenses = mergeCloudAndLegacyRecords(cloudData.expenses, pendingLegacyMigration?.expenses || []);
      memoryCache.expenses = expenses.records;
      await Promise.all(expenses.missingFromCloud.map(expense => FirestoreSyncService.saveExpense(expense)));

      const auditLogs = mergeCloudAndLegacyRecords(cloudData.auditLogs, pendingLegacyMigration?.auditLogs || []);
      memoryCache.auditLogs = auditLogs.records;
      await Promise.all(auditLogs.missingFromCloud.map(log => FirestoreSyncService.saveAuditLog(log)));

      const staff = canMigrateLegacyStaff
        ? mergeCloudAndLegacyRecords(cloudData.staff, pendingLegacyMigration?.staff || [])
        : { records: cloudData.staff, missingFromCloud: [] as StaffMember[] };
      memoryCache.staff = sanitizeStaffList(staff.records);
      await Promise.all(staff.missingFromCloud.map(member => FirestoreSyncService.saveStaff(member)));

      // 6. Pharmacy Settings & Licensing
      if (cloudData.settings) {
        memoryCache.settings = cloudData.settings;
      } else if (pendingLegacyMigration?.settings) {
        memoryCache.settings = pendingLegacyMigration.settings;
        await FirestoreSyncService.saveSettings(pendingLegacyMigration.settings);
      } else {
        memoryCache.settings = INITIAL_SETTINGS;
      }

      cloudStatus = {
        ...cloudStatus,
        isConnected: true,
        isSyncing: false,
        lastSyncTime: new Date(),
        error: undefined,
      };

      if (pendingLegacyMigration) {
        await clearLegacyBrowserData();
        pendingLegacyMigration = null;
        canMigrateLegacyStaff = false;
      }

      this.notifySubscribers();

      return {
        success: true,
        medicineCount: memoryCache.medicines?.length || 0,
        billCount: memoryCache.bills?.length || 0,
        purchaseCount: memoryCache.purchases?.length || 0,
        customerCount: memoryCache.customers?.length || 0,
      };
    } catch (err: any) {
      console.error('[StorageService] Error during authoritative cloud sync:', err);
      cloudStatus = {
        ...cloudStatus,
        isConnected: false,
        isSyncing: false,
        error: 'Cloud sync failed. Check your network, Firebase setup, and staff permissions.',
      };
      this.notifySubscribers();
      return {
        success: false,
        medicineCount: memoryCache.medicines?.length || 0,
        billCount: memoryCache.bills?.length || 0,
        purchaseCount: memoryCache.purchases?.length || 0,
        customerCount: memoryCache.customers?.length || 0,
      };
    }
  }

  // --- Settings ---
  static getSettings(): StoreSettings {
    if (memoryCache.settings !== undefined) return memoryCache.settings;
    memoryCache.settings = readLocalSync(STORAGE_KEYS.SETTINGS, INITIAL_SETTINGS);
    return memoryCache.settings;
  }

  static saveSettings(settings: StoreSettings): void {
    memoryCache.settings = settings;
    IDBStorage.setItem(STORAGE_KEYS.SETTINGS, settings).catch(console.error);
    safeLocalStorageSet(STORAGE_KEYS.SETTINGS, settings);
    // Real-time Cloud Firestore Sync
    FirestoreSyncService.saveSettings(settings).catch(console.error);
    this.addAuditLog('SETTINGS_UPDATE', 'Pharmacy profile, drug licensing and thresholds updated');
    this.notifySubscribers();
  }

  // --- Staff ---
  static getStaff(): StaffMember[] {
    if (memoryCache.staff !== undefined) return memoryCache.staff;
    memoryCache.staff = loadLocalStaff();
    return memoryCache.staff;
  }

  static saveStaff(staffList: StaffMember[]): void {
    memoryCache.staff = sanitizeStaffList(staffList);
    IDBStorage.setItem(STORAGE_KEYS.STAFF, memoryCache.staff).catch(console.error);
    safeLocalStorageSet(STORAGE_KEYS.STAFF, memoryCache.staff);
    // Real-time Cloud Firestore Sync for each staff member
    memoryCache.staff.forEach(s => {
      FirestoreSyncService.saveStaff(s).catch(console.error);
    });
    this.notifySubscribers();
  }

  static getActiveStaff(): StaffMember {
    const staff = this.getStaff();
    const rawId = memoryCache.activeStaffId || (
      !cloudOnlyPersistence && typeof localStorage !== 'undefined'
        ? localStorage.getItem(STORAGE_KEYS.ACTIVE_STAFF)
        : null
    );
    if (rawId) {
      const found = staff.find(s => s.id === rawId && s.status === 'Active');
      if (found) return found;
    }
    return staff[0] || {
      id: '',
      name: 'Not signed in',
      username: '',
      phone: '',
      email: '',
      role: 'Cashier',
      status: 'Deactivated',
      createdDate: '',
    };
  }

  static setActiveStaff(staffId: string): void {
    memoryCache.activeStaffId = staffId;
    safeLocalStorageSet(STORAGE_KEYS.ACTIVE_STAFF, staffId);
    IDBStorage.setItem(STORAGE_KEYS.ACTIVE_STAFF, staffId).catch(console.error);
    const staff = this.getStaff().find(s => s.id === staffId);
    if (staff) {
      this.addAuditLog('SESSION_SWITCH', `Active cashier session switched to ${staff.name} (${staff.role})`);
    }
    this.notifySubscribers();
  }

  // --- Medicines & Batches ---
  static getMedicines(): Medicine[] {
    if (memoryCache.medicines !== undefined) return memoryCache.medicines;
    memoryCache.medicines = readLocalSync(STORAGE_KEYS.MEDICINES, []);
    return memoryCache.medicines;
  }

  static saveMedicines(medicines: Medicine[]): void {
    memoryCache.medicines = medicines;
    IDBStorage.setItem(STORAGE_KEYS.MEDICINES, medicines).catch(console.error);
    safeLocalStorageSet(STORAGE_KEYS.MEDICINES, medicines);
    this.notifySubscribers();
  }

  static addMedicine(newMed: Medicine): void {
    const medicines = [...this.getMedicines()];
    medicines.unshift(newMed);
    this.saveMedicines(medicines);
    // Real-time Cloud Firestore Sync
    FirestoreSyncService.saveMedicine(newMed).catch(console.error);
    this.addAuditLog('MEDICINE_CREATED', `Added new product ${newMed.brandName} (${newMed.strength}) with batch ${newMed.batches[0]?.batchNumber || 'N/A'}`);
  }

  private static applyMedicineUpdate(updatedMed: Medicine): void {
    const medicines = [...this.getMedicines()];
    const idx = medicines.findIndex(m => m.id === updatedMed.id);
    if (idx === -1) {
      return;
    }

    medicines[idx] = updatedMed;
    this.saveMedicines(medicines);
    this.addAuditLog('MEDICINE_UPDATED', `Updated details for ${updatedMed.brandName}`);
  }

  static updateMedicine(updatedMed: Medicine): void {
    if (!this.getMedicines().some(medicine => medicine.id === updatedMed.id)) return;
    this.applyMedicineUpdate(updatedMed);
    FirestoreSyncService.saveMedicine(updatedMed).catch(console.error);
  }

  static async updateMedicineAndSync(updatedMed: Medicine): Promise<void> {
    if (!this.getMedicines().some(medicine => medicine.id === updatedMed.id)) {
      throw new Error('This medicine is no longer available. Refresh the catalogue and try again.');
    }

    await FirestoreSyncService.saveMedicine(updatedMed);
    this.applyMedicineUpdate(updatedMed);
  }

  static deleteMedicine(medicineId: string): void {
    let medicines = this.getMedicines();
    const target = medicines.find(m => m.id === medicineId);
    medicines = medicines.filter(m => m.id !== medicineId);
    this.saveMedicines(medicines);
    // Real-time Cloud Firestore Sync
    FirestoreSyncService.deleteMedicine(medicineId).catch(console.error);
    if (target) {
      this.addAuditLog('MEDICINE_DELETED', `Deleted medicine item ${target.brandName}`);
    }
  }

  // --- Customers ---
  static getCustomers(): Customer[] {
    if (memoryCache.customers !== undefined) return memoryCache.customers;
    memoryCache.customers = readLocalSync(STORAGE_KEYS.CUSTOMERS, []);
    return memoryCache.customers;
  }

  static saveCustomers(customers: Customer[]): void {
    memoryCache.customers = customers;
    IDBStorage.setItem(STORAGE_KEYS.CUSTOMERS, customers).catch(console.error);
    safeLocalStorageSet(STORAGE_KEYS.CUSTOMERS, customers);
    this.notifySubscribers();
  }

  static addCustomer(customer: Customer): void {
    const customers = [...this.getCustomers()];
    customers.unshift(customer);
    this.saveCustomers(customers);
    // Real-time Cloud Firestore Sync
    FirestoreSyncService.saveCustomer(customer).catch(console.error);
    this.addAuditLog('CUSTOMER_REGISTERED', `Registered new patient/customer ${customer.name} (${customer.phone})`);
  }

  static updateCustomer(updated: Customer): void {
    const customers = [...this.getCustomers()];
    const idx = customers.findIndex(c => c.id === updated.id);
    if (idx !== -1) {
      customers[idx] = updated;
      this.saveCustomers(customers);
      // Real-time Cloud Firestore Sync
      FirestoreSyncService.saveCustomer(updated).catch(console.error);
      this.addAuditLog('CUSTOMER_UPDATED', `Updated patient profile for ${updated.name} (${updated.phone})`);
    }
  }

  // --- Suppliers ---
  static getSuppliers(): Supplier[] {
    if (memoryCache.suppliers !== undefined) return memoryCache.suppliers;
    memoryCache.suppliers = readLocalSync(STORAGE_KEYS.SUPPLIERS, []);
    return memoryCache.suppliers;
  }

  static saveSuppliers(suppliers: Supplier[]): void {
    memoryCache.suppliers = suppliers;
    IDBStorage.setItem(STORAGE_KEYS.SUPPLIERS, suppliers).catch(console.error);
    safeLocalStorageSet(STORAGE_KEYS.SUPPLIERS, suppliers);
    this.notifySubscribers();
  }

  static addSupplier(supplier: Supplier): void {
    const suppliers = [...this.getSuppliers()];
    suppliers.unshift(supplier);
    this.saveSuppliers(suppliers);
    // Real-time Cloud Firestore Sync
    FirestoreSyncService.saveSupplier(supplier).catch(console.error);
    this.addAuditLog('SUPPLIER_REGISTERED', `Registered pharmaceutical supplier ${supplier.firmName}`);
  }

  static updateSupplier(supplier: Supplier): void {
    const suppliers = [...this.getSuppliers()];
    const idx = suppliers.findIndex(s => s.id === supplier.id);
    if (idx !== -1) {
      suppliers[idx] = supplier;
      this.saveSuppliers(suppliers);
      // Real-time Cloud Firestore Sync
      FirestoreSyncService.saveSupplier(supplier).catch(console.error);
      this.notifySubscribers();
    }
  }

  // --- Inward Purchases (IndexedDB + Cloud Firestore) ---
  static getPurchases(): PurchaseInward[] {
    if (memoryCache.purchases !== undefined) return memoryCache.purchases;
    memoryCache.purchases = readLocalSync(STORAGE_KEYS.PURCHASES, []);
    return memoryCache.purchases;
  }

  static savePurchases(purchases: PurchaseInward[]): void {
    memoryCache.purchases = purchases;

    // Persist in IndexedDB
    IDBStorage.setItem(STORAGE_KEYS.PURCHASES, purchases).catch(err => {
      console.error('[StorageService] Failed to persist purchases to IndexedDB:', err);
    });

    // Provide a quota-safe lightweight copy for localStorage fallback
    try {
      const lightweightPurchases = purchases.map(p => ({
        ...p,
        billImageUrl: p.billImageUrl ? '[Stored in IndexedDB & Cloud]' : undefined,
      }));
      safeLocalStorageSet(STORAGE_KEYS.PURCHASES, lightweightPurchases);
    } catch {
      // Safely ignore if localStorage quota is tight
    }

    this.notifySubscribers();
  }

  static async deleteAllPurchasesAndSync(): Promise<number> {
    const deletedCount = await FirestoreSyncService.deleteAllPurchases();
    this.savePurchases([]);
    this.addAuditLog('PURCHASE_INVOICES_DELETED', `Deleted ${deletedCount} purchase/inward invoice records`);
    return deletedCount;
  }

  static addPurchaseInward(inward: PurchaseInward): void {
    const medicines = this.getMedicines();
    const availableSuppliers = this.getSuppliers();
    const validDate = (value: string, pattern: RegExp) => {
      if (!pattern.test(value)) return false;
      const [year, month, day] = value.split('-').map(Number);
      if (month < 1 || month > 12) return false;
      if (day !== undefined && new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10) !== value) {
        return false;
      }
      return true;
    };
    if (
      !inward ||
      !inward.id ||
      !inward.inwardNumber ||
      !inward.supplierId ||
      !availableSuppliers.some(supplier => supplier.id === inward.supplierId) ||
      typeof inward.supplierInvoiceNo !== 'string' ||
      !inward.supplierInvoiceNo.trim() ||
      !validDate(inward.invoiceDate, /^\d{4}-\d{2}-\d{2}$/) ||
      !['Paid', 'Credit Pending'].includes(inward.paymentStatus) ||
      !Array.isArray(inward.items) ||
      inward.items.length === 0 ||
      !Number.isFinite(inward.netBillAmount)
    ) {
      throw new Error('Complete the supplier, invoice, payment, and total details before recording this inward.');
    }
    const existingPurchases = this.getPurchases();
    if (existingPurchases.some(purchase =>
      purchase.supplierId === inward.supplierId &&
      typeof purchase.supplierInvoiceNo === 'string' &&
      purchase.supplierInvoiceNo.trim().toLowerCase() === inward.supplierInvoiceNo.trim().toLowerCase()
    )) {
      throw new Error('This supplier invoice number has already been recorded.');
    }

    for (const item of inward.items) {
      if (!item || typeof item.medicineName !== 'string' || typeof item.batchNumber !== 'string') {
        throw new Error('Every invoice item must include a medicine name and batch number.');
      }
      const matchingMedicine = medicines.find(medicine =>
        typeof medicine?.brandName === 'string' &&
        medicine.brandName.trim().toLowerCase() === item.medicineName.trim().toLowerCase()
      );
      const packSize = Number(item.packSize ?? matchingMedicine?.packSize);
      const freeQty = Number(item.freeQty ?? 0);
      const currentMonth = new Date().toISOString().slice(0, 7);
      if (
        !item.medicineName.trim() ||
        !item.batchNumber.trim() ||
        !validDate(item.expiryDate, /^\d{4}-\d{2}$/) ||
        item.expiryDate < currentMonth ||
        (item.mfgDate && !validDate(item.mfgDate, /^\d{4}-\d{2}$/)) ||
        !Number.isInteger(packSize) ||
        packSize < 1 ||
        !Number.isInteger(item.quantity) ||
        item.quantity < 1 ||
        !Number.isInteger(freeQty) ||
        freeQty < 0 ||
        !Number.isFinite(item.purchaseCost) ||
        item.purchaseCost < 0 ||
        !Number.isFinite(item.sellingMrp) ||
        item.sellingMrp < 0 ||
        ![0, 5, 12, 18, 28].includes(Number(item.gstRate))
      ) {
        throw new Error(`Verify the item name, batch, expiry, pack, quantity, price, and tax values for ${item.medicineName || 'this invoice item'}.`);
      }
    }

    const purchases = [...existingPurchases];
    purchases.unshift(inward);
    this.savePurchases(purchases);

    // Real-time Cloud Firestore Sync for the purchase
    FirestoreSyncService.savePurchase(inward).catch(console.error);

    // Update medicines inventory batches
    const updatedMedicines = [...medicines];
    const updatedMedsToSync: Medicine[] = [];

    (inward.items || []).forEach(inItem => {
      const inItemName = (inItem.medicineName || '').trim().toLowerCase();

      let existingMed = updatedMedicines.find(
        m => m?.brandName && m.brandName.trim().toLowerCase() === inItemName
      );

      const effectivePackSize = Number(inItem.packSize ?? existingMed?.packSize);
      const purchaseCost = Number(inItem.purchaseCost);
      const sellingMrp = Number(inItem.sellingMrp);
      const effectiveUnitMrp = inItem.unitMrp || Math.round((sellingMrp / effectivePackSize) * 100) / 100;
      const effectiveUnitCost = inItem.unitPurchaseCost || Math.round((purchaseCost / effectivePackSize) * 100) / 100;
      const totalUnitsReceived = Number(inItem.quantity) + Number(inItem.freeQty || 0);
      const batchNo = inItem.batchNumber.trim().toUpperCase();

      if (existingMed) {
        existingMed.batches = existingMed.batches || [];
        if (inItem.hsnCode && (!existingMed.hsnCode || existingMed.hsnCode === '30049099')) {
          existingMed.hsnCode = inItem.hsnCode;
        }
        if (inItem.packSize && !existingMed.packSize) {
          existingMed.packSize = effectivePackSize;
          existingMed.packUnit = inItem.packUnit || `Strip of ${effectivePackSize}`;
        }
        const batchIdx = existingMed.batches.findIndex(
          b => (b.batchNumber || '').trim().toUpperCase() === batchNo
        );
        if (inItem.gstRate !== undefined && !isNaN(Number(inItem.gstRate))) {
          existingMed.gstRate = Number(inItem.gstRate);
        }
        if (batchIdx !== -1) {
          existingMed.batches[batchIdx].stock = (existingMed.batches[batchIdx].stock || 0) + totalUnitsReceived;
          existingMed.batches[batchIdx].purchasePrice = purchaseCost;
          existingMed.batches[batchIdx].mrp = sellingMrp;
          existingMed.batches[batchIdx].packSize = effectivePackSize;
          existingMed.batches[batchIdx].packUnit = inItem.packUnit || existingMed.packUnit || '';
          existingMed.batches[batchIdx].unitMrp = effectiveUnitMrp;
          existingMed.batches[batchIdx].unitPurchasePrice = effectiveUnitCost;
        } else {
          existingMed.batches.push({
            batchNumber: batchNo,
            mfgDate: inItem.mfgDate || '',
            expiryDate: inItem.expiryDate,
            purchasePrice: purchaseCost,
            mrp: sellingMrp,
            stock: totalUnitsReceived,
            rackLocation: inItem.rackLocation || '',
            barcode: inItem.barcode || '',
            packSize: effectivePackSize,
            packUnit: inItem.packUnit || existingMed.packUnit || `Strip of ${effectivePackSize}`,
            unitMrp: effectiveUnitMrp,
            unitPurchasePrice: effectiveUnitCost,
          });
        }
        updatedMedsToSync.push(existingMed);
      } else {
        // Create new medicine entry
        const newMed: Medicine = {
          id: `med-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          brandName: inItem.medicineName.trim(),
          genericName: (inItem.genericName || '').trim(),
          category: inItem.category,
          dosageForm: inItem.dosageForm,
          strength: inItem.strength || '',
          manufacturer: '',
          gstRate: Number(inItem.gstRate),
          hsnCode: inItem.hsnCode || '',
          isScheduleDrug: false,
          scheduleClass: 'OTC',
          packSize: effectivePackSize,
          packUnit: inItem.packUnit || '',
          batches: [
            {
              batchNumber: inItem.batchNumber,
              mfgDate: inItem.mfgDate,
              expiryDate: inItem.expiryDate,
              purchasePrice: inItem.purchaseCost,
              mrp: inItem.sellingMrp,
              stock: totalUnitsReceived,
              rackLocation: inItem.rackLocation || '',
              barcode: inItem.barcode || '',
              packSize: effectivePackSize,
              packUnit: inItem.packUnit,
              unitMrp: effectiveUnitMrp,
              unitPurchasePrice: effectiveUnitCost,
            },
          ],
        };
        updatedMedicines.push(newMed);
        updatedMedsToSync.push(newMed);
      }
    });

    this.saveMedicines(updatedMedicines);
    // Sync all updated medicine items to Firestore cloud in parallel
    updatedMedsToSync.forEach(m => {
      FirestoreSyncService.saveMedicine(m).catch(console.error);
    });

    // Update supplier total purchases
    const suppliers = [...this.getSuppliers()];
    const supIdx = suppliers.findIndex(s => s.id === inward.supplierId);
    if (supIdx !== -1) {
      suppliers[supIdx].totalPurchases += inward.netBillAmount;
      if (inward.paymentStatus === 'Credit Pending') {
        suppliers[supIdx].outstandingBalance += inward.netBillAmount;
      }
      this.saveSuppliers(suppliers);
      FirestoreSyncService.saveSupplier(suppliers[supIdx]).catch(console.error);
    }

    this.addAuditLog('PURCHASE_INWARD', `Recorded goods inward bill #${inward.supplierInvoiceNo} from ${inward.supplierName} (₹${inward.netBillAmount.toFixed(2)})`);
  }

  // --- Sales Bills & Stock Deduction ---
  static getBills(): SaleBill[] {
    if (memoryCache.bills !== undefined) return memoryCache.bills;
    memoryCache.bills = readLocalSync(STORAGE_KEYS.BILLS, []);
    return memoryCache.bills;
  }

  static saveBills(bills: SaleBill[]): void {
    memoryCache.bills = bills;
    IDBStorage.setItem(STORAGE_KEYS.BILLS, bills).catch(console.error);
    safeLocalStorageSet(STORAGE_KEYS.BILLS, bills);
    this.notifySubscribers();
  }

  static addBill(bill: SaleBill): void {
    if (
      !bill ||
      typeof bill.id !== 'string' ||
      !bill.id ||
      typeof bill.billNumber !== 'string' ||
      !bill.billNumber.trim() ||
      !Array.isArray(bill.items) ||
      bill.items.length === 0 ||
      !Number.isFinite(bill.netPayable) ||
      bill.netPayable < 0 ||
      bill.status !== 'Completed'
    ) {
      throw new Error('The bill is incomplete or invalid and was not saved.');
    }

    const bills = [...this.getBills()];
    if (bills.some(existing => existing.id === bill.id || existing.billNumber === bill.billNumber)) {
      throw new Error('This bill number has already been used. Start a new bill and try again.');
    }

    const currentMonth = new Date().toISOString().slice(0, 7);
    const medicines = this.getMedicines().map(medicine => ({
      ...medicine,
      batches: Array.isArray(medicine.batches) ? medicine.batches.map(batch => ({ ...batch })) : [],
    }));
    const stockToDeduct = new Map<string, { medicineId: string; batchNumber: string; quantityInPacks: number }>();
    for (const item of bill.items) {
      if (
        !item ||
        typeof item.medicineId !== 'string' ||
        typeof item.batchNumber !== 'string' ||
        (item.dispenseMode !== undefined && item.dispenseMode !== 'pack' && item.dispenseMode !== 'loose') ||
        !Number.isInteger(item.quantity) ||
        item.quantity < 1 ||
        !Number.isFinite(item.mrp) ||
        item.mrp < 0
      ) {
        throw new Error('A bill item has invalid quantity, batch, or price details.');
      }

      const medicine = medicines.find(entry => entry.id === item.medicineId);
      const batch = medicine?.batches.find(entry => entry.batchNumber === item.batchNumber);
      if (!medicine || !batch) {
        throw new Error(`The selected batch ${item.batchNumber} is no longer available. Refresh inventory and review the bill.`);
      }

      let quantityInPacks = item.quantity;
      if (item.dispenseMode === 'loose') {
        const packSize = batch.packSize || medicine.packSize;
        if (
          medicine.allowLooseDispensing !== true ||
          batch.allowLooseDispensing === false ||
          !Number.isInteger(packSize) ||
          !packSize ||
          packSize <= 1 ||
          (item.packSize !== undefined && item.packSize !== packSize)
        ) {
          throw new Error(`Loose dispensing is no longer enabled for ${medicine.brandName}, batch ${item.batchNumber}. Review the bill.`);
        }
        quantityInPacks = item.quantity / packSize;
      }

      const key = JSON.stringify([item.medicineId, item.batchNumber]);
      const existing = stockToDeduct.get(key);
      stockToDeduct.set(key, {
        medicineId: item.medicineId,
        batchNumber: item.batchNumber,
        quantityInPacks: (existing?.quantityInPacks || 0) + quantityInPacks,
      });
    }

    const updatedMedicineIds = new Set(
      Array.from(stockToDeduct.values(), item => item.medicineId)
    );
    for (const { medicineId, batchNumber, quantityInPacks } of stockToDeduct.values()) {
      const medicine = medicines.find(item => item.id === medicineId);
      const batch = medicine?.batches.find(item => item.batchNumber === batchNumber);
      if (!medicine || !batch) {
        throw new Error(`The selected batch ${batchNumber} is no longer available. Refresh inventory and review the bill.`);
      }
      if (!batch.expiryDate || batch.expiryDate < currentMonth) {
        throw new Error(`Expired batch ${batchNumber} cannot be sold.`);
      }
      if (!Number.isFinite(batch.stock) || batch.stock + 1e-9 < quantityInPacks) {
        throw new Error(`Insufficient stock for ${medicine.brandName}, batch ${batchNumber}. Refresh inventory and review the bill.`);
      }
      batch.stock = Math.max(0, Math.round((batch.stock - quantityInPacks) * 1_000_000_000_000) / 1_000_000_000_000);
    }

    bills.unshift(bill);
    this.saveBills(bills);

    // Sync bill immediately to Firestore Cloud so all active counter terminals receive it
    FirestoreSyncService.saveBill(bill).catch(console.error);

    // Deduct stock from medicines batches
    this.saveMedicines(medicines);
    // Push real-time deducted stock to Firestore cloud
    medicines.filter(m => updatedMedicineIds.has(m.id)).forEach(m => {
      FirestoreSyncService.saveMedicine(m).catch(console.error);
    });

    // Update or create customer spend
    const cleanBillPhone = bill.customerPhone ? bill.customerPhone.replace(/\D/g, '') : '';
    if (cleanBillPhone.length >= 10) {
      const customers = [...this.getCustomers()];
      const existing = customers.find(c => c.phone.replace(/\D/g, '').slice(-10) === cleanBillPhone.slice(-10));
      if (existing) {
        existing.totalVisits += 1;
        existing.totalSpend += bill.netPayable;
        existing.lastVisit = new Date().toISOString().split('T')[0];
        if (bill.doctorName && !existing.doctorPreferred) {
          existing.doctorPreferred = bill.doctorName;
        }
        this.saveCustomers(customers);
        FirestoreSyncService.saveCustomer(existing).catch(console.error);
      } else if (bill.customerName && bill.customerName.trim() && bill.customerName !== 'Walk-in Customer') {
        const newCust: Customer = {
          id: `cust-${Date.now()}`,
          name: bill.customerName.trim(),
          phone: bill.customerPhone.trim(),
          address: 'Walk-in Retail Counter',
          totalVisits: 1,
          totalSpend: bill.netPayable,
          creditBalance: 0,
          doctorPreferred: bill.doctorName,
          lastVisit: new Date().toISOString().split('T')[0],
        };
        this.addCustomer(newCust);
      }
    }

    this.addAuditLog(
      'BILL_CREATED',
      `Invoice ${bill.billNumber} created: ₹${bill.netPayable.toFixed(2)} (${bill.paymentMethod}) for ${bill.customerName || 'Walk-in'}`
    );
  }

  // --- Expenses ---
  static getExpenses(): StoreExpense[] {
    if (memoryCache.expenses !== undefined) return memoryCache.expenses;
    memoryCache.expenses = readLocalSync(STORAGE_KEYS.EXPENSES, []);
    return memoryCache.expenses;
  }

  static saveExpenses(expenses: StoreExpense[]): void {
    memoryCache.expenses = expenses;
    IDBStorage.setItem(STORAGE_KEYS.EXPENSES, expenses).catch(console.error);
    safeLocalStorageSet(STORAGE_KEYS.EXPENSES, expenses);
    this.notifySubscribers();
  }

  static addExpense(expense: StoreExpense): void {
    const expenses = [...this.getExpenses()];
    expenses.unshift(expense);
    this.saveExpenses(expenses);
    // Real-time Cloud Firestore Sync
    FirestoreSyncService.saveExpense(expense).catch(console.error);
    this.addAuditLog('EXPENSE_RECORDED', `Operating expense logged: ${expense.category} - ₹${expense.amount.toFixed(2)} (${expense.paymentMode})`);
  }

  static deleteExpense(expenseId: string): void {
    let expenses = this.getExpenses();
    const target = expenses.find(e => e.id === expenseId);
    expenses = expenses.filter(e => e.id !== expenseId);
    this.saveExpenses(expenses);
    // Real-time Cloud Firestore Sync
    FirestoreSyncService.deleteExpense(expenseId).catch(console.error);
    if (target) {
      this.addAuditLog('EXPENSE_DELETED', `Deleted expense: ${target.category} - ₹${target.amount.toFixed(2)}`);
    }
  }

  // --- Audit Logs ---
  static getAuditLogs(): AuditLogEntry[] {
    if (memoryCache.auditLogs !== undefined) return memoryCache.auditLogs;
    memoryCache.auditLogs = readLocalSync(STORAGE_KEYS.AUDIT_LOGS, []);
    return memoryCache.auditLogs;
  }

  static saveAuditLogs(logs: AuditLogEntry[]): void {
    memoryCache.auditLogs = logs;
    IDBStorage.setItem(STORAGE_KEYS.AUDIT_LOGS, logs).catch(console.error);
    safeLocalStorageSet(STORAGE_KEYS.AUDIT_LOGS, logs);
    this.notifySubscribers();
  }

  static addAuditLog(action: string, details: string): void {
    const logs = [...this.getAuditLogs()];
    const activeUser = this.getActiveStaff();
    const newEntry: AuditLogEntry = {
      id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      timestamp: new Date().toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      }),
      userId: activeUser.id,
      userName: activeUser.name,
      action,
      details,
      ipAddress: 'Not available (client-side)',
    };
    logs.unshift(newEntry);
    if (logs.length > 300) logs.pop(); // keep latest 300
    this.saveAuditLogs(logs);
    // Real-time Cloud Firestore Sync
    FirestoreSyncService.saveAuditLog(newEntry).catch(console.error);
  }

  // --- Backup & Restore ---
  static exportMasterJSON(): string {
    const payload = {
      version: '2.5.0',
      exportedAt: new Date().toISOString(),
      store: this.getSettings().storeName,
      settings: this.getSettings(),
      staff: this.getStaff(),
      medicines: this.getMedicines(),
      suppliers: this.getSuppliers(),
      customers: this.getCustomers(),
      bills: this.getBills(),
      purchases: this.getPurchases(),
      expenses: this.getExpenses(),
      auditLogs: this.getAuditLogs(),
    };
    return JSON.stringify(payload, null, 2);
  }

  static async restoreFromJSON(contentString: string): Promise<{
    success: boolean;
    medicineCount: number;
    billCount: number;
    message: string;
  }> {
    try {
      const trimmed = (contentString || '').trim();
      if (!trimmed) {
        return { success: false, medicineCount: 0, billCount: 0, message: 'File is empty' };
      }

      let data: any = null;
      let medicinesToRestore: Medicine[] = [];

      // Detect JSON vs CSV
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        data = JSON.parse(trimmed);
        if (Array.isArray(data)) {
          // Direct JSON array of medicines
          medicinesToRestore = data;
        } else if (data && typeof data === 'object') {
          if (Array.isArray(data.medicines)) {
            medicinesToRestore = data.medicines;
          } else if (Array.isArray(data.items)) {
            medicinesToRestore = data.items;
          }
        }
      } else {
        // Likely CSV format
        const lines = trimmed.split(/\r?\n/).filter(l => l.trim().length > 0);
        if (lines.length >= 2) {
          const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/['"]/g, ''));
          for (let i = 1; i < lines.length; i++) {
            const row = lines[i].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(v => v.trim().replace(/^["']|["']$/g, ''));
            if (row.length < 2) continue;

            const getCol = (names: string[]): string => {
              for (const n of names) {
                const idx = headers.findIndex(h => h.includes(n));
                if (idx !== -1 && row[idx]) return row[idx];
              }
              return '';
            };

            const brandName = getCol(['brand', 'medicine', 'name', 'item', 'product']) || row[0];
            if (!brandName) continue;
            const genericName = getCol(['generic', 'salt', 'composition']);
            const category = (getCol(['category', 'group']) as any) || 'Analgesics & Antipyretics';
            const dosageForm = (getCol(['dosage', 'form', 'type']) as any) || 'Tablet';
            const strength = getCol(['strength', 'power', 'mg']);
            const packSize = Number.parseInt(getCol(['pack', 'size', 'strip']), 10);
            const mrp = Number.parseFloat(getCol(['mrp', 'price', 'sell']));
            const purchasePrice = Number.parseFloat(getCol(['purchase', 'cost', 'ptr']));
            const batchNumber = getCol(['batch', 'lot', 'bno']);
            const expiryDate = getCol(['exp', 'expiry']);
            const stock = Number.parseFloat(getCol(['stock', 'qty', 'quantity', 'units']));
            const gstRate = Number.parseInt(getCol(['gst', 'tax']), 10);
            const missingFields = [
              !batchNumber && 'batch number',
              !/^\d{4}-(0[1-9]|1[0-2])$/.test(expiryDate) && 'expiry month (YYYY-MM)',
              !Number.isInteger(packSize) || packSize < 1 ? 'pack size' : '',
              !Number.isFinite(mrp) || mrp <= 0 ? 'MRP' : '',
              !Number.isFinite(purchasePrice) || purchasePrice < 0 ? 'purchase price' : '',
              !Number.isFinite(stock) || stock < 0 ? 'stock quantity' : '',
              ![0, 5, 12, 18, 28].includes(gstRate) ? 'GST rate' : '',
            ].filter(Boolean);
            if (missingFields.length > 0) {
              throw new Error(`CSV row ${i + 1} is missing valid ${missingFields.join(', ')}.`);
            }
            const scheduleValue = getCol(['schedule class', 'schedule']).toLowerCase();
            const scheduleClasses: Record<string, Medicine['scheduleClass']> = {
              otc: 'OTC',
              'schedule h': 'Schedule H',
              'schedule h1': 'Schedule H1',
              'schedule x': 'Schedule X',
            };
            const scheduleClass = scheduleClasses[scheduleValue] || 'OTC';
            const isScheduleDrug = scheduleClass !== 'OTC';

            medicinesToRestore.push({
              id: `med-${Date.now()}-${i}-${Math.random().toString(36).substr(2, 4)}`,
              brandName,
              genericName,
              category,
              dosageForm,
              strength,
              manufacturer: getCol(['manufacturer', 'company']),
              gstRate,
              hsnCode: getCol(['hsn']),
              isScheduleDrug,
              scheduleClass,
              packSize,
              packUnit: `Strip of ${packSize}`,
              batches: [
                {
                  batchNumber,
                  mfgDate: getCol(['mfg date', 'manufacturing date']),
                  expiryDate,
                  purchasePrice,
                  mrp,
                  stock,
                  rackLocation: getCol(['rack', 'shelf', 'location']),
                  barcode: getCol(['barcode', 'ean', 'upc']),
                  packSize,
                  packUnit: `Strip of ${packSize}`,
                  unitMrp: Math.round((mrp / packSize) * 100) / 100,
                  unitPurchasePrice: Math.round((purchasePrice / packSize) * 100) / 100,
                }
              ]
            });
          }
        }
      }

      // Restore ancillary store entities if full master archive
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        if (data.settings) {
          memoryCache.settings = data.settings;
          await FirestoreSyncService.saveSettings(data.settings);
        }
        if (data.staff && Array.isArray(data.staff)) {
          memoryCache.staff = sanitizeStaffList(data.staff);
          await Promise.all(memoryCache.staff.map(staff => FirestoreSyncService.saveStaff(staff)));
        }
        if (data.suppliers && Array.isArray(data.suppliers)) {
          this.saveSuppliers(data.suppliers);
          await FirestoreSyncService.saveSuppliersBulk(data.suppliers);
        }
        if (data.customers && Array.isArray(data.customers)) {
          this.saveCustomers(data.customers);
          await FirestoreSyncService.saveCustomersBulk(data.customers);
        }
        if (data.bills && Array.isArray(data.bills)) {
          this.saveBills(data.bills);
          await FirestoreSyncService.saveBillsBulk(data.bills);
        }
        if (data.purchases && Array.isArray(data.purchases)) {
          this.savePurchases(data.purchases);
          await FirestoreSyncService.savePurchasesBulk(data.purchases);
        }
        if (data.expenses && Array.isArray(data.expenses)) {
          this.saveExpenses(data.expenses);
          await Promise.all(data.expenses.map((expense: StoreExpense) => FirestoreSyncService.saveExpense(expense)));
        }
        if (data.auditLogs && Array.isArray(data.auditLogs)) {
          this.saveAuditLogs(data.auditLogs);
          await Promise.all(data.auditLogs.map((log: AuditLogEntry) => FirestoreSyncService.saveAuditLog(log)));
        }
      }

      // Restore and bulk-upload medicines to Cloud Firestore
      if (medicinesToRestore.length > 0) {
        const sanitizedMeds: Medicine[] = medicinesToRestore.map((m: any, idx: number) => ({
          ...m,
          id: m.id || `med-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 4)}`,
          batches: Array.isArray(m.batches) ? m.batches : [],
        }));

        // Write directly to local memory & IndexedDB
        this.saveMedicines(sanitizedMeds);

        // Upload all restored medicines to Cloud Firestore immediately
        console.log(`[StorageService] Uploading ${sanitizedMeds.length} restored medicines to Cloud Firestore...`);
        await FirestoreSyncService.saveMedicinesBulk(sanitizedMeds);
        console.log(`[StorageService] Cloud Firestore successfully synchronized with ${sanitizedMeds.length} medicines.`);
      }

      this.addAuditLog('DATABASE_RESTORE', `Restored ${medicinesToRestore.length} medicines & synchronized to Cloud Firestore`);
      this.notifySubscribers();

      return {
        success: true,
        medicineCount: medicinesToRestore.length,
        billCount: data?.bills?.length || 0,
        message: `Successfully restored and synchronized ${medicinesToRestore.length} medicines to Cloud Firestore.`,
      };
    } catch (e: any) {
      console.error('Failed to parse backup archive:', e);
      return {
        success: false,
        medicineCount: 0,
        billCount: 0,
        message: e?.message || 'Failed to parse archive file',
      };
    }
  }

  static clearInventoryOnly(): void {
    this.saveMedicines([]);
    this.saveBills([]);
    this.savePurchases([]);
    this.addAuditLog('INVENTORY_PURGED', 'All inventory medicines, batches, bills and inward purchases cleared to fresh 0 state');
    this.notifySubscribers();
  }

  static getRememberedAuth(): boolean {
    return typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEYS.AUTH_REMEMBER) === 'true';
  }

  static setRememberedAuth(remember: boolean): void {
    safeLocalStorageSet(STORAGE_KEYS.AUTH_REMEMBER, remember ? 'true' : 'false');
  }

  static resetToDefault(): void {
    IDBStorage.clear().catch(console.error);
    if (!cloudOnlyPersistence && typeof localStorage !== 'undefined') {
      localStorage.clear();
    }

    memoryCache.settings = INITIAL_SETTINGS;
    memoryCache.staff = sanitizeStaffList(INITIAL_STAFF);
    memoryCache.suppliers = INITIAL_SUPPLIERS;
    memoryCache.medicines = INITIAL_MEDICINES;
    memoryCache.customers = INITIAL_CUSTOMERS;
    memoryCache.bills = INITIAL_BILLS;
    memoryCache.purchases = [];
    memoryCache.expenses = INITIAL_EXPENSES;
    memoryCache.auditLogs = INITIAL_AUDIT_LOGS;

    safeLocalStorageSet(STORAGE_KEYS.SETTINGS, INITIAL_SETTINGS);
    safeLocalStorageSet(STORAGE_KEYS.STAFF, memoryCache.staff);
    safeLocalStorageSet(STORAGE_KEYS.SUPPLIERS, INITIAL_SUPPLIERS);
    safeLocalStorageSet(STORAGE_KEYS.MEDICINES, INITIAL_MEDICINES);
    safeLocalStorageSet(STORAGE_KEYS.CUSTOMERS, INITIAL_CUSTOMERS);
    safeLocalStorageSet(STORAGE_KEYS.BILLS, INITIAL_BILLS);
    safeLocalStorageSet(STORAGE_KEYS.EXPENSES, INITIAL_EXPENSES);
    safeLocalStorageSet(STORAGE_KEYS.AUDIT_LOGS, INITIAL_AUDIT_LOGS);

    this.notifySubscribers();
  }
}
