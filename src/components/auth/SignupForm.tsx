import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Eye, EyeOff, Check, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface SignupFormProps {
  onSwitchToLogin: () => void;
}

export const SignupForm = ({ onSwitchToLogin }: SignupFormProps) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [checkingUsername, setCheckingUsername] = useState(false);

  const validateUsername = (value: string) => {
    return /^[^\s]{1,30}$/.test(value);
  };

  const createInternalEmailFromUsername = async (value: string) => {
    const usernameBytes = new TextEncoder().encode(value.trim());
    const hashBuffer = await crypto.subtle.digest("SHA-256", usernameBytes);
    const hashHex = Array.from(new Uint8Array(hashBuffer))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");

    return `${hashHex}@habittracker.app`;
  };

  const checkUsernameAvailability = async (value: string) => {
    if (!validateUsername(value)) {
      setUsernameAvailable(null);
      return;
    }

    setCheckingUsername(true);
    try {
      const { data, error } = await supabase.rpc("check_username_available", {
        target_username: value,
      });

      if (error) {
        setUsernameAvailable(null);
        return;
      }

      setUsernameAvailable(data as boolean);
    } catch {
      setUsernameAvailable(null);
    } finally {
      setCheckingUsername(false);
    }
  };

  const usernameTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleUsernameChange = (value: string) => {
    const cleaned = value.replace(/\s/g, "");
    setUsername(cleaned);
    setUsernameAvailable(null);

    if (usernameTimeoutRef.current) {
      clearTimeout(usernameTimeoutRef.current);
      usernameTimeoutRef.current = null;
    }

    if (cleaned.length >= 1) {
      usernameTimeoutRef.current = setTimeout(() => checkUsernameAvailability(cleaned), 500);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateUsername(username)) {
      toast.error("Username must be 1-30 characters with no spaces");
      return;
    }

    if (password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }

    const generatedEmail = await createInternalEmailFromUsername(username);

    if (usernameAvailable === false) {
      toast.error("This username is already taken");
      return;
    }

    setLoading(true);
    try {
      // Final availability check via RPC
      const { data: available } = await supabase.rpc("check_username_available", {
        target_username: username,
      });

      if (!available) {
        toast.error("This username was just taken! Please choose another.");
        setUsernameAvailable(false);
        setLoading(false);
        return;
      }

      const { error } = await supabase.auth.signUp({
        email: generatedEmail,
        password,
        options: {
          data: { username },
        },
      });

      if (error) {
        if (error.message.includes("already registered")) {
          toast.error("This username is already registered. Try logging in instead.");
        } else {
          toast.error(error.message);
        }
        return;
      }

      toast.success("Account created successfully. You can log in now.", {
        duration: 5000,
      });
      onSwitchToLogin();
    } catch (err) {
      console.error("Signup error:", err);
      toast.error("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSignup} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="signup-username">Username</Label>
        <div className="relative">
          <Input
            id="signup-username"
            placeholder="Choose a unique username"
            value={username}
            onChange={(e) => handleUsernameChange(e.target.value)}
            maxLength={30}
            autoComplete="username"
            className="text-base pr-10"
          />
          {username.length >= 1 && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              {checkingUsername ? (
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              ) : usernameAvailable === true ? (
                <Check className="w-4 h-4 text-primary" />
              ) : usernameAvailable === false ? (
                <X className="w-4 h-4 text-destructive" />
              ) : null}
            </div>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Any characters allowed except spaces (1-30 chars)
        </p>
        {usernameAvailable === false && (
        <p className="text-xs text-destructive">This username is already taken</p>
        )}
      </div>


      <div className="space-y-2">
        <Label htmlFor="signup-password">Password</Label>
        <div className="relative">
          <Input
            id="signup-password"
            type={showPassword ? "text" : "password"}
            placeholder="Create a password (min 6 characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            maxLength={128}
            autoComplete="new-password"
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

      <Button
        type="submit"
        disabled={loading || usernameAvailable === false}
        className="w-full"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
        Create Account
      </Button>

      <p className="text-sm text-center text-muted-foreground">
        Already have an account?{" "}
        <button
          type="button"
          onClick={onSwitchToLogin}
          className="text-primary hover:underline font-medium"
        >
          Log in
        </button>
      </p>
    </form>
  );
};
