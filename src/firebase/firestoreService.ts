import { 
  collection, 
  doc, 
  setDoc, 
  deleteDoc, 
  onSnapshot, 
  getDocsFromServer,
  getDocFromServer,
  getDoc,
  deleteField,
  writeBatch,
  query,
  where,
  Unsubscribe 
} from 'firebase/firestore';
import { db, auth } from './config';
import { 
  Medicine, 
  SaleBill, 
  Supplier, 
  PurchaseInward, 
  Customer, 
  StoreExpense, 
  StaffMember, 
  StaffAccountRequest,
  StaffRole,
  StoreSettings, 
  AuditLogEntry 
} from '../types/pharmacy';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

function isStaffRole(role: unknown): role is StaffRole {
  return role === 'Admin' || role === 'Pharmacist' || role === 'Cashier' || role === 'Inventory Manager';
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('[Firestore Error]:', JSON.stringify(errInfo));
  FirestoreSyncService.reportConnectionError(
    `${operationType} failed for ${path || 'Firestore'}. Check the network and active staff permissions.`
  );
  throw new Error(JSON.stringify(errInfo));
}

function omitUndefinedFirestoreFields<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(item => item === undefined ? null : omitUndefinedFirestoreFields(item)) as T;
  }

  if (value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, fieldValue]) => fieldValue !== undefined)
        .map(([key, fieldValue]) => [key, omitUndefinedFirestoreFields(fieldValue)])
    ) as T;
  }

  return value;
}

// Collection names
export const FIRESTORE_COLLECTIONS = {
  MEDICINES: 'medicines',
  BILLS: 'bills',
  CUSTOMERS: 'customers',
  SUPPLIERS: 'suppliers',
  PURCHASES: 'purchases',
  EXPENSES: 'expenses',
  STAFF: 'staff',
  SETTINGS: 'settings',
  AUDIT_LOGS: 'audit_logs',
} as const;

export interface CloudDataSnapshot {
  medicines: Medicine[];
  bills: SaleBill[];
  customers: Customer[];
  suppliers: Supplier[];
  purchases: PurchaseInward[];
  expenses: StoreExpense[];
  staff: StaffMember[];
  settings?: StoreSettings;
  auditLogs: AuditLogEntry[];
  totalRecords: number;
}

export interface CloudSyncCallbacks {
  onMedicinesSync?: (medicines: Medicine[]) => void;
  onBillsSync?: (bills: SaleBill[]) => void;
  onCustomersSync?: (customers: Customer[]) => void;
  onSuppliersSync?: (suppliers: Supplier[]) => void;
  onPurchasesSync?: (purchases: PurchaseInward[]) => void;
  onExpensesSync?: (expenses: StoreExpense[]) => void;
  onStaffSync?: (staff: StaffMember[]) => void;
  onSettingsSync?: (settings: StoreSettings) => void;
  onAuditLogsSync?: (logs: AuditLogEntry[]) => void;
  onConnectionChange?: (status: { isConnected: boolean; isSyncing: boolean; lastSyncTime: Date | null; error?: string }) => void;
}

export class FirestoreSyncService {
  private static unsubscribers: Unsubscribe[] = [];
  private static isSubscribed = false;
  private static lastSync: Date | null = null;
  private static connectionCallback: CloudSyncCallbacks['onConnectionChange'];
  private static syncGeneration = 0;

  static reportConnectionError(message: string): void {
    this.connectionCallback?.({
      isConnected: false,
      isSyncing: false,
      lastSyncTime: this.lastSync,
      error: message,
    });
  }

  private static reportSnapshotStatus(
    snapshot: { metadata: { fromCache: boolean } },
    callbacks: CloudSyncCallbacks
  ): void {
    const isConnected = !snapshot.metadata.fromCache;
    if (isConnected) this.lastSync = new Date();
    callbacks.onConnectionChange?.({
      isConnected,
      isSyncing: false,
      lastSyncTime: this.lastSync,
      error: isConnected ? undefined : 'Using cached data. Cloud changes are not currently confirmed.',
    });
  }

  private static reportListenerError(error: unknown, operationType: OperationType, path: string): void {
    const errInfo: FirestoreErrorInfo = {
      error: error instanceof Error ? error.message : String(error),
      authInfo: {
        userId: auth.currentUser?.uid,
        email: auth.currentUser?.email,
        emailVerified: auth.currentUser?.emailVerified,
        isAnonymous: auth.currentUser?.isAnonymous,
        tenantId: auth.currentUser?.tenantId,
        providerInfo: auth.currentUser?.providerData?.map(provider => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
      },
      operationType,
      path,
    };
    console.error('[Firestore Listener Error]:', JSON.stringify(errInfo));
    this.reportConnectionError(`Firestore ${operationType} failed for ${path}. Check the network and staff permissions.`);
  }

  private static sanitizeStaffRecord(data: Record<string, unknown>): StaffMember {
    const { password: _password, ...profile } = data;
    if (
      typeof profile.id !== 'string' ||
      typeof profile.name !== 'string' ||
      typeof profile.username !== 'string' ||
      typeof profile.phone !== 'string' ||
      typeof profile.email !== 'string' ||
      !isStaffRole(profile.role) ||
      (profile.status !== 'Active' && profile.status !== 'Deactivated') ||
      typeof profile.createdDate !== 'string'
    ) {
      throw new Error('A Firestore staff profile is missing required fields or has an invalid role.');
    }

    return {
      id: profile.id,
      name: profile.name,
      username: profile.username,
      phone: profile.phone,
      email: profile.email,
      role: profile.role,
      status: profile.status,
      createdDate: profile.createdDate,
      ...(typeof profile.pharmacistRegNo === 'string' ? { pharmacistRegNo: profile.pharmacistRegNo } : {}),
    };
  }

  private static async subscribeStaff(callbacks: CloudSyncCallbacks, generation: number): Promise<void> {
    const user = auth.currentUser;
    if (!user) return;
    const accountSnapshot = await getDoc(doc(db, 'staff_accounts', user.uid));
    if (!accountSnapshot.exists()) {
      throw new Error('The signed-in Firebase account has no staff-account record.');
    }

    const account = accountSnapshot.data();
    const onError = (error: Error) => this.reportListenerError(error, OperationType.LIST, FIRESTORE_COLLECTIONS.STAFF);
    const unsubscribe = account.role === 'Admin'
      ? onSnapshot(
          collection(db, FIRESTORE_COLLECTIONS.STAFF),
          snapshot => {
            const list: StaffMember[] = [];
            snapshot.forEach(item => list.push(this.sanitizeStaffRecord(item.data())));
            if (callbacks.onStaffSync && list.length > 0) callbacks.onStaffSync(list);
          },
          onError
        )
      : onSnapshot(
          doc(db, FIRESTORE_COLLECTIONS.STAFF, account.staffId),
          snapshot => {
            if (snapshot.exists() && callbacks.onStaffSync) {
              callbacks.onStaffSync([this.sanitizeStaffRecord(snapshot.data())]);
            }
          },
          onError
        );

    if (this.isSubscribed && generation === this.syncGeneration) {
      this.unsubscribers.push(unsubscribe);
    } else {
      unsubscribe();
    }
  }

  private static async fetchStaffForCurrentUser(fetchCollection: (name: string) => Promise<unknown[]>): Promise<unknown[]> {
    const user = auth.currentUser;
    if (!user) return [];
    const accountSnapshot = await getDoc(doc(db, 'staff_accounts', user.uid));
    if (!accountSnapshot.exists()) return [];
    const account = accountSnapshot.data();
    if (account.role === 'Admin') return fetchCollection(FIRESTORE_COLLECTIONS.STAFF);
    const staffSnapshot = await getDoc(doc(db, FIRESTORE_COLLECTIONS.STAFF, account.staffId));
    return staffSnapshot.exists() ? [this.sanitizeStaffRecord(staffSnapshot.data())] : [];
  }

  private static async fetchAuditLogsForCurrentUser(
    fetchCollection: (name: string) => Promise<unknown[]>
  ): Promise<unknown[]> {
    const user = auth.currentUser;
    if (!user) return [];
    const accountSnapshot = await getDoc(doc(db, 'staff_accounts', user.uid));
    return accountSnapshot.data()?.role === 'Admin'
      ? fetchCollection(FIRESTORE_COLLECTIONS.AUDIT_LOGS)
      : [];
  }

  private static async subscribeAuditLogs(callbacks: CloudSyncCallbacks, generation: number): Promise<void> {
    const user = auth.currentUser;
    if (!user) return;
    const accountSnapshot = await getDoc(doc(db, 'staff_accounts', user.uid));
    if (!accountSnapshot.exists() || accountSnapshot.data().role !== 'Admin') return;

    const unsubscribe = onSnapshot(
      collection(db, FIRESTORE_COLLECTIONS.AUDIT_LOGS),
      snapshot => {
        const logs: AuditLogEntry[] = [];
        snapshot.forEach(item => logs.push(item.data() as AuditLogEntry));
        logs.sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime());
        callbacks.onAuditLogsSync?.(logs.slice(0, 200));
      },
      error => this.reportListenerError(error, OperationType.LIST, FIRESTORE_COLLECTIONS.AUDIT_LOGS)
    );

    if (this.isSubscribed && generation === this.syncGeneration) {
      this.unsubscribers.push(unsubscribe);
    } else {
      unsubscribe();
    }
  }

  static async getAuthenticatedStaff(): Promise<StaffMember> {
    const user = auth.currentUser;
    if (!user) {
      throw new Error('Sign in before loading a staff profile.');
    }

    const accountSnapshot = await getDoc(doc(db, 'staff_accounts', user.uid));
    if (!accountSnapshot.exists()) {
      throw new Error('This Firebase account is not linked to an authorized pharmacy staff profile.');
    }

    const account = accountSnapshot.data();
    if (account.enabled !== true || typeof account.staffId !== 'string' || typeof account.role !== 'string') {
      throw new Error('This pharmacy staff account is inactive or is missing its role configuration.');
    }

    const staffSnapshot = await getDoc(doc(db, FIRESTORE_COLLECTIONS.STAFF, account.staffId));
    if (!staffSnapshot.exists()) {
      throw new Error('The staff profile linked to this Firebase account could not be found.');
    }

    const rawStaff = staffSnapshot.data();
    const staff = this.sanitizeStaffRecord(rawStaff);
    if (
      staff.id !== account.staffId ||
      staff.status !== 'Active' ||
      staff.role !== account.role ||
      (user.email && staff.email.toLowerCase() !== user.email.toLowerCase())
    ) {
      throw new Error('The Firebase account and active pharmacy staff profile do not match.');
    }

    if (account.role === 'Admin' && 'password' in rawStaff) {
      await this.saveStaff(staff);
    }

    return staff;
  }

  static async submitAccountRequest(name: string, phone: string): Promise<void> {
    const user = auth.currentUser;
    if (!user?.email) {
      throw new Error('Sign in with an email account before requesting pharmacy access.');
    }

    const requestRef = doc(db, 'account_requests', user.uid);
    const existing = await getDoc(requestRef);
    if (existing.exists() && existing.data().status === 'pending') return;

    await setDoc(requestRef, {
      uid: user.uid,
      name: name.trim() || user.displayName || user.email.split('@')[0],
      email: user.email,
      phone: phone.trim(),
      status: 'pending',
      requestedAt: new Date().toISOString(),
    });
  }

  static async getPendingAccountRequests(): Promise<StaffAccountRequest[]> {
    const requests = await getDocsFromServer(query(
      collection(db, 'account_requests'),
      where('status', '==', 'pending')
    ));

    return requests.docs.map(request => request.data() as StaffAccountRequest);
  }

  static async approveAccountRequest(request: StaffAccountRequest, role: StaffRole): Promise<void> {
    if (!isStaffRole(role)) throw new Error('Select a valid staff role before approving this request.');

    const staffId = `staff-${request.uid}`;
    const staff: StaffMember = {
      id: staffId,
      name: request.name,
      username: request.email,
      phone: request.phone,
      email: request.email,
      role,
      status: 'Active',
      createdDate: new Date().toISOString().slice(0, 10),
    };

    const batch = writeBatch(db);
    batch.set(doc(db, FIRESTORE_COLLECTIONS.STAFF, staffId), staff);
    batch.set(doc(db, 'staff_accounts', request.uid), {
      enabled: true,
      staffId,
      role,
    });
    batch.update(doc(db, 'account_requests', request.uid), {
      status: 'approved',
      staffId,
      role,
      reviewedAt: new Date().toISOString(),
    });
    await batch.commit();
  }

  static async rejectAccountRequest(request: StaffAccountRequest): Promise<void> {
    const batch = writeBatch(db);
    batch.update(doc(db, 'account_requests', request.uid), {
      status: 'rejected',
      reviewedAt: new Date().toISOString(),
    });
    await batch.commit();
  }

  /**
   * Start real-time multi-device listeners on all pharmacy collections
   */
  static startRealtimeSync(callbacks: CloudSyncCallbacks): () => void {
    if (this.isSubscribed) {
      this.stopRealtimeSync();
    }

    this.isSubscribed = true;
    const generation = ++this.syncGeneration;
    this.connectionCallback = callbacks.onConnectionChange;
    callbacks.onConnectionChange?.({ isConnected: false, isSyncing: true, lastSyncTime: this.lastSync });

    try {
      // 1. Medicines
      const medUnsub = onSnapshot(
        collection(db, FIRESTORE_COLLECTIONS.MEDICINES),
        { includeMetadataChanges: true },
        (snapshot) => {
          const list: Medicine[] = [];
          snapshot.forEach((d) => {
            list.push(d.data() as Medicine);
          });
          if (callbacks.onMedicinesSync) {
            callbacks.onMedicinesSync(list);
          }
          this.reportSnapshotStatus(snapshot, callbacks);
        },
        (error) => {
          this.reportListenerError(error, OperationType.LIST, FIRESTORE_COLLECTIONS.MEDICINES);
        }
      );
      this.unsubscribers.push(medUnsub);

      // 2. Bills
      const billsUnsub = onSnapshot(
        collection(db, FIRESTORE_COLLECTIONS.BILLS),
        (snapshot) => {
          const list: SaleBill[] = [];
          snapshot.forEach((d) => {
            list.push(d.data() as SaleBill);
          });
          // Sort bills by timestamp descending
          list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
          if (callbacks.onBillsSync) {
            callbacks.onBillsSync(list);
          }
          this.reportSnapshotStatus(snapshot, callbacks);
        },
        (error) => {
          this.reportListenerError(error, OperationType.LIST, FIRESTORE_COLLECTIONS.BILLS);
        }
      );
      this.unsubscribers.push(billsUnsub);

      // 3. Customers
      const custUnsub = onSnapshot(
        collection(db, FIRESTORE_COLLECTIONS.CUSTOMERS),
        (snapshot) => {
          const list: Customer[] = [];
          snapshot.forEach((d) => {
            list.push(d.data() as Customer);
          });
          if (callbacks.onCustomersSync) {
            callbacks.onCustomersSync(list);
          }
          this.reportSnapshotStatus(snapshot, callbacks);
        },
        (error) => {
          this.reportListenerError(error, OperationType.LIST, FIRESTORE_COLLECTIONS.CUSTOMERS);
        }
      );
      this.unsubscribers.push(custUnsub);

      // 4. Suppliers
      const supUnsub = onSnapshot(
        collection(db, FIRESTORE_COLLECTIONS.SUPPLIERS),
        (snapshot) => {
          const list: Supplier[] = [];
          snapshot.forEach((d) => {
            list.push(d.data() as Supplier);
          });
          if (callbacks.onSuppliersSync) {
            callbacks.onSuppliersSync(list);
          }
          this.lastSync = new Date();
        },
        (error) => {
          this.reportListenerError(error, OperationType.LIST, FIRESTORE_COLLECTIONS.SUPPLIERS);
        }
      );
      this.unsubscribers.push(supUnsub);

      // 5. Purchases
      const purUnsub = onSnapshot(
        collection(db, FIRESTORE_COLLECTIONS.PURCHASES),
        (snapshot) => {
          const list: PurchaseInward[] = [];
          snapshot.forEach((d) => {
            list.push(d.data() as PurchaseInward);
          });
          if (callbacks.onPurchasesSync) {
            callbacks.onPurchasesSync(list);
          }
          this.lastSync = new Date();
        },
        (error) => {
          this.reportListenerError(error, OperationType.LIST, FIRESTORE_COLLECTIONS.PURCHASES);
        }
      );
      this.unsubscribers.push(purUnsub);

      // 6. Expenses
      const expUnsub = onSnapshot(
        collection(db, FIRESTORE_COLLECTIONS.EXPENSES),
        (snapshot) => {
          const list: StoreExpense[] = [];
          snapshot.forEach((d) => {
            list.push(d.data() as StoreExpense);
          });
          if (callbacks.onExpensesSync) {
            callbacks.onExpensesSync(list);
          }
          this.lastSync = new Date();
        },
        (error) => {
          this.reportListenerError(error, OperationType.LIST, FIRESTORE_COLLECTIONS.EXPENSES);
        }
      );
      this.unsubscribers.push(expUnsub);

      void this.subscribeStaff(callbacks, generation).catch(error => {
        this.reportListenerError(error, OperationType.LIST, FIRESTORE_COLLECTIONS.STAFF);
      });

      // 8. Settings
      const settingsUnsub = onSnapshot(
        doc(db, FIRESTORE_COLLECTIONS.SETTINGS, 'store_profile'),
        (snapshot) => {
          if (snapshot.exists() && callbacks.onSettingsSync) {
            callbacks.onSettingsSync(snapshot.data() as StoreSettings);
          }
          this.lastSync = new Date();
        },
        (error) => {
          this.reportListenerError(error, OperationType.GET, `${FIRESTORE_COLLECTIONS.SETTINGS}/store_profile`);
        }
      );
      this.unsubscribers.push(settingsUnsub);

      void this.subscribeAuditLogs(callbacks, generation).catch(error => {
        this.reportListenerError(error, OperationType.LIST, FIRESTORE_COLLECTIONS.AUDIT_LOGS);
      });

    } catch (err: any) {
      console.error('[FirestoreSyncService] Realtime sync error:', err);
      callbacks.onConnectionChange?.({ isConnected: false, isSyncing: false, lastSyncTime: this.lastSync, error: err?.message });
    }

    return () => this.stopRealtimeSync();
  }

  static stopRealtimeSync(): void {
    this.syncGeneration++;
    this.unsubscribers.forEach((unsub) => {
      try {
        unsub();
      } catch (e) {
        console.warn('Error unsubscribing:', e);
      }
    });
    this.unsubscribers = [];
    this.isSubscribed = false;
    this.connectionCallback = undefined;
  }

  // --- Cloud Mutation Operations ---

  static async saveMedicine(medicine: Medicine): Promise<void> {
    const docPath = `${FIRESTORE_COLLECTIONS.MEDICINES}/${medicine.id}`;
    try {
      await setDoc(doc(db, FIRESTORE_COLLECTIONS.MEDICINES, medicine.id), medicine, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, docPath);
    }
  }

  /**
   * High-throughput batched upload for medicines (up to 400 documents per batch)
   * Ensures bulk imports and master JSON restores sync to Cloud Firestore in seconds.
   */
  static async saveMedicinesBulk(medicines: Medicine[]): Promise<void> {
    if (!medicines || medicines.length === 0) return;
    const chunkSize = 400;
    for (let i = 0; i < medicines.length; i += chunkSize) {
      const chunk = medicines.slice(i, i + chunkSize);
      const batch = writeBatch(db);
      chunk.forEach((med) => {
        if (!med.id) {
          med.id = `med-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
        }
        const ref = doc(db, FIRESTORE_COLLECTIONS.MEDICINES, med.id);
        batch.set(ref, med, { merge: true });
      });
      try {
        await batch.commit();
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, FIRESTORE_COLLECTIONS.MEDICINES);
      }
    }
  }

  static async saveBillsBulk(bills: SaleBill[]): Promise<void> {
    if (!bills || bills.length === 0) return;
    const chunkSize = 400;
    for (let i = 0; i < bills.length; i += chunkSize) {
      const chunk = bills.slice(i, i + chunkSize);
      const batch = writeBatch(db);
      chunk.forEach((bill) => {
        if (bill && bill.id) {
          const ref = doc(db, FIRESTORE_COLLECTIONS.BILLS, bill.id);
          batch.set(ref, omitUndefinedFirestoreFields(bill), { merge: true });
        }
      });
      try {
        await batch.commit();
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, FIRESTORE_COLLECTIONS.BILLS);
      }
    }
  }

  static async savePurchasesBulk(purchases: PurchaseInward[]): Promise<void> {
    if (!purchases || purchases.length === 0) return;
    const chunkSize = 400;
    for (let i = 0; i < purchases.length; i += chunkSize) {
      const chunk = purchases.slice(i, i + chunkSize);
      const batch = writeBatch(db);
      chunk.forEach((pur) => {
        if (pur && pur.id) {
          const ref = doc(db, FIRESTORE_COLLECTIONS.PURCHASES, pur.id);
          batch.set(ref, pur, { merge: true });
        }
      });
      try {
        await batch.commit();
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, FIRESTORE_COLLECTIONS.PURCHASES);
      }
    }
  }

  static async saveCustomersBulk(customers: Customer[]): Promise<void> {
    if (!customers || customers.length === 0) return;
    const chunkSize = 400;
    for (let i = 0; i < customers.length; i += chunkSize) {
      const chunk = customers.slice(i, i + chunkSize);
      const batch = writeBatch(db);
      chunk.forEach((cust) => {
        if (cust && cust.id) {
          const ref = doc(db, FIRESTORE_COLLECTIONS.CUSTOMERS, cust.id);
          batch.set(ref, cust, { merge: true });
        }
      });
      try {
        await batch.commit();
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, FIRESTORE_COLLECTIONS.CUSTOMERS);
      }
    }
  }

  static async saveSuppliersBulk(suppliers: Supplier[]): Promise<void> {
    if (!suppliers || suppliers.length === 0) return;
    const chunkSize = 400;
    for (let i = 0; i < suppliers.length; i += chunkSize) {
      const chunk = suppliers.slice(i, i + chunkSize);
      const batch = writeBatch(db);
      chunk.forEach((sup) => {
        if (sup && sup.id) {
          const ref = doc(db, FIRESTORE_COLLECTIONS.SUPPLIERS, sup.id);
          batch.set(ref, sup, { merge: true });
        }
      });
      try {
        await batch.commit();
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, FIRESTORE_COLLECTIONS.SUPPLIERS);
      }
    }
  }

  static async deleteMedicine(id: string): Promise<void> {
    const docPath = `${FIRESTORE_COLLECTIONS.MEDICINES}/${id}`;
    try {
      await deleteDoc(doc(db, FIRESTORE_COLLECTIONS.MEDICINES, id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, docPath);
    }
  }

  static async saveBill(bill: SaleBill): Promise<void> {
    const docPath = `${FIRESTORE_COLLECTIONS.BILLS}/${bill.id}`;
    try {
      await setDoc(doc(db, FIRESTORE_COLLECTIONS.BILLS, bill.id), omitUndefinedFirestoreFields(bill), { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, docPath);
    }
  }

  static async saveCustomer(customer: Customer): Promise<void> {
    const docPath = `${FIRESTORE_COLLECTIONS.CUSTOMERS}/${customer.id}`;
    try {
      await setDoc(doc(db, FIRESTORE_COLLECTIONS.CUSTOMERS, customer.id), customer, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, docPath);
    }
  }

  static async saveSupplier(supplier: Supplier): Promise<void> {
    const docPath = `${FIRESTORE_COLLECTIONS.SUPPLIERS}/${supplier.id}`;
    try {
      await setDoc(doc(db, FIRESTORE_COLLECTIONS.SUPPLIERS, supplier.id), supplier, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, docPath);
    }
  }

  static async savePurchase(purchase: PurchaseInward): Promise<void> {
    const docPath = `${FIRESTORE_COLLECTIONS.PURCHASES}/${purchase.id}`;
    try {
      await setDoc(doc(db, FIRESTORE_COLLECTIONS.PURCHASES, purchase.id), purchase, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, docPath);
    }
  }

  static async saveExpense(expense: StoreExpense): Promise<void> {
    const docPath = `${FIRESTORE_COLLECTIONS.EXPENSES}/${expense.id}`;
    try {
      await setDoc(doc(db, FIRESTORE_COLLECTIONS.EXPENSES, expense.id), expense, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, docPath);
    }
  }

  static async deleteExpense(id: string): Promise<void> {
    const docPath = `${FIRESTORE_COLLECTIONS.EXPENSES}/${id}`;
    try {
      await deleteDoc(doc(db, FIRESTORE_COLLECTIONS.EXPENSES, id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, docPath);
    }
  }

  static async saveStaff(staff: StaffMember): Promise<void> {
    const docPath = `${FIRESTORE_COLLECTIONS.STAFF}/${staff.id}`;
    try {
      await setDoc(
        doc(db, FIRESTORE_COLLECTIONS.STAFF, staff.id),
        { ...staff, password: deleteField() },
        { merge: true }
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, docPath);
    }
  }

  static async deleteStaff(id: string): Promise<void> {
    const docPath = `${FIRESTORE_COLLECTIONS.STAFF}/${id}`;
    try {
      await deleteDoc(doc(db, FIRESTORE_COLLECTIONS.STAFF, id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, docPath);
    }
  }

  static async saveSettings(settings: StoreSettings): Promise<void> {
    const docPath = `${FIRESTORE_COLLECTIONS.SETTINGS}/store_profile`;
    try {
      await setDoc(doc(db, FIRESTORE_COLLECTIONS.SETTINGS, 'store_profile'), settings, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, docPath);
    }
  }

  static async saveAuditLog(log: AuditLogEntry): Promise<void> {
    const docPath = `${FIRESTORE_COLLECTIONS.AUDIT_LOGS}/${log.id}`;
    try {
      await setDoc(doc(db, FIRESTORE_COLLECTIONS.AUDIT_LOGS, log.id), log);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, docPath);
    }
  }

  /**
   * Authoritative direct server fetch of all pharmacy collections from Firestore.
   * Uses getDocsFromServer to ensure brand new devices or fresh deployment URLs
   * immediately fetch live cloud inventory without relying on local cache or empty state.
   */
  static async fetchAllFromCloud(): Promise<CloudDataSnapshot> {
    const fetchColDocs = async (colName: string) => {
      try {
        const colRef = collection(db, colName);
        const snap = await getDocsFromServer(colRef);
        const items: any[] = [];
        snap.forEach((d) => items.push(d.data()));
        return items;
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, colName);
      }
    };

    const fetchSettingsDoc = async (): Promise<StoreSettings | undefined> => {
      const docRef = doc(db, FIRESTORE_COLLECTIONS.SETTINGS, 'store_profile');
      const snap = await getDocFromServer(docRef);
      return snap.exists() ? snap.data() as StoreSettings : undefined;
    };

    const [
      medsRaw,
      billsRaw,
      customersRaw,
      suppliersRaw,
      purchasesRaw,
      expensesRaw,
      staffRaw,
      settingsRaw,
      auditRaw,
    ] = await Promise.all([
      fetchColDocs(FIRESTORE_COLLECTIONS.MEDICINES),
      fetchColDocs(FIRESTORE_COLLECTIONS.BILLS),
      fetchColDocs(FIRESTORE_COLLECTIONS.CUSTOMERS),
      fetchColDocs(FIRESTORE_COLLECTIONS.SUPPLIERS),
      fetchColDocs(FIRESTORE_COLLECTIONS.PURCHASES),
      fetchColDocs(FIRESTORE_COLLECTIONS.EXPENSES),
      this.fetchStaffForCurrentUser(fetchColDocs),
      fetchSettingsDoc(),
      this.fetchAuditLogsForCurrentUser(fetchColDocs),
    ]);

    const medicines = medsRaw as Medicine[];
    const bills = (billsRaw as SaleBill[]).sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    const customers = customersRaw as Customer[];
    const suppliers = suppliersRaw as Supplier[];
    const purchases = purchasesRaw as PurchaseInward[];
    const expenses = expensesRaw as StoreExpense[];
    const staff = staffRaw as StaffMember[];
    const auditLogs = (auditRaw as AuditLogEntry[]).sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    this.lastSync = new Date();

    const totalRecords =
      medicines.length +
      bills.length +
      customers.length +
      suppliers.length +
      purchases.length +
      expenses.length +
      staff.length;

    console.log(`[Firestore] Authoritative cloud sync completed: ${medicines.length} medicines, ${bills.length} bills, ${purchases.length} purchases, ${customers.length} customers fetched.`);

    return {
      medicines,
      bills,
      customers,
      suppliers,
      purchases,
      expenses,
      staff,
      settings: settingsRaw,
      auditLogs,
      totalRecords,
    };
  }
}
