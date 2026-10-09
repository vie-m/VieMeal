// Meal planner: generate 1- or 7-day plans (rule-based or AI), day tabs,
// swap / lock meals, "Why this meal?", log a whole day, shopping list.
import { useEffect, useState } from 'react';
import {
  RefreshCw, Lock, Unlock, Shuffle, Sparkles, ShoppingCart, BookCheck, CalendarDays, HelpCircle, Wand2,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useApi } from '../hooks/useApi.js';
import { EmptyState, ErrorBox, Flash, Modal, Notice, SkeletonList, SourceBadge } from '../components/ui.jsx';
import { MEAL_LABELS, capitalize, fmt, isoDate, prettyDate } from '../utils/format.js';

function ShoppingList({ planId, open, onClose }) {
  const { data, loading, error } = useApi(open ? `/meal-plans/${planId}/shopping-list` : null);
  const [checked, setChecked] = useState({});
  return (
    <Modal open={open} onClose={onClose} title="Shopping list" wide>
      {loading && <SkeletonList rows={4} className="h-10" />}
      <ErrorBox message={error} />
      {data?.length === 0 && <p className="muted">Nothing to buy.</p>}
      <div className="space-y-4">
        {data?.map((g) => (
          <div key={g.category}>
            <h3 className="mb-1 text-sm font-semibold text-brand-700 dark:text-brand-400">{capitalize(g.category)}</h3>
            <ul>
              {g.items.map((it) => (
                <li key={it.food_id}>
                  <label className="flex cursor-pointer items-start gap-3 py-1.5 text-sm">
                    <input type="checkbox" className="mt-0.5 h-4 w-4 accent-brand-600" checked={!!checked[it.food_id]}
                      onChange={() => setChecked({ ...checked, [it.food_id]: !checked[it.food_id] })} />
                    <span className={`flex-1 ${checked[it.food_id] ? 'muted line-through' : ''}`}>{it.name}</span>
                    <span className="muted tabular-nums">{it.grams >= 1000 ? `${(it.grams / 1000).toFixed(1)} kg` : `${it.grams} g`}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="muted mt-4 text-xs">Amounts are the total for the whole plan (cooked weight for prepared dishes).</p>
    </Modal>
  );
}

function MealCard({ item, aiEnabled, onSwap, onLock, onWhy, busy }) {
  return (
    <div className={`card flex flex-col gap-3 ${item.is_locked ? 'ring-2 ring-brand-500/40' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-wide text-brand-600 dark:text-brand-400">{MEAL_LABELS[item.meal_type]}</div>
          <h3 className="mt-0.5 font-semibold leading-snug">{item.name}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className="muted text-xs">{item.grams} g {item.recipe_id ? '· recipe' : ''}</span>
            <SourceBadge source={item.source} />
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-lg font-bold tabular-nums">{fmt(item.calories_kcal)}</div>
          <div className="muted text-[11px]">kcal</div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        <div className="rounded-lg bg-brand-50 py-1.5 dark:bg-brand-950/50"><b>{item.protein_g} g</b><div className="muted">protein</div></div>
        <div className="rounded-lg bg-amber-50 py-1.5 dark:bg-amber-950/40"><b>{item.carbs_g} g</b><div className="muted">carbs</div></div>
        <div className="rounded-lg bg-indigo-50 py-1.5 dark:bg-indigo-950/40"><b>{item.fat_g} g</b><div className="muted">fat</div></div>
      </div>
      <div className="mt-auto flex flex-wrap gap-2">
        <button className="btn-secondary btn-sm" disabled={busy || item.is_locked} onClick={onSwap} title="Pick the next best option">
          <Shuffle className="h-3.5 w-3.5" /> Swap
        </button>
        <button className={`btn-sm ${item.is_locked ? 'btn-primary' : 'btn-secondary'}`} disabled={busy} onClick={onLock}
          title="Locked meals stay when you regenerate">
          {item.is_locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />} {item.is_locked ? 'Locked' : 'Lock'}
        </button>
        {aiEnabled && (
          <button className="btn-ghost btn-sm" onClick={onWhy}><HelpCircle className="h-3.5 w-3.5" /> Why this meal?</button>
        )}
      </div>
    </div>
  );
}

export default function Planner() {
  const { data: plan, loading, error, reload, setData } = useApi('/meal-plans/current');
  const { data: ai } = useApi('/ai/status');
  const [dayIdx, setDayIdx] = useState(0);
  const [days, setDays] = useState(7);
  const [busy, setBusy] = useState(false);
  const [busyItem, setBusyItem] = useState(null);
  const [msg, setMsg] = useState(null); // { tone, text }
  const [err, setErr] = useState('');
  const [flash, setFlash] = useState('');
  const [showList, setShowList] = useState(false);
  const [why, setWhy] = useState(null); // { item, text, loading, error }

  // Open today's tab when a plan loads.
  useEffect(() => {
    if (!plan?.days) return;
    const i = plan.days.findIndex((d) => d.date === isoDate());
    setDayIdx(i >= 0 ? i : 0);
  }, [plan?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const generate = async (withAi) => {
    setBusy(true);
    setErr('');
    setMsg(null);
    try {
      if (withAi) {
        const r = await api.post('/ai/generate-plan', { days });
        setData(r.plan);
        setMsg({ tone: r.fallback ? 'warn' : 'success', text: r.message });
      } else {
        setData(await api.post('/meal-plans/generate', { days }));
        setFlash('New plan ready');
      }
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const swap = async (item) => {
    setBusyItem(item.id);
    try { setData(await api.put(`/meal-plans/items/${item.id}/swap`)); } catch (e) { setErr(e.message); } finally { setBusyItem(null); }
  };

  const lock = async (item) => {
    setBusyItem(item.id);
    try {
      const r = await api.put(`/meal-plans/items/${item.id}/lock`, { locked: !item.is_locked });
      setData({ ...plan, days: plan.days.map((d) => ({ ...d, items: d.items.map((i) => (i.id === item.id ? { ...i, is_locked: r.is_locked } : i)) })) });
    } catch (e) { setErr(e.message); } finally { setBusyItem(null); }
  };

  const explain = async (item) => {
    setWhy({ item, loading: true });
    try {
      const r = await api.post('/ai/explain', { item_id: item.id });
      setWhy({ item, text: r.explanation });
    } catch (e) {
      setWhy({ item, error: e.message });
    }
  };

  const logDay = async (day) => {
    const target = day.date > isoDate() ? isoDate() : day.date;
    if (!window.confirm(`Add all meals of ${prettyDate(day.date)} to your diary for ${target === isoDate() ? 'today' : prettyDate(target)}?`)) return;
    setBusy(true);
    try {
      const r = await api.post(`/meal-plans/${plan.id}/log-day`, { date: day.date, log_date: target });
      setFlash(`${r.logged} meals added to your diary`);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  const day = plan?.days?.[dayIdx];
  const lockedCount = plan?.days?.reduce((s, d) => s + d.items.filter((i) => i.is_locked).length, 0) || 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Meal planner</h1>
          {plan && (
            <p className="muted text-sm">
              Target {fmt(plan.target_calories)} kcal/day · made by {plan.created_by === 'ai' ? 'AI (numbers from our database)' : 'our planner'}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl border border-slate-200 p-0.5 dark:border-slate-700">
            {[1, 7].map((n) => (
              <button key={n} onClick={() => setDays(n)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${days === n ? 'bg-brand-600 text-white' : 'muted'}`}>
                {n} day{n > 1 ? 's' : ''}
              </button>
            ))}
          </div>
          <button className="btn-primary" disabled={busy} onClick={() => generate(false)}>
            <RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} /> {plan ? 'Regenerate' : 'Generate'}
          </button>
          {ai?.guest ? (
            // Guests see the AI button, but it leads to the sign-up page.
            <Link to="/app/signup" className="btn-secondary" title="Create a free account to use AI">
              <Lock className="h-4 w-4 text-violet-500" /> With AI
            </Link>
          ) : (
            <button className="btn-secondary" disabled={busy || !ai?.enabled} onClick={() => generate(true)}
              title={ai?.enabled ? 'Let the AI suggest meals' : 'AI is not set up on this server'}>
              <Sparkles className="h-4 w-4 text-violet-500" /> With AI
            </button>
          )}
        </div>
      </div>

      {ai?.guest && (
        <p className="muted text-xs">AI plans and "Why this meal?" need a free account. The rule-based planner works for guests.</p>
      )}
      {ai && !ai.guest && !ai.enabled && (
        <p className="muted text-xs">AI features are turned off (no AI key on the server). The rule-based planner works fully without it.</p>
      )}
      {lockedCount > 0 && <p className="muted text-xs">{lockedCount} locked meal{lockedCount > 1 ? 's' : ''} will be kept when you regenerate.</p>}
      {msg && <Notice tone={msg.tone} icon={Wand2}>{msg.text}</Notice>}
      <ErrorBox message={err || error} onRetry={error ? reload : undefined} />

      {loading ? <SkeletonList rows={3} className="h-40" /> : !plan ? (
        <div className="card">
          <EmptyState icon={CalendarDays} title="No meal plan yet"
            text="We pick meals that match your calories, protein goal, diet and allergies, then scale the portions."
            action={<button className="btn-primary" disabled={busy} onClick={() => generate(false)}>Generate my plan</button>} />
        </div>
      ) : (
        <>
          {/* Day tabs */}
          {plan.days.length > 1 && (
            <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
              {plan.days.map((d, i) => (
                <button key={d.date} onClick={() => setDayIdx(i)}
                  className={`shrink-0 rounded-xl border px-3 py-2 text-center text-xs transition ${
                    i === dayIdx ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900'}`}>
                  <div className="font-semibold">{d.date === isoDate() ? 'Today' : prettyDate(d.date, { weekday: 'short' })}</div>
                  <div className={i === dayIdx ? 'text-brand-100' : 'muted'}>{prettyDate(d.date, { day: 'numeric', month: 'short' })}</div>
                </button>
              ))}
            </div>
          )}

          {day && (
            <>
              <div className="card flex flex-wrap items-center gap-x-6 gap-y-2 py-3">
                <div><span className="text-xl font-bold tabular-nums">{fmt(day.totals.calories_kcal)}</span> <span className="muted text-sm">/ {fmt(plan.target_calories)} kcal</span></div>
                <div className="muted text-sm">P {Math.round(day.totals.protein_g)} g · C {Math.round(day.totals.carbs_g)} g · F {Math.round(day.totals.fat_g)} g</div>
                <div className="ml-auto flex gap-2">
                  <button className="btn-secondary btn-sm" disabled={busy} onClick={() => logDay(day)}><BookCheck className="h-4 w-4" /> Log this day</button>
                  <button className="btn-secondary btn-sm" onClick={() => setShowList(true)}><ShoppingCart className="h-4 w-4" /> Shopping list</button>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {day.items.map((it) => (
                  <MealCard key={it.id} item={it} aiEnabled={ai?.enabled && !ai?.guest} busy={busyItem === it.id}
                    onSwap={() => swap(it)} onLock={() => lock(it)} onWhy={() => explain(it)} />
                ))}
              </div>
            </>
          )}
          <ShoppingList planId={plan.id} open={showList} onClose={() => setShowList(false)} />
        </>
      )}

      <Modal open={Boolean(why)} onClose={() => setWhy(null)} title="Why this meal?">
        {why?.loading && <SkeletonList rows={2} className="h-6" />}
        {why?.text && (
          <div className="space-y-3">
            <p className="font-medium">{why.item.name}</p>
            <p className="text-sm leading-relaxed">{why.text}</p>
            <p className="muted text-xs">Explanation by AI. The nutrition numbers come from our database.</p>
          </div>
        )}
        <ErrorBox message={why?.error} />
      </Modal>
      <Flash message={flash} onDone={() => setFlash('')} />
    </div>
  );
}
