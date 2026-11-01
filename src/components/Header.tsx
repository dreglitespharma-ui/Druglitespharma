import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Bell, 
  LogOut, 
  Clock, 
  ChevronDown, 
  CheckCircle2, 
  Lock,
  PlusCircle,
  Database,
  Menu,
  Sparkles,
  Cloud,
  RefreshCw,
  Smartphone,
  Laptop,
  Tablet,
  X
} from 'lucide-react';
import { StaffMember, StoreSettings } from '../types/pharmacy';
import { StorageService } from '../utils/storage';

interface HeaderProps {
  title: string;
  subtitle?: string;
  activeStaff: StaffMember;
  allStaff: StaffMember[];
  onSwitchStaff: (staffId: string) => void;
  settings: StoreSettings;
  onOpenPos: () => void;
  onLogout: () => void;
  onToggleMobileMenu?: () => void;
  onOpenAIAssistant?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  title,
  subtitle,
  activeStaff,
  allStaff,
  onSwitchStaff,
  settings,
  onOpenPos,
  onLogout,
  onToggleMobileMenu,
  onOpenAIAssistant,
}) => {
  const [showStaffDropdown, setShowStaffDropdown] = useState(false);
  const [showCloudModal, setShowCloudModal] = useState(false);
  const [cloudStatus, setCloudStatus] = useState(StorageService.getCloudStatus());
  const [currentTimeStr, setCurrentTimeStr] = useState<string>('');

  useEffect(() => {
    const unsub = StorageService.subscribe(() => {
      setCloudStatus(StorageService.getCloudStatus());
    });
    return unsub;
  }, []);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      // Format: "Tue, 13 Oct, 2026, 11:00:45 pm" matching screenshot exactly
      const weekday = now.toLocaleDateString('en-US', { weekday: 'short' });
      const day = now.toLocaleDateString('en-US', { day: '2-digit' });
      const month = now.toLocaleDateString('en-US', { month: 'short' });
      const year = now.getFullYear();
      const time = now.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      }).toLowerCase();

      setCurrentTimeStr(`${weekday},  ${day} ${month},  ${year},  ${time}`);
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Compute initials for the user avatar circle (e.g. "OW" for Owner)
  const getInitials = (name: string, role: string) => {
    if (role.toLowerCase().includes('owner') || role.toLowerCase().includes('admin')) return 'OW';
    if (role.toLowerCase().includes('pharma')) return 'PH';
    if (role.toLowerCase().includes('cashier')) return 'CS';
    return name.slice(0, 2).toUpperCase();
  };

  return (
    <header className="h-16 shrink-0 bg-white border-b border-slate-200 px-2 sm:px-6 flex items-center justify-between gap-1 sm:gap-3 sticky top-0 z-20 shadow-2xs select-none">
      
      {/* Left Brand Area (Matching Image 1) */}
      <div className="flex items-center gap-1 sm:gap-3 min-w-0 flex-1">
        {/* Mobile Hamburger Toggle Button */}
        {onToggleMobileMenu && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleMobileMenu();
            }}
            className="md:hidden min-w-10 min-h-10 p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors shrink-0"
            title="Open Menu"
          >
            <Menu className="w-5 h-5 text-slate-700" />
          </button>
        )}

        {/* Medical Cross Logo with small checkmark */}
        <div className="relative w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-br from-[#009b8c] to-[#007b70] text-white flex items-center justify-center shadow-xs shrink-0">
          <Plus className="w-6 h-6 text-white" strokeWidth={3.5} />
          <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-500 rounded-full border-2 border-white flex items-center justify-center text-[8px] text-white font-bold">
            ✓
          </span>
        </div>

        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-1 sm:gap-1.5 leading-none whitespace-nowrap">
            <span className="font-extrabold text-slate-900 text-xs min-[375px]:text-sm sm:text-base tracking-tight">DRUGS LITES</span>
            <span className="hidden min-[400px]:inline font-extrabold text-[#009b8c] text-xs min-[400px]:text-sm sm:text-base tracking-tight">PHARMA</span>
            <span className="hidden sm:inline px-1.5 py-0.2 rounded-md bg-sky-50 text-sky-700 border border-sky-200 text-[10px] font-extrabold tracking-wide uppercase">
              POS
            </span>
          </div>
          <span className="hidden sm:inline text-[10px] sm:text-[11px] text-slate-500 font-medium mt-0.5">
            Medical Store Management System • Lic. 20B/21B
          </span>
        </div>
      </div>

      {/* Center Live Clock & SQLite Active Pill (Matching Image 1) */}
      <div className="hidden xl:flex items-center gap-2.5">
        {/* Clock Pill */}
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full border border-slate-200 bg-slate-50/70 text-slate-700 text-xs font-mono font-medium shadow-2xs">
          <Clock className="w-3.5 h-3.5 text-slate-400" />
          <span>{currentTimeStr || 'Tue, 13 Oct, 2026, 11:00:45 pm'}</span>
        </div>

        {/* Firestore connection state */}
        <button
          type="button"
          onClick={() => setShowCloudModal(true)}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold shadow-2xs transition-colors cursor-pointer ${
            cloudStatus.isConnected
              ? 'border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-800'
              : 'border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-800'
          }`}
          title="View current Firestore connection status"
        >
          <span className={`w-2 h-2 rounded-full ${cloudStatus.isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`}></span>
          <span className="flex items-center gap-1">
            <span>{cloudStatus.isConnected ? 'Cloud connected' : 'Cloud offline'}</span>
          </span>
        </button>
      </div>

      {/* Right Controls (Matching Image 1) */}
      <div className="flex items-center gap-0.5 sm:gap-3 shrink-0">

        {/* + New Bill [F1 / F2] Button */}
        <button
          onClick={() => {
            onOpenPos();
            setTimeout(() => {
              window.dispatchEvent(new CustomEvent('pharmacy:new-bill'));
              window.dispatchEvent(new CustomEvent('pharmacy:focus-search'));
            }, 60);
          }}
          className="min-w-10 min-h-10 sm:min-h-0 flex items-center justify-center gap-1.5 px-2 sm:px-3.5 py-1.5 rounded-xl bg-[#00897b] hover:bg-[#00796b] text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-95 text-white"
          title="Create New Sale Bill & Focus Search [F1 / F2]"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">New Bill</span>
          <span className="hidden sm:inline text-[10px] bg-white/20 px-1 py-0.2 rounded font-mono">F1</span>
        </button>

        {/* AI Assistant Button */}
        {onOpenAIAssistant && (
          <button
            onClick={onOpenAIAssistant}
            className="min-w-10 min-h-10 sm:min-h-0 flex items-center justify-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-xl bg-gradient-to-r from-teal-600 via-emerald-600 to-teal-700 hover:from-teal-700 hover:to-emerald-800 text-white text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-95"
            title="Open Dr. Maya AI Pharmacy Assistant [F4]"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-200" />
            <span className="hidden sm:inline">Ask AI</span>
            <span className="hidden min-[400px]:inline text-[10px] bg-white/20 px-1 py-0.2 rounded font-mono">F4</span>
          </button>
        )}

        {/* Notification Bell */}
        <button
          type="button"
          onClick={() => alert(
            cloudStatus.isConnected
              ? 'Firestore connection is active.'
              : cloudStatus.error || 'Firestore is offline. Verify network access before relying on cloud backups.'
          )}
          className="hidden sm:block p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          title="System Notifications"
        >
          <Bell className="w-4 h-4" />
        </button>

        {/* User Badge with Dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowStaffDropdown(!showStaffDropdown)}
            className="min-w-10 min-h-10 flex items-center justify-center sm:justify-start gap-2 sm:pl-2 sm:pr-1.5 py-1 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer"
            aria-label="Open staff menu"
          >
            <div className="text-right hidden sm:block">
              <div className="text-xs font-bold text-slate-800 leading-tight">
                {activeStaff.username || 'Ganesha7'}
              </div>
              <div className="text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200/80 px-1.5 py-0.2 rounded mt-0.5 inline-block">
                {activeStaff.role === 'Admin' ? 'Owner / Admin' : activeStaff.role}
              </div>
            </div>

            {/* Avatar Circle OW */}
            <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center border border-slate-300">
              {getInitials(activeStaff.name, activeStaff.role)}
            </div>
          </button>

          {/* Dropdown Menu */}
          {showStaffDropdown && (
            <div className="absolute right-0 mt-1.5 w-60 bg-white rounded-2xl shadow-xl border border-slate-200 py-1.5 z-50 text-xs animate-in fade-in">
              <div className="px-3 py-1.5 border-b border-slate-100 font-semibold text-slate-500 text-[11px] uppercase tracking-wider flex items-center justify-between">
                <span>Switch Shift Staff</span>
                <Lock className="w-3 h-3 text-slate-400" />
              </div>
              <div className="py-1">
                {allStaff.map(staff => (
                  <button
                    key={staff.id}
                    onClick={() => {
                      onSwitchStaff(staff.id);
                      setShowStaffDropdown(false);
                    }}
                    className={`w-full text-left px-3 py-2 flex items-center justify-between hover:bg-slate-50 transition-colors ${
                      activeStaff.id === staff.id ? 'bg-emerald-50 text-emerald-800 font-semibold' : 'text-slate-700'
                    }`}
                  >
                    <div>
                      <div className="font-medium">{staff.name}</div>
                      <div className="text-[10px] text-slate-400">{staff.role}</div>
                    </div>
                    {activeStaff.id === staff.id && (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    )}
                  </button>
                ))}

                <div className="border-t border-slate-100 mt-1 pt-1">
                  <button
                    onClick={() => {
                      setShowStaffDropdown(false);
                      onLogout();
                    }}
                    className="w-full text-left px-3 py-1.5 flex items-center gap-2 text-rose-600 hover:bg-rose-50 font-bold transition-colors"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Lock Terminal / Logout</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Direct Logout / Exit Icon (Matching Image 1) */}
        <button
          onClick={onLogout}
          className="hidden sm:block p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
          title="Sign Out / Lock Terminal"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>

      {/* Cloud Sync Status Modal */}
      {showCloudModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden text-slate-800">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-teal-800 to-emerald-900 px-5 py-4 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center text-teal-300">
                  <Cloud className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm tracking-tight">Firestore Cloud Sync</h3>
                  <p className="text-[11px] text-teal-200">Connection status for this store</p>
                </div>
              </div>
              <button
                onClick={() => setShowCloudModal(false)}
                className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4 text-xs">
              {/* Status Banner */}
              <div className={`p-3 rounded-xl border flex items-start gap-3 ${
                cloudStatus.isConnected
                  ? 'bg-emerald-50 border-emerald-200'
                  : 'bg-amber-50 border-amber-200'
              }`}>
                <span className={`w-2.5 h-2.5 rounded-full mt-1 shrink-0 ${
                  cloudStatus.isConnected ? 'bg-emerald-500 animate-ping' : 'bg-amber-500'
                }`}></span>
                <div>
                  <div className={`font-bold text-xs ${cloudStatus.isConnected ? 'text-emerald-900' : 'text-amber-900'}`}>
                    {cloudStatus.isConnected ? 'Firestore connection confirmed' : 'Firestore is offline'}
                  </div>
                  <div className={`text-[11px] mt-0.5 ${cloudStatus.isConnected ? 'text-emerald-700' : 'text-amber-800'}`}>
                    {cloudStatus.error || (cloudStatus.isConnected
                      ? 'Cloud updates are available. Confirm each sale or purchase is saved before closing the terminal.'
                      : 'Changes may remain only on this device until Firestore reconnects.')}
                  </div>
                </div>
              </div>

              {/* Synchronized Device Matrix */}
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2.5">
                <div className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                  Supported Synchronized Terminals
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-2xs">
                    <Laptop className="w-4 h-4 text-teal-700 mx-auto mb-1" />
                    <div className="font-bold text-slate-800 text-[11px]">PC & Mac</div>
                    <div className="text-[9px] text-slate-500 font-semibold">Browser app</div>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-2xs">
                    <Smartphone className="w-4 h-4 text-teal-700 mx-auto mb-1" />
                    <div className="font-bold text-slate-800 text-[11px]">Mobiles</div>
                    <div className="text-[9px] text-slate-500 font-semibold">Browser app</div>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-2xs">
                    <Tablet className="w-4 h-4 text-teal-700 mx-auto mb-1" />
                    <div className="font-bold text-slate-800 text-[11px]">Tablets</div>
                    <div className="text-[9px] text-slate-500 font-semibold">Browser app</div>
                  </div>
                </div>
              </div>

              {/* Technical Cloud Metadata */}
              <div className="space-y-1.5 bg-slate-50 p-3 rounded-xl border border-slate-200 font-mono text-[11px]">
                <div className="flex justify-between items-center text-slate-600">
                  <span>Cloud Instance:</span>
                  <span className="font-bold text-slate-800 text-[10px] truncate max-w-[200px]" title={cloudStatus.databaseName}>
                    {cloudStatus.databaseName.slice(0, 24)}...
                  </span>
                </div>
                <div className="flex justify-between items-center text-slate-600">
                  <span>Sync Protocol:</span>
                  <span className="font-bold text-emerald-700">Firestore WebSocket onSnapshot</span>
                </div>
                <div className="flex justify-between items-center text-slate-600">
                  <span>Local Acceleration:</span>
                  <span className="font-bold text-indigo-700">IndexedDB + Memory Cache</span>
                </div>
                <div className="flex justify-between items-center text-slate-600">
                  <span>Last Live Event:</span>
                  <span className="text-slate-800 font-sans">
                    {cloudStatus.lastSyncTime ? cloudStatus.lastSyncTime.toLocaleTimeString() : 'Not confirmed'}
                  </span>
                </div>
              </div>

              {/* Action Button */}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    void StorageService.syncFromCloudAuthoritative();
                    setShowCloudModal(false);
                  }}
                  className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-teal-700 to-emerald-700 hover:from-teal-800 hover:to-emerald-800 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs transition-all cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Re-check & Refresh Cloud State</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
