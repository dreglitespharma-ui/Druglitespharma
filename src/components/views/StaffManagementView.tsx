import React, { useEffect, useState } from 'react';
import { UserCheck, Plus, Edit3, Trash2, Shield, Phone, Mail, X, CheckCircle2, Lock, AlertTriangle, UserPlus } from 'lucide-react';
import { StaffAccountRequest, StaffMember, StaffRole } from '../../types/pharmacy';
import { sound } from '../../utils/sound';
import { FirestoreSyncService } from '../../firebase/firestoreService';

const STAFF_ROLES: StaffRole[] = ['Admin', 'Pharmacist', 'Cashier', 'Inventory Manager'];

interface StaffManagementViewProps {
  staffList: StaffMember[];
  activeStaff: StaffMember;
  onAddStaff: (staff: StaffMember) => void;
  onUpdateStaff: (staff: StaffMember) => void;
  onDeleteStaff: (staffId: string) => void;
  onSwitchStaff: (staffId: string) => void;
}

export const StaffManagementView: React.FC<StaffManagementViewProps> = ({
  staffList,
  activeStaff,
  onAddStaff,
  onUpdateStaff,
  onDeleteStaff,
  onSwitchStaff,
}) => {
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);
  const [staffToDelete, setStaffToDelete] = useState<StaffMember | null>(null);
  const [actionAlert, setActionAlert] = useState<{ title: string; message: string } | null>(null);
  const [deleteSuccessName, setDeleteSuccessName] = useState<string | null>(null);
  const [accountRequests, setAccountRequests] = useState<StaffAccountRequest[]>([]);
  const [requestRoles, setRequestRoles] = useState<Record<string, StaffRole>>({});
  const [isLoadingRequests, setIsLoadingRequests] = useState<boolean>(false);
  const [processingRequestUid, setProcessingRequestUid] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [requestNotice, setRequestNotice] = useState<string | null>(null);

  useEffect(() => {
    if (activeStaff.role !== 'Admin') return;
    let cancelled = false;
    setIsLoadingRequests(true);
    setRequestError(null);
    void FirestoreSyncService.getPendingAccountRequests()
      .then(requests => {
        if (!cancelled) {
          setAccountRequests(requests);
          setRequestRoles(Object.fromEntries(requests.map(request => [request.uid, 'Pharmacist'])));
        }
      })
      .catch(error => {
        console.error('[StaffManagement] Could not load account requests:', error);
        if (!cancelled) setRequestError(error instanceof Error ? error.message : 'Could not load account requests.');
      })
      .finally(() => {
        if (!cancelled) setIsLoadingRequests(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeStaff.role]);

  // Form State
  const [name, setName] = useState<string>('');
  const [username, setUsername] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [role, setRole] = useState<StaffRole>('Pharmacist');
  const [regNo, setRegNo] = useState<string>('');

  const activeCount = staffList.filter(s => s.status === 'Active').length;
  const deactivatedCount = staffList.filter(s => s.status === 'Deactivated').length;

  const handleOpenAdd = () => {
    setEditingStaff(null);
    setName('');
    setUsername('');
    setPhone('');
    setEmail('');
    setRole('Pharmacist');
    setRegNo('KA-PH-');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (staff: StaffMember) => {
    setEditingStaff(staff);
    setName(staff.name);
    setUsername(staff.username);
    setPhone(staff.phone);
    setEmail(staff.email);
    setRole(staff.role);
    setRegNo(staff.pharmacistRegNo || '');
    setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !username.trim()) return;

    if (editingStaff) {
      const updated: StaffMember = {
        ...editingStaff,
        name,
        username,
        phone,
        email,
        role,
        pharmacistRegNo: regNo || undefined,
      };
      onUpdateStaff(updated);
      sound.playSuccessChime();
    } else {
      const newStaff: StaffMember = {
        id: `staff-${Date.now()}`,
        name,
        username,
        phone,
        email,
        role,
        pharmacistRegNo: regNo || undefined,
        status: 'Active',
        createdDate: new Date().toISOString().split('T')[0],
      };
      onAddStaff(newStaff);
      sound.playSuccessChime();
    }

    setIsModalOpen(false);
  };

  const handleDeleteClick = (staff: StaffMember) => {
    if (activeStaff.role !== 'Admin') {
      setActionAlert({
        title: 'Admin / Owner Privileges Required',
        message: 'Only the Store Owner or an Administrator can delete staff accounts. Please switch to an Admin account to manage team access.',
      });
      return;
    }

    const adminCount = staffList.filter(s => s.role === 'Admin').length;
    if (staff.role === 'Admin' && adminCount <= 1) {
      setActionAlert({
        title: 'Protected Primary Admin',
        message: 'Cannot delete the primary Store Owner / Admin account. At least one Administrator account must remain active.',
      });
      return;
    }

    if (staff.id === activeStaff.id) {
      setActionAlert({
        title: 'Current Active Session',
        message: 'You cannot delete your own active login session. Please switch to another account before removing this user profile.',
      });
      return;
    }

    setStaffToDelete(staff);
  };

  const handleConfirmDelete = () => {
    if (!staffToDelete) return;
    const removedName = staffToDelete.name;
    onDeleteStaff(staffToDelete.id);
    setStaffToDelete(null);
    sound.playWarningBeep();
    setDeleteSuccessName(removedName);
    setTimeout(() => setDeleteSuccessName(null), 3500);
  };

  const handleApproveRequest = async (request: StaffAccountRequest) => {
    setProcessingRequestUid(request.uid);
    setRequestError(null);
    setRequestNotice(null);
    try {
      await FirestoreSyncService.approveAccountRequest(request, requestRoles[request.uid] || 'Pharmacist');
      setAccountRequests(current => current.filter(item => item.uid !== request.uid));
      setRequestNotice(`Approved ${request.name}. They can now sign in with their registered email and password.`);
      sound.playSuccessChime();
    } catch (error) {
      console.error('[StaffManagement] Could not approve account request:', error);
      setRequestError(error instanceof Error ? error.message : 'Could not approve this account request.');
    } finally {
      setProcessingRequestUid(null);
    }
  };

  const handleRejectRequest = async (request: StaffAccountRequest) => {
    setProcessingRequestUid(request.uid);
    setRequestError(null);
    setRequestNotice(null);
    try {
      await FirestoreSyncService.rejectAccountRequest(request);
      setAccountRequests(current => current.filter(item => item.uid !== request.uid));
      setRequestNotice(`Rejected the account request from ${request.name}.`);
      sound.playWarningBeep();
    } catch (error) {
      console.error('[StaffManagement] Could not reject account request:', error);
      setRequestError(error instanceof Error ? error.message : 'Could not reject this account request.');
    } finally {
      setProcessingRequestUid(null);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      {/* Success Notification Banner */}
      {deleteSuccessName && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-center justify-between shadow-xs animate-in fade-in duration-200">
          <div className="flex items-center gap-2 font-medium">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Staff member <strong>{deleteSuccessName}</strong> was successfully deleted.</span>
          </div>
          <button
            onClick={() => setDeleteSuccessName(null)}
            className="text-emerald-700 hover:text-emerald-900 text-xs font-semibold px-2 py-0.5 rounded cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}
      {/* Header */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-800">Staff Management & Access Control</h2>
          <p className="text-xs text-slate-500">
            Pharmacist Licensure, Cashier Terminal Privileges & Shift Authentication
          </p>
        </div>

        <button
          onClick={handleOpenAdd}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-98"
        >
          <Plus className="w-4 h-4" />
          <span>+ Add Staff Account</span>
        </button>
      </div>

      {activeStaff.role === 'Admin' && (
        <section className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-emerald-700" />
              <div>
                <h3 className="text-sm font-bold text-slate-800">Account Access Requests</h3>
                <p className="text-[11px] text-slate-500">Approve requests to create linked staff sign-ins.</p>
              </div>
            </div>
            <span className="px-2 py-1 rounded-full bg-amber-50 text-amber-800 text-[11px] font-bold">
              {accountRequests.length} pending
            </span>
          </div>

          <div className="p-4 space-y-3">
            {requestError && (
              <p role="alert" className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs">{requestError}</p>
            )}
            {requestNotice && (
              <p role="status" className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs">{requestNotice}</p>
            )}
            {isLoadingRequests ? (
              <p className="text-xs text-slate-500">Loading access requests…</p>
            ) : accountRequests.length === 0 ? (
              <p className="text-xs text-slate-500">There are no pending account requests.</p>
            ) : accountRequests.map(request => (
              <div key={request.uid} className="p-3 rounded-lg border border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-900">{request.name}</p>
                  <p className="text-[11px] text-slate-600 break-all">{request.email}</p>
                  {request.phone && <p className="text-[11px] text-slate-500">{request.phone}</p>}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={requestRoles[request.uid] || 'Pharmacist'}
                    onChange={event => {
                      const selectedRole = STAFF_ROLES.find(item => item === event.target.value);
                      if (selectedRole) {
                        setRequestRoles(current => ({ ...current, [request.uid]: selectedRole }));
                      }
                    }}
                    disabled={processingRequestUid === request.uid}
                    aria-label={`Role for ${request.name}`}
                    className="px-2.5 py-2 border border-slate-300 rounded-lg text-xs bg-white"
                  >
                    <option value="Pharmacist">Pharmacist</option>
                    <option value="Cashier">Cashier</option>
                    <option value="Inventory Manager">Inventory Manager</option>
                    <option value="Admin">Admin</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => void handleApproveRequest(request)}
                    disabled={processingRequestUid === request.uid}
                    className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold disabled:opacity-50"
                  >
                    {processingRequestUid === request.uid ? 'Saving…' : 'Approve'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleRejectRequest(request)}
                    disabled={processingRequestUid === request.uid}
                    className="px-3 py-2 rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50 text-xs font-bold disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Top 3 Metric Cards (Matching Video 2:33) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs font-bold text-slate-500 uppercase">TOTAL STAFF MEMBERS</span>
          <div className="text-2xl font-extrabold text-slate-900 mt-2 font-mono">
            {staffList.length}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Authorized store personnel</p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs font-bold text-slate-500 uppercase">ACTIVE SESSIONS</span>
          <div className="text-2xl font-extrabold text-emerald-600 mt-2 font-mono">
            {activeCount}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Logged into terminal</p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs font-bold text-slate-500 uppercase">DEACTIVATED ACCOUNTS</span>
          <div className="text-2xl font-extrabold text-slate-400 mt-2 font-mono">
            {deactivatedCount}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Suspended permissions</p>
        </div>
      </div>

      {/* Staff Table (Matching Video 2:35) */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 font-semibold text-slate-600 uppercase text-[10px] tracking-wider">
                <th className="p-3">Staff Name & Username</th>
                <th className="p-3">Contact Info</th>
                <th className="p-3">Role & Permissions</th>
                <th className="p-3 text-center">Status</th>
                <th className="p-3 text-center">Active Cashier</th>
                <th className="p-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
              {staffList.map(staff => {
                const isCurrent = activeStaff.id === staff.id;

                return (
                  <tr key={staff.id} className="hover:bg-slate-50/60">
                    <td className="p-3">
                      <div className="font-bold text-slate-900">{staff.name}</div>
                      <div className="text-[11px] text-slate-400 font-mono">@{staff.username}</div>
                      {staff.pharmacistRegNo && (
                        <div className="text-[10px] text-emerald-700 font-bold mt-0.5">
                          Reg No: {staff.pharmacistRegNo}
                        </div>
                      )}
                    </td>

                    <td className="p-3 font-mono text-slate-700">
                      <div>{staff.phone}</div>
                      <div className="text-[11px] text-slate-400">{staff.email}</div>
                    </td>

                    <td className="p-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${
                        staff.role === 'Admin'
                          ? 'bg-purple-100 text-purple-800'
                          : staff.role === 'Pharmacist'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}>
                        <Shield className="w-3 h-3" />
                        {staff.role}
                      </span>
                    </td>

                    <td className="p-3 text-center">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        staff.status === 'Active'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-slate-100 text-slate-500'
                      }`}>
                        ● {staff.status}
                      </span>
                    </td>

                    <td className="p-3 text-center">
                      {isCurrent ? (
                        <span className="px-2 py-0.5 bg-emerald-600 text-white rounded text-[10px] font-bold">
                          Current Session
                        </span>
                      ) : (
                        <button
                          onClick={() => onSwitchStaff(staff.id)}
                          className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[10px] font-semibold transition-colors"
                        >
                          Switch User
                        </button>
                      )}
                    </td>

                    <td className="p-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => handleOpenEdit(staff)}
                          className="p-1.5 rounded-lg border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50 text-slate-600 hover:text-emerald-700 transition-colors cursor-pointer"
                          title="Edit Staff Account"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteClick(staff)}
                          className="p-1.5 rounded-lg border border-slate-200 hover:border-rose-400 hover:bg-rose-50 text-slate-500 hover:text-rose-600 transition-colors cursor-pointer"
                          title="Delete Staff Account"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create / Edit Staff Account Modal (Matching Video 2:36 - 2:47) */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center">
                  <UserCheck className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-sm">
                    {editingStaff ? 'Edit Staff Profile' : 'Create Staff Profile'}
                  </h3>
                  <p className="text-[11px] text-slate-500">Staff details and pharmacy role</p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Full Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Priya Sharma"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs focus:outline-emerald-600"
                />
              </div>

              <div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Username *</label>
                  <input
                    type="text"
                    required
                    placeholder="priya_pharma"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-mono focus:outline-emerald-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Phone Number</label>
                  <input
                    type="tel"
                    placeholder="9876543210"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-mono focus:outline-emerald-600"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Email</label>
                  <input
                    type="email"
                    placeholder="priya@drugslites.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs focus:outline-emerald-600"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Role & Permissions</label>
                <select
                  value={role}
                  onChange={e => setRole(e.target.value as StaffRole)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs focus:outline-emerald-600 bg-white"
                >
                  <option value="Admin">Admin (Full Store Control)</option>
                  <option value="Pharmacist">Pharmacist (Dispensing & Schedule Rx)</option>
                  <option value="Cashier">Cashier (POS Billing Only)</option>
                  <option value="Inventory Manager">Inventory Manager (Stock & Inward)</option>
                </select>
              </div>

              {role === 'Pharmacist' && (
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    State Pharmacy Council Registration No.
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. KA-PH-58219"
                    value={regNo}
                    onChange={e => setRegNo(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-mono focus:outline-emerald-600"
                  />
                </div>
              )}

              <p className="text-[11px] leading-relaxed text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                This creates a staff profile only. To create a sign-in, ask the person to submit an account request and approve it above.
              </p>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3 py-1.5 border border-slate-200 text-slate-700 rounded-lg text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-xs cursor-pointer"
                >
                  {editingStaff ? 'Save Profile' : 'Create Profile'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Staff In-App Confirmation Modal (Ensures 100% reliable deletion without iframe alert blocks) */}
      {staffToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-rose-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Delete Staff Account</h3>
                  <p className="text-[11px] text-slate-500">Revoke system access and credential profile</p>
                </div>
              </div>
              <button
                onClick={() => setStaffToDelete(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-3.5">
              <p className="text-xs text-slate-700 leading-relaxed">
                Are you sure you want to permanently delete the account for{' '}
                <strong className="text-slate-900 font-bold">{staffToDelete.name}</strong>?
              </p>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1.5 font-sans">
                <div className="flex justify-between text-slate-600">
                  <span>Username:</span>
                  <span className="font-mono font-bold text-slate-800">@{staffToDelete.username}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>System Role:</span>
                  <span className="font-bold text-emerald-700">{staffToDelete.role}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Contact:</span>
                  <span className="text-slate-700">{staffToDelete.phone || 'N/A'}</span>
                </div>
              </div>

              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200/80 flex items-start gap-2.5 text-amber-800 text-[11px]">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <p>
                  This will immediately remove this staff member's login access, POS billing rights, and shift sessions.
                </p>
              </div>

              <div className="pt-2 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setStaffToDelete(null)}
                  className="px-3.5 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Yes, Delete Account</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Permission / Action Notice Modal */}
      {actionAlert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-sm w-full shadow-2xl border border-slate-200 p-5 space-y-3.5">
            <div className="w-11 h-11 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="text-center space-y-1">
              <h3 className="text-sm font-bold text-slate-900">{actionAlert.title}</h3>
              <p className="text-xs text-slate-600 leading-relaxed">{actionAlert.message}</p>
            </div>
            <div className="pt-2 flex justify-center">
              <button
                type="button"
                onClick={() => setActionAlert(null)}
                className="w-full py-2 bg-[#00796b] hover:bg-[#00695c] text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
              >
                Understood
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
