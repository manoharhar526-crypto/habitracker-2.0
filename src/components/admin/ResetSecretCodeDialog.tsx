import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";

export const ResetSecretCodeDialog = () => {
  const [open, setOpen] = useState(false);
  const [currentCode, setCurrentCode] = useState("");
  const [newCode, setNewCode] = useState("");
  const [confirmCode, setConfirmCode] = useState("");
  const [loading, setLoading] = useState(false);

  const reset = () => {
    setCurrentCode("");
    setNewCode("");
    setConfirmCode("");
  };

  const handleReset = async () => {
    if (newCode.length < 4) {
      toast.error("New secret code must be at least 4 characters");
      return;
    }
    if (newCode !== confirmCode) {
      toast.error("New secret codes do not match");
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-gate", {
        body: { action: "reset", currentCode, newCode },
      });

      if (error || data?.error) {
        toast.error(data?.error || "Could not update secret code");
        return;
      }

      toast.success("Secret code updated");
      reset();
      setOpen(false);
    } catch {
      toast.error("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <KeyRound className="w-4 h-4 mr-2" />
          Reset Secret Code
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Reset admin secret code</DialogTitle>
          <DialogDescription>
            Any characters are allowed (letters, numbers, symbols). Minimum 4 characters.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="current-secret">Current secret code</Label>
            <Input
              id="current-secret"
              type="password"
              value={currentCode}
              onChange={(e) => setCurrentCode(e.target.value)}
              maxLength={128}
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-secret">New secret code</Label>
            <Input
              id="new-secret"
              type="password"
              value={newCode}
              onChange={(e) => setNewCode(e.target.value)}
              maxLength={128}
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-secret">Confirm new secret code</Label>
            <Input
              id="confirm-secret"
              type="password"
              value={confirmCode}
              onChange={(e) => setConfirmCode(e.target.value)}
              maxLength={128}
              autoComplete="off"
            />
          </div>
        </div>

        <DialogFooter>
          <Button onClick={handleReset} disabled={loading} className="w-full">
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Update Secret Code
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
