import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { LoginForm } from "@/components/auth/LoginForm";
import { SignupForm } from "@/components/auth/SignupForm";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "@/lib/navigation";

import { useAuth } from "@/hooks/useAuth";

const Auth = () => {
  const [isLogin, setIsLogin] = useState(true);
  const navigate = useNavigate();
  const { user } = useAuth();

  // Redirects for signed-in users are handled solely by AuthRoute in App.tsx.
  void navigate; void user;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Habit Tracker</h1>
          {isLogin ? (
            <p className="text-muted-foreground text-sm">
              sign up! before Log in.&nbsp; &nbsp;
            </p>
          ) : (
            <>
              <p className="text-base font-semibold text-primary">
                Please create an account by signing up
              </p>
            </>
          )}
        </div>

        <Card className="p-6">
          {isLogin ? (
            <LoginForm onSwitchToSignup={() => setIsLogin(false)} />
          ) : (
            <SignupForm onSwitchToLogin={() => setIsLogin(true)} />
          )}
        </Card>


        <p className="text-xs text-center text-muted-foreground">
          {"\n"}
        </p>
      </div>
    </div>
  );
};

export default Auth;
