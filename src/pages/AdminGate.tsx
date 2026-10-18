import { useState } from "react";
import { useNavigate } from "@/lib/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Loader2, ShieldCheck, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ADMIN_GATE_SESSION_KEY } from "@/lib/constants";
import { useAuth } from "@/hooks/useAuth";

const AdminGate = () => {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const [code, setCode] = useState("");
  const [showCode, setShowCode] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) {
      toast.error("Enter the secret code");
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-gate", {
        body: { action: "verify", code },
      });

      if (error || data?.error || !data?.verified) {
        toast.error(data?.error || "Incorrect secret code");
        return;
      }

      sessionStorage.setItem(ADMIN_GATE_SESSION_KEY, "true");
      toast.success("Access granted");
      navigate("/admin", { replace: true });
    } catch {
      toast.error("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    sessionStorage.removeItem(ADMIN_GATE_SESSION_KEY);
    await signOut();
    navigate("/auth", { replace: true });
  };

  return (
    <main className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-sm p-6 space-y-5">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="rounded-full bg-muted p-3">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold">Secret Code Required</h1>
          <p className="text-sm text-muted-foreground">
            Enter the admin secret code to continue.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="secret-code">Secret code</Label>
            <div className="relative">
              <Input
                id="secret-code"
                type={showCode ? "text" : "password"}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                maxLength={128}
                autoComplete="off"
                placeholder="Enter secret code"
                className="text-base pr-10"
                autoFocus
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                onClick={() => setShowCode(!showCode)}
              >
                {showCode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </Button>
            </div>
          </div>

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Unlock Admin Panel
          </Button>
        </form>

        <Button variant="ghost" className="w-full" onClick={handleCancel}>
          Cancel and sign out
        </Button>
      </Card>
    </main>
  );
};

export default AdminGate;
