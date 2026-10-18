import { useState, useEffect, useCallback, Component, ReactNode } from "react";
import { useParams, useNavigate } from "@/lib/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  ArrowLeft, Loader2, Key, Pencil, Shield, User, Mail,
  Clock, Calendar, CheckCircle2, ListTodo,
  Save, X, Eye, EyeOff, Lock, Trash2, ChevronLeft, ChevronRight, Trophy, RefreshCw,
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useRealtimeAdmin } from "@/hooks/useRealtimeAdmin";
import type { Habit } from "@/types/habit";
import type { Task } from "@/types/task";
import { HabitGrid } from "@/components/HabitGrid";
import { HabitCalendar } from "@/components/HabitCalendar";
import { CompletionLineChart } from "@/components/charts/CompletionLineChart";
import { HabitPieChart } from "@/components/charts/HabitPieChart";
import { HabitBarChart } from "@/components/charts/HabitBarChart";
import { IndividualHabitChart } from "@/components/charts/IndividualHabitChart";
import { TaskCompletionChart } from "@/components/charts/TaskCompletionChart";
import { TaskProgressChart } from "@/components/charts/TaskProgressChart";
import { HabitReportCard } from "@/components/HabitReportCard";
import { TaskReportCard } from "@/components/TaskReportCard";
import { GoalsOverview } from "@/components/GoalsOverview";
import { getMonthName, getMonthKey, getHabitsForMonth } from "@/lib/habitUtils";

class ErrorBoundary extends Component<{ children: ReactNode; label: string }, { error: string | null }> {
  constructor(props: any) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(e: any) { return { error: e?.message || "Unknown error" }; }
  render() {
    if (this.state.error) return (
      <div className="p-4 border border-red-500/30 rounded-lg bg-red-500/10">
        <p className="text-red-400 text-sm font-medium">Error in {this.props.label}</p>
        <p className="text-red-300 text-xs mt-1">{this.state.error}</p>
      </div>
    );
    return this.props.children;
  }
}

interface ProfileData {
  username: string;
  created_at: string;
}

const noop = () => {};

const AdminUserDetail = () => {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();

  const [profile, setProfile]   = useState<ProfileData | null>(null);
  const [roles, setRoles]       = useState<string[]>([]);
  const [loading, setLoading]   = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [username, setUsername]               = useState("");
  const [originalUsername, setOriginalUsername] = useState("");
  const [editingUsername, setEditingUsername] = useState(false);
  const [newPassword, setNewPassword]         = useState("");
  const [showPasswordField, setShowPasswordField] = useState(false);
  const [showPassword, setShowPassword]       = useState(false);
  const [saving, setSaving]                   = useState(false);
  const [viewMonth, setViewMonth]             = useState<Date>(new Date());

  // ── Write operations via edge function (needs service role) ───────────────
  const adminAction = useCallback(async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("admin-manage", { body });
    if (error || data?.error) throw new Error(data?.error || "Request failed");
    return data;
  }, []);

  // ── READ profile + roles directly from DB ─────────────────────────────────
  const fetchProfile = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [{ data: prof, error: profErr }, { data: roleRows }] = await Promise.all([
        (supabase as any).from("profiles").select("username, created_at").eq("user_id", userId).maybeSingle(),
        (supabase as any).from("user_roles").select("role").eq("user_id", userId),
      ]);

      if (profErr || !prof) { setNotFound(true); return; }

      setProfile(prof);
      setUsername(prof.username);
      setOriginalUsername(prof.username);
      setRoles((roleRows ?? []).map((r: any) => r.role));
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);

  // Profile realtime auto-refresh disabled


  // ── READ sync data (habits/tasks) directly from user_sync_data ────────────
  const { getSyncData, getLastUpdated, refresh: refreshSync } = useRealtimeAdmin(userId);
  const syncData  = userId ? getSyncData(userId)    : null;
  const lastSynced = userId ? getLastUpdated(userId) : null;

  const handleSaveUsername = async () => {
    if (!username.trim() || /\s/.test(username)) { toast.error("Invalid username"); return; }
    setSaving(true);
    try {
      await adminAction({ action: "update_username", target_user_id: userId, new_username: username });
      toast.success("Username updated");
      setOriginalUsername(username);
      setEditingUsername(false);
    } catch (e: unknown) {
      toast.error((e as Error).message || "Failed to update username");
    } finally { setSaving(false); }
  };

  const handleSavePassword = async () => {
    if (newPassword.length < 6) { toast.error("Password must be at least 6 characters"); return; }
    setSaving(true);
    try {
      await adminAction({ action: "update_password", target_user_id: userId, new_password: newPassword });
      toast.success("Password updated");
      setNewPassword("");
      setShowPasswordField(false);
    } catch (e: unknown) {
      toast.error((e as Error).message || "Failed to update password");
    } finally { setSaving(false); }
  };

  const handleDeleteUser = async () => {
    setSaving(true);
    try {
      await adminAction({ action: "delete_user", target_user_id: userId });
      toast.success("User deleted");
      navigate("/admin");
    } catch (e: unknown) {
      toast.error((e as Error).message || "Failed to delete user");
    } finally { setSaving(false); }
  };

  if (loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );

  if (notFound || !profile) return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
      <p className="text-muted-foreground">User not found</p>
      <Button variant="outline" onClick={() => navigate("/admin")}>
        <ArrowLeft className="w-4 h-4 mr-2" /> Back
      </Button>
    </div>
  );

  const isAdmin = roles.includes("admin");

  const habitSource: any[]    = syncData?.habits        ?? [];
  const taskSource: any[]     = syncData?.tasks         ?? [];
  const calendarSource: any[] = syncData?.calendarNotes ?? [];

  const allHabits: Habit[] = habitSource.map((h: any, i: number) => {
    let month = h.month;
    if (!month || month === "undefined" || month === "null") {
      const firstDay = Array.isArray(h.completedDays) && h.completedDays.length > 0
        ? String(h.completedDays[0]) : null;
      month = firstDay ? firstDay.substring(0, 7) : getMonthKey(new Date());
    }
    return {
      id: String(h.id || i),
      name: String(h.name || "Habit " + (i + 1)),
      month: String(month),
      completedDays: Array.isArray(h.completedDays) ? h.completedDays.map(String) : [],
      skippedDays: Array.isArray(h.skippedDays) ? h.skippedDays.map(String)
                 : Array.isArray(h.skipDays) ? h.skipDays.map(String) : [],
      order: typeof h.order === "number" ? h.order : i,
    };
  });

  const allTasks: Task[] = taskSource.map((t: any, i: number) => ({
    id: String(t.id || i),
    title: String(t.title || t.name || "Task " + (i + 1)),
    completed: !!t.completed,
    type: ["general", "monthly", "weekly", "daily"].includes(t.type) ? t.type : "general",
    day: t.day,
    weekNumber: t.weekNumber,
  }));

  const availableMonths    = [...new Set(allHabits.map(h => h.month))].sort();
  const currentMonthHabits = getHabitsForMonth(allHabits, viewMonth);

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto p-4 md:p-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/admin")}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <User className="w-6 h-6 text-primary" />
                {originalUsername}
                {isAdmin && <Badge variant="default" className="text-xs ml-1">Admin</Badge>}
              </h1>
              <p className="text-sm text-muted-foreground">Full user profile & data</p>
            </div>
          </div>
          {!isAdmin && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm">
                  <Trash2 className="w-4 h-4 mr-1" /> Delete User
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete {originalUsername}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Permanently deletes this user and all their data. Cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDeleteUser} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Delete Permanently
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>

        {/* Account */}
        <Card className="p-5 space-y-4">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <Shield className="w-4 h-4" /> Account & Credentials
          </h2>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground flex items-center gap-1">
              <User className="w-3 h-3" /> Username
            </Label>
            {editingUsername ? (
              <div className="flex gap-2">
                <Input value={username} onChange={(e) => setUsername(e.target.value.replace(/\s/g, ""))} maxLength={30} className="text-sm" />
                <Button size="sm" onClick={handleSaveUsername} disabled={saving}>
                  {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setEditingUsername(false); setUsername(originalUsername); }}>
                  <X className="w-3 h-3" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium">{originalUsername}</p>
                <Button size="sm" variant="ghost" onClick={() => setEditingUsername(true)}>
                  <Pencil className="w-3 h-3" />
                </Button>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground flex items-center gap-1">
              <Lock className="w-3 h-3" /> Password
            </Label>
            <p className="text-sm font-mono text-muted-foreground italic">•••••••• (encrypted)</p>
            {showPasswordField ? (
              <div className="flex gap-2 mt-2">
                <div className="relative flex-1">
                  <Input
                    type={showPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="New password (min 6 chars)"
                    className="text-sm pr-10"
                  />
                  <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 h-full w-10" onClick={() => setShowPassword(!showPassword)}>
                    {showPassword ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  </Button>
                </div>
                <Button size="sm" onClick={handleSavePassword} disabled={saving}>
                  {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setShowPasswordField(false); setNewPassword(""); }}>
                  <X className="w-3 h-3" />
                </Button>
              </div>
            ) : (
              <Button size="sm" variant="outline" onClick={() => setShowPasswordField(true)} className="mt-1">
                <Key className="w-3 h-3 mr-1" /> Change Password
              </Button>
            )}
          </div>

          <Separator />

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="space-y-0.5">
              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                <Calendar className="w-3 h-3" /> Account Created
              </Label>
              <p className="text-xs">{new Date(profile.created_at).toLocaleString()}</p>
            </div>
            <div className="space-y-0.5">
              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="w-3 h-3" /> Last Synced
              </Label>
              <p className="text-xs">{lastSynced ? new Date(lastSynced).toLocaleString() : "Never"}</p>
            </div>
            <div className="space-y-0.5">
              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                <Shield className="w-3 h-3" /> Roles
              </Label>
              <div className="flex gap-1 flex-wrap">
                {roles.length ? roles.map(r => (
                  <Badge key={r} variant={r === "admin" ? "default" : "secondary"} className="text-xs">{r}</Badge>
                )) : <span className="text-xs text-muted-foreground">No roles</span>}
              </div>
            </div>
            <div className="space-y-0.5">
              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Total Habits
              </Label>
              <p className="text-xs font-medium">{allHabits.length}</p>
            </div>
          </div>
        </Card>

        {/* User Data */}
        {syncData ? (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold">User Data</h2>
                {lastSynced && (
                  <span className="text-xs text-muted-foreground">
                    Last synced: {new Date(lastSynced).toLocaleString()}
                  </span>
                )}
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => refreshSync()} title="Refresh">
                  <RefreshCw className="w-3.5 h-3.5" />
                </Button>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-8 w-8"
                  onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1))}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="font-medium min-w-32 text-center text-sm">{getMonthName(viewMonth)}</span>
                <Button variant="ghost" size="icon" className="h-8 w-8"
                  onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1))}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {availableMonths.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {availableMonths.map(m => (
                  <Badge
                    key={m}
                    variant={getMonthKey(viewMonth) === m ? "default" : "outline"}
                    className="text-xs cursor-pointer"
                    onClick={() => { const [y, mo] = m.split("-").map(Number); setViewMonth(new Date(y, mo - 1, 1)); }}
                  >
                    {m}
                  </Badge>
                ))}
              </div>
            )}

            <Tabs defaultValue="habits" className="w-full">
              <TabsList className="grid w-full max-w-none grid-cols-3 mb-4">
                <TabsTrigger value="habits" className="text-xs sm:text-sm">Habits</TabsTrigger>
                <TabsTrigger value="goals" className="text-xs sm:text-sm">Goals</TabsTrigger>
                <TabsTrigger value="reports" className="text-xs sm:text-sm">Reports</TabsTrigger>
              </TabsList>

              <TabsContent value="habits" className="space-y-6"><ErrorBoundary label="Habits Tab">
                <Card className="overflow-hidden border-border">
                  <div className="p-3 border-b border-border">
                    <h3 className="font-semibold text-sm">Monthly Tracking Grid ({currentMonthHabits.length} habits)</h3>
                  </div>
                  <HabitGrid habits={currentMonthHabits} currentMonth={viewMonth} onToggleDay={noop} onDeleteHabit={noop} onReorderHabits={noop} onRenameHabit={noop} frozenDates={[]} />
                  {currentMonthHabits.length === 0 && <p className="text-sm text-muted-foreground p-4">No habits for this month</p>}
                </Card>
                <HabitCalendar habits={currentMonthHabits} currentMonth={viewMonth} onToggleSkipDay={noop} />
                {currentMonthHabits.length > 0 && (
                  <div>
                    <h3 className="text-base font-semibold mb-3">Habit Analytics</h3>
                    <div className="grid md:grid-cols-2 gap-4">
                      <CompletionLineChart habits={currentMonthHabits} currentMonth={viewMonth} />
                      <HabitPieChart habits={currentMonthHabits} currentMonth={viewMonth} />
                      <HabitBarChart habits={currentMonthHabits} currentMonth={viewMonth} />
                      <IndividualHabitChart habits={currentMonthHabits} currentMonth={viewMonth} />
                    </div>
                  </div>
                )}
              </ErrorBoundary></TabsContent>

              <TabsContent value="goals" className="space-y-6"><ErrorBoundary label="Goals Tab">
                <GoalsOverview tasks={allTasks} currentMonth={viewMonth} onToggleTask={noop} onAddTask={noop} onDeleteTask={noop} onEditTask={noop} calendarNotes={calendarSource} onAddCalendarNote={noop} onDeleteCalendarNote={noop} onEditCalendarNote={noop} />
              </ErrorBoundary></TabsContent>

              <TabsContent value="reports" className="space-y-6"><ErrorBoundary label="Reports Tab">
                {allHabits.length > 0 && (
                  <div>
                    <h3 className="text-base font-semibold mb-3 flex items-center gap-2">
                      <Trophy className="w-4 h-4" /> All-Time Statistics
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <Card className="p-3 border-border">
                        <p className="text-xs text-muted-foreground">Total Habits</p>
                        <p className="text-2xl font-bold mt-1">{allHabits.length}</p>
                      </Card>
                      <Card className="p-3 border-border">
                        <p className="text-xs text-muted-foreground">Total Completions</p>
                        <p className="text-2xl font-bold mt-1">{allHabits.reduce((sum, h) => sum + (h.completedDays?.length || 0), 0)}</p>
                      </Card>
                      <Card className="p-3 border-border">
                        <p className="text-xs text-muted-foreground">This Month</p>
                        <p className="text-2xl font-bold mt-1">{currentMonthHabits.length}</p>
                      </Card>
                      <Card className="p-3 border-border">
                        <p className="text-xs text-muted-foreground">Goals</p>
                        <p className="text-2xl font-bold mt-1">{allTasks.length}</p>
                      </Card>
                    </div>
                  </div>
                )}
                <div>
                  <h3 className="text-base font-semibold mb-3">Habit Reports</h3>
                  <HabitReportCard habits={currentMonthHabits} currentMonth={viewMonth} frozenDates={[]} />
                </div>
                <div>
                  <h3 className="text-base font-semibold mb-3">Task Reports</h3>
                  <TaskReportCard tasks={allTasks} />
                </div>
                <div>
                  <h3 className="text-base font-semibold mb-3">Task Analytics</h3>
                  <div className="grid md:grid-cols-2 gap-4">
                    <TaskCompletionChart tasks={allTasks} />
                    <TaskProgressChart tasks={allTasks} currentMonth={viewMonth} />
                  </div>
                </div>
              </ErrorBoundary></TabsContent>
            </Tabs>
          </div>
        ) : (
          <Card className="p-6 text-center space-y-3">
            <p className="text-muted-foreground text-sm">No sync data yet for this user.</p>
            <p className="text-muted-foreground text-xs">Data appears here the next time they open the app.</p>
            <Button variant="outline" size="sm" onClick={() => refreshSync()} className="gap-2">
              <RefreshCw className="w-3.5 h-3.5" /> Check Again
            </Button>
          </Card>
        )}
      </div>
    </div>
  );
};

export default AdminUserDetail;
