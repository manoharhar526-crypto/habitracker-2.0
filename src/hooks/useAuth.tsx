import { useState, useEffect, createContext, useContext, ReactNode } from "react";
import { STORAGE_KEYS } from "@/lib/constants";
import { supabase } from "@/integrations/supabase/client";
import { User, Session } from "@supabase/supabase-js";
import { cancelPending } from "@/services/backgroundSync";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  username: string | null;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  username: null,
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    let settled = false;

    // Set up auth state listener FIRST
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      settled = true;
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);

      if (session?.user) {
        setTimeout(() => fetchUsername(session.user.id), 0);
      } else {
        setUsername(null);
      }
    });

    // Check for existing session — with a timeout fallback
    // so offline users don't get stuck on loading screen
    const timeoutId = setTimeout(() => {
      if (mounted && !settled) {
        setLoading(false); // give up waiting after 3s
      }
    }, 3000);

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      settled = true;
      clearTimeout(timeoutId);
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);

      if (session?.user) {
        fetchUsername(session.user.id);
      }
    }).catch(() => {
      if (mounted) setLoading(false);
    });

    return () => {
      mounted = false;
      clearTimeout(timeoutId);
      subscription.unsubscribe();
    };
  }, []);

  const fetchUsername = async (userId: string) => {
    try {
      const { data } = await supabase
        .from("profiles")
        .select("username")
        .eq("user_id", userId)
        .maybeSingle();
      if (data) setUsername(data.username);
    } catch { /* offline, skip */ }
  };

  const signOut = async () => {
    // Cancel any pending background sync BEFORE signing out so the user's
    // data can't flush to Supabase after the session is gone
    if (user?.id) cancelPending(user.id);
    await supabase.auth.signOut();
    localStorage.removeItem(STORAGE_KEYS.IS_ADMIN);
    setUsername(null);
    setUser(null);
    setSession(null);
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, username, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};
