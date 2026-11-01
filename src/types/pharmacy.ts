export type DosageForm = 
  | 'Tablet' 
  | 'Capsule' 
  | 'Syrup' 
  | 'Injection' 
  | 'Ointment' 
  | 'Spray'
  | 'Drops' 
  | 'Suspension'
  | 'Inhaler'
  | 'Cosmetics'
  | 'Ice Cream';

export type MedicineCategory = 
  | 'Analgesics & Antipyretics' 
  | 'Antibiotics & Antimicrobials'
  | 'Anti-infective & Antifungal'
  | 'Gastrointestinal & Antacids' 
  | 'Cardiovascular & Antihypertensive' 
  | 'Antidiabetic' 
  | 'Respiratory & Anti-allergic' 
  | 'Vitamins & Supplements' 
  | 'Dermatology & Topicals'
  | 'Dermatological & Antifungal Topicals'
  | 'Urological & Nephrology'
  | 'Ophthalmological & Otic'
  | 'Musculoskeletal & Joint Care'
  | 'Hormones & Obstetrics / Gynecology'
  | 'CNS & Neurological'
  | 'Cosmetics & Personal Care'
  | 'FMCG, Food & Dairy';

export type ScheduleClass = 'OTC' | 'Schedule H' | 'Schedule H1' | 'Schedule X';

export interface BatchInfo {
  batchNumber: string;
  mfgDate: string; // YYYY-MM
  expiryDate: string; // YYYY-MM
  purchasePrice: number;
  mrp: number; // Pack MRP
  stock: number; // In packs
  rackLocation: string;
  barcode: string;
  packSize?: number; // Base units per pack (e.g. 10, 15, 100)
  packUnit?: string; // e.g. "Strip of 10", "Strip of 15", "Bottle 100ml"
  unitMrp?: number; // MRP / packSize (for loose tablet/unit dispensing)
  unitPurchasePrice?: number;
  allowLooseDispensing?: boolean; // When true, allows individual tablet/unit selling
}

export interface Medicine {
  id: string;
  brandName: string;
  genericName: string;
  category: MedicineCategory;
  dosageForm: DosageForm;
  strength: string;
  manufacturer: string;
  gstRate: number; // e.g. 5, 12, 18
  hsnCode: string;
  isScheduleDrug: boolean;
  scheduleClass: ScheduleClass;
  packSize?: number;
  packUnit?: string;
  allowLooseDispensing?: boolean; // User choice: Allow loose dispensing vs Full pack only
  storageCondition?: string;
  reorderLevel?: number;
  batches: BatchInfo[];
}

export interface CartItem {
  medicineId: string;
  brandName: string;
  genericName: string;
  dosageForm: DosageForm;
  strength: string;
  batchNumber: string;
  expiryDate: string;
  rackLocation: string;
  quantity: number;
  mrp: number; // effective MRP applied
  purchasePrice: number;
  discountPercent: number;
  gstRate: number;
  hsnCode?: string;
  daysSupply?: number; // Days duration of medication (e.g. 5, 10, 15, 30 days)
  isScheduleDrug: boolean;
  dispenseMode?: 'pack' | 'loose'; // Full pack vs loose tablet dispensing
  packSize?: number;
  packUnit?: string;
  packMrp?: number;
  unitMrp?: number;
}

export type PaymentMethod = 'Cash' | 'UPI / QR' | 'Card POS' | 'Split Pay';

export interface SaleBill {
  id: string;
  billNumber: string;
  timestamp: string;
  cashierName: string;
  customerName: string;
  customerPhone: string;
  doctorName?: string;
  doctorRegNo?: string;
  isPrescriptionVerified: boolean;
  pharmacistName?: string;
  pharmacistRegNo?: string;
  items: CartItem[];
  subtotal: number;
  totalDiscount: number;
  taxableAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  roundOff: number;
  netPayable: number;
  paymentMethod: PaymentMethod;
  paymentRef?: string;
  creditDueDays?: number; // Days allowed or pending for credit payment
  daysTaken?: number; // Live days elapsed since dispensing
  status: 'Completed' | 'Refunded' | 'Cancelled';
}

export interface Supplier {
  id: string;
  firmName: string;
  contactPerson: string;
  phone: string;
  email?: string;
  gstin: string;
  drugLicenseNo: string;
  creditDays: number;
  address: string;
  city: string;
  state: string;
  totalPurchases: number;
  outstandingBalance: number;
}

export interface InwardItem {
  medicineName: string;
  genericName: string;
  dosageForm: DosageForm;
  strength: string;
  category: MedicineCategory;
  batchNumber: string;
  mfgDate: string;
  expiryDate: string;
  quantity: number;
  freeQty?: number;
  packSize?: number;
  packUnit?: string;
  unitMrp?: number;
  unitPurchaseCost?: number;
  totalBaseUnits?: number;
  purchaseCost: number;
  tradePrice?: number | null;
  sellingMrp: number;
  gstRate: number;
  hsnCode?: string;
  rackLocation: string;
  barcode: string;
}

export interface PurchaseInward {
  id: string;
  inwardNumber: string;
  supplierId: string;
  supplierName: string;
  supplierInvoiceNo: string;
  invoiceDate: string;
  receivedDate: string;
  billImageUrl?: string;
  items: InwardItem[];
  taxableTotal: number;
  gstTotal: number;
  netBillAmount: number;
  paymentStatus: 'Paid' | 'Credit Pending' | 'Partially Paid';
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email?: string;
  address: string;
  medicalConditions?: string;
  allergies?: string;
  doctorPreferred?: string;
  refillReminderDays?: number; // Refill Reminder / Contact After (Days) - default 30
  totalVisits: number;
  totalSpend: number;
  creditBalance: number;
  creditDueDays?: number; // Days credit balance has been pending
  lastVisit: string;
  lastReminderSent?: string; // Timestamp when reminder was last sent
  activeCourseDays?: number; // Days of ongoing prescription
}

export interface StoreExpense {
  id: string;
  date: string;
  category: 'Rent' | 'Electricity & Utilities' | 'Staff Salary' | 'Tea & Refreshment' | 'Packaging & Consumables' | 'Store Maintenance' | 'Software & Tech' | 'Miscellaneous';
  amount: number;
  paymentMode: 'Cash' | 'UPI / Bank' | 'Card';
  recordedBy: string;
  description: string;
  receiptNumber?: string;
}

export type StaffRole = 'Admin' | 'Pharmacist' | 'Cashier' | 'Inventory Manager';

export interface StaffMember {
  id: string;
  name: string;
  username: string;
  phone: string;
  email: string;
  role: StaffRole;
  pharmacistRegNo?: string;
  status: 'Active' | 'Deactivated';
  createdDate: string;
}

export interface StaffAccountRequest {
  uid: string;
  name: string;
  email: string;
  phone: string;
  status: 'pending' | 'approved' | 'rejected';
  requestedAt: string;
  role?: StaffRole;
  staffId?: string;
  reviewedAt?: string;
}

export interface StoreSettings {
  storeName: string;
  tagline: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  pincode: string;
  phone: string;
  email: string;
  dl20b: string;
  dl21b: string;
  gstin: string;
  pan: string;
  upiId: string;
  soundboxName: string;
  nearExpiryDaysThreshold: number;
  lowStockThreshold: number;
  googleDriveSyncEnabled: boolean;
  googleDriveAccount: string;
  googleDriveFolderId?: string;
  googleDriveFolderName: string;
  googleDriveSyncFrequency: string;
  lastBackupTime?: string;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  action: string;
  details: string;
  ipAddress: string;
}

export interface ParsedInvoiceItem {
  medicineName: string;
  genericName: string;
  dosageForm: DosageForm;
  strength: string;
  category: MedicineCategory;
  batchNumber: string;
  mfgDate: string;
  expiryDate: string;
  quantity: number;
  freeQty?: number;
  packSize?: number;
  packUnit?: string;
  purchaseCost: number; // Per-pack purchase cost after invoice discount, excluding GST
  tradePrice?: number | null; // Printed per-pack PTR/trade price before invoice discount
  sellingMrp: number; // Pack MRP
  taxableAmount?: number; // Extracted line taxable amount, excluding GST
  gstAmount?: number; // Extracted line GST amount
  unitMrp?: number; // Loose unit MRP = sellingMrp / packSize
  unitPurchaseCost?: number;
  totalBaseUnits?: number; // (quantity + freeQty) * packSize
  gstRate: number;
  hsnCode: string;
  rackLocation?: string;
  matchedMedicineId?: string | null;
  matchType?: 'exact' | 'partial' | 'new';
  matchReason?: string;
  selected?: boolean;
}

export interface ParsedInvoice {
  supplier: {
    firmName: string;
    invoiceNo: string;
    invoiceDate: string;
    gstin?: string;
  };
  items: ParsedInvoiceItem[];
  totalTaxable: number;
  totalGst: number;
  netAmount: number;
  validationWarnings?: string[];
  summary?: string;
  rawImage?: string;
  aiEngine?: string;
}

export type AIAssistantActionType = 
  | 'ADJUST_STOCK'
  | 'ADD_BATCH'
  | 'UPDATE_PRICE'
  | 'UPDATE_EXPIRY'
  | 'NAVIGATE_TAB'
  | 'FIND_MEDICINE'
  | 'OPEN_INVOICE_UPLOAD'
  | 'AUTO_FILL_INWARD';

export interface AIAssistantAction {
  type: AIAssistantActionType;
  medicineId?: string;
  medicineName?: string;
  batchNumber?: string;
  newStock?: number;
  deltaStock?: number;
  reason?: string;
  newMrp?: number;
  newPurchasePrice?: number;
  newExpiryDate?: string;
  tab?: string;
  searchTerm?: string;
  invoiceData?: ParsedInvoice;
  applied?: boolean;
}

export interface AIAssistantMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  image?: string;
  thinking?: string;
  inventoryMatches?: Array<{
    id: string;
    brandName: string;
    genericName: string;
    dosageForm: string;
    strength: string;
    totalStock: number;
    batches: Array<{
      batchNumber: string;
      stock: number;
      expiryDate: string;
      rackLocation: string;
      mrp: number;
    }>;
  }>;
  invoiceResult?: ParsedInvoice;
  actions?: AIAssistantAction[];
  quickReplies?: string[];
}
