import React, { useState } from 'react';
import { 
  Settings, 
  Database, 
  ShieldCheck, 
  Upload, 
  Save, 
  Cloud, 
  CheckCircle2, 
  Building2, 
  FileCheck, 
  AlertTriangle
} from 'lucide-react';
import { StoreSettings, AuditLogEntry } from '../../types/pharmacy';
import { StorageService } from '../../utils/storage';
import { sound } from '../../utils/sound';

interface SettingsBackupViewProps {
  settings: StoreSettings;
  auditLogs: AuditLogEntry[];
  onUpdateSettings: (settings: StoreSettings) => void;
  onDatabaseRestored: () => void;
}

export const SettingsBackupView: React.FC<SettingsBackupViewProps> = ({
  settings,
  auditLogs,
  onUpdateSettings,
  onDatabaseRestored,
}) => {
  const [activeTab, setActiveTab] = useState<'licensing' | 'backup' | 'audit'>('licensing');
  const cloudStatus = StorageService.getCloudStatus();

  // Form State
  const [storeName, setStoreName] = useState<string>(settings.storeName);
  const [tagline, setTagline] = useState<string>(settings.tagline);
  const [addressLine1, setAddressLine1] = useState<string>(settings.addressLine1);
  const [addressLine2, setAddressLine2] = useState<string>(settings.addressLine2);
  const [city, setCity] = useState<string>(settings.city);
  const [state, setState] = useState<string>(settings.state);
  const [pincode, setPincode] = useState<string>(settings.pincode);
  const [phone, setPhone] = useState<string>(settings.phone);
  const [email, setEmail] = useState<string>(settings.email);
  const [dl20b, setDl20b] = useState<string>(settings.dl20b);
  const [dl21b, setDl21b] = useState<string>(settings.dl21b);
  const [gstin, setGstin] = useState<string>(settings.gstin);
  const [pan, setPan] = useState<string>(settings.pan);
  const [upiId, setUpiId] = useState<string>(settings.upiId);
  const [soundboxName, setSoundboxName] = useState<string>(settings.soundboxName);
  const [nearExpiryDays, setNearExpiryDays] = useState<number>(settings.nearExpiryDaysThreshold);
  const [lowStockThreshold, setLowStockThreshold] = useState<number>(settings.lowStockThreshold);

  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);
  const [restoreStatus, setRestoreStatus] = useState<string>('');
  const [syncNotice, setSyncNotice] = useState<string | null>(null);

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    const updated: StoreSettings = {
      ...settings,
      storeName,
      tagline,
      addressLine1,
      addressLine2,
      city,
      state,
      pincode,
      phone,
      email,
      dl20b,
      dl21b,
      gstin,
      pan,
      upiId,
      soundboxName,
      nearExpiryDaysThreshold: Number(nearExpiryDays),
      lowStockThreshold: Number(lowStockThreshold),
      googleDriveSyncEnabled: false,
    };
    onUpdateSettings(updated);
    sound.playSuccessChime();
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  const [isRestoring, setIsRestoring] = useState<boolean>(false);
  const [isDragOver, setIsDragOver] = useState<boolean>(false);

  const processRestoreFile = async (file: File) => {
    if (!file) return;
    setIsRestoring(true);
    setRestoreStatus(`Reading ${file.name}...`);

    const reader = new FileReader();
    reader.onload = async ev => {
      const content = ev.target?.result as string;
      if (content) {
        setRestoreStatus('☁️ Restoring & synchronizing inventory with Cloud Firestore...');
        try {
          const res = await StorageService.restoreFromJSON(content);
          if (res.success) {
            sound.playSuccessChime();
            setRestoreStatus(`✅ Restored ${res.medicineCount} medicines & synchronized to Cloud Firestore! All devices up to date.`);
            setTimeout(() => {
              onDatabaseRestored();
              setIsRestoring(false);
              setRestoreStatus('');
            }, 2000);
          } else {
            sound.playWarningBeep();
            setIsRestoring(false);
            setRestoreStatus(`Failed to restore: ${res.message}`);
          }
        } catch (err: any) {
          sound.playWarningBeep();
          setIsRestoring(false);
          setRestoreStatus(`Error restoring archive: ${err?.message || 'Unknown error'}`);
        }
      }
    };
    reader.readAsText(file);
  };

  const handleRestoreFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processRestoreFile(file);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      {/* Header */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-800">Pharmacy Settings, Licensing & Backups</h2>
          <p className="text-xs text-slate-500">
            Form 20B/21B Drug Licensing, Firestore Cloud Records, and Security Audits
          </p>
        </div>

        <div className="flex items-center gap-2">
          {savedSuccess && (
            <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Settings Saved
            </span>
          )}
        </div>
      </div>

      {/* Sub Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200">
        {[
          { id: 'licensing', label: 'Licensing & Store Info' },
          { id: 'backup', label: 'Database Backup & Restore' },
          { id: 'audit', label: 'Security & Compliance Audit Log' },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id as typeof activeTab)}
            className={`px-4 py-2 text-xs font-bold border-b-2 transition-all ${
              activeTab === t.id
                ? 'border-emerald-600 text-emerald-800'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab 1: Licensing & Store Info (Matching Video 2:50 - 2:56, 3:10 - 3:14) */}
      {activeTab === 'licensing' && (
        <form onSubmit={handleSaveSettings} className="space-y-4">
          {/* Section 1: Store Branding & Contacts */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-3">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <Building2 className="w-4 h-4 text-emerald-600" />
              Medical Store Branding & Contacts
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Pharmacy Name</label>
                <input
                  type="text"
                  value={storeName}
                  onChange={e => setStoreName(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-bold focus:outline-emerald-600"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Tagline / Mission</label>
                <input
                  type="text"
                  value={tagline}
                  onChange={e => setTagline(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs focus:outline-emerald-600"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Store Address Line 1</label>
                <input
                  type="text"
                  value={addressLine1}
                  onChange={e => setAddressLine1(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs focus:outline-emerald-600"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Address Line 2 (Area)</label>
                <input
                  type="text"
                  value={addressLine2}
                  onChange={e => setAddressLine2(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs focus:outline-emerald-600"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">City</label>
                <input
                  type="text"
                  value={city}
                  onChange={e => setCity(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs focus:outline-emerald-600"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">State</label>
                <input
                  type="text"
                  value={state}
                  onChange={e => setState(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs focus:outline-emerald-600"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Postal PIN Code</label>
                <input
                  type="text"
                  value={pincode}
                  onChange={e => setPincode(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-mono focus:outline-emerald-600"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Official Phone</label>
                <input
                  type="text"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-mono focus:outline-emerald-600"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Official Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs focus:outline-emerald-600"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">UPI VPA ID (QR Payments)</label>
                <input
                  type="text"
                  value={upiId}
                  onChange={e => setUpiId(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-mono text-emerald-800 font-bold focus:outline-emerald-600"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Drug Licensing & Taxation Numbers */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-3">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              Drug Licensing & Taxation Numbers
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Drug License Form 20B</label>
                <input
                  type="text"
                  value={dl20b}
                  onChange={e => setDl20b(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-mono font-bold focus:outline-emerald-600 uppercase"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Drug License Form 21B</label>
                <input
                  type="text"
                  value={dl21b}
                  onChange={e => setDl21b(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-mono font-bold focus:outline-emerald-600 uppercase"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">GSTIN Number</label>
                <input
                  type="text"
                  value={gstin}
                  onChange={e => setGstin(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-mono font-bold focus:outline-emerald-600 uppercase"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Store PAN Number</label>
                <input
                  type="text"
                  value={pan}
                  onChange={e => setPan(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-mono font-bold focus:outline-emerald-600 uppercase"
                />
              </div>
            </div>
          </div>

          {/* Section 3: System Triggers & Thresholds */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-3">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <FileCheck className="w-4 h-4 text-emerald-600" />
              System Triggers & Thresholds
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Near Expiry Warning Alert (Days)
                </label>
                <input
                  type="number"
                  value={nearExpiryDays}
                  onChange={e => setNearExpiryDays(Number(e.target.value))}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-mono focus:outline-emerald-600"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">Default: 90 days FEFO notice</span>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Low Stock Warning Threshold (Units)
                </label>
                <input
                  type="number"
                  value={lowStockThreshold}
                  onChange={e => setLowStockThreshold(Number(e.target.value))}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-mono focus:outline-emerald-600"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">Default: 15 strips reorder point</span>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-98"
            >
              <Save className="w-4 h-4" />
              <span>Save Pharmacy Configuration</span>
            </button>
          </div>
        </form>
      )}

      {/* Tab 2: Database Backup & Restore */}
      {activeTab === 'backup' && (
        <div className="space-y-4">
          {/* Firestore connection and sync controls */}
          <div className="bg-gradient-to-br from-teal-900 via-teal-800 to-emerald-900 p-5 rounded-xl border border-teal-700 text-white shadow-sm space-y-3">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-emerald-300">
                  <Cloud className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="font-bold text-sm">Firestore Cloud Sync</h4>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      cloudStatus.isConnected
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30'
                        : 'bg-amber-500/20 text-amber-200 border border-amber-400/30'
                    }`}>
                      {cloudStatus.isConnected ? 'Connected' : 'Offline'}
                    </span>
                  </div>
                  <p className="text-xs text-teal-100">
                    {cloudStatus.error || 'Cloud updates are available when the Firebase connection is confirmed.'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={async () => {
                  setSyncNotice('☁️ Querying authoritative Firestore collections...');
                  try {
                    const res = await StorageService.syncFromCloudAuthoritative();
                    if (!res.success) {
                      throw new Error(StorageService.getCloudStatus().error || 'Firestore sync could not be confirmed.');
                    }
                    onDatabaseRestored();
                    sound.playSuccessChime();
                    setSyncNotice(`Firestore sync confirmed: ${res.medicineCount} medicines, ${res.billCount} bills, and ${res.purchaseCount} purchases.`);
                  } catch (error) {
                    console.error('[SettingsBackupView] Firestore refresh failed:', error);
                    setSyncNotice(error instanceof Error ? `Cloud sync failed: ${error.message}` : 'Cloud sync failed. Check Firebase setup and network.');
                  }
                  setTimeout(() => setSyncNotice(null), 4500);
                }}
                className="px-3.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-bold text-xs flex items-center gap-1.5 shadow-xs cursor-pointer transition-colors"
              >
                <span>Check Firestore now</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 pt-1 text-xs">
              <div className="bg-white/10 p-2.5 rounded-lg border border-white/10">
                <div className="text-[10px] text-teal-200 uppercase font-semibold">Cloud Database Instance</div>
                <div className="font-mono text-emerald-200 text-xs font-bold truncate">
                  {StorageService.getCloudStatus().databaseName}
                </div>
              </div>
              <div className="bg-white/10 p-2.5 rounded-lg border border-white/10">
                <div className="text-[10px] text-teal-200 uppercase font-semibold">Active Synchronization</div>
                <div className="text-white text-xs font-bold">
                  {cloudStatus.isConnected ? 'Firestore is the active data store' : 'Not confirmed'}
                </div>
              </div>
              <div className="bg-white/10 p-2.5 rounded-lg border border-white/10">
                <div className="text-[10px] text-teal-200 uppercase font-semibold">Local Performance Layer</div>
                <div className="text-white text-xs font-bold">
                  In-memory session cache only
                </div>
              </div>
            </div>

            {syncNotice && (
              <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 text-xs flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300" />
                <span>{syncNotice}</span>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-900">
            Pharmacy records are stored in Firestore. The browser keeps only an in-memory working copy while the app is open; it does not save pharmacy records to IndexedDB or local storage.
          </div>

          {/* Import archive into Firestore */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4">
              <div className="flex items-center gap-2">
                <Upload className="w-5 h-5 text-blue-600" />
                <h4 className="font-bold text-slate-900 text-sm">Import Archive to Firestore</h4>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Upload a previously exported JSON or CSV file. Its records will be written to Firestore.
              </p>

              {/* Drag and Drop Zone */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragOver(true);
                }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragOver(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file) processRestoreFile(file);
                }}
                className={`relative border-2 border-dashed rounded-xl p-5 text-center transition-all cursor-pointer ${
                  isDragOver
                    ? 'border-emerald-500 bg-emerald-50/70 scale-[1.01]'
                    : 'border-slate-300 hover:border-emerald-500 bg-slate-50/50 hover:bg-emerald-50/30'
                }`}
              >
                <input
                  type="file"
                  accept=".json,.csv"
                  onChange={handleRestoreFile}
                  disabled={isRestoring}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                />
                <div className="flex flex-col items-center justify-center space-y-2 pointer-events-none">
                  <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center">
                    <Upload className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-slate-800 block">
                      Drop Backup JSON or CSV file here, or click to browse
                    </span>
                    <span className="text-[11px] text-slate-500 block mt-0.5">
                      Supports Master JSON archives (180+ medicines) & CSV catalogs
                    </span>
                </div>
              </div>

              {restoreStatus && (
                <div className={`p-3 rounded-lg text-xs font-bold flex items-center gap-2 ${
                  isRestoring ? 'bg-amber-50 text-amber-800 border border-amber-200' : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                }`}>
                  {isRestoring && <div className="w-3.5 h-3.5 border-2 border-amber-600 border-t-transparent rounded-full animate-spin shrink-0" />}
                  <span>{restoreStatus}</span>
                </div>
              )}
            </div>
          </div>

          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs text-slate-600 space-y-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-bold text-slate-800">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>Firestore Cloud Storage</span>
              </div>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-100 text-emerald-800 font-bold text-[10px] rounded-full border border-emerald-300 w-fit">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse"></span>
                Browser database disabled
              </span>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Pharmacy records are read from and written to your configured Firestore database. An internet connection is required; if Firestore is unavailable, the app blocks access to records rather than using a local database.
            </p>
          </div>
        </div>
      )}

      {/* Tab 3: Security & Compliance Audit Log (Matching Video 3:06 - 3:09) */}
      {activeTab === 'audit' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center text-xs">
            <span className="font-bold text-slate-800">Security & Compliance Audit Trail</span>
            <span className="text-slate-500 font-mono">{auditLogs.length} Records</span>
          </div>

          <div className="overflow-x-auto max-h-[500px]">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="sticky top-0 bg-slate-100 z-10">
                <tr className="border-b border-slate-200 font-semibold text-slate-600 uppercase text-[10px] tracking-wider">
                  <th className="p-3">Timestamp</th>
                  <th className="p-3">User / Cashier</th>
                  <th className="p-3">Action Type</th>
                  <th className="p-3">Details / Audit Payload</th>
                  <th className="p-3 text-right">IP / Station</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                {auditLogs.map(log => (
                  <tr key={log.id} className="hover:bg-slate-50/60 font-mono text-[11px]">
                    <td className="p-3 text-slate-500 whitespace-nowrap">{log.timestamp}</td>
                    <td className="p-3 text-slate-800 font-sans font-semibold">{log.userName}</td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 rounded font-bold text-[10px] bg-slate-100 text-slate-800 border border-slate-200">
                        {log.action}
                      </span>
                    </td>
                    <td className="p-3 text-slate-600 font-sans">{log.details}</td>
                    <td className="p-3 text-right text-slate-400">{log.ipAddress}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
