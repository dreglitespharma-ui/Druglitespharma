import { Medicine, Supplier, Customer, StoreExpense, StaffMember, StoreSettings, SaleBill, AuditLogEntry } from '../types/pharmacy';

export const INITIAL_SETTINGS: StoreSettings = {
  storeName: 'DRUGS LITES PHARMA',
  tagline: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  state: '',
  pincode: '',
  phone: '',
  email: '',
  dl20b: '',
  dl21b: '',
  gstin: '',
  pan: '',
  upiId: '',
  soundboxName: 'DRUGS LITES PHARMA',
  nearExpiryDaysThreshold: 90,
  lowStockThreshold: 15,
  googleDriveSyncEnabled: false,
  googleDriveAccount: '',
  googleDriveFolderId: '',
  googleDriveFolderName: '',
  googleDriveSyncFrequency: 'Manual',
  lastBackupTime: '',
};

export const INITIAL_STAFF: StaffMember[] = [];
export const INITIAL_SUPPLIERS: Supplier[] = [];

export const INITIAL_MEDICINES: Medicine[] = [];

// Patient and customer profiles with medication history and credit tracking
export const INITIAL_CUSTOMERS: Customer[] = [];

export const INITIAL_BILLS: SaleBill[] = [];

export const INITIAL_EXPENSES: StoreExpense[] = [];

export const INITIAL_AUDIT_LOGS: AuditLogEntry[] = [];
