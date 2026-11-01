import React from 'react';
import { 
  LayoutDashboard, 
  ShoppingCart, 
  Pill, 
  CalendarClock, 
  Truck, 
  FileText, 
  Users, 
  Wallet, 
  BarChart3, 
  UserCheck, 
  Settings, 
  ShieldCheck,
  PlusCircle,
  X,
  Lock,
  Sparkles,
  Bot,
  LogOut
} from 'lucide-react';
import { StaffMember } from '../types/pharmacy';

export type ActiveTab = 
  | 'dashboard'
  | 'pos'
  | 'catalog'
  | 'batches'
  | 'purchases'
  | 'prescription'
  | 'customers'
  | 'expenses'
  | 'reports'
  | 'staff'
  | 'settings';

interface SidebarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  onOpenPos: () => void;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
  activeStaff?: StaffMember;
  onOpenAIAssistant?: () => void;
  onLogout?: () => void;
  isCloudConnected?: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({ 
  activeTab, 
  setActiveTab, 
  onOpenPos,
  isMobileOpen = false,
  onCloseMobile,
  activeStaff,
  onOpenAIAssistant,
  onLogout,
  isCloudConnected = false
}) => {
  const isAdmin = activeStaff ? activeStaff.role === 'Admin' : true;

  const menuItems = [
    { id: 'dashboard', label: 'Main Dashboard', icon: LayoutDashboard },
    { id: 'pos', label: 'POS Billing', icon: ShoppingCart, badge: 'F1' },
    { id: 'catalog', label: 'Medicine Catalog', icon: Pill },
    { id: 'batches', label: 'Batches & Expiry', icon: CalendarClock },
    { id: 'purchases', label: 'Purchases & Suppliers', icon: Truck },
    { id: 'prescription', label: 'Prescription Log', icon: FileText, tag: 'Schedule H' },
    { id: 'customers', label: 'Customer CRM', icon: Users },
    { id: 'expenses', label: 'Expenses & Cash', icon: Wallet, adminOnly: true },
    { id: 'reports', label: 'Business Reports', icon: BarChart3 },
    { id: 'staff', label: 'Staff Management', icon: UserCheck, adminOnly: true },
    { id: 'settings', label: 'Settings & Backup', icon: Settings, adminOnly: true },
  ];

  const handleSelectTab = (itemId: string, adminOnly?: boolean) => {
    if (adminOnly && !isAdmin) {
      alert('Access restricted: this section is available to pharmacy Admin accounts only.');
      return;
    }

    if (itemId === 'pos') {
      onOpenPos();
    } else {
      setActiveTab(itemId as ActiveTab);
    }

    if (onCloseMobile) {
      onCloseMobile();
    }
  };

  const sidebarContent = (
    <div className="w-64 bg-slate-900 text-slate-200 flex flex-col shrink-0 h-full min-h-0 border-r border-slate-800 select-none">
      {/* Brand Header */}
      <div className="p-4 border-b border-slate-800/80 bg-slate-950/60 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#00897b] to-[#00695c] flex items-center justify-center text-white shadow-md shadow-teal-950/40">
            <PlusCircle className="w-5 h-5 text-white" strokeWidth={2.5} />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5 leading-tight">
              <span className="font-bold text-white tracking-wide text-base">DRUGS LITES</span>
              <span className="bg-[#00796b]/30 text-[#4db6ac] text-[10px] font-extrabold px-1.5 py-0.5 rounded uppercase tracking-wider border border-[#00796b]/40">
                PHARMA
              </span>
            </div>
            <span className="text-[11px] text-slate-400 font-medium">Enterprise Medical Store</span>
          </div>
        </div>

        {/* Close button on mobile */}
        {onCloseMobile && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onCloseMobile();
            }}
            className="md:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
            title="Close Menu"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <div className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
        <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
          <span>Core Operations</span>
          {activeStaff && (
            <span className="text-[9px] text-[#80cbc4] font-mono lowercase">
              @{activeStaff.username}
            </span>
          )}
        </div>

        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          const isLocked = item.adminOnly && !isAdmin;

          return (
            <button
              key={item.id}
              onClick={() => handleSelectTab(item.id, item.adminOnly)}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
                isActive
                  ? 'bg-[#00796b] text-white shadow-md'
                  : isLocked
                  ? 'text-slate-400 hover:bg-slate-800/40 opacity-75'
                  : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon className={`w-4 h-4 ${isActive ? 'text-white' : isLocked ? 'text-slate-500' : 'text-slate-400'}`} />
                <span>{item.label}</span>
              </div>

              <div className="flex items-center gap-1.5">
                {isLocked && (
                  <span className="text-[10px] text-amber-400 bg-amber-400/10 px-1.5 py-0.2 rounded border border-amber-400/20 flex items-center gap-1">
                    <Lock className="w-2.5 h-2.5" />
                    <span className="hidden sm:inline">Admin</span>
                  </span>
                )}
                {item.badge && (
                  <span className="text-[10px] bg-white/20 text-white px-1.5 py-0.2 rounded font-mono">
                    {item.badge}
                  </span>
                )}
                {isActive && (
                  <span className="text-white text-xs font-bold font-mono">›</span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* AI Assistant Quick Card */}
      {onOpenAIAssistant && (
        <div className="p-3 mx-2 my-2 rounded-xl bg-gradient-to-br from-teal-950/80 to-slate-900 border border-teal-800/60 shadow-inner">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-6 h-6 rounded-lg bg-teal-600 text-white flex items-center justify-center">
              <Bot className="w-3.5 h-3.5" />
            </div>
            <div>
              <span className="text-xs font-bold text-white leading-none">Dr. Maya AI</span>
              <span className="text-[10px] text-teal-300 block">Multimodal Copilot</span>
            </div>
          </div>
          <p className="text-[11px] text-slate-300 mb-2 leading-tight">
            Upload invoices to auto-fill inventory & adjust batches.
          </p>
          <button
            onClick={onOpenAIAssistant}
            className="w-full py-1.5 px-2.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-[11px] font-bold flex items-center justify-center gap-1.5 shadow-xs cursor-pointer transition-colors active:scale-95"
          >
            <Sparkles className="w-3 h-3 text-amber-200" />
            Launch Assistant
          </button>
        </div>
      )}

      {/* Lock / Logout Terminal Button */}
      {onLogout && (
        <div className="px-2 pb-2">
          <button
            type="button"
            onClick={() => {
              if (onCloseMobile) onCloseMobile();
              onLogout();
            }}
            className="w-full flex items-center justify-between px-3.5 py-2 rounded-xl text-xs font-semibold text-rose-300 hover:text-white bg-rose-950/30 hover:bg-rose-900/50 border border-rose-800/40 transition-all cursor-pointer shadow-xs group"
            title="Lock terminal and return to Login Screen"
          >
            <div className="flex items-center gap-2.5">
              <LogOut className="w-3.5 h-3.5 text-rose-400 group-hover:scale-110 transition-transform" />
              <span>Lock / Exit Terminal</span>
            </div>
            <span className="text-[10px] bg-rose-900/60 text-rose-200 px-1.5 py-0.2 rounded font-mono">
              Logout
            </span>
          </button>
        </div>
      )}

      {/* Compliance Footer */}
      <div className="p-3 border-t border-slate-800/80 bg-slate-950/40 text-xs">
        <div className="flex items-center gap-2 text-[#4db6ac] font-medium">
          <ShieldCheck className="w-4 h-4 shrink-0" />
          <span>Pharmacy tools</span>
        </div>
        <div className="text-[11px] text-slate-400 mt-1 pl-6">
          Prescription and expiry tracking
        </div>
        <div className="text-[10px] text-slate-400 mt-2 pt-2 border-t border-slate-800/60 flex items-center justify-between">
          <span>Local data</span>
          <span className={`flex items-center gap-1 ${isCloudConnected ? 'text-[#4db6ac]' : 'text-amber-300'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${isCloudConnected ? 'bg-[#4db6ac] animate-pulse' : 'bg-amber-300'}`}></span>
            {isCloudConnected ? 'Cloud connected' : 'Cloud offline'}
          </span>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Persistent Sidebar */}
      <aside className="hidden md:block shrink-0">
        {sidebarContent}
      </aside>

      {/* Mobile Slide-over Drawer with Backdrop */}
      {isMobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs transition-opacity"
            onClick={onCloseMobile}
          />

          {/* Drawer content */}
          <div className="relative z-10 w-72 max-w-[85vw] h-full shadow-2xl animate-in slide-in-from-left duration-200">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
};
