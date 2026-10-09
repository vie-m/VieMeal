// App shell: sidebar on desktop (md and up), bottom navigation on mobile.
import { NavLink, Outlet } from 'react-router-dom';
import {
  Home, Search, CalendarDays, Sparkles, User, BookOpen, ChefHat, LineChart, Moon, Sun, LogOut,
} from 'lucide-react';
import Logo from './Logo.jsx';
import { Disclaimer } from './ui.jsx';
import LogoutButton from './LogoutButton.jsx';
import { useTheme } from '../hooks/useTheme.js';
import { useAuth } from '../context/AuthContext.jsx';
import { GuestBanner } from './Guest.jsx';

// The 5 main tabs (the mobile bottom bar shows these).
const MAIN = [
  { to: '/app', label: 'Home', long: 'Home', icon: Home, end: true },
  { to: '/app/food', label: 'Food', long: 'Food search', icon: Search },
  { to: '/app/plan', label: 'Plan', long: 'Meal planner', icon: CalendarDays },
  { to: '/app/ai', label: 'AI', long: 'AI assistant', icon: Sparkles },
  { to: '/app/profile', label: 'Profile', long: 'Profile & settings', icon: User },
];
// Extra pages (desktop sidebar; on mobile they are linked from Home and Profile).
const EXTRA = [
  { to: '/app/diary', label: 'Food diary', icon: BookOpen },
  { to: '/app/recipes', label: 'Recipes', icon: ChefHat },
  { to: '/app/progress', label: 'Progress', icon: LineChart },
];

const sideLink = ({ isActive }) =>
  `flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
    isActive
      ? 'bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300'
      : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
  }`;

export default function Layout() {
  const [dark, setDark] = useTheme();
  const { user } = useAuth();

  return (
    <div className="min-h-screen md:flex">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 md:flex lg:w-64">
        <div className="mb-6 px-2"><Logo /></div>
        <nav className="space-y-1">
          {MAIN.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end} className={sideLink}>
              <l.icon className="h-5 w-5" /> {l.long}
            </NavLink>
          ))}
          <div className="my-3 border-t border-slate-100 dark:border-slate-800" />
          {EXTRA.map((l) => (
            <NavLink key={l.to} to={l.to} className={sideLink}><l.icon className="h-5 w-5" /> {l.label}</NavLink>
          ))}
        </nav>
        <div className="mt-auto space-y-1">
          <button className={sideLink({ isActive: false })} onClick={() => setDark(!dark)}>
            {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />} {dark ? 'Light mode' : 'Dark mode'}
          </button>
          <LogoutButton className={sideLink({ isActive: false })}>
            <LogOut className="h-5 w-5" /> Log out
          </LogoutButton>
          <p className="muted truncate px-3 pt-2 text-xs">{user?.is_guest ? 'Guest account' : user?.email}</p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90 md:hidden">
          <Logo small />
          <button className="btn-ghost p-2" onClick={() => setDark(!dark)} aria-label="Toggle dark mode">
            {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-8 pt-4 sm:px-6 md:pt-8">
          <GuestBanner />
          <Outlet />
        </main>

        <footer className="px-4 pb-24 pt-2 text-center md:pb-6">
          <Disclaimer />
        </footer>

        {/* Mobile bottom navigation */}
        <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 md:hidden">
          {MAIN.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${isActive ? 'text-brand-600 dark:text-brand-400' : 'text-slate-500'}`}
            >
              <l.icon className="h-5 w-5" />
              {l.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}
