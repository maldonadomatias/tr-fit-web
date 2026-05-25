import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useParams,
} from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AuthProvider } from '@/contexts/AuthContext';
import { RequireAdmin } from '@/components/RequireAdmin';
import { AdminShell } from '@/components/AdminShell';
import Login from '@/pages/Login';
import NotFound from '@/pages/NotFound';
import AdminUsers from '@/pages/admin/Users';
import AdminUserDetail from '@/pages/admin/UserDetail';
import AdminDashboard from '@/pages/admin/Dashboard';
import AdminPending from '@/pages/admin/Pending';
import AdminSubscriptions from '@/pages/admin/Subscriptions';
import AdminActivity from '@/pages/admin/Activity';
import AdminAlerts from '@/pages/admin/Alerts';
import AdminRutinas from '@/pages/admin/Rutinas';
import AdminExercises from '@/pages/admin/Exercises';

const qc = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 10_000, refetchOnWindowFocus: true },
  },
});

function RedirectRutina() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={`/admin/rutinas/${id ?? ''}`} replace />;
}

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <AuthProvider>
          <TooltipProvider delayDuration={150}>
            <Routes>
              <Route path="/" element={<Navigate to="/admin" replace />} />
              <Route path="/login" element={<Login />} />
              <Route
                element={
                  <RequireAdmin>
                    <AdminShell />
                  </RequireAdmin>
                }
              >
                <Route path="/admin" element={<AdminDashboard />} />
                <Route path="/admin/pending" element={<AdminPending />} />
                <Route path="/admin/alerts" element={<AdminAlerts />} />
                <Route path="/admin/users" element={<AdminUsers />} />
                <Route path="/admin/users/:id" element={<AdminUserDetail />} />
                <Route
                  path="/admin/subscriptions"
                  element={<AdminSubscriptions />}
                />
                <Route path="/admin/activity" element={<AdminActivity />} />
                <Route path="/admin/rutinas" element={<AdminRutinas />} />
                <Route path="/admin/rutinas/atleta" element={<AdminRutinas />} />
                <Route path="/admin/rutinas/atleta/:athleteId" element={<AdminRutinas />} />
                <Route path="/admin/rutinas/:id" element={<AdminRutinas />} />
                <Route path="/admin/exercises" element={<AdminExercises />} />
              </Route>
              <Route
                path="/admin/operations"
                element={<Navigate to="/admin" replace />}
              />
              <Route
                path="/admin/operations/athletes"
                element={<Navigate to="/admin/users" replace />}
              />
              <Route
                path="/admin/operations/athletes/:id"
                element={<Navigate to="/admin/users" replace />}
              />
              <Route
                path="/admin/operations/skeletons"
                element={<Navigate to="/admin/rutinas" replace />}
              />
              <Route
                path="/admin/operations/skeletons/:id"
                element={<RedirectRutina />}
              />
              <Route
                path="/admin/operations/alerts"
                element={<Navigate to="/admin/alerts" replace />}
              />
              <Route path="*" element={<NotFound />} />
            </Routes>
            <Toaster />
          </TooltipProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
