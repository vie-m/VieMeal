// Public landing page with a free BMI calculator (no login needed).
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, Search, Sparkles, LineChart, ShieldCheck, Moon, Sun } from 'lucide-react';
import Logo from '../components/Logo.jsx';
import BmiScale, { BmiHelp } from '../components/BmiScale.jsx';
import { Disclaimer, ErrorBox } from '../components/ui.jsx';
import { api } from '../api.js';
import { BMI_COLORS, BMI_LABELS } from '../utils/format.js';
import { useTheme } from '../hooks/useTheme.js';
import { GuestButton } from '../components/Guest.jsx';

const FEATURES = [
  { icon: Search, title: '7,800+ foods', text: 'USDA database plus common Indonesian dishes like rendang, soto and gado-gado.' },
  { icon: CalendarDays, title: 'Smart meal plans', text: '1-day or 7-day plans that fit your calories, diet and allergies.' },
  { icon: LineChart, title: 'Track progress', text: 'Food diary, water, weight and BMI trends in simple charts.' },
  { icon: Sparkles, title: 'AI assistant', text: 'Ask nutrition questions. Numbers always come from the database.' },
];

function BmiCalculator() {
  const [form, setForm] = useState({ weight_kg: '', height_cm: '', standard: 'asian' });
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      setResult(await api.post('/tools/bmi', {
        weight_kg: Number(form.weight_kg), height_cm: Number(form.height_cm), standard: form.standard,
      }));
    } catch (err) {
      setError(err.message);
      setResult(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <h2 className="mb-1 text-lg font-bold">Free BMI calculator</h2>
      <p className="muted mb-4 text-sm">No account needed.</p>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="w">Weight (kg)</label>
            <input id="w" className="input" type="number" inputMode="decimal" step="0.1" min="20" max="400" required
              value={form.weight_kg} onChange={(e) => setForm({ ...form, weight_kg: e.target.value })} placeholder="65" />
          </div>
          <div>
            <label className="label" htmlFor="h">Height (cm)</label>
            <input id="h" className="input" type="number" inputMode="decimal" step="0.1" min="100" max="250" required
              value={form.height_cm} onChange={(e) => setForm({ ...form, height_cm: e.target.value })} placeholder="165" />
          </div>
        </div>
        <div>
          <span className="label flex items-center gap-1">Standard <BmiHelp /></span>
          <div className="flex gap-2">
            {[['asian', 'Asian'], ['who', 'WHO']].map(([v, l]) => (
              <button type="button" key={v} className={form.standard === v ? 'chip-on' : 'chip-off'}
                onClick={() => setForm({ ...form, standard: v })}>{l}</button>
            ))}
          </div>
        </div>
        <button className="btn-primary w-full" disabled={busy}>{busy ? 'Calculating...' : 'Calculate BMI'}</button>
      </form>
      <div className="mt-3"><ErrorBox message={error} /></div>
      {result && (
        <div className="mt-4 space-y-3 rounded-xl bg-slate-50 p-4 dark:bg-slate-800/60">
          <div className="flex items-center justify-between">
            <span className="text-3xl font-bold">{result.bmi}</span>
            <span className={`badge px-2 py-1 text-sm ${BMI_COLORS[result.category]}`}>{BMI_LABELS[result.category]}</span>
          </div>
          <BmiScale bmi={result.bmi} standard={result.standard} />
          <p className="text-sm">
            A healthy weight for your height is about <b>{result.ideal_weight.min} - {result.ideal_weight.max} kg</b>.
          </p>
          <Link to="/register" className="btn-secondary w-full">Get my calorie & meal plan</Link>
        </div>
      )}
      <Disclaimer className="mt-4" />
    </div>
  );
}

export default function Landing() {
  const [dark, setDark] = useTheme();
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
        <Logo />
        <div className="flex items-center gap-1 sm:gap-2">
          <button className="btn-ghost p-2" onClick={() => setDark(!dark)} aria-label="Toggle dark mode">
            {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>
          <Link to="/login" className="btn-ghost">Log in</Link>
          <Link to="/register" className="btn-primary hidden sm:inline-flex">Sign up free</Link>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl items-start gap-8 px-4 pb-12 pt-6 sm:px-6 md:grid-cols-2 md:pt-12">
        <div className="md:pt-6">
          <span className="badge mb-4 bg-brand-100 px-2.5 py-1 text-xs text-brand-800 dark:bg-brand-900/60 dark:text-brand-200">
            Nutrition made simple
          </span>
          <h1 className="text-3xl font-extrabold leading-tight tracking-tight sm:text-5xl">
            Eat well, <span className="text-brand-600">your way</span>.
          </h1>
          <p className="muted mt-4 text-base sm:text-lg">
            VieMeal works out your calorie and macro targets, tracks what you eat, and builds meal plans that respect
            your diet and allergies, with Indonesian favorites included.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link to="/register" className="btn-primary px-6 py-3">Create free account</Link>
            <Link to="/login" className="btn-secondary px-6 py-3">I have an account</Link>
          </div>
          <div className="mt-4 max-w-sm">
            <GuestButton className="btn-ghost -ml-3 text-brand-700 dark:text-brand-400" />
            <p className="muted text-xs">Try it with sample data, no email needed. The AI assistant needs a free account.</p>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            {FEATURES.map((f) => (
              <div key={f.title} className="flex gap-3">
                <div className="h-fit rounded-xl bg-brand-50 p-2 text-brand-600 dark:bg-brand-950 dark:text-brand-400"><f.icon className="h-5 w-5" /></div>
                <div>
                  <h3 className="font-semibold">{f.title}</h3>
                  <p className="muted text-sm">{f.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        <BmiCalculator />
      </section>

      <footer className="border-t border-slate-200 px-4 py-6 text-center dark:border-slate-800">
        <p className="muted mb-2 flex items-center justify-center gap-1 text-xs"><ShieldCheck className="h-3.5 w-3.5" /> Food data: USDA FoodData Central (public domain) and Open Food Facts. Indonesian values are estimates.</p>
        <Disclaimer />
      </footer>
    </div>
  );
}
