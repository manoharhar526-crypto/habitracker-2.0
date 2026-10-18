import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { STORAGE_KEYS, ADMIN_GATE_SESSION_KEY } from "@/lib/constants";
import { AuthProvider } from "@/hooks/useAuth";
import { ThemeProvider } from "@/hooks/useTheme";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Widgets from "./pages/Widgets";
import AdminPanel from "./pages/AdminPanel";
import AdminGate from "./pages/AdminGate";
import AdminUserDetail from "./pages/AdminUserDetail";
import AdminUpdates from "./pages/AdminUpdates";
import NotFound from "./pages/NotFound";
import { ProtectedRoute, AdminRoute, AdminGateRoute, AuthRoute, useAdminAutoLogout } from "@/components/RouteGuards";

const queryClient = new QueryClient();

const AdminPanelPage = () => {
  const navigate = useNavigate();
  const handleBack = async () => {
    localStorage.removeItem(STORAGE_KEYS.IS_ADMIN);
    sessionStorage.removeItem(ADMIN_GATE_SESSION_KEY);
    await supabase.auth.signOut();
    navigate("/auth", { replace: true });
  };
  return <AdminPanel onBack={handleBack} />;
};

const AppRoutes = () => {
  useAdminAutoLogout();
  return (
    <Routes>
      <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
      <Route path="/widgets" element={<ProtectedRoute><Widgets /></ProtectedRoute>} />
      <Route path="/auth" element={<AuthRoute><Auth /></AuthRoute>} />
      <Route path="/admin-login" element={<Navigate to="/auth" replace />} />
      <Route path="/admin-gate" element={<AdminGateRoute><AdminGate /></AdminGateRoute>} />
      <Route path="/admin" element={<AdminRoute><AdminPanelPage /></AdminRoute>} />
      <Route path="/admin/updates" element={<AdminRoute><AdminUpdates /></AdminRoute>} />
      <Route path="/admin/user/:userId" element={<AdminRoute><AdminUserDetail /></AdminRoute>} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
