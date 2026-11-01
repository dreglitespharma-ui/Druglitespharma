import React, { useState } from 'react';
import { 
  Plus, 
  ShieldCheck, 
  User, 
  Lock, 
  Eye, 
  EyeOff, 
  CheckCircle2,
  Info 
} from 'lucide-react';
import { StaffMember } from '../types/pharmacy';
import { sound } from '../utils/sound';
import { setPersistence, browserLocalPersistence, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { auth } from '../firebase/config';
import { FirestoreSyncService } from '../firebase/firestoreService';

interface LoginPageProps {
  onLoginSuccess: (staff: StaffMember) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({
  onLoginSuccess,
}) => {
  const [identifier, setIdentifier] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [showForgotNotice, setShowForgotNotice] = useState<boolean>(false);
  const [isSigningIn, setIsSigningIn] = useState(false);

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setShowForgotNotice(false);

    const cleanInput = identifier.trim();

    if (!cleanInput || !password) {
      sound.playWarningBeep();
      setErrorMessage('Please enter your Firebase staff email and password.');
      return;
    }

    setIsSigningIn(true);
    try {
      await setPersistence(auth, browserLocalPersistence);
      const { user } = await signInWithEmailAndPassword(auth, cleanInput, password);
      const staff = await FirestoreSyncService.getAuthenticatedStaff();
      if (user.uid !== auth.currentUser?.uid) throw new Error('Your Firebase session changed. Sign in again.');
      sound.playSuccessChime();
      onLoginSuccess(staff);
    } catch (error) {
      if (auth.currentUser) {
        await signOut(auth).catch(signOutError => {
          console.error('[LoginPage] Could not clear the failed Firebase session:', signOutError);
        });
      }
      sound.playWarningBeep();
      setErrorMessage(error instanceof Error ? error.message : 'Firebase sign-in failed.');
    } finally {
      setIsSigningIn(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#ecf2f1] flex items-center justify-center p-4 sm:p-6 font-sans select-none">
      {/* Main Login Card - Cleaned without quick access demo box */}
      <div className="bg-white rounded-[28px] max-w-sm sm:max-w-md w-full shadow-xl border border-slate-200/80 p-6 sm:p-8 space-y-5 relative animate-in fade-in duration-200">
        
        {/* Top Logo - Medical Cross with Teal Gradient */}
        <div className="flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-b from-[#00897b] to-[#00695c] text-white flex items-center justify-center shadow-md shadow-teal-950/20 mb-3">
            <Plus className="w-10 h-10 text-white" strokeWidth={3.5} />
          </div>

          {/* Brand Header */}
          <div className="flex items-center justify-center gap-1.5 leading-none">
            <span className="text-2xl font-black text-slate-900 tracking-tight">DRUGS LITES</span>
            <span className="text-2xl font-black text-[#00796b] tracking-tight">PHARMA</span>
          </div>

          <p className="text-xs text-slate-600 font-medium mt-1.5">
            Medical Store Management & Point of Sale
          </p>

          {/* License Badge */}
          <div className="mt-2.5 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#e0f2f1] text-[#00695c] border border-[#80cbc4] text-[11px] font-semibold">
            <ShieldCheck className="w-3.5 h-3.5 text-[#00796b]" />
            <span>Pharmacy records • Form 20B/21B</span>
          </div>
        </div>

        {/* Login Form */}
        <form onSubmit={handleFormSubmit} className="space-y-4 pt-1">
          {/* Firebase staff account */}
          <div>
            <label className="text-xs font-bold text-slate-800 block mb-1">
              Firebase staff email
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                type="email"
                required
                placeholder="Enter your Firebase staff email"
                value={identifier}
                onChange={e => setIdentifier(e.target.value)}
                className="w-full pl-10 pr-3 py-2.5 bg-slate-50/70 hover:bg-white focus:bg-white border border-slate-300 rounded-xl text-xs font-medium focus:outline-[#00796b] focus:border-[#00796b] transition-all"
                autoComplete="email"
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-bold text-slate-800">Staff password</label>
              <button
                type="button"
                onClick={() => setShowForgotNotice(!showForgotNotice)}
                className="text-[11px] font-bold text-[#00796b] hover:underline cursor-pointer"
              >
                Forgot password?
              </button>
            </div>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                placeholder="Enter password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full pl-10 pr-10 py-2.5 bg-slate-50/70 hover:bg-white focus:bg-white border border-slate-300 rounded-xl text-xs font-medium focus:outline-[#00796b] focus:border-[#00796b] transition-all"
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* In-App Forgot Password Notice */}
          {showForgotNotice && (
            <div className="p-3 bg-teal-50 border border-teal-200 text-[#004d40] rounded-xl text-xs flex items-start gap-2 animate-in fade-in duration-150">
              <Info className="w-4 h-4 text-[#00796b] shrink-0 mt-0.5" />
              <div className="text-[11px] leading-relaxed">
                <span>Ask your Firebase administrator to send a password reset email.</span>
              </div>
            </div>
          )}

          {errorMessage && (
            <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
              {errorMessage}
            </div>
          )}

          {/* Primary CTA Button */}
          <button
            type="submit"
            disabled={isSigningIn}
            className="w-full py-3 bg-[#00695c] hover:bg-[#004d40] text-white font-extrabold rounded-xl text-xs sm:text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-98 tracking-wide mt-2"
          >
            <CheckCircle2 className="w-4 h-4 text-white" />
            <span>{isSigningIn ? 'Verifying account...' : 'Log in to DRUGS LITES PHARMA'}</span>
          </button>
        </form>

        {/* Subtle Footer Note */}
        <div className="pt-2 text-center border-t border-slate-100">
          <p className="text-[11px] text-slate-400">
            Firebase Authentication and authorized Firestore access are required.
          </p>
        </div>
      </div>
    </div>
  );
};
