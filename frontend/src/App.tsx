import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AuthProvider } from '@/contexts/AuthContext';
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
import AdminActivity from '@/pages/admin/Activity';

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
            <Route path="/" element={<Navigate to="/admin" replace />} />
            <Route path="/login" element={<Login />} />
            <Route
              element={
                <RequireAdmin>
                  <AppShell />
                </RequireAdmin>
              }
            >
              <Route path="/admin/operations" element={<Home />} />
              <Route path="/admin/operations/athletes" element={<Athletes />} />
              <Route path="/admin/operations/athletes/:id" element={<AthleteDetail />} />
              <Route path="/admin/operations/skeletons" element={<Skeletons />} />
              <Route path="/admin/operations/skeletons/:id" element={<SkeletonReview />} />
              <Route path="/admin/operations/alerts" element={<Alerts />} />
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
              <Route path="/admin/activity" element={<AdminActivity />} />
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
