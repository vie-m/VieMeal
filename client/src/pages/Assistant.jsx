// AI assistant chat. The last 10 messages are kept in memory and sent to the
// backend, which adds the user's profile context (never name or email).
import { useEffect, useRef, useState } from 'react';
import { Send, Sparkles, Bot, RotateCcw } from 'lucide-react';
import { api } from '../api.js';
import { useApi } from '../hooks/useApi.js';
import { EmptyState, ErrorBox, Skeleton } from '../components/ui.jsx';
import { GuestLock } from '../components/Guest.jsx';

const STARTERS = [
  'Is rendang healthy?',
  "What's a high-protein breakfast?",
  'How can I eat more vegetables?',
  'Healthy snacks under 200 kcal?',
];

// Very small formatter: **bold** and bullet lines, no HTML injection.
function Formatted({ text }) {
  return text.split('\n').map((line, i) => {
    const bullet = /^\s*[-*•]\s+/.test(line);
    const clean = line.replace(/^\s*[-*•]\s+/, '');
    const parts = clean.split(/(\*\*[^*]+\*\*)/g).map((p, j) =>
      p.startsWith('**') && p.endsWith('**') ? <b key={j}>{p.slice(2, -2)}</b> : p);
    if (!line.trim()) return <div key={i} className="h-2" />;
    return bullet
      ? <div key={i} className="flex gap-2"><span>•</span><span>{parts}</span></div>
      : <p key={i}>{parts}</p>;
  });
}

export default function Assistant() {
  const { data: status, loading } = useApi('/ai/status');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const bottom = useRef(null);

  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, busy]);

  const send = async (text) => {
    const content = text.trim();
    if (!content || busy) return;
    const next = [...messages, { role: 'user', content }].slice(-10); // keep the last 10
    setMessages(next);
    setInput('');
    setBusy(true);
    setError('');
    try {
      const r = await api.post('/ai/chat', { messages: next });
      setMessages([...next, { role: 'assistant', content: r.reply }].slice(-10));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Skeleton className="h-96" />;

  return (
    <div className="flex h-[calc(100dvh-13rem)] min-h-[420px] flex-col md:h-[calc(100dvh-9rem)]">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h1 className="page-title flex items-center gap-2"><Sparkles className="h-6 w-6 text-violet-500" /> AI assistant</h1>
          <p className="muted text-sm">General nutrition tips based on your goals. Not medical advice.</p>
        </div>
        {messages.length > 0 && (
          <button className="btn-ghost btn-sm" onClick={() => setMessages([])}><RotateCcw className="h-4 w-4" /> New chat</button>
        )}
      </div>

      {status?.guest ? (
        <div className="card">
          <GuestLock title="The AI assistant needs a free account"
            text="Guests can try everything else. Sign up to chat with the AI, get AI meal plans and ask &quot;Why this meal?&quot;." />
        </div>
      ) : !status?.enabled ? (
        <div className="card">
          <EmptyState icon={Bot} title="The AI assistant is not available right now"
            text="This server has no AI key configured. Everything else in VieMeal, including the meal planner, works without it." />
        </div>
      ) : (
        <>
          <div className="card flex-1 space-y-3 overflow-y-auto">
            {messages.length === 0 && (
              <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
                <Bot className="h-10 w-10 text-violet-500" />
                <p className="muted max-w-sm text-sm">Ask anything about food and nutrition. I know your goal, targets, diet and allergies.</p>
                <div className="flex max-w-lg flex-wrap justify-center gap-2">
                  {STARTERS.map((s) => <button key={s} className="chip-off" onClick={() => send(s)}>{s}</button>)}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] space-y-1 rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                  m.role === 'user' ? 'rounded-br-md bg-brand-600 text-white' : 'rounded-bl-md bg-slate-100 dark:bg-slate-800'}`}>
                  {m.role === 'user' ? m.content : <Formatted text={m.content} />}
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex"><div className="rounded-2xl rounded-bl-md bg-slate-100 px-4 py-3 dark:bg-slate-800">
                <span className="inline-flex gap-1">
                  {[0, 1, 2].map((i) => <span key={i} className="h-2 w-2 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: `${i * 0.15}s` }} />)}
                </span>
              </div></div>
            )}
            <div ref={bottom} />
          </div>
          <div className="mt-2"><ErrorBox message={error} /></div>
          <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="mt-2 flex gap-2">
            <input className="input flex-1" placeholder="Ask about food, meals or nutrition..." value={input} maxLength={2000}
              onChange={(e) => setInput(e.target.value)} />
            <button className="btn-primary px-3" disabled={busy || !input.trim()} aria-label="Send"><Send className="h-5 w-5" /></button>
          </form>
        </>
      )}
    </div>
  );
}
