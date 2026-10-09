// Profile & settings: body info, goal, diet, allergies, BMI standard, macro split,
// units, dark mode, log out.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { LogOut, Moon, Sun, BookOpen, ChefHat, LineChart, Save } from 'lucide-react';
import { BodyFields, DietFields, GoalFields, useProfileForm } from '../components/ProfileForm.jsx';
import TargetsSummary from '../components/TargetsSummary.jsx';
import { ErrorBox, Flash, SkeletonList } from '../components/ui.jsx';
import LogoutButton from '../components/LogoutButton.jsx';
import { useApi } from '../hooks/useApi.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useTheme } from '../hooks/useTheme.js';

function MacroFields({ form, set }) {
  const sum = Number(form.protein_pct) + Number(form.carbs_pct) + Number(form.fat_pct);
  const field = (key, label, min, max) => (
    <div>
      <label className="label text-xs" htmlFor={key}>{label} ({min}-{max}%)</label>
      <input id={key} className="input" type="number" min={min} max={max} value={form[key]} onChange={(e) => set({ [key]: e.target.value })} />
    </div>
  );
  return (
    <div>
      <div className="grid grid-cols-3 gap-2">
        {field('protein_pct', 'Protein', 10, 35)}
        {field('carbs_pct', 'Carbs', 40, 65)}
        {field('fat_pct', 'Fat', 20, 35)}
      </div>
      <p className={`mt-1 text-xs ${sum === 100 ? 'muted' : 'text-amber-600'}`}>Total {sum}% (must be 100%). Default 25 / 50 / 25.</p>
    </div>
  );
}

export default function Profile() {
  const { user, markProfileDone } = useAuth();
  const [dark, setDark] = useTheme();
  // Guest starts with every personal setting blank; normal accounts keep onboarding defaults.
  const p = useProfileForm(user?.is_guest);
  const { data: targets, reload } = useApi('/profile/targets');
  const [units, setUnits] = useState(localStorage.getItem('units') || 'metric');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState('');

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      await p.save();
      await reload();
      markProfileDone();
      setFlash('Profile saved');
    } catch (ex) { setErr(ex.message); } finally { setBusy(false); }
  };

  const changeUnits = (u) => { setUnits(u); localStorage.setItem('units', u); };
  const lbs = Number(p.form.weight_kg) ? (Number(p.form.weight_kg) * 2.20462).toFixed(1) : '-';
  const ft = Number(p.form.height_cm) ? `${Math.floor(p.form.height_cm / 30.48)} ft ${Math.round((p.form.height_cm % 30.48) / 2.54)} in` : '-';

  return (
    <div className="space-y-4">
      <div>
        <h1 className="page-title">Profile & settings</h1>
        <p className="muted text-sm">{user?.is_guest ? 'Guest account (temporary history)' : `${user?.full_name} · ${user?.email}`}</p>
      </div>

      {user?.is_guest && (
        <div className="card flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm">You are using a <b>guest account</b>. It is deleted after 24 hours. Sign up to keep your data and unlock the AI assistant.</p>
          <Link to="/app/signup" className="btn-primary btn-sm">Create free account</Link>
        </div>
      )}

      {/* Mobile shortcuts to pages not in the bottom bar */}
      <div className="grid grid-cols-3 gap-2 md:hidden">
        {[['/app/diary', 'Diary', BookOpen], ['/app/recipes', 'Recipes', ChefHat], ['/app/progress', 'Progress', LineChart]].map(([to, l, Icon]) => (
          <Link key={to} to={to} className="card flex flex-col items-center gap-1 p-3 text-xs font-medium"><Icon className="h-5 w-5 text-brand-600" /> {l}</Link>
        ))}
      </div>

      {p.loading ? <SkeletonList rows={3} className="h-40" /> : (
        <form onSubmit={save} className="space-y-4">
          <div className="card space-y-4"><h2 className="font-semibold">Body</h2><BodyFields form={p.form} set={p.set} />
            {units === 'imperial' && <p className="muted text-xs">= {lbs} lb, {ft}</p>}
          </div>
          <div className="card space-y-4"><h2 className="font-semibold">Activity & goal</h2><GoalFields form={p.form} set={p.set} /></div>
          <div className="card space-y-4"><h2 className="font-semibold">Diet, allergies & BMI</h2>
            <DietFields form={p.form} set={p.set} allergens={p.allergens} setAllergens={p.setAllergens} />
          </div>
          <div className="card space-y-2"><h2 className="font-semibold">Macro split</h2><MacroFields form={p.form} set={p.set} /></div>
          <ErrorBox message={err || p.error} />
          <div className="sticky bottom-20 z-20 md:bottom-4">
            <button className="btn-primary w-full py-3 shadow-lg sm:w-auto" disabled={busy}><Save className="h-4 w-4" /> {busy ? 'Saving...' : 'Save changes'}</button>
          </div>
        </form>
      )}

      {targets && (
        <div className="space-y-2">
          <h2 className="text-lg font-bold">My targets</h2>
          <TargetsSummary t={targets} />
        </div>
      )}

      <div className="card space-y-4">
        <h2 className="font-semibold">App settings</h2>
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm">Units</span>
          <div className="flex gap-2">
            {[['metric', 'kg / cm'], ['imperial', 'show lb / ft']].map(([v, l]) => (
              <button key={v} className={units === v ? 'chip-on' : 'chip-off'} onClick={() => changeUnits(v)}>{l}</button>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm">Appearance</span>
          <button className="btn-secondary btn-sm" onClick={() => setDark(!dark)}>
            {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />} {dark ? 'Light mode' : 'Dark mode'}
          </button>
        </div>
        <LogoutButton className="btn-secondary w-full text-red-600"><LogOut className="h-4 w-4" /> Log out</LogoutButton>
      </div>
      <Flash message={flash} onDone={() => setFlash('')} />
    </div>
  );
}
