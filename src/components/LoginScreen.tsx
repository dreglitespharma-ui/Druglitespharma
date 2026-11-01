import React, { useState } from 'react';
import { 
  Plus, 
  ShieldCheck, 
  User, 
  Lock, 
  Eye, 
  EyeOff, 
  CheckCircle2,
  Phone
} from 'lucide-react';
import {
  browserLocalPersistence,
  browserSessionPersistence,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { auth } from '../firebase/config';
import { FirestoreSyncService } from '../firebase/firestoreService';
import { StaffMember } from '../types/pharmacy';
import { sound } from '../utils/sound';

interface LoginScreenProps {
  onLoginSuccess: (staff: StaffMember, rememberDevice: boolean) => Promise<void> | void;
  onRegistrationFlowChange: (inProgress: boolean) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({
  onLoginSuccess,
  onRegistrationFlowChange,
}) => {
  const [identifier, setIdentifier] = useState<string>(() => {
    const savedEmail = localStorage.getItem('drugs_lites_saved_username') || '';
    return savedEmail.includes('@') ? savedEmail : '';
  });
  const [password, setPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [fullName, setFullName] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [isCreatingAccount, setIsCreatingAccount] = useState<boolean>(false);
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [rememberTerminal, setRememberTerminal] = useState<boolean>(() => {
    return localStorage.getItem('drugs_lites_remember_device') === 'true';
  });
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [noticeMessage, setNoticeMessage] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isSendingReset, setIsSendingReset] = useState<boolean>(false);

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setErrorMessage('');
    setNoticeMessage('');

    const cleanInput = identifier.trim().toLowerCase();
    const cleanPass = password;

    if (!cleanInput || !cleanPass) {
      sound.playWarningBeep();
      setErrorMessage('Enter the email address and password for your Firebase staff account.');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanInput)) {
      sound.playWarningBeep();
      setErrorMessage('Enter the email address registered to your Firebase staff account.');
      return;
    }

    setIsSubmitting(true);
    onRegistrationFlowChange(true);
    try {
      await setPersistence(auth, rememberTerminal ? browserLocalPersistence : browserSessionPersistence);
      const { user } = await signInWithEmailAndPassword(auth, cleanInput, cleanPass);
      let staff: StaffMember;
      try {
        staff = await FirestoreSyncService.getAuthenticatedStaff();
      } catch (error) {
        if (!(error instanceof Error) || !error.message.includes('not linked to an authorized pharmacy staff profile')) {
          throw error;
        }

        await FirestoreSyncService.submitAccountRequest(user.displayName || '', '');
        await signOut(auth);
        onRegistrationFlowChange(false);
        setNoticeMessage('Your access request has been submitted. An administrator must approve it before you can sign in.');
        setIsSubmitting(false);
        return;
      }

      onRegistrationFlowChange(false);
      localStorage.setItem('drugs_lites_remember_device', rememberTerminal ? 'true' : 'false');
      if (rememberTerminal) {
        localStorage.setItem('drugs_lites_saved_username', cleanInput);
      } else {
        localStorage.removeItem('drugs_lites_saved_username');
      }
      await onLoginSuccess(staff, rememberTerminal);
    } catch (err) {
      await signOut(auth).catch(signOutError => {
        console.error('[Login] Failed to clear an unsuccessful Firebase session:', signOutError);
      });
      onRegistrationFlowChange(false);
      sound.playWarningBeep();
      const code = typeof err === 'object' && err !== null && 'code' in err ? String(err.code) : '';
      setErrorMessage(
        code === 'auth/operation-not-allowed'
          ? 'Email/password sign-in is disabled in this Firebase project. Ask the project administrator to enable Email/Password under Firebase Console → Authentication → Sign-in method.'
          : code === 'auth/invalid-credential' || code === 'auth/user-not-found' || code === 'auth/wrong-password'
            ? 'Email or password is incorrect, or this account is not authorized for this pharmacy.'
            : err instanceof Error
              ? err.message
              : 'Could not sign in. Check your connection and contact the store administrator.'
      );
      setIsSubmitting(false);
    }
  };

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setErrorMessage('');
    setNoticeMessage('');

    const email = identifier.trim().toLowerCase();
    if (!fullName.trim()) {
      setErrorMessage('Enter your full name.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setErrorMessage('Enter a valid email address.');
      return;
    }
    if (password.length < 6) {
      setErrorMessage('Your password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage('The passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    onRegistrationFlowChange(true);
    try {
      await setPersistence(auth, browserSessionPersistence);
      const { user } = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(user, { displayName: fullName.trim() });
      await FirestoreSyncService.submitAccountRequest(fullName, phone);
      await signOut(auth);
      onRegistrationFlowChange(false);
      setIsCreatingAccount(false);
      setPassword('');
      setConfirmPassword('');
      setNoticeMessage('Account created and access request sent. An administrator must approve your request before you can sign in.');
    } catch (error) {
      if (auth.currentUser) {
        await signOut(auth).catch(signOutError => {
          console.error('[Login] Failed to clear the new Firebase session:', signOutError);
        });
      }
      onRegistrationFlowChange(false);
      sound.playWarningBeep();
      const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
      setErrorMessage(
        code === 'auth/operation-not-allowed'
          ? 'Account creation is disabled in this Firebase project. Ask the project administrator to enable Email/Password under Firebase Console → Authentication → Sign-in method, then try again.'
          : code === 'auth/email-already-in-use'
            ? 'An account already exists for this email. Sign in to submit or check your access request.'
            : code === 'auth/weak-password'
              ? 'Choose a stronger password with at least 6 characters.'
              : error instanceof Error
                ? error.message
                : 'Could not create your account. Check your connection and try again.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePasswordReset = async () => {
    const email = identifier.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setErrorMessage('Enter your staff account email first to request a password reset.');
      return;
    }

    setIsSendingReset(true);
    setErrorMessage('');
    try {
      await sendPasswordResetEmail(auth, email);
      setNoticeMessage('If a Firebase staff account exists for this email, password reset instructions have been sent.');
    } catch (err) {
      const code = typeof err === 'object' && err !== null && 'code' in err ? String(err.code) : '';
      if (code === 'auth/user-not-found') {
        setNoticeMessage('If a Firebase staff account exists for this email, password reset instructions have been sent.');
      } else {
        setErrorMessage(err instanceof Error ? err.message : 'Unable to send password reset instructions.');
      }
    } finally {
      setIsSendingReset(false);
    }
  };

  return (
    <div className="min-h-dvh bg-[#ecf2f1] flex items-center justify-center p-3 sm:p-6 font-sans select-none">
      {/* Main Login Card matching user reference design exactly */}
      <div className="bg-white rounded-[28px] max-w-sm sm:max-w-md w-full shadow-xl border border-slate-200/80 p-5 sm:p-8 space-y-5 relative animate-in fade-in duration-200">
        
        {/* Top Logo - Medical Cross with Teal Gradient Squircle */}
        <div className="flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-[22px] bg-[#00796b] text-white flex items-center justify-center shadow-md shadow-teal-950/20 mb-3">
            <Plus className="w-10 h-10 text-white" strokeWidth={3.5} />
          </div>

          {/* Brand Header */}
          <div className="flex items-center justify-center gap-1.5 leading-none">
            <span className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">DRUGS LITES</span>
            <span className="text-xl sm:text-2xl font-black text-[#00796b] tracking-tight">PHARMA</span>
          </div>

          <p className="text-xs sm:text-sm text-slate-600 font-medium mt-1.5">
            Medical Store Management & Point of Sale
          </p>

          {/* License Badge */}
          <div className="mt-2.5 inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-[#e0f2f1] text-[#00695c] border border-[#80cbc4] text-[11px] font-semibold">
            <ShieldCheck className="w-3.5 h-3.5 text-[#00796b]" />
            <span>Pharmacy records • Form 20B/21B</span>
          </div>
        </div>

        {/* Login Form */}
        <form onSubmit={isCreatingAccount ? handleCreateAccount : handleFormSubmit} className="space-y-4 pt-1">
          {isCreatingAccount && (
            <>
              <div>
                <label className="text-xs font-bold text-slate-800 block mb-1">Full name</label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                  <input
                    type="text"
                    required
                    maxLength={200}
                    placeholder="Enter your full name"
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    className="w-full pl-10 pr-3 py-2.5 bg-slate-50/70 border border-slate-300 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-1 focus:ring-[#00796b]"
                    autoComplete="name"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-800 block mb-1">Phone (optional)</label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                  <input
                    type="tel"
                    maxLength={50}
                    placeholder="Enter your phone number"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    className="w-full pl-10 pr-3 py-2.5 bg-slate-50/70 border border-slate-300 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-1 focus:ring-[#00796b]"
                    autoComplete="tel"
                  />
                </div>
              </div>
            </>
          )}
          {/* Email / Username / Mobile */}
          <div>
            <label className="text-xs font-bold text-slate-800 block mb-1">
              {isCreatingAccount ? 'Email address' : 'Staff account email'}
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                type="email"
                required
                placeholder={isCreatingAccount ? 'Enter your email address' : 'Enter your Firebase account email'}
                value={identifier}
                onChange={e => {
                  setIdentifier(e.target.value);
                  if (errorMessage) setErrorMessage('');
                }}
                className="w-full pl-10 pr-3 py-2.5 bg-slate-50/70 hover:bg-white focus:bg-white border border-slate-300 rounded-xl text-xs sm:text-sm font-medium focus:outline-none focus:ring-1 focus:ring-[#00796b] focus:border-[#00796b] transition-all text-slate-800 placeholder-slate-400"
                autoComplete={isCreatingAccount ? 'email' : 'username'}
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-bold text-slate-800">Staff password</label>
              {!isCreatingAccount && <button
                type="button"
                onClick={handlePasswordReset}
                disabled={isSendingReset}
                className="text-[11px] font-bold text-[#00796b] hover:underline cursor-pointer"
              >
                {isSendingReset ? 'Sending reset email…' : 'Forgot password?'}
              </button>}
            </div>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                placeholder="Enter password"
                value={password}
                onChange={e => {
                  setPassword(e.target.value);
                  if (errorMessage) setErrorMessage('');
                }}
                className="w-full pl-10 pr-10 py-2.5 bg-slate-50/70 hover:bg-white focus:bg-white border border-slate-300 rounded-xl text-xs sm:text-sm font-medium focus:outline-none focus:ring-1 focus:ring-[#00796b] focus:border-[#00796b] transition-all text-slate-800 placeholder-slate-400"
                autoComplete={isCreatingAccount ? 'new-password' : 'current-password'}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer p-0.5"
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4 text-slate-400" />}
              </button>
            </div>
          </div>

          {isCreatingAccount && (
            <div>
              <label className="text-xs font-bold text-slate-800 block mb-1">Confirm password</label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-50/70 border border-slate-300 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-1 focus:ring-[#00796b]"
                autoComplete="new-password"
              />
            </div>
          )}

          {/* Remember this terminal */}
          {!isCreatingAccount && <div className="flex items-center gap-2 pt-0.5">
            <input
              type="checkbox"
              id="rememberTerminal"
              checked={rememberTerminal}
              onChange={e => setRememberTerminal(e.target.checked)}
              className="w-4 h-4 rounded text-[#00796b] focus:ring-[#00796b] border-slate-300 cursor-pointer"
            />
            <label htmlFor="rememberTerminal" className="text-xs font-bold text-slate-700 cursor-pointer">
              Remember this terminal
            </label>
          </div>}

          {errorMessage && (
            <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
              {errorMessage}
            </div>
          )}
          {noticeMessage && (
            <div role="status" className="p-2.5 rounded-xl bg-teal-50 border border-teal-200 text-teal-800 text-xs font-medium">
              {noticeMessage}
            </div>
          )}

          {/* Primary CTA Button */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3 bg-[#00695c] hover:bg-[#004d40] text-white font-extrabold rounded-xl text-xs sm:text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-98 tracking-wide mt-2 disabled:opacity-80 disabled:cursor-wait"
          >
            {isSubmitting ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Connecting & Loading Live Store...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4 text-white" />
                <span>{isCreatingAccount ? 'Create account & request access' : 'Log in to DRUGS LITES PHARMA'}</span>
              </>
            )}
          </button>
        </form>

        <div className="text-center">
          <button
            type="button"
            onClick={() => {
              setIsCreatingAccount(value => !value);
              setErrorMessage('');
              setNoticeMessage('');
            }}
            className="text-xs font-bold text-[#00796b] hover:underline"
          >
            {isCreatingAccount ? 'Already registered? Log in' : 'New staff member? Create an account'}
          </button>
        </div>

        <div className="pt-2 text-center">
          <p className="text-[11px] text-slate-500">
            {isCreatingAccount
              ? 'Your account remains locked until a store administrator approves your access request.'
              : 'Access requires an active Firebase account linked by your store administrator.'}
          </p>
        </div>

        {/* Subtle Footer Note */}
        <div className="pt-2 text-center border-t border-slate-100 space-y-1">
          <p className="text-[11px] text-slate-400">
            Firebase Authentication and authorized Firestore access are required.
          </p>
          <div className="flex items-center justify-center gap-1.5 text-[10px] text-teal-700/80 font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
            <span>Firebase Authentication Required</span>
          </div>
        </div>
      </div>
    </div>
  );
};
