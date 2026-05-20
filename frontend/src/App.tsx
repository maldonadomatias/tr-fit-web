import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AuthProvider } from '@/contexts/AuthContext';
import { RequireCoach } from '@/components/RequireCoach';
import { RequireAdmin } from '@/components/RequireAdmin';
import { AppShell } from '@/components/AppShell';
import { AdminShell } from '@/components/AdminShell';
import Login from '@/pages/Login';
import NotFound from '@/pages/NotFound';
import Home from '@/pages/coach/Home';
import Athletes from '@/pages/coach/Athletes';
import AthleteDetail from '@/pages/coach/AthleteDetail';
import Skeletons from '@/pages/coach/Skeletons';
import SkeletonReview from '@/pages/coach/SkeletonReview';
import Alerts from '@/pages/coach/Alerts';
import AdminUsers from '@/pages/admin/Users';
import AdminUserDetail from '@/pages/admin/UserDetail';
import AdminDashboard from '@/pages/admin/Dashboard';
import AdminPending from '@/pages/admin/Pending';
import AdminSubscriptions from '@/pages/admin/Subscriptions';

const qc = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 10_000, refetchOnWindowFocus: true },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <AuthProvider>
          <TooltipProvider delayDuration={150}>
          <Routes>
            <Route path="/" element={<Navigate to="/coach" replace />} />
            <Route path="/login" element={<Login />} />
            <Route
              element={
                <RequireCoach>
                  <AppShell />
                </RequireCoach>
              }
            >
              <Route path="/coach" element={<Home />} />
              <Route path="/coach/athletes" element={<Athletes />} />
              <Route path="/coach/athletes/:id" element={<AthleteDetail />} />
              <Route path="/coach/skeletons" element={<Skeletons />} />
              <Route path="/coach/skeletons/:id" element={<SkeletonReview />} />
              <Route path="/coach/alerts" element={<Alerts />} />
            </Route>
            <Route
              element={
                <RequireAdmin>
                  <AdminShell />
                </RequireAdmin>
              }
            >
              <Route path="/admin" element={<AdminDashboard />} />
              <Route path="/admin/pending" element={<AdminPending />} />
              <Route path="/admin/users" element={<AdminUsers />} />
              <Route path="/admin/users/:id" element={<AdminUserDetail />} />
              <Route
                path="/admin/subscriptions"
                element={<AdminSubscriptions />}
              />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
          <Toaster />
          </TooltipProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
