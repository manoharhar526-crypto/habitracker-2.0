import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Shield, Download, Upload, Trash2, Clock, Check, Timer } from "lucide-react";
import { toast } from "sonner";
import {
  loadManualBackups, saveManualBackup, restoreManualBackup,
  deleteManualBackup, type ManualBackup,
} from "@/lib/appStorage";
import type { Habit } from "@/types/habit";
import type { Task } from "@/types/task";
import { loadAutoBackupSettings, saveAutoBackupSettings, type AutoBackupSettings } from "@/hooks/useAutoBackup";
import { saveSharedBackup, restoreSharedBackup, listMySharedBackups, deleteSharedBackup, type SharedBackupMeta } from "@/lib/sharedBackup";

interface BackupRestoreDialogProps {
  habits: Habit[];
  tasks: Task[];
  onRestore: (habits: Habit[], tasks: Task[]) => void;
}

export const BackupRestoreDialog = ({ habits, tasks, onRestore }: BackupRestoreDialogProps) => {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("manual");
  const [manualBackups, setManualBackups] = useState<ManualBackup[]>([]);
  const [newCode, setNewCode] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [restoreCode, setRestoreCode] = useState("");
  const [deleteCode, setDeleteCode] = useState("");
  const [confirmDeleteCode, setConfirmDeleteCode] = useState<string | null>(null);
  const [autoSettings, setAutoSettings] = useState<AutoBackupSettings>(() => loadAutoBackupSettings());
  const [autoCodeInput, setAutoCodeInput] = useState("");
  const [autoRestoreCode, setAutoRestoreCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [cloudBackups, setCloudBackups] = useState<SharedBackupMeta[]>([]);

  const refreshData = () => {
    setManualBackups(loadManualBackups());
    setAutoSettings(loadAutoBackupSettings());
  };

  const loadCloudCodes = async () => {
    try {
      const res = await listMySharedBackups();
      const backups = res.backups ?? [];
      setCloudBackups(backups);
      // Reconcile device-only settings with the account source of truth. This
      // prevents a previously cached/deleted code from appearing as reserved.
      const local = loadAutoBackupSettings();
      const localCodeExists = local.code
        ? backups.some((backup) => backup.code === local.code?.trim().toLowerCase())
        : false;
      if (!localCodeExists) {
        const next = {
          ...local,
          code: backups[0]?.code,
          enabled: backups.length > 0 ? local.enabled : false,
        };
        saveAutoBackupSettings(next);
        setAutoSettings(next);
      }
    } catch { /* offline / not signed in — ignore */ }
  };

  useEffect(() => { if (open) { refreshData(); loadCloudCodes(); } }, [open]);

  const updateAuto = (patch: Partial<AutoBackupSettings>) => {
    const next = { ...autoSettings, ...patch };
    setAutoSettings(next);
    saveAutoBackupSettings(next);
  };

  const handleCreateManualBackup = async () => {
    const code = newCode.trim().toLowerCase();
    if (code.length < 4) { toast.error("Backup code must be at least 4 characters"); return; }
    setBusy(true);
    try {
      await saveSharedBackup(code, habits, tasks, newLabel.trim() || undefined);
      const result = saveManualBackup(code, habits, tasks, newLabel.trim() || undefined);
      if (!result.success && !result.error?.toLowerCase().includes("exists")) {
        toast.warning("Cloud backup created, but it could not be cached on this device");
      } else {
        toast.success(`Backup created with code: ${code}`);
      }
      setNewCode("");
      setNewLabel("");
      refreshData();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to create backup");
    } finally {
      setBusy(false);
    }
  };

  const restoreFromAnySource = async (rawCode: string) => {
    const code = rawCode.trim().toLowerCase();
    const local = restoreManualBackup(code);
    if (local.success && local.habits && local.tasks) {
      return { habits: local.habits, tasks: local.tasks };
    }
    const remote = await restoreSharedBackup(code);
    return { habits: remote.habits, tasks: remote.tasks };
  };

  const handleRestore = async () => {
    const code = restoreCode.trim().toLowerCase();
    if (code.length < 4) { toast.error("Enter a valid backup code"); return; }
    setBusy(true);
    try {
      const result = await restoreFromAnySource(code);
      onRestore(result.habits, result.tasks);
      toast.success("Data restored successfully!");
      setRestoreCode("");
      setOpen(false);
    } catch (e: any) {
      toast.error(e?.message ?? "No backup found for that code");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = (code: string) => {
    const ok = deleteManualBackup(code);
    if (ok) { toast.success("Backup deleted"); refreshData(); }
    else toast.error("Failed to delete backup");
    setConfirmDeleteCode(null);
  };

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });
    } catch { return iso; }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setNewCode(""); setNewLabel(""); setRestoreCode(""); setDeleteCode(""); setConfirmDeleteCode(null); setTab("manual"); } }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon" className="h-8 w-8 sm:h-9 sm:w-auto sm:px-3 sm:gap-1.5">
          <Shield className="w-4 h-4" />
          <span className="hidden sm:inline">Backup</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Backup & Restore
          </DialogTitle>
          <DialogDescription>
            Create a manual backup with a code to save and restore your data across devices.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="manual" className="gap-1.5 text-xs"><Download className="w-3.5 h-3.5" />Manual</TabsTrigger>
            <TabsTrigger value="restore" className="gap-1.5 text-xs"><Upload className="w-3.5 h-3.5" />Restore</TabsTrigger>
            <TabsTrigger value="auto" className="gap-1.5 text-xs"><Timer className="w-3.5 h-3.5" />Auto</TabsTrigger>
          </TabsList>



          {/* MANUAL BACKUP TAB */}
          <TabsContent value="manual" className="space-y-4 mt-4">
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Create a named backup with a unique code. Use the code to restore your data on any device.
              </p>

              <div className="space-y-2">
                <Input
                  placeholder="Backup code (min 4 chars, e.g. myhabits2026)"
                  value={newCode}
                  onChange={e => setNewCode(e.target.value)}
                  maxLength={64}
                  className="font-mono"
                />
                <Input
                  placeholder="Label (optional, e.g. April checkpoint)"
                  value={newLabel}
                  onChange={e => setNewLabel(e.target.value)}
                  maxLength={60}
                />
                <Button
                  onClick={handleCreateManualBackup}
                  disabled={busy || newCode.trim().length < 4}
                  className="w-full gap-2"
                >
                  <Download className="w-4 h-4" />
                  Create Backup
                </Button>
                <p className="text-xs text-muted-foreground">
                  ⚠️ Write down your code! You need it to restore. Codes are unique — you can't reuse one.
                </p>
              </div>

              {/* Saved manual backups list */}
              {manualBackups.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-border">
                  <p className="text-xs font-medium text-muted-foreground">Your saved backups:</p>
                  {manualBackups.map(b => (
                    <div key={b.code} className="flex items-center justify-between rounded border border-border bg-muted/20 px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-medium text-foreground">{b.code}</span>
                          {b.label && <span className="text-xs text-muted-foreground truncate">— {b.label}</span>}
                        </div>
                        <div className="flex items-center gap-1 mt-0.5">
                          <Clock className="w-3 h-3 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">{formatDate(b.createdAt)}</span>
                        </div>
                        <div className="text-xs text-muted-foreground">{b.habits.length} habits · {b.tasks.length} tasks</div>
                      </div>
                      <div className="flex-shrink-0 ml-2">
                        {confirmDeleteCode === b.code ? (
                          <div className="flex gap-1">
                            <Button size="sm" variant="destructive" className="h-7 px-2 text-xs" onClick={() => handleDelete(b.code)}>Delete</Button>
                            <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setConfirmDeleteCode(null)}>Cancel</Button>
                          </div>
                        ) : (
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setConfirmDeleteCode(b.code)}>
                            <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          {/* RESTORE TAB */}
          <TabsContent value="restore" className="space-y-4 mt-4">
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Enter your manual backup code to restore your habits and tasks.
              </p>
              <Input
                placeholder="Enter your backup code..."
                value={restoreCode}
                onChange={e => setRestoreCode(e.target.value)}
                maxLength={64}
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground text-center">⚠️ This will replace your current data</p>
              <Button onClick={handleRestore} disabled={busy || restoreCode.trim().length < 4} className="w-full gap-2">
                <Upload className="w-4 h-4" />
                Restore from Code
              </Button>

              {/* Quick restore from local backups */}
              {manualBackups.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-border">
                  <p className="text-xs font-medium text-muted-foreground">Or pick from your saved backups:</p>
                  {manualBackups.map(b => (
                    <button
                      key={b.code}
                      className="w-full text-left rounded border border-border bg-muted/20 hover:bg-muted/40 px-3 py-2 transition-colors"
                      onClick={async () => {
                        try {
                          const result = await restoreFromAnySource(b.code);
                          onRestore(result.habits, result.tasks);
                          toast.success(`Restored from backup: ${b.code}`);
                          setOpen(false);
                        } catch (e: any) {
                          toast.error(e?.message ?? "Failed to restore backup");
                        }
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs font-medium">{b.code}</span>
                        <span className="text-xs text-muted-foreground">{b.habits.length}h · {b.tasks.length}t</span>
                      </div>
                      {b.label && <p className="text-xs text-muted-foreground mt-0.5">{b.label}</p>}
                      <p className="text-xs text-muted-foreground">{formatDate(b.createdAt)}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          {/* AUTO BACKUP TAB */}
          <TabsContent value="auto" className="space-y-4 mt-4">
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Pick your own unique code (first come, first served). Auto backup saves your data to that code once a day so you can restore it on any device.
              </p>

              {/* Code reservation */}
              <div className="space-y-2 rounded border border-border bg-muted/20 px-3 py-3">
                <Label className="text-sm">Your backup code</Label>
                {autoSettings.code ? (
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-sm font-medium break-all">{autoSettings.code}</span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-xs"
                      onClick={() => { updateAuto({ code: undefined }); setAutoCodeInput(""); }}
                    >
                      Change
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Input
                      placeholder="e.g. my-habits-2026 (4-64 chars, a-z 0-9 _ -)"
                      value={autoCodeInput}
                      onChange={e => setAutoCodeInput(e.target.value.toLowerCase())}
                      maxLength={64}
                      className="font-mono"
                    />
                    <Button
                      size="sm"
                      className="w-full"
                      disabled={busy || autoCodeInput.trim().length < 4}
                      onClick={async () => {
                        const code = autoCodeInput.trim().toLowerCase();
                        setBusy(true);
                        try {
                          // Single roundtrip: save also enforces first-come ownership
                          await saveSharedBackup(code, habits, tasks, "Auto backup");
                          updateAuto({ code });
                           await loadCloudCodes();
                          setAutoCodeInput("");
                          toast.success(`Reserved code: ${code}`);
                        } catch (e: any) {
                          toast.error(e?.message ?? "Failed to reserve code");
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Reserve code
                    </Button>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between rounded border border-border bg-muted/20 px-3 py-2">
                <Label htmlFor="auto-enabled" className="text-sm">Enable auto backup</Label>
                <Switch
                  id="auto-enabled"
                  checked={autoSettings.enabled}
                  disabled={!autoSettings.code}
                  onCheckedChange={(v) => updateAuto({ enabled: v })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="auto-time" className="text-sm">Backup time (daily, IST)</Label>
                <Input
                  id="auto-time"
                  type="time"
                  value={autoSettings.time}
                  onChange={(e) => updateAuto({ time: e.target.value })}
                  disabled={!autoSettings.enabled}
                  className="font-mono"
                />
              </div>

              {autoSettings.lastRun && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Check className="w-3.5 h-3.5" />
                  Last auto backup: {autoSettings.lastRun}
                </div>
              )}




              {/* Cloud codes owned by this user (survive re-login / new device) */}
              {cloudBackups.length > 0 && (
                <div className="space-y-2 pt-3 border-t border-border">
                  <Label className="text-sm">Your reserved codes</Label>
                  <p className="text-xs text-muted-foreground">
                    Saved to your account — available on any device you log in to.
                  </p>
                  {cloudBackups.map(b => (
                    <div key={b.code} className="flex items-center justify-between rounded border border-border bg-muted/20 px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <div className="font-mono text-xs font-medium text-foreground break-all">{b.code}</div>
                        {b.label && <div className="text-xs text-muted-foreground truncate">{b.label}</div>}
                        <div className="flex items-center gap-1 mt-0.5">
                          <Clock className="w-3 h-3 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">{formatDate(b.updated_at)}</span>
                        </div>
                      </div>
                      <div className="flex gap-1 flex-shrink-0 ml-2">
                        {autoSettings.code !== b.code && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-xs"
                            onClick={() => { updateAuto({ code: b.code }); toast.success(`Using code: ${b.code}`); }}
                          >
                            Use
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs"
                          disabled={busy}
                          onClick={async () => {
                            setBusy(true);
                            try {
                              const res = await restoreSharedBackup(b.code);
                              onRestore(res.habits, res.tasks);
                              toast.success(`Restored from ${b.code}`);
                              setOpen(false);
                            } catch (e: any) {
                              toast.error(e?.message ?? "Failed to restore");
                            } finally { setBusy(false); }
                          }}
                        >
                          Restore
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                          disabled={busy}
                          onClick={async () => {
                            if (!confirm(`Delete cloud backup code "${b.code}"? This cannot be undone.`)) return;
                            setBusy(true);
                            try {
                              await deleteSharedBackup(b.code);
                              setCloudBackups(prev => prev.filter(x => x.code !== b.code));
                              if (autoSettings.code === b.code) updateAuto({ code: undefined });
                              toast.success(`Deleted ${b.code}`);
                            } catch (e: any) {
                              toast.error(e?.message ?? "Failed to delete");
                            } finally { setBusy(false); }
                          }}
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Restore by any code */}
              <div className="space-y-2 pt-3 border-t border-border">
                <Label className="text-sm">Restore from any code</Label>
                <p className="text-xs text-muted-foreground">
                  Enter any code (yours or someone else's) to restore that backup on this device.
                </p>
                <Input
                  placeholder="Enter code..."
                  value={autoRestoreCode}
                  onChange={e => setAutoRestoreCode(e.target.value.toLowerCase())}
                  maxLength={64}
                  className="font-mono"
                />
                <Button
                  variant="outline"
                  className="w-full gap-2"
                  disabled={busy || autoRestoreCode.trim().length < 4}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      const res = await restoreFromAnySource(autoRestoreCode);
                      onRestore(res.habits, res.tasks);
                      toast.success("Data restored from code");
                      setAutoRestoreCode("");
                      setOpen(false);
                    } catch (e: any) {
                      toast.error(e?.message ?? "Failed to restore");
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <Upload className="w-4 h-4" />
                  Restore from Code
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};
