/**
 * Legacy browser-storage migration helper. Active pharmacy records are stored in Firestore.
 */

const DB_NAME = 'drugs_lites_pharma_db';
const DB_VERSION = 1;
const STORE_NAME = 'keyval_store';
const MIGRATION_FLAG_KEY = 'drugs_lites_idb_migrated_v2';

let dbInstance: IDBDatabase | null = null;
let dbPromise: Promise<IDBDatabase> | null = null;
let persistenceEnabled = true;

export class IDBStorage {
  static disablePersistence(): void {
    persistenceEnabled = false;
  }

  /**
   * Check if IndexedDB is available in the current environment
   */
  static isAvailable(): boolean {
    return typeof window !== 'undefined' && 'indexedDB' in window && window.indexedDB !== null;
  }

  /**
   * Open or retrieve the existing IndexedDB connection
   */
  static async getDB(): Promise<IDBDatabase> {
    if (dbInstance) {
      return dbInstance;
    }

    if (dbPromise) {
      return dbPromise;
    }

    if (!this.isAvailable()) {
      throw new Error('IndexedDB is not supported in this browser environment');
    }

    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };

      request.onsuccess = (event: Event) => {
        dbInstance = (event.target as IDBOpenDBRequest).result;
        
        // Handle unexpected disconnects
        dbInstance.onversionchange = () => {
          dbInstance?.close();
          dbInstance = null;
          dbPromise = null;
        };

        dbInstance.onclose = () => {
          dbInstance = null;
          dbPromise = null;
        };

        resolve(dbInstance);
      };

      request.onerror = (event: Event) => {
        dbPromise = null;
        reject((event.target as IDBOpenDBRequest).error || new Error('Failed to open IndexedDB'));
      };
    });

    return dbPromise;
  }

  /**
   * Retrieve a value by key
   */
  static async getItem<T = any>(key: string): Promise<T | null> {
    if (!persistenceEnabled) return null;
    const db = await this.getDB();
    return new Promise<T | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);

      req.onsuccess = () => {
        resolve(req.result !== undefined ? req.result : null);
      };

      req.onerror = () => {
        reject(req.error || new Error(`Failed to read key: ${key}`));
      };
    });
  }

  /**
   * Save a value by key
   */
  static async setItem<T = any>(key: string, value: T): Promise<void> {
    if (!persistenceEnabled) return;
    const db = await this.getDB();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(value, key);

      req.onsuccess = () => {
        resolve();
      };

      req.onerror = () => {
        reject(req.error || new Error(`Failed to write key: ${key}`));
      };

      tx.onabort = () => {
        reject(tx.error || new Error(`Transaction aborted writing key: ${key}`));
      };
    });
  }

  /**
   * Remove a value by key
   */
  static async removeItem(key: string): Promise<void> {
    if (!persistenceEnabled) return;
    try {
      const db = await this.getDB();
      return new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.delete(key);

        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error || new Error(`Failed to delete key: ${key}`));
      });
    } catch (err) {
      console.warn(`[IDBStorage] Error deleting ${key}:`, err);
    }
  }

  /**
   * Clear all items in the store
   */
  static async clear(): Promise<void> {
    const db = await this.getDB();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.clear();

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error || new Error('Failed to clear IndexedDB store'));
    });
  }

  /**
   * Get all keys stored in the database
   */
  static async getAllKeys(): Promise<string[]> {
    if (!persistenceEnabled) return [];
    try {
      const db = await this.getDB();
      return new Promise<string[]>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.getAllKeys();

        req.onsuccess = () => {
          resolve((req.result as string[]) || []);
        };

        req.onerror = () => {
          reject(req.error || new Error('Failed to retrieve keys from IndexedDB'));
        };
      });
    } catch (err) {
      console.warn('[IDBStorage] Error retrieving keys:', err);
      return [];
    }
  }

  /**
   * Export all key-value entries
   */
  static async exportAll(): Promise<Record<string, any>> {
    const keys = await this.getAllKeys();
    const result: Record<string, any> = {};
    for (const key of keys) {
      result[key] = await this.getItem(key);
    }
    return result;
  }

  /**
   * Bulk import key-value entries
   */
  static async importAll(entries: Record<string, any>): Promise<void> {
    if (!persistenceEnabled) return;
    const db = await this.getDB();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      Object.entries(entries).forEach(([key, val]) => {
        store.put(val, key);
      });

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Failed to bulk import data into IndexedDB'));
      tx.onabort = () => reject(tx.error || new Error('Transaction aborted during bulk import'));
    });
  }

  /**
   * One-time automated migration routine:
   * Inspects localStorage for target keys, migrates them to IndexedDB,
   * and trims localStorage so quota is permanently freed.
   */
  static async migrateFromLocalStorage(targetKeys: string[]): Promise<{ migratedCount: number; keys: string[] }> {
    if (!persistenceEnabled || !this.isAvailable()) {
      return { migratedCount: 0, keys: [] };
    }

    const migratedKeys: string[] = [];
    const isAlreadyMigrated = localStorage.getItem(MIGRATION_FLAG_KEY) === 'true';

    try {
      for (const key of targetKeys) {
        const localRaw = localStorage.getItem(key);
        if (localRaw !== null) {
          try {
            const parsed = JSON.parse(localRaw);
            const existingInIDB = await this.getItem(key);

            // If IDB doesn't have it or we haven't marked migration done, transfer to IDB
            if (!existingInIDB || !isAlreadyMigrated) {
              await this.setItem(key, parsed);
              migratedKeys.push(key);
            }
          } catch {
            // Raw string value
            const existingInIDB = await this.getItem(key);
            if (!existingInIDB || !isAlreadyMigrated) {
              await this.setItem(key, localRaw);
              migratedKeys.push(key);
            }
          }
        }
      }

      // Mark migration flag
      localStorage.setItem(MIGRATION_FLAG_KEY, 'true');

      // Specifically prune large base64 keys like purchases from localStorage
      // to guarantee localStorage quota errors are completely resolved
      const purchasesKey = targetKeys.find(k => k.includes('purchases'));
      if (purchasesKey) {
        try {
          const rawPurchases = localStorage.getItem(purchasesKey);
          if (rawPurchases && rawPurchases.length > 500000) {
            // It contains large data URLs; strip or clear from localStorage
            // The data is already safely secured in IndexedDB!
            const purchasesData = JSON.parse(rawPurchases);
            const lightweight = purchasesData.map((p: any) => ({
              ...p,
              billImageUrl: p.billImageUrl ? '[Stored in IndexedDB]' : undefined,
            }));
            localStorage.setItem(purchasesKey, JSON.stringify(lightweight));
          }
        } catch (e) {
          // If even lightweight write fails, remove from localStorage
          localStorage.removeItem(purchasesKey);
        }
      }

      return { migratedCount: migratedKeys.length, keys: migratedKeys };
    } catch (err) {
      console.error('[IDBStorage] Migration from localStorage encountered an issue:', err);
      return { migratedCount: migratedKeys.length, keys: migratedKeys };
    }
  }
}
