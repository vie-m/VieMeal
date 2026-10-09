import { Salad } from 'lucide-react';

export default function Logo({ small }) {
  return (
    <span className="inline-flex items-center gap-2 font-bold tracking-tight">
      <span className="rounded-xl bg-brand-600 p-1.5 text-white"><Salad className={small ? 'h-4 w-4' : 'h-5 w-5'} /></span>
      <span className={small ? 'text-base' : 'text-lg'}>Vie<span className="text-brand-600">Meal</span></span>
    </span>
  );
}
