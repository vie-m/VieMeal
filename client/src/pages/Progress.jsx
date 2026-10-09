// Progress: weight chart, BMI trend, averages for the last 7 and 30 days.
import { useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, BarChart, Bar, ReferenceLine,
} from 'recharts';
import { Scale, TrendingDown, TrendingUp, Minus } from 'lucide-react';
import { api } from '../api.js';
import { useApi } from '../hooks/useApi.js';
import { EmptyState, ErrorBox, Skeleton } from '../components/ui.jsx';
import { addDays, fmt, isoDate, prettyDate } from '../utils/format.js';

const axis = { fontSize: 11, fill: '#94a3b8' };
const short = (d) => prettyDate(d, { day: 'numeric', month: 'short' });

function Averages({ days, target }) {
  const to = isoDate();
  const { data, loading } = useApi(`/logs/summary?from=${addDays(to, -(days - 1))}&to=${to}`);
  if (loading) return <Skeleton className="h-32" />;
  const a = data.averages;
  return (
    <div className="card">
      <h2 className="font-semibold">Last {days} days</h2>
      <p className="muted mb-3 text-xs">Average per logged day ({a.logged_days} of {days} days logged)</p>
      <div className="grid grid-cols-4 gap-2 text-center">
        {[['kcal', a.calories_kcal, target?.calories], ['protein', a.protein_g], ['carbs', a.carbs_g], ['fat', a.fat_g]].map(([l, v, t]) => (
          <div key={l} className="rounded-xl bg-slate-50 p-2 dark:bg-slate-800/60">
            <div className="font-bold tabular-nums">{fmt(v)}{l !== 'kcal' && ' g'}</div>
            <div className="muted text-[11px]">{l}</div>
            {t && <div className="muted text-[10px]">target {fmt(t)}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Progress() {
  const { data: weights, loading, error, reload } = useApi('/weights');
  const { data: t } = useApi('/profile/targets');
  const to = isoDate();
  const { data: month } = useApi(`/logs/summary?from=${addDays(to, -29)}&to=${to}`);
  const [w, setW] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      await api.post('/weights', { weight_kg: Number(w) });
      setW('');
      reload();
    } catch (ex) { setErr(ex.message); } finally { setBusy(false); }
  };

  const first = weights?.[0];
  const last = weights?.[weights.length - 1];
  const diff = first && last ? Math.round((last.weight_kg - first.weight_kg) * 10) / 10 : 0;
  const DiffIcon = diff < 0 ? TrendingDown : diff > 0 ? TrendingUp : Minus;
  const chartData = weights?.map((x) => ({ ...x, label: short(x.logged_on) })) || [];
  const calData = month?.days?.filter((d) => d.entries > 0).map((d) => ({ label: short(d.day), kcal: Math.round(d.calories_kcal) })) || [];

  return (
    <div className="space-y-4">
      <h1 className="page-title">Progress</h1>
      <ErrorBox message={error} onRetry={reload} />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 font-semibold"><Scale className="h-5 w-5 text-brand-600" /> Weight</h2>
            {weights?.length > 1 && (
              <span className="muted flex items-center gap-1 text-sm"><DiffIcon className="h-4 w-4" /> {diff > 0 ? '+' : ''}{diff} kg since {short(first.logged_on)}</span>
            )}
          </div>
          {loading ? <Skeleton className="h-56" /> : chartData.length === 0 ? (
            <EmptyState icon={Scale} title="No weight entries yet" text="Log your weight to see your trend." />
          ) : (
            <div className="h-56">
              <ResponsiveContainer>
                <LineChart data={chartData} margin={{ left: -20, right: 8, top: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#94a3b833" />
                  <XAxis dataKey="label" tick={axis} interval="preserveStartEnd" minTickGap={20} />
                  <YAxis tick={axis} domain={['dataMin - 1', 'dataMax + 1']} />
                  <Tooltip formatter={(v) => [`${v} kg`, 'Weight']} />
                  <Line type="monotone" dataKey="weight_kg" stroke="#16a34a" strokeWidth={2.5} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
        <form onSubmit={save} className="card h-fit space-y-3">
          <h2 className="font-semibold">Log today's weight</h2>
          <div className="flex gap-2">
            <input className="input" type="number" inputMode="decimal" min="25" max="400" step="0.1" placeholder={last ? String(last.weight_kg) : 'kg'}
              required value={w} onChange={(e) => setW(e.target.value)} />
            <button className="btn-primary" disabled={busy}>Save</button>
          </div>
          <p className="muted text-xs">Weight naturally moves up and down day to day. Look at the trend over weeks.</p>
          <ErrorBox message={err} />
        </form>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card">
          <h2 className="mb-3 font-semibold">BMI trend</h2>
          {chartData.length === 0 ? <p className="muted text-sm">No data yet.</p> : (
            <div className="h-48">
              <ResponsiveContainer>
                <LineChart data={chartData} margin={{ left: -20, right: 8, top: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#94a3b833" />
                  <XAxis dataKey="label" tick={axis} interval="preserveStartEnd" minTickGap={20} />
                  <YAxis tick={axis} domain={['dataMin - 0.5', 'dataMax + 0.5']} />
                  <Tooltip formatter={(v) => [v, 'BMI']} />
                  {t && <ReferenceLine y={t.bmi_standard === 'asian' ? 23 : 25} stroke="#f59e0b" strokeDasharray="4 4" />}
                  <Line type="monotone" dataKey="bmi" stroke="#6366f1" strokeWidth={2.5} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
          <p className="muted mt-1 text-xs">Dashed line: upper end of the healthy range ({t?.bmi_standard === 'who' ? 'WHO' : 'Asian'} standard).</p>
        </div>
        <div className="card">
          <h2 className="mb-3 font-semibold">Calories per day (30 days)</h2>
          {calData.length === 0 ? <p className="muted text-sm">No logged days yet.</p> : (
            <div className="h-48">
              <ResponsiveContainer>
                <BarChart data={calData} margin={{ left: -15, right: 8, top: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#94a3b833" vertical={false} />
                  <XAxis dataKey="label" tick={axis} interval="preserveStartEnd" minTickGap={20} />
                  <YAxis tick={axis} />
                  <Tooltip formatter={(v) => [`${v} kcal`, 'Eaten']} />
                  {t && <ReferenceLine y={t.calories} stroke="#16a34a" strokeDasharray="4 4" />}
                  <Bar dataKey="kcal" fill="#43cc77" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Averages days={7} target={t} />
        <Averages days={30} target={t} />
      </div>
    </div>
  );
}
