// Login and Register pages (they share one layout).
import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import Logo from '../components/Logo.jsx';
import { ErrorBox } from '../components/ui.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { GuestButton } from '../components/Guest.jsx';

function AuthCard({ title, subtitle, children, footer }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <Link to="/" className="mb-6"><Logo /></Link>
      <div className="card w-full max-w-sm">
        <h1 className="text-xl font-bold">{title}</h1>
        <p className="muted mb-5 text-sm">{subtitle}</p>
        {children}
      </div>
      <p className="muted mt-4 text-sm">{footer}</p>
    </div>
  );
}

function OrDivider() {
  return (
    <div className="my-4 flex items-center gap-3 text-xs text-slate-400">
      <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" /> or just look around <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
    </div>
  );
}

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const user = await login(form.email, form.password);
      navigate(user.has_profile ? location.state?.from || '/app' : '/onboarding', { replace: true });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <AuthCard
      title="Welcome back"
      subtitle="Log in to see your plan and diary."
      footer={<>New here? <Link to="/register" className="font-semibold text-brand-600">Create an account</Link></>}
    >
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" className="input" type="email" autoComplete="email" required
            value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="pw">Password</label>
          <input id="pw" className="input" type="password" autoComplete="current-password" required
            value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </div>
        <ErrorBox message={error} />
        <button className="btn-primary w-full" disabled={busy}>{busy ? 'Logging in...' : 'Log in'}</button>
      </form>
      <OrDivider />
      <GuestButton />
    </AuthCard>
  );
}

export function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ full_name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.password.length < 8) return setError('Password must be at least 8 characters');
    setBusy(true);
    try {
      await register(form.full_name, form.email, form.password);
      navigate('/onboarding', { replace: true });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <AuthCard
      title="Create your account"
      subtitle="Free, and it takes less than a minute."
      footer={<>Already have an account? <Link to="/login" className="font-semibold text-brand-600">Log in</Link></>}
    >
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="label" htmlFor="name">Name</label>
          <input id="name" className="input" autoComplete="name" required maxLength={100}
            value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" className="input" type="email" autoComplete="email" required
            value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="pw">Password</label>
          <input id="pw" className="input" type="password" autoComplete="new-password" required minLength={8} maxLength={72}
            value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          <p className="muted mt-1 text-xs">At least 8 characters.</p>
        </div>
        <ErrorBox message={error} />
        <button className="btn-primary w-full" disabled={busy}>{busy ? 'Creating...' : 'Sign up'}</button>
      </form>
      <OrDivider />
      <GuestButton />
    </AuthCard>
  );
}

// Guest -> real account. Same form as Register, but keeps the guest's data.
export function UpgradeAccount() {
  const { user, upgrade } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ full_name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!user?.is_guest) return <Navigate to="/app/profile" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.password.length < 8) return setError('Password must be at least 8 characters');
    setBusy(true);
    try {
      await upgrade(form.full_name, form.email, form.password);
      // Guest profile is still blank, so choose settings before using the app.
      navigate('/onboarding', { replace: true });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-sm">
      <div className="card">
        <h1 className="text-xl font-bold">Create your free account</h1>
        <p className="muted mb-5 text-sm">Unlocks the AI assistant. Everything you did as a guest stays, and it is no longer deleted after 24 hours.</p>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="label" htmlFor="name">Name</label>
            <input id="name" className="input" autoComplete="name" required maxLength={100}
              value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input id="email" className="input" type="email" autoComplete="email" required
              value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="pw">Password</label>
            <input id="pw" className="input" type="password" autoComplete="new-password" required minLength={8} maxLength={72}
              value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            <p className="muted mt-1 text-xs">At least 8 characters.</p>
          </div>
          <ErrorBox message={error} />
          <button className="btn-primary w-full" disabled={busy}>{busy ? 'Saving...' : 'Create account'}</button>
        </form>
      </div>
    </div>
  );
}
