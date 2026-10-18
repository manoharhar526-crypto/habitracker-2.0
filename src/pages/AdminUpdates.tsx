import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "@/lib/navigation";
import { ArrowLeft, Loader2, Upload, Pencil, Trash2, Download, Smartphone } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { APP_VERSION, AppRelease, UPDATES_BUCKET, formatSize, startDownload, releasesTable, encodeNotes, decodeRelease, uploadApk } from "@/lib/appUpdates";

const cleanName = (n: string) => {
  const s = n.trim().replace(/[^\w.\- ]/g, "").replace(/\s+/g, "-");
  return s.toLowerCase().endsWith(".apk") ? s : `${s}.apk`;
};

type Draft = { version: string; apk_name: string; release_notes: string; is_published: boolean; is_required: boolean; notify: boolean };

const AdminUpdates = () => {
  const navigate = useNavigate();
  const [releases, setReleases] = useState<AppRelease[]>([]);
  const [loading, setLoading] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [form, setForm] = useState<Draft>({ version: "", apk_name: "", release_notes: "", is_published: true, is_required: false, notify: true });
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [edit, setEdit] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await releasesTable().select("*").order("created_at", { ascending: false });
    if (error) toast.error("Couldn't load updates. Has the updates table been set up?");
    setReleases((data ?? []).map(decodeRelease));
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const handleUpload = async () => {
    if (!file) return toast.error("Choose an APK file");
    if (!form.version.trim()) return toast.error("Enter a version");
    setUploading(true);
    try {
      const apkName = cleanName(form.apk_name || file.name);
      const path = `${Date.now()}-${apkName}`;
      setProgress("Starting...");
      await uploadApk(path, file, (sent, total, bps) =>
        setProgress(`${Math.round((sent / total) * 100)}% · ${formatSize(sent)} of ${formatSize(total)} · ${formatSize(Math.round(bps))}/s`));
      const { error } = await releasesTable().insert({
        version: form.version.trim(), apk_name: apkName, file_path: path, file_size: file.size,
        release_notes: encodeNotes(form.release_notes, form.notify),
        is_published: form.is_published, is_required: form.is_required,
      });
      if (error) { await supabase.storage.from(UPDATES_BUCKET).remove([path]); throw error; }
      toast.success("Update uploaded");
      setFile(null);
      setForm({ version: "", apk_name: "", release_notes: "", is_published: true, is_required: false, notify: true });
      (document.getElementById("apk-file") as HTMLInputElement | null)?.value && ((document.getElementById("apk-file") as HTMLInputElement).value = "");
      load();
    } catch (e) {
      toast.error((e as Error).message || "Upload failed");
    } finally { setUploading(false); setProgress(""); }
  };

  const saveEdit = async (id: string) => {
    if (!edit || !edit.version.trim() || !edit.apk_name.trim()) return toast.error("Version and file name are required");
    setSaving(true);
    const { error } = await releasesTable().update({
      version: edit.version.trim(), apk_name: cleanName(edit.apk_name),
      release_notes: encodeNotes(edit.release_notes, edit.notify),
      is_published: edit.is_published, is_required: edit.is_required, updated_at: new Date().toISOString(),
    }).eq("id", id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Saved");
    setEditingId(null);
    load();
  };

  const togglePublished = async (r: AppRelease) => {
    const { error } = await releasesTable().update({ is_published: !r.is_published }).eq("id", r.id);
    if (error) return toast.error(error.message);
    setReleases((p) => p.map((x) => (x.id === r.id ? { ...x, is_published: !r.is_published } : x)));
  };

  const remove = async (r: AppRelease) => {
    await supabase.storage.from(UPDATES_BUCKET).remove([r.file_path]);
    const { error } = await releasesTable().delete().eq("id", r.id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    setReleases((p) => p.filter((x) => x.id !== r.id));
  };

  const Fields = ({ d, set }: { d: Draft; set: (d: Draft) => void }) => (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Version</Label>
          <Input value={d.version} onChange={(e) => set({ ...d, version: e.target.value })} placeholder="e.g. 2.2.0" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">APK file name</Label>
          <Input value={d.apk_name} onChange={(e) => set({ ...d, apk_name: e.target.value })} placeholder="Habitracker-2.2.0.apk" />
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">What's new</Label>
        <Textarea value={d.release_notes} onChange={(e) => set({ ...d, release_notes: e.target.value })} rows={3} placeholder="New calendar, better reminders..." />
      </div>
      <div className="flex flex-wrap gap-6">
        <label className="flex items-center gap-2 text-sm"><Switch checked={d.is_published} onCheckedChange={(v) => set({ ...d, is_published: v })} /> Visible to users</label>
        <label className="flex items-center gap-2 text-sm"><Switch checked={d.is_required} onCheckedChange={(v) => set({ ...d, is_required: v })} /> Mark as important</label>
        <label className="flex items-center gap-2 text-sm"><Switch checked={d.notify} onCheckedChange={(v) => set({ ...d, notify: v })} /> Send notification to users</label>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/admin")}><ArrowLeft className="w-5 h-5" /></Button>
          <Smartphone className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold">App Updates</h1>
          <Badge variant="secondary" className="ml-auto text-xs">Current app {APP_VERSION}</Badge>
        </div>

        <Card className="p-4 space-y-4">
          <h2 className="font-semibold">Upload new version</h2>
          <div className="space-y-1">
            <Label className="text-xs">APK file</Label>
            <Input id="apk-file" type="file" accept=".apk,application/vnd.android.package-archive"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setFile(f);
                if (f && !form.apk_name) setForm((p) => ({ ...p, apk_name: f.name }));
              }} />
            {file && <p className="text-xs text-muted-foreground">{file.name} · {formatSize(file.size)}</p>}
          </div>
          {Fields({ d: form, set: setForm })}
          <Button onClick={handleUpload} disabled={uploading} className="w-full gap-2">
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {uploading ? `Uploading ${progress}` : "Upload update"}
          </Button>
        </Card>

        <div className="space-y-3">
          <h2 className="font-semibold">All versions</h2>
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : releases.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No updates uploaded yet</p>
          ) : releases.map((r) => (
            <Card key={r.id} className="p-4 space-y-3">
              {editingId === r.id && edit ? (
                <>
                  {Fields({ d: edit, set: setEdit })}
                  <div className="flex gap-2 justify-end">
                    <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>Cancel</Button>
                    <Button size="sm" onClick={() => saveEdit(r.id)} disabled={saving}>
                      {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : "Save"}
                    </Button>
                  </div>
                </>
              ) : (
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">v{r.version.replace(/^v/i, "")}</span>
                      <Badge variant={r.is_published ? "default" : "outline"} className="text-[10px]">{r.is_published ? "Live" : "Hidden"}</Badge>
                      {r.is_required && <Badge variant="destructive" className="text-[10px]">Important</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{r.apk_name} · {formatSize(r.file_size)} · {new Date(r.created_at).toLocaleDateString()}</p>
                    {r.release_notes && <p className="text-xs whitespace-pre-line">{r.release_notes}</p>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Switch checked={r.is_published} onCheckedChange={() => togglePublished(r)} title="Visible to users" />
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Download"
                      onClick={async () => {
                        try {
                          await startDownload(r);
                        } catch (e) {
                          toast.error((e as Error).message || "Download failed");
                        }
                      }}
                    >
                      <Download className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" title="Edit" onClick={() => {
                      setEditingId(r.id);
                      setEdit({ version: r.version, apk_name: r.apk_name, release_notes: r.release_notes ?? "", is_published: r.is_published, is_required: r.is_required, notify: r.notify !== false });
                    }}><Pencil className="w-4 h-4" /></Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" title="Delete"><Trash2 className="w-4 h-4 text-destructive" /></Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete version {r.version}?</AlertDialogTitle>
                          <AlertDialogDescription>The APK file will be removed and users can no longer download it.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => remove(r)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AdminUpdates;
