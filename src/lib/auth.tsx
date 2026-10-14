import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { isDemoMode, exitDemo } from "@/lib/demo";

type AuthCtx = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  isDemo: boolean;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthCtx>({ session: null, user: null, loading: true, isDemo: false, signOut: async () => {} });

const DEMO_USER = {
  id: "demo-user",
  email: "demo@aioutreach.studio",
  user_metadata: { full_name: "Demo Visitor" },
} as unknown as User;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isDemo, setIsDemo] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setIsDemo(!data.session && isDemoMode());
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const demoSession = { user: DEMO_USER } as unknown as Session;

  return (
    <Ctx.Provider
      value={{
        session: session ?? (isDemo ? demoSession : null),
        user: session?.user ?? (isDemo ? DEMO_USER : null),
        loading,
        isDemo,
        signOut: async () => {
          if (isDemo) {
            exitDemo();
            return;
          }
          await supabase.auth.signOut();
        },
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
