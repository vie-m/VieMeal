// Routes. Public: landing, login, register. Normal accounts need onboarding;
// guests go straight to Profile so they can choose their own settings.
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import Layout from './components/Layout.jsx';
import { Skeleton } from './components/ui.jsx';
import Landing from './pages/Landing.jsx';
import { Login, Register, UpgradeAccount } from './pages/Auth.jsx';
import Onboarding from './pages/Onboarding.jsx';
import Home from './pages/Home.jsx';
import FoodSearch from './pages/FoodSearch.jsx';
import Diary from './pages/Diary.jsx';
import Planner from './pages/Planner.jsx';
import Recipes from './pages/Recipes.jsx';
import RecipeDetail from './pages/RecipeDetail.jsx';
import RecipeNew from './pages/RecipeNew.jsx';
import Assistant from './pages/Assistant.jsx';
import Progress from './pages/Progress.jsx';
import Profile from './pages/Profile.jsx';

function FullPageLoader() {
  return (
    <div className="mx-auto max-w-md space-y-4 p-6">
      <Skeleton className="h-10 w-40" />
      <Skeleton className="h-40" />
      <Skeleton className="h-24" />
    </div>
  );
}

// Guard for the app pages.
function RequireAuth({ children, needProfile = true }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <FullPageLoader />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  const guestSetupPage = user.is_guest && ['/app/profile', '/app/signup'].includes(location.pathname);
  if (needProfile && !user.has_profile && !guestSetupPage) return <Navigate to="/onboarding" replace />;
  return children;
}

// Logged-in users skip the landing / login pages.
function PublicOnly({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <FullPageLoader />;
  if (user) return <Navigate to={user.has_profile ? '/app' : user.is_guest ? '/app/profile' : '/onboarding'} replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<PublicOnly><Landing /></PublicOnly>} />
      <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
      <Route path="/register" element={<PublicOnly><Register /></PublicOnly>} />
      <Route path="/onboarding" element={<RequireAuth needProfile={false}><Onboarding /></RequireAuth>} />
      <Route path="/app" element={<RequireAuth><Layout /></RequireAuth>}>
        <Route index element={<Home />} />
        <Route path="food" element={<FoodSearch />} />
        <Route path="diary" element={<Diary />} />
        <Route path="plan" element={<Planner />} />
        <Route path="recipes" element={<Recipes />} />
        <Route path="recipes/new" element={<RecipeNew />} />
        <Route path="recipes/:id" element={<RecipeDetail />} />
        <Route path="ai" element={<Assistant />} />
        <Route path="progress" element={<Progress />} />
        <Route path="profile" element={<Profile />} />
        <Route path="signup" element={<UpgradeAccount />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
