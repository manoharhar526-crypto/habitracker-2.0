import { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataExportPanel } from "@/components/DataExportPanel";
import { DataImportPanel } from "@/components/DataImportPanel";
import { Settings, Bell, Trash2, UserX, Loader2, KeyRound, Sun, Moon } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  requestNotificationPermission, sendNotification,
  getNotificationStatus, getNotificationStatusAsync, cancelAllNotifications,
} from "@/lib/notificationUtils";
import { Capacitor } from "@capacitor/core";
import { useTheme } from "@/hooks/useTheme";
import { WidgetPrefsTab } from "@/components/WidgetPrefsTab";
import { UpdateCard } from "@/components/UpdateCard";
import type { Habit } from "@/types/habit";
import type { Task } from "@/types/task";


const APP_VERSION = "v2.1.2.25";

interface SettingsDialogProps {
  onResetData: () => void;
  reminderEnabled: boolean;
  morningTime: string;
  eveningTime: string;
  nightTime: string;
  timezone: string;
  onReminderEnabledChange: (enabled: boolean) => void;
  onMorningTimeChange: (time: string) => void;
  onEveningTimeChange: (time: string) => void;
  onNightTimeChange: (time: string) => void;
  onTimezoneChange: (tz: string) => void;
  habits?: Habit[];
  tasks?: Task[];
  onImport?: (data: { habits?: Habit[]; tasks?: Task[]; calendarNotes?: any[] }) => void;
}

export const SettingsDialog = ({
  onResetData,
  reminderEnabled,
  morningTime,
  eveningTime,
  nightTime,
  timezone,
  onReminderEnabledChange,
  onMorningTimeChange,
  onEveningTimeChange,
  onNightTimeChange,
  onTimezoneChange,
  habits,
  tasks,
  onImport,
}: SettingsDialogProps) => {
  const { theme, toggleTheme } = useTheme();
  const [notificationStatus, setNotificationStatus] = useState<'granted' | 'denied' | 'default' | 'unsupported'>(getNotificationStatus());
  const [open, setOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPasswordValue, setNewPasswordValue] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    getNotificationStatusAsync().then(setNotificationStatus);
  }, [open]);

  const handleEnableReminders = async () => {
    const granted = await requestNotificationPermission();
    const status = await getNotificationStatusAsync();
    setNotificationStatus(status);
    if (granted) {
      onReminderEnabledChange(true);
      toast.success("Reminders enabled!");
      await sendNotification("Habit Tracker", "Reminders are now enabled!");
    } else {
      toast.error(Capacitor.isNativePlatform()
        ? "Please allow notifications in your device settings"
        : "Please allow notifications in your browser settings"
      );
    }
  };

  const handleToggleReminder = async (checked: boolean) => {
    if (checked && notificationStatus !== "granted") {
      await handleEnableReminders();
    } else {
      onReminderEnabledChange(checked);
      if (!checked) await cancelAllNotifications();
    }
  };

  const handleTestNotification = async () => {
    if (notificationStatus === "granted") {
      await sendNotification("Test Reminder", "Don't forget to check your habits today!");
      toast.success("Test notification sent!");
    } else {
      toast.error("Enable notifications first");
    }
  };

  const handleDeleteAccount = async () => {
    if (deletePassword.length < 6) { toast.error("Please enter your password"); return; }
    setDeleting(true);
    try {
      const { data, error } = await supabase.functions.invoke("delete-account", {
        body: { password: deletePassword },
      });
      if (error || data?.error) {
        let msg = data?.error || "Failed to delete account";
        try {
          if (error && typeof error.message === "string") {
            const jsonMatch = error.message.match(/\{.*\}/);
            if (jsonMatch) { const parsed = JSON.parse(jsonMatch[0]); if (parsed.error) msg = parsed.error; }
          }
          if (error && error.context && typeof error.context.json === "function") {
            const body = await error.context.json();
            if (body?.error) msg = body.error;
          }
        } catch (e) { console.warn("Error parsing response:", e); }
        toast.error(msg.includes("Incorrect password")
          ? "The password you entered is incorrect. Please try again."
          : msg);
        return;
      }
      onResetData();
      localStorage.clear();
      sessionStorage.clear();
      await supabase.auth.signOut();
      toast.success("Account deleted permanently");
      setOpen(false);
    } catch (err) {
      console.error("Delete account error:", err);
      toast.error("An unexpected error occurred");
    } finally {
      setDeleting(false);
      setDeletePassword("");
      setShowDeleteConfirm(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon">
          <Settings className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Settings</span>
            <span className="text-xs font-normal text-muted-foreground">{APP_VERSION}</span>
          </DialogTitle>
          <DialogDescription>Configure reminders and manage your data</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="general" className="py-2">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="general" className="text-xs">General</TabsTrigger>
            <TabsTrigger value="reminders" className="text-xs">Reminders</TabsTrigger>
            <TabsTrigger value="widgets" className="text-xs">Widgets</TabsTrigger>
            <TabsTrigger value="account" className="text-xs">Account</TabsTrigger>
            <TabsTrigger value="data" className="text-xs">Data</TabsTrigger>
          </TabsList>

          <TabsContent value="widgets" className="pt-4">
            <WidgetPrefsTab habits={habits ?? []} tasks={tasks ?? []} />
          </TabsContent>


          {/* General tab: Appearance + Timezone */}
          <TabsContent value="general" className="space-y-6 pt-4">
            <UpdateCard />
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                {theme === "dark" ? <Moon className="h-4 w-4 text-muted-foreground" /> : <Sun className="h-4 w-4 text-muted-foreground" />}
                <h3 className="font-medium">Appearance</h3>
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-sm">Theme</Label>
                <Button variant="outline" size="sm" onClick={toggleTheme} className="gap-2">
                  {theme === "dark" ? <><Sun className="w-3.5 h-3.5" />Light Mode</> : <><Moon className="w-3.5 h-3.5" />Dark Mode</>}
                </Button>
              </div>
            </div>

            <div className="space-y-4 pt-2 border-t border-border">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-muted-foreground" />
                <h3 className="font-medium">Clock Timezone</h3>
              </div>
              <div className="space-y-1">
                <Label className="text-sm">Timezone</Label>
                <select
                  className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  value={timezone}
                  onChange={e => onTimezoneChange(e.target.value)}
                >
                  <option value="">Auto-detect (local)</option>
                  <option value="Asia/Kolkata">India (IST, UTC+5:30)</option>
                  <option value="America/New_York">New York (EST/EDT)</option>
                  <option value="America/Chicago">Chicago (CST/CDT)</option>
                  <option value="America/Denver">Denver (MST/MDT)</option>
                  <option value="America/Los_Angeles">Los Angeles (PST/PDT)</option>
                  <option value="Europe/London">London (GMT/BST)</option>
                  <option value="Europe/Paris">Paris (CET/CEST)</option>
                  <option value="Europe/Berlin">Berlin (CET/CEST)</option>
                  <option value="Asia/Dubai">Dubai (GST, UTC+4)</option>
                  <option value="Asia/Singapore">Singapore (SGT, UTC+8)</option>
                  <option value="Asia/Tokyo">Tokyo (JST, UTC+9)</option>
                  <option value="Australia/Sydney">Sydney (AEST/AEDT)</option>
                </select>
                <p className="text-xs text-muted-foreground">Controls the clock shown in the header.</p>
              </div>
            </div>
          </TabsContent>

          {/* Reminders tab */}
          <TabsContent value="reminders" className="space-y-4 pt-4">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-muted-foreground" />
              <h3 className="font-medium">Daily Reminders</h3>
            </div>

            {notificationStatus === "unsupported" ? (
              <p className="text-sm text-muted-foreground">Your browser doesn't support notifications</p>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <Label htmlFor="reminder-toggle" className="text-sm">Enable daily reminders</Label>
                  <Switch id="reminder-toggle" checked={reminderEnabled} onCheckedChange={handleToggleReminder} />
                </div>

                {reminderEnabled && (
                  <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-3">
                    <p className="text-xs font-medium text-muted-foreground">Notification times:</p>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">🌅 Morning</Label>
                        <Input type="time" value={morningTime} onChange={e => onMorningTimeChange(e.target.value)} className="h-8 text-xs" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">🌆 Evening</Label>
                        <Input type="time" value={eveningTime} onChange={e => onEveningTimeChange(e.target.value)} className="h-8 text-xs" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">🌙 Night</Label>
                        <Input type="time" value={nightTime} onChange={e => onNightTimeChange(e.target.value)} className="h-8 text-xs" />
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">📅 Weekly summary every Sunday at 8 PM</p>
                    <Button variant="outline" size="sm" onClick={handleTestNotification} className="w-full">
                      Test Notification
                    </Button>
                  </div>
                )}

                {notificationStatus === "denied" && (
                  <p className="text-sm text-muted-foreground">
                    Notifications are blocked. Please enable them in {Capacitor.isNativePlatform() ? "device" : "browser"} settings.
                  </p>
                )}
              </>
            )}
          </TabsContent>

          {/* Account tab: Change password + Delete account */}
          <TabsContent value="account" className="space-y-6 pt-4">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-muted-foreground" />
                <h3 className="font-medium">Change Password</h3>
              </div>
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label htmlFor="current-pw" className="text-sm">Current Password</Label>
                  <Input id="current-pw" type="password" placeholder="Enter current password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} maxLength={128} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="new-pw" className="text-sm">New Password</Label>
                  <Input id="new-pw" type="password" placeholder="Enter new password (min 6 chars)" value={newPasswordValue} onChange={e => setNewPasswordValue(e.target.value)} maxLength={128} />
                </div>
                <Button
                  className="w-full gap-2"
                  disabled={changingPassword || currentPassword.length < 6 || newPasswordValue.length < 6}
                  onClick={async () => {
                    setChangingPassword(true);
                    try {
                      const { data: { user } } = await supabase.auth.getUser();
                      if (!user?.email) throw new Error("No user found");
                      const { error: signInError } = await supabase.auth.signInWithPassword({ email: user.email, password: currentPassword });
                      if (signInError) { toast.error("Current password is incorrect"); return; }
                      const { error } = await supabase.auth.updateUser({ password: newPasswordValue });
                      if (error) { toast.error(error.message); }
                      else { toast.success("Password changed successfully!"); setCurrentPassword(""); setNewPasswordValue(""); }
                    } catch (err: unknown) {
                      toast.error((err as Error).message || "Failed to change password");
                    } finally {
                      setChangingPassword(false);
                    }
                  }}
                >
                  {changingPassword ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                  Change Password
                </Button>
              </div>
            </div>

            <div className="space-y-4 pt-4 border-t border-border">
              <div className="flex items-center gap-2">
                <UserX className="h-4 w-4 text-muted-foreground" />
                <h3 className="font-medium">Delete Account</h3>
              </div>
              <p className="text-sm text-muted-foreground">Permanently delete your account and all data. This cannot be undone.</p>
              {!showDeleteConfirm ? (
                <Button variant="destructive" className="w-full" onClick={() => setShowDeleteConfirm(true)}>Delete My Account</Button>
              ) : (
                <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
                  <p className="text-sm font-medium">Enter your password to confirm:</p>
                  <Input type="password" placeholder="Your password" value={deletePassword} onChange={e => setDeletePassword(e.target.value)} maxLength={128} className="text-base" />
                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1" onClick={() => { setShowDeleteConfirm(false); setDeletePassword(""); }}>Cancel</Button>
                    <Button variant="destructive" className="flex-1 gap-2" disabled={deleting || deletePassword.length < 6} onClick={handleDeleteAccount}>
                      {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserX className="w-4 h-4" />}
                      Confirm Delete
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </TabsContent>

          {/* Data tab: Export + Reset */}
          <TabsContent value="data" className="space-y-6 pt-4">
            {onImport && <DataImportPanel onImport={onImport} />}
            <DataExportPanel habits={habits ?? []} tasks={tasks ?? []} />

            <div className="space-y-4 pt-4 border-t border-border">
            <div className="flex items-center gap-2">
              <Trash2 className="h-4 w-4 text-muted-foreground" />
              <h3 className="font-medium">Reset Data</h3>
            </div>
            <p className="text-sm text-muted-foreground">This will permanently delete all your habits, tasks, and settings.</p>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="w-full">Reset All Data</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This action cannot be undone. This will permanently delete all your habits, tasks, and settings from this device.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => { onResetData(); setOpen(false); }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Reset Everything
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            </div>
          </TabsContent>
        </Tabs>

      </DialogContent>
    </Dialog>
  );
};
