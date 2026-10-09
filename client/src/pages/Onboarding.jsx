// Onboarding after the first login: 3 short steps, then the personal targets.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import Logo from '../components/Logo.jsx';
import { BodyFields, DietFields, GoalFields, useProfileForm } from '../components/ProfileForm.jsx';
import TargetsSummary from '../components/TargetsSummary.jsx';
import { Disclaimer, ErrorBox, SkeletonList } from '../components/ui.jsx';
import { api } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';

const STEPS = ['Body info', 'Activity & goal', 'Diet & allergies'];

export default function Onboarding() {
  const { user, markProfileDone } = useAuth();
  const navigate = useNavigate();
  const p = useProfileForm();
  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [targets, setTargets] = useState(null);

  // Simple client-side checks per step (the server validates everything again).
  const stepError = () => {
    const f = p.form;
    if (step === 0) {
      if (!f.birth_date) return 'Please enter your birth date';
      const age = (Date.now() - new Date(f.birth_date)) / 3.156e10;
      if (age < 18) return 'VieMeal is designed for adults (18+)';
      if (!(f.height_cm >= 100 && f.height_cm <= 250)) return 'Height should be between 100 and 250 cm';
      if (!(f.weight_kg >= 25 && f.weight_kg <= 400)) return 'Weight should be between 25 and 400 kg';
    }
    return '';
  };

  const next = async (e) => {
    e.preventDefault();
    const err = stepError();
    setError(err);
    if (err) return;
    if (step < STEPS.length - 1) return setStep(step + 1);
    setBusy(true);
    try {
      await p.save();
      setTargets(await api.get('/profile/targets'));
      markProfileDone();
    } catch (ex) {
      setError(ex.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto min-h-screen max-w-3xl px-4 py-6 sm:py-10">
      <div className="mb-6 flex items-center justify-between"><Logo /></div>

      {targets ? (
        <div className="space-y-4">
          <div>
            <h1 className="page-title">Your personal targets</h1>
            <p className="muted">Here is what we calculated for you, {user?.full_name?.split(' ')[0]}. You can change your details any time in Profile.</p>
          </div>
          <TargetsSummary t={targets} />
          <button className="btn-primary w-full py-3 sm:w-auto" onClick={() => navigate('/app', { replace: true })}>
            Go to my dashboard <ArrowRight className="h-4 w-4" />
          </button>
          <Disclaimer />
        </div>
      ) : p.loading ? (
        <SkeletonList rows={3} className="h-20" />
      ) : (
        <form onSubmit={next} className="card space-y-5">
          {/* Step indicator */}
          <ol className="flex gap-2">
            {STEPS.map((s, i) => (
              <li key={s} className="flex-1">
                <div className={`h-1.5 rounded-full ${i <= step ? 'bg-brand-500' : 'bg-slate-200 dark:bg-slate-700'}`} />
                <div className={`mt-1 hidden text-xs sm:block ${i === step ? 'font-semibold' : 'muted'}`}>{i + 1}. {s}</div>
              </li>
            ))}
          </ol>
          <div>
            <h1 className="text-xl font-bold">{STEPS[step]}</h1>
            <p className="muted text-sm">Step {step + 1} of {STEPS.length}</p>
          </div>

          {step === 0 && <BodyFields form={p.form} set={p.set} />}
          {step === 1 && <GoalFields form={p.form} set={p.set} />}
          {step === 2 && <DietFields form={p.form} set={p.set} allergens={p.allergens} setAllergens={p.setAllergens} />}

          <ErrorBox message={error || p.error} />
          <div className="flex justify-between gap-2">
            <button type="button" className="btn-ghost" disabled={step === 0} onClick={() => setStep(step - 1)}>
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
            <button className="btn-primary" disabled={busy}>
              {step < STEPS.length - 1 ? <>Next <ArrowRight className="h-4 w-4" /></> : busy ? 'Saving...' : <>See my targets <Check className="h-4 w-4" /></>}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
