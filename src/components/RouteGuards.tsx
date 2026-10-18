import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { STORAGE_KEYS, ADMIN_GATE_SESSION_KEY } from "@/lib/constants";

const ADMIN_KEY = STORAGE_KEYS.IS_ADMIN;
export const ADMIN_SESSION_KEY = "admin_session_active";

export const LoadingScreen = () => (
  <div className="min-h-screen bg-background flex items-center justify-center">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
  </div>
);

/**
 * Server-verified admin check. Returns null while unknown. On network/DB
 * errors it stays null and retries — never falls back to "not admin".
 */
const useIsAdmin = (userId: string | undefined) => {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  useEffect(() => {
    if (!userId) {
      setIsAdmin(false);
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    setIsAdmin(null);
    const check = () => {
      supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .eq("role", "admin")
        .maybeSingle()
        .then(({ data, error }) => {
          if (cancelled) return;
          if (error) {
            timer = setTimeout(check, 1500);
            return;
          }
          setIsAdmin(!!data);
        });
    };
    check();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [userId]);
  return isAdmin;
};

/** Auto-logout admin when the app is closed and reopened. */
export const useAdminAutoLogout = () => {
  const { user, signOut } = useAuth();
  useEffect(() => {
    if (!user) return;
    const wasAdmin = localStorage.getItem(ADMIN_KEY) === "true";
    const hasSession = sessionStorage.getItem(ADMIN_SESSION_KEY) === "true";
    if (wasAdmin && !hasSession) {
      localStorage.removeItem(ADMIN_KEY);
      sessionStorage.removeItem(ADMIN_GATE_SESSION_KEY);
      void signOut();
    } else {
      sessionStorage.setItem(ADMIN_SESSION_KEY, "true");
    }
  }, [user, signOut]);
};

/** Regular user pages: signed in AND not an admin. */
export const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  const isAdmin = useIsAdmin(user?.id);
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/auth" replace />;
  if (isAdmin === null) return <LoadingScreen />;
  if (isAdmin) {
    return (
      <Navigate
        to={sessionStorage.getItem(ADMIN_GATE_SESSION_KEY) === "true" ? "/admin" : "/admin-gate"}
        replace
      />
    );
  }
  return <>{children}</>;
};

/** Admin pages behind the secret-code gate. */
export const AdminRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  const isAdmin = useIsAdmin(user?.id);

  useEffect(() => {
    if (isAdmin === true) {
      localStorage.setItem(ADMIN_KEY, "true");
      sessionStorage.setItem(ADMIN_SESSION_KEY, "true");
    } else if (isAdmin === false) {
      localStorage.removeItem(ADMIN_KEY);
    }
  }, [isAdmin]);

  if (loading || isAdmin === null) return <LoadingScreen />;
  if (!user) return <Navigate to="/auth" replace />;
  if (!isAdmin) return <Navigate to="/" replace />;
  if (sessionStorage.getItem(ADMIN_GATE_SESSION_KEY) !== "true")
    return <Navigate to="/admin-gate" replace />;
  return <>{children}</>;
};

/** The secret-code gate itself (admin only, no gate check). */
export const AdminGateRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  const isAdmin = useIsAdmin(user?.id);

  if (loading || isAdmin === null) return <LoadingScreen />;
  if (!user) return <Navigate to="/auth" replace />;
  if (!isAdmin) return <Navigate to="/" replace />;
  if (sessionStorage.getItem(ADMIN_GATE_SESSION_KEY) === "true")
    return <Navigate to="/admin" replace />;
  return <>{children}</>;
};

/** Sends signed-in users away from the auth page. */
export const AuthRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  const isAdmin = useIsAdmin(user?.id);

  useEffect(() => {
    if (isAdmin === true) localStorage.setItem(ADMIN_KEY, "true");
    else if (isAdmin === false) localStorage.removeItem(ADMIN_KEY);
  }, [isAdmin]);

  if (loading) return <LoadingScreen />;
  if (user) {
    if (isAdmin === null) return <LoadingScreen />;
    return <Navigate to={isAdmin ? "/admin-gate" : "/"} replace />;
  }
  return <>{children}</>;
};
