// Home dashboard: calorie ring, macro bars, water, today's planned meals, BMI.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Droplets, Plus, Minus, CalendarDays, Check, BookOpen, ChefHat, LineChart, Search, Scale,
} from 'lucide-react';
import { api } from '../api.js';
import { useApi } from '../hooks/useApi.js';
import { useAuth } from '../context/AuthContext.jsx';
import CalorieRing from '../components/CalorieRing.jsx';
import BmiScale, { BmiHelp } from '../components/BmiScale.jsx';
import { EmptyState, ErrorBox, Flash, ProgressBar, Skeleton } from '../components/ui.jsx';
import { BMI_COLORS, BMI_LABELS, MEAL_LABELS, fmt, isoDate } from '../utils/format.js';

function greeting() {
  const h = new Date().getHours();
  return h < 4 ? 'Good evening' : h < 11 ? 'Good morning' : h < 15 ? 'Good afternoon' : 'Good evening';
}

function WaterCard({ target }) {
  const { data, setData, error } = useApi('/water');
  const [busy, setBusy] = useState(false);
  const add = async (body) => {
    setBusy(true);
    try { setData(await api.post('/water', body)); } finally { setBusy(false); }
  };
  const total = data?.total_ml ?? 0;
  const glasses = Math.ceil(target / 250);
  return (
    <div className="card">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-semibold"><Droplets className="h-5 w-5 text-sky-500" /> Water</h2>
        <span className="muted text-sm tabular-nums">{(total / 1000).toFixed(2)} / {(target / 1000).toFixed(1)} L</span>
      </div>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {Array.from({ length: glasses }, (_, i) => (
          <div key={i} className={`h-7 w-5 rounded-b-md rounded-t-sm border-2 transition ${
            (i + 1) * 250 <= total ? 'border-sky-500 bg-sky-400' : 'border-slate-200 dark:border-slate-700'}`} />
        ))}
      </div>
      <ErrorBox message={error} />
      <div className="flex gap-2">
        <button className="btn-primary flex-1 bg-sky-500 hover:bg-sky-600" disabled={busy} onClick={() => add({ amount_ml: 250 })}>
          <Plus className="h-4 w-4" /> 250 ml
        </button>
        <button className="btn-secondary flex-1" disabled={busy} onClick={() => add({ amount_ml: 500 })}>
          <Plus className="h-4 w-4" /> 500 ml
        </button>
        <button className="btn-ghost" disabled={busy || !total} onClick={() => add({ undo: true })} aria-label="Undo last">
          <Minus className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function PlannedToday({ onLogged }) {
  const today = isoDate();
  const { data: plan, loading, setData } = useApi('/meal-plans/current');
  const [busyId, setBusyId] = useState(null);
  const day = plan?.days?.find((d) => d.date === today);

  const logItem = async (item) => {
    setBusyId(item.id);
    try {
      await api.post(`/meal-plans/${plan.id}/log-day`, { date: today, item_ids: [item.id], log_date: today });
      setData({ ...plan, days: plan.days.map((d) => (d.date === today
        ? { ...d, items: d.items.map((i) => (i.id === item.id ? { ...i, logged: true } : i)) } : d)) });
      onLogged();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="card">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-semibold"><CalendarDays className="h-5 w-5 text-brand-600" /> Today's plan</h2>
        <Link to="/app/plan" className="text-sm font-medium text-brand-600">Open planner</Link>
      </div>
      {loading ? <Skeleton className="h-32" /> : !day ? (
        <EmptyState icon={CalendarDays} title="No plan for today" text="Generate a plan that fits your targets in one tap."
          action={<Link to="/app/plan" className="btn-primary">Create a meal plan</Link>} />
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {day.items.map((it) => (
            <li key={it.id} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="muted text-xs">{MEAL_LABELS[it.meal_type]}</div>
                <div className="truncate font-medium">{it.name}</div>
                <div className="muted text-xs">{it.grams} g · {fmt(it.calories_kcal)} kcal · {it.protein_g} g protein</div>
              </div>
              <button className={it.logged ? 'btn-ghost btn-sm text-brand-600' : 'btn-secondary btn-sm'} disabled={it.logged || busyId === it.id}
                onClick={() => logItem(it)}>
                {it.logged ? <><Check className="h-4 w-4" /> Logged</> : 'Log this'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function Home() {
  const { user } = useAuth();
  const { data: t, loading: tl, error: te, reload: rt } = useApi('/profile/targets');
  const { data: log, loading: ll, reload: rl } = useApi(`/logs?date=${isoDate()}`);
  const [flash, setFlash] = useState('');

  if (te) return <ErrorBox message={te} onRetry={rt} />;
  const eaten = log?.totals || { calories_kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="page-title">{greeting()}, {user?.full_name?.split(' ')[0]}</h1>
        <p className="muted text-sm">{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Calories + macros */}
        <div className="card lg:col-span-2">
          {tl || ll ? <Skeleton className="h-44" /> : (
            <div className="flex flex-col items-center gap-6 sm:flex-row">
              <CalorieRing eaten={eaten.calories_kcal} target={t.calories} />
              <div className="w-full flex-1 space-y-3">
                <div className="grid grid-cols-3 gap-2 text-center text-sm">
                  <div><div className="font-bold tabular-nums">{fmt(t.calories)}</div><div className="muted text-xs">Target</div></div>
                  <div><div className="font-bold tabular-nums">{fmt(eaten.calories_kcal)}</div><div className="muted text-xs">Eaten</div></div>
                  <div><div className="font-bold tabular-nums">{fmt(Math.max(0, t.calories - eaten.calories_kcal))}</div><div className="muted text-xs">Remaining</div></div>
                </div>
                <ProgressBar label="Protein" value={eaten.protein_g} target={t.macros.protein_g} color="bg-brand-500" />
                <ProgressBar label="Carbs" value={eaten.carbs_g} target={t.macros.carbs_g} color="bg-amber-400" />
                <ProgressBar label="Fat" value={eaten.fat_g} target={t.macros.fat_g} color="bg-indigo-500" />
                <div className="flex gap-2 pt-1">
                  <Link to="/app/food" className="btn-primary btn-sm"><Search className="h-4 w-4" /> Log food</Link>
                  <Link to="/app/diary" className="btn-secondary btn-sm"><BookOpen className="h-4 w-4" /> Diary</Link>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* BMI */}
        <div className="card">
          {tl ? <Skeleton className="h-40" /> : (
            <>
              <h2 className="mb-2 flex items-center gap-2 font-semibold"><Scale className="h-5 w-5 text-brand-600" /> BMI <BmiHelp /></h2>
              <div className="flex items-center gap-3">
                <span className="text-3xl font-bold">{t.bmi}</span>
                <span className={`badge px-2 py-1 text-sm ${BMI_COLORS[t.bmi_category]}`}>{BMI_LABELS[t.bmi_category]}</span>
              </div>
              <BmiScale bmi={t.bmi} standard={t.bmi_standard} />
              <p className="muted text-sm">Healthy range for your height: <span className="whitespace-nowrap">{t.ideal_weight.min} - {t.ideal_weight.max} kg</span></p>
              <Link to="/app/progress" className="mt-2 inline-block text-sm font-medium text-brand-600">Log weight</Link>
            </>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <PlannedToday onLogged={() => { rl(); setFlash('Added to your diary'); }} />
        </div>
        <div className="space-y-4">
          {t && <WaterCard target={t.water_ml} />}
          {/* Shortcuts (mostly useful on mobile where the sidebar is hidden) */}
          <div className="grid grid-cols-3 gap-2 md:hidden">
            {[['/app/diary', 'Diary', BookOpen], ['/app/recipes', 'Recipes', ChefHat], ['/app/progress', 'Progress', LineChart]].map(([to, l, Icon]) => (
              <Link key={to} to={to} className="card flex flex-col items-center gap-1 p-3 text-xs font-medium">
                <Icon className="h-5 w-5 text-brand-600" /> {l}
              </Link>
            ))}
          </div>
        </div>
      </div>
      <Flash message={flash} onDone={() => setFlash('')} />
    </div>
  );
}
