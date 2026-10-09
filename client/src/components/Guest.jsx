// Guest-mode pieces shared by several pages.
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Lock, UserRound } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { ErrorBox } from './ui.jsx';

// "Continue as guest" button: makes a private sandbox account with sample data.
export function GuestButton({ className = 'btn-secondary w-full' }) {
  const { loginAsGuest } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const go = async () => {
    setBusy(true);
    setError('');
    try {
      await loginAsGuest();
      // Guests must choose profile settings before using the app.
      navigate('/app/profile', { replace: true });
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  return (
    <>
      <button type="button" className={className} onClick={go} disabled={busy}>
        <UserRound className="h-4 w-4" /> {busy ? 'Preparing your guest space...' : 'Continue as guest'}
      </button>
      {error && <div className="mt-2"><ErrorBox message={error} /></div>}
    </>
  );
}

// Shown instead of a feature that guests cannot use (AI, barcode, ...).
export function GuestLock({ title = 'Create a free account to unlock this', text }) {
  return (
    <div className="flex flex-col items-center gap-3 py-8 text-center">
      <div className="rounded-full bg-violet-100 p-3 text-violet-600 dark:bg-violet-950 dark:text-violet-300"><Lock className="h-6 w-6" /></div>
      <h2 className="font-semibold">{title}</h2>
      {text && <p className="muted max-w-sm text-sm">{text}</p>}
      <Link to="/app/signup" className="btn-primary">Create free account</Link>
      <p className="muted text-xs">Takes 30 seconds. Everything you logged as a guest is kept.</p>
    </div>
  );
}

// Thin banner on top of every app page while using a guest account.
export function GuestBanner() {
  const { user } = useAuth();
  if (!user?.is_guest) return null;
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
      <span><b>Guest mode</b> · sample data, deleted after 24 hours. AI assistant is locked.</span>
      <Link to="/app/signup" className="font-semibold underline">Create free account</Link>
    </div>
  );
}
