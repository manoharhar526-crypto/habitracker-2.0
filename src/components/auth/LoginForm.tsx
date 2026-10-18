import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "@/lib/navigation";

interface LoginFormProps {
  onSwitchToSignup: () => void;
}

export const LoginForm = ({ onSwitchToSignup }: LoginFormProps) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedUsername = username.trim();
    if (trimmedUsername.length < 1) {
      toast.error("Username is required");
      return;
    }
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("auth-login", {
        body: { username: trimmedUsername, password },
      });

      if (error || data?.error) {
        let message = data?.error as string | undefined;
        // Non-2xx responses put the body on error.context — read it for the real reason
        if (!message && error && "context" in error) {
          try {
            const body = await (error as { context: Response }).context.json();
            message = body?.error;
          } catch { /* ignore */ }
        }
        toast.error(message || "Invalid username or password");
        return;
      }


      if (data?.session) {
        await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });
        if (data.is_admin) {
          toast.success("Admin verified — enter the secret code");
          navigate("/admin-gate", { replace: true });
        } else {
          toast.success("Welcome back!");
        }
      }
    } catch (err) {
      console.error("Login error:", err);
      toast.error("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleLogin} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="username">Username</Label>
        <Input
          id="username"
          placeholder="Enter your username"
          value={username}
          onChange={(e) => setUsername(e.target.value.replace(/\s/g, ""))}
          maxLength={30}
          autoComplete="username"
          className="text-base"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <div className="relative">
          <Input
            id="password"
            type={showPassword ? "text" : "password"}
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            maxLength={128}
            autoComplete="current-password"
            className="text-base pr-10"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
            onClick={() => setShowPassword(!showPassword)}
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </Button>
        </div>
      </div>
      <Button type="submit" disabled={loading} className="w-full">
        {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
        Log In
      </Button>
      <p className="text-sm text-center text-muted-foreground">
        <button
          type="button"
          onClick={onSwitchToSignup}
          className="text-primary hover:underline font-medium"
        >
          Sign up
        </button>
      </p>
    </form>
  );
};
