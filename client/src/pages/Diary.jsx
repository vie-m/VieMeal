// Food diary: pick a date, entries grouped by meal, totals vs targets, edit / delete.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Pencil, Trash2, Plus, BookOpen } from 'lucide-react';
import { api } from '../api.js';
import { useApi } from '../hooks/useApi.js';
import { EmptyState, ErrorBox, Modal, ProgressBar, SkeletonList, SourceBadge } from '../components/ui.jsx';
import { MEAL_LABELS, MEAL_TYPES, addDays, fmt, isoDate, prettyDate } from '../utils/format.js';

function EditModal({ entry, onClose, onSaved }) {
  const [grams, setGrams] = useState(entry?.grams ?? 100);
  const [mealType, setMealType] = useState(entry?.meal_type ?? 'lunch');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  if (!entry) return null;
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.put(`/logs/${entry.id}`, { grams: Number(grams), meal_type: mealType });
      onSaved();
    } catch (ex) {
      setErr(ex.message);
      setBusy(false);
    }
  };
  // Calories scale linearly with grams.
  const kcal = entry.grams > 0 ? (entry.calories_kcal / entry.grams) * (Number(grams) || 0) : 0;
  return (
    <Modal open onClose={onClose} title={entry.item_name}>
      <form onSubmit={save} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="eg">Amount (g)</label>
            <input id="eg" className="input" type="number" min="1" max="5000" value={grams} onChange={(e) => setGrams(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="em">Meal</label>
            <select id="em" className="input" value={mealType} onChange={(e) => setMealType(e.target.value)}>
              {MEAL_TYPES.map((m) => <option key={m} value={m}>{MEAL_LABELS[m]}</option>)}
            </select>
          </div>
        </div>
        <p className="muted text-sm">About {Math.round(kcal)} kcal</p>
        <ErrorBox message={err} />
        <button className="btn-primary w-full" disabled={busy}>Save</button>
      </form>
    </Modal>
  );
}

export default function Diary() {
  const [date, setDate] = useState(isoDate());
  const { data, loading, error, reload } = useApi(`/logs?date=${date}`);
  const { data: t } = useApi('/profile/targets');
  const [editing, setEditing] = useState(null);
  const isToday = date === isoDate();

  const remove = async (id) => {
    if (!window.confirm('Remove this entry?')) return;
    await api.del(`/logs/${id}`);
    reload();
  };

  const totals = data?.totals;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="page-title">Food diary</h1>
        <div className="flex items-center gap-1">
          <button className="btn-ghost p-2" onClick={() => setDate(addDays(date, -1))} aria-label="Previous day"><ChevronLeft className="h-5 w-5" /></button>
          <input type="date" className="input w-auto py-2" value={date} max={isoDate()} onChange={(e) => e.target.value && setDate(e.target.value)} />
          <button className="btn-ghost p-2" disabled={isToday} onClick={() => setDate(addDays(date, 1))} aria-label="Next day"><ChevronRight className="h-5 w-5" /></button>
        </div>
      </div>
      <p className="muted -mt-2 text-sm">{isToday ? 'Today' : prettyDate(date, { weekday: 'long', day: 'numeric', month: 'long' })}</p>

      <ErrorBox message={error} onRetry={reload} />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {loading ? <SkeletonList rows={4} className="h-24" /> : data?.entries.length === 0 ? (
            <div className="card">
              <EmptyState icon={BookOpen} title="Nothing logged for this day"
                text="Search for a food or log a planned meal to see your totals here."
                action={<Link to="/app/food" className="btn-primary"><Plus className="h-4 w-4" /> Add food</Link>} />
            </div>
          ) : MEAL_TYPES.map((m) => {
            const rows = data.entries.filter((e) => e.meal_type === m);
            const kcal = rows.reduce((s, r) => s + r.calories_kcal, 0);
            return (
              <div key={m} className="card">
                <div className="mb-1 flex items-center justify-between">
                  <h2 className="font-semibold">{MEAL_LABELS[m]}</h2>
                  <span className="muted text-sm tabular-nums">{fmt(kcal)} kcal</span>
                </div>
                {rows.length === 0 ? <p className="muted py-2 text-sm">Nothing logged</p> : (
                  <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                    {rows.map((r) => (
                      <li key={r.id} className="flex items-center gap-2 py-2.5">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate font-medium">{r.item_name}</span>
                            {r.recipe_id && <span className="badge bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">recipe</span>}
                            <SourceBadge source={r.source} />
                          </div>
                          <div className="muted text-xs">{r.grams} g · P {r.protein_g} · C {r.carbs_g} · F {r.fat_g} g</div>
                        </div>
                        <span className="w-16 text-right text-sm font-semibold tabular-nums">{fmt(r.calories_kcal)}</span>
                        <button className="btn-ghost p-2" onClick={() => setEditing(r)} aria-label="Edit"><Pencil className="h-4 w-4" /></button>
                        <button className="btn-ghost p-2 hover:text-red-600" onClick={() => remove(r.id)} aria-label="Delete"><Trash2 className="h-4 w-4" /></button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>

        <div className="card h-fit space-y-3 lg:sticky lg:top-8">
          <h2 className="font-semibold">Day totals</h2>
          {!totals || !t ? <SkeletonList rows={4} className="h-6" /> : (
            <>
              <ProgressBar label="Calories" value={totals.calories_kcal} target={t.calories} unit="kcal" />
              <ProgressBar label="Protein" value={totals.protein_g} target={t.macros.protein_g} />
              <ProgressBar label="Carbs" value={totals.carbs_g} target={t.macros.carbs_g} color="bg-amber-400" />
              <ProgressBar label="Fat" value={totals.fat_g} target={t.macros.fat_g} color="bg-indigo-500" />
              <div className="muted flex justify-between border-t border-slate-100 pt-2 text-sm dark:border-slate-800">
                <span>Fiber {totals.fiber_g} g</span><span>Sodium {fmt(totals.sodium_mg)} mg</span>
              </div>
            </>
          )}
        </div>
      </div>
      {editing && <EditModal entry={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
    </div>
  );
}
