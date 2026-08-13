import { lazy, Suspense } from "react";
import {
  BrowserRouter,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import { AuthProvider } from "./contexts/AuthProvider";
import { AppDataProvider } from "./contexts/AppDataProvider";
import { FeedbackProvider } from "./contexts/FeedbackProvider";
import { useAuth } from "./contexts/auth";
import Navigation from "./components/Navigation";
import RouteEffects from "./components/RouteEffects";
import LandingPage from "./pages/LandingPage";
import Dashboard from "./pages/Dashboard";
import type { UserRole } from "./types";

const Campaigns = lazy(() => import("./pages/Campaigns"));
const CampaignDetail = lazy(() => import("./pages/CampaignDetail"));
const SocialStream = lazy(() => import("./pages/SocialStream"));
const Publishing = lazy(() => import("./pages/Publishing"));
const MediaLibrary = lazy(() => import("./pages/MediaLibrary"));
const Tasks = lazy(() => import("./pages/Tasks"));
const Agents = lazy(() => import("./pages/Agents"));
const Participants = lazy(() => import("./pages/Participants"));
const Profile = lazy(() => import("./pages/Profile"));
const Admin = lazy(() => import("./pages/Admin"));
const NotFound = lazy(() => import("./pages/NotFound"));

function LoadingScreen() {
  return (
    <div
      className="flex min-h-screen items-center justify-center bg-gray-900 text-gray-300"
      role="status"
    >
      <div className="text-center">
        <div className="mx-auto mb-4 h-9 w-9 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
        Sitzung wird geladen …
      </div>
    </div>
  );
}

function ProtectedLayout() {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();
  if (isLoading) return <LoadingScreen />;
  if (!isAuthenticated)
    return (
      <Navigate
        to="/"
        replace
        state={{
          from: `${location.pathname}${location.search}${location.hash}`,
        }}
      />
    );
  return (
    <div className="min-h-screen bg-gray-900">
      <a
        href="#main-content"
        className="sr-only z-[100] rounded bg-blue-600 px-4 py-2 text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Zum Inhalt springen
      </a>
      <Navigation />
      <main id="main-content" className="pt-16 md:pt-0">
        <Outlet />
      </main>
    </div>
  );
}

function RoleGuard({ roles }: { roles: UserRole[] }) {
  const { user } = useAuth();
  return user && roles.includes(user.role) ? (
    <Outlet />
  ) : (
    <Navigate to="/dashboard" replace />
  );
}

function PublicOnly() {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <LoadingScreen />;
  return isAuthenticated ? (
    <Navigate to="/dashboard" replace />
  ) : (
    <LandingPage />
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <RouteEffects />
      <AppDataProvider>
        <FeedbackProvider>
          <AuthProvider>
            <Suspense fallback={<LoadingScreen />}>
              <Routes>
                <Route path="/" element={<PublicOnly />} />
                <Route element={<ProtectedLayout />}>
                  <Route path="dashboard" element={<Dashboard />} />
                  <Route path="campaigns" element={<Campaigns />} />
                  <Route
                    path="campaigns/:campaignId"
                    element={<CampaignDetail />}
                  />
                  <Route path="social-stream" element={<SocialStream />} />
                  <Route path="publishing" element={<Publishing />} />
                  <Route path="media-library" element={<MediaLibrary />} />
                  <Route path="tasks" element={<Tasks />} />
                  <Route path="agents" element={<Agents />} />
                  <Route path="participants" element={<Participants />} />
                  <Route path="profile" element={<Profile />} />
                  <Route element={<RoleGuard roles={["Admin"]} />}>
                    <Route path="admin" element={<Admin />} />
                  </Route>
                </Route>
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </AuthProvider>
        </FeedbackProvider>
      </AppDataProvider>
    </BrowserRouter>
  );
}
