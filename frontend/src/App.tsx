import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/sonner';
import { AuthProvider } from '@/contexts/AuthContext';
import { RequireCoach } from '@/components/RequireCoach';
import { AppShell } from '@/components/AppShell';
import Login from '@/pages/Login';
import NotFound from '@/pages/NotFound';
import Home from '@/pages/coach/Home';
import Athletes from '@/pages/coach/Athletes';
import AthleteDetail from '@/pages/coach/AthleteDetail';
import Skeletons from '@/pages/coach/Skeletons';
import SkeletonReview from '@/pages/coach/SkeletonReview';
import Alerts from '@/pages/coach/Alerts';

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
            <Route path="*" element={<NotFound />} />
          </Routes>
          <Toaster />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
