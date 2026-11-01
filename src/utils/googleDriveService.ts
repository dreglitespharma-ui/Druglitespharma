/**
 * Google Drive Cloud Backup & One-Click Restore Service
 * Implements Google Drive API client-side token auth via Firebase
 * Supports automated backups, manual cloud sync, and cross-device restoration
 */

import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  User 
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import { StorageService } from './storage';

// 1. Initialize Firebase App (safely reusing existing instance if any)
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);

// 2. Google Auth Provider with minimal Drive scope (drive.file)
const provider = new GoogleAuthProvider();
provider.addScope('https://www.googleapis.com/auth/drive.file');
provider.setCustomParameters({
  prompt: 'select_account',
});

// Flag to track ongoing sign in flow
let isSigningIn = false;
// In-memory cache for OAuth access token (NEVER stored in localStorage per security guidelines)
let cachedAccessToken: string | null = null;
let cachedGoogleUser: User | null = null;

export interface DriveBackupMeta {
  id: string;
  name: string;
  size?: string;
  modifiedTime: string;
  storeName?: string;
  version?: string;
  recordsSummary?: string;
}

/**
 * Initialize Google Auth state listener.
 */
export const initGoogleAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      cachedGoogleUser = user;
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        // If user is logged into Firebase but token expired/cleared from memory,
        // trigger failure to allow re-authentication on demand
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedGoogleUser = null;
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

/**
 * Trigger Google Sign-In with popup to request Google Drive access.
 */
export const signInWithGoogleDrive = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to obtain Google Drive OAuth access token.');
    }

    cachedAccessToken = credential.accessToken;
    cachedGoogleUser = result.user;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error('Google Drive sign-in error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

/**
 * Retrieve current cached access token.
 */
export const getGoogleAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

/**
 * Get current Google User profile.
 */
export const getCurrentGoogleUser = (): User | null => {
  return cachedGoogleUser || auth.currentUser;
};

/**
 * Sign out of Google Drive connection.
 */
export const signOutGoogleDrive = async (): Promise<void> => {
  await signOut(auth);
  cachedAccessToken = null;
  cachedGoogleUser = null;
};

/**
 * Compile structured master backup payload from current local database.
 */
export const generateStructuredBackupPayload = () => {
  const settings = StorageService.getSettings();
  const staff = StorageService.getStaff();
  const medicines = StorageService.getMedicines();
  const suppliers = StorageService.getSuppliers();
  const customers = StorageService.getCustomers();
  const bills = StorageService.getBills();
  const purchases = StorageService.getPurchases();
  const expenses = StorageService.getExpenses();
  const auditLogs = StorageService.getAuditLogs();

  const totalBatches = medicines.reduce((sum, m) => sum + (m.batches?.length || 0), 0);
  const totalStockUnits = medicines.reduce(
    (sum, m) => sum + (m.batches?.reduce((bSum, b) => bSum + (b.stock || 0), 0) || 0),
    0
  );

  return {
    app: 'DRUGS_LITES_PHARMA_POS',
    format: 'cloud_backup_v2.4',
    exportedAt: new Date().toISOString(),
    storeName: settings.storeName || 'DRUGS LITES PHARMA',
    gstin: settings.gstin || '',
    stats: {
      medicinesCount: medicines.length,
      batchesCount: totalBatches,
      stockUnitsCount: totalStockUnits,
      billsCount: bills.length,
      customersCount: customers.length,
      suppliersCount: suppliers.length,
      purchasesCount: purchases.length,
      expensesCount: expenses.length,
    },
    data: {
      settings,
      staff,
      medicines,
      suppliers,
      customers,
      bills,
      purchases,
      expenses,
      auditLogs,
    },
  };
};

/**
 * Helper: Find or create application folder in Google Drive.
 */
export const findOrCreateDriveFolder = async (
  accessToken: string,
  folderName: string = 'DRUGS_LITES_PHARMA_BACKUPS'
): Promise<string> => {
  try {
    // 1. Search for existing folder
    const query = encodeURIComponent(`mimeType = 'application/vnd.google-apps.folder' and name = '${folderName}' and trashed = false`);
    const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (listRes.ok) {
      const listData = await listRes.json();
      if (listData.files && listData.files.length > 0) {
        return listData.files[0].id;
      }
    }

    // 2. Create folder if not found
    const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
      }),
    });

    if (createRes.ok) {
      const folderData = await createRes.json();
      return folderData.id;
    }
  } catch (err) {
    console.warn('Could not create folder in Drive, using root folder fallback:', err);
  }

  return 'root';
};

/**
 * Upload a structured database backup to Google Drive using multipart upload.
 */
export const uploadBackupToGoogleDrive = async (
  accessToken: string,
  customLabel?: string
): Promise<{ fileId: string; fileName: string; timestamp: string }> => {
  const payload = generateStructuredBackupPayload();
  const folderId = await findOrCreateDriveFolder(accessToken);

  const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const fileName = `Pharmacy_Backup_${customLabel || 'Auto'}_${dateStr}.json`;

  const metadata = {
    name: fileName,
    parents: folderId && folderId !== 'root' ? [folderId] : undefined,
    mimeType: 'application/json',
    description: `Full pharmacy database backup from ${payload.storeName}. Contains ${payload.stats.medicinesCount} medicines, ${payload.stats.billsCount} bills, ${payload.stats.customersCount} customers.`,
  };

  const fileContent = JSON.stringify(payload, null, 2);
  const boundary = '-------314159265358979323846';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const multipartRequestBody =
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    'Content-Type: application/json\r\n\r\n' +
    fileContent +
    closeDelimiter;

  const uploadRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body: multipartRequestBody,
  });

  if (!uploadRes.ok) {
    const errorText = await uploadRes.text();
    throw new Error(`Google Drive backup upload failed: ${errorText}`);
  }

  const uploadResult = await uploadRes.json();

  // Also maintain an updated pointer / latest snapshot named 'Pharmacy_Backup_LATEST.json'
  try {
    const latestMetadata = {
      name: 'Pharmacy_Backup_LATEST.json',
      parents: folderId && folderId !== 'root' ? [folderId] : undefined,
      mimeType: 'application/json',
      description: 'Latest instant cross-device snapshot for one-click restore',
    };

    const latestBody =
      delimiter +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(latestMetadata) +
      delimiter +
      'Content-Type: application/json\r\n\r\n' +
      fileContent +
      closeDelimiter;

    await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: latestBody,
    });
  } catch (latestErr) {
    // Non-critical background pointer update
  }

  // Update audit log
  StorageService.addAuditLog(
    'GOOGLE_DRIVE_BACKUP',
    `Database archived to Google Drive: ${fileName} (${payload.stats.medicinesCount} meds, ${payload.stats.billsCount} bills)`
  );

  return {
    fileId: uploadResult.id,
    fileName,
    timestamp: new Date().toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }),
  };
};

/**
 * List existing pharmacy backups available in the user's Google Drive.
 */
export const listGoogleDriveBackups = async (accessToken: string): Promise<DriveBackupMeta[]> => {
  const query = encodeURIComponent(`name contains 'Pharmacy_Backup' and trashed = false`);
  const url = `https://www.googleapis.com/drive/v3/files?q=${query}&orderBy=modifiedTime desc&pageSize=20&fields=files(id,name,size,modifiedTime,mimeType,description)`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Failed to list Google Drive backups: ${errorText}`);
  }

  const data = await res.json();
  const files: any[] = data.files || [];

  return files.map(f => {
    const sizeInKB = f.size ? `${(parseInt(f.size, 10) / 1024).toFixed(1)} KB` : 'Dynamic';
    const dateFormatted = new Date(f.modifiedTime).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });

    return {
      id: f.id,
      name: f.name,
      size: sizeInKB,
      modifiedTime: dateFormatted,
      recordsSummary: f.description || 'Pharmacy Full Database Snapshot',
    };
  });
};

/**
 * Fetch and download a specific backup JSON from Google Drive.
 */
export const downloadBackupFileContent = async (accessToken: string, fileId: string): Promise<any> => {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Failed to download backup from Google Drive: ${errorText}`);
  }

  return await res.json();
};

/**
 * Seamlessly restore local database from a downloaded Google Drive backup payload.
 */
export const restoreFromCloudBackupPayload = async (backupPayload: any): Promise<boolean> => {
  try {
    if (!backupPayload) return false;

    // Handle both direct data structure and wrapped data object
    const dataToRestore = backupPayload.data || backupPayload;

    const jsonString = JSON.stringify(dataToRestore);
    const res = await StorageService.restoreFromJSON(jsonString);

    if (res.success) {
      StorageService.addAuditLog(
        'CROSS_DEVICE_RESTORE_CLOUD',
        `Database re-populated from Google Drive (${backupPayload.storeName || 'Cloud Archive'}) at ${new Date().toLocaleTimeString()}`
      );
    }

    return res.success;
  } catch (err) {
    console.error('Error applying cloud backup to storage:', err);
    return false;
  }
};
