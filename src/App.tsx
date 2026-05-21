import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { PermissionsProvider } from "@/contexts/PermissionsContext";
import { OfflineSyncProvider } from "@/hooks/useOfflineSync";
import Index from "./pages/Index";
import AuthPage from "./pages/AuthPage";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Don't refetch just because the user switched tabs — reduces background noise
      refetchOnWindowFocus: false,
      // 2-minute stale time: data is considered fresh and won't be re-requested
      // unless the cache key changes or 2 min elapses
      staleTime: 2 * 60 * 1000,
      // Keep unused query results in cache for 5 min before GC
      gcTime: 5 * 60 * 1000,
    },
  },
});

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  if (loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
    </div>
  );
  if (!session) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}

function AuthRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  if (loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
    </div>
  );
  if (session) return <Navigate to="/" replace />;
  return <>{children}</>;
}

// All section paths that map to the main AppShell.
// The AppShell reads the current path via NavigationContext (useLocation) to
// decide which section to render — so we only need one wildcard catch-all here.
const SECTION_PATHS = [
  "/", "/property", "/maintenance", "/messages", "/profile",
  "/manuals", "/checklists", "/tasks", "/contacts", "/vendors", "/inventory",
  "/laundry", "/orders", "/meet-team", "/travel", "/calendar",
  "/achievements", "/master-import", "/memory", "/alerts", "/rules", "/car-wash",
  "/staff-schedule", "/timeline",
];

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          {/* PermissionsProvider inside AuthProvider — runs ONE set of DB queries
              and shares results via context to all 30+ consuming components. */}
          <OfflineSyncProvider>
          <PermissionsProvider>
            <Routes>
              <Route path="/auth" element={<AuthRoute><AuthPage /></AuthRoute>} />
              <Route path="/reset-password" element={<ResetPassword />} />
              {/* All app sections share a single AppShell; the active section is
                  derived from the URL path inside NavigationContext. */}
              {SECTION_PATHS.map(path => (
                <Route
                  key={path}
                  path={path}
                  element={<ProtectedRoute><Index /></ProtectedRoute>}
                />
              ))}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </PermissionsProvider>
          </OfflineSyncProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
