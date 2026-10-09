// Pie chart of calories from protein / carbs / fat (recharts).
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

const COLORS = { Protein: '#16a34a', Carbs: '#f59e0b', Fat: '#6366f1' };

export default function MacroPie({ protein, carbs, fat, size = 140 }) {
  // Calories from each macro: protein and carbs 4 kcal/g, fat 9 kcal/g.
  const data = [
    { name: 'Protein', grams: protein, value: Math.round(protein * 4) },
    { name: 'Carbs', grams: carbs, value: Math.round(carbs * 4) },
    { name: 'Fat', grams: fat, value: Math.round(fat * 9) },
  ];
  const total = data.reduce((s, d) => s + d.value, 0);
  if (!total) return <p className="muted text-sm">No macro data</p>;
  return (
    <div className="flex flex-wrap items-center gap-4">
      <div style={{ width: size, height: size }}>
        <ResponsiveContainer>
          <PieChart>
            <Pie data={data} dataKey="value" innerRadius="55%" outerRadius="100%" paddingAngle={2} stroke="none" isAnimationActive={false}>
              {data.map((d) => <Cell key={d.name} fill={COLORS[d.name]} />)}
            </Pie>
            <Tooltip formatter={(v) => `${v} kcal`} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="space-y-1.5 text-sm">
        {data.map((d) => (
          <li key={d.name} className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full" style={{ background: COLORS[d.name] }} />
            <span className="w-16">{d.name}</span>
            <span className="w-14 tabular-nums">{Math.round(d.grams * 10) / 10} g</span>
            <span className="muted tabular-nums">{Math.round((d.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
