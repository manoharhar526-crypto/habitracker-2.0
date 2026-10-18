import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Download, Loader2, CheckCircle2, RefreshCw } from "lucide-react";
import { APP_VERSION, AppRelease, fetchLatestRelease, formatSize, startDownload, isNewerThanDownloaded, markDownloaded, getSavedApk, installSavedApk } from "@/lib/appUpdates";

export const UpdateCard = () => {
  const [release, setRelease] = useState<AppRelease | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [pct, setPct] = useState<number | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const r = await fetchLatestRelease();
    setRelease(r);
    setSaved(r ? await getSavedApk(r) : null);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const hasUpdate = !!release && isNewerThanDownloaded(release);

  return (
    <div className="space-y-3 pt-2 border-t border-border">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Download className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-medium">App Update</h3>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={load} disabled={loading} title="Check again">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">You have version {APP_VERSION}</p>
      {!loading && !release && (
        <p className="text-sm flex items-center gap-2 text-muted-foreground">
          <CheckCircle2 className="h-4 w-4 text-primary" /> You're on the latest version
        </p>
      )}
      {!loading && release && (
        <div className="rounded-lg border border-primary/40 bg-primary/5 p-3 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm">{hasUpdate ? "New update" : "Latest update"} {release.version}</span>
            {release.is_required && <Badge variant="destructive" className="text-[10px]">Important</Badge>}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Released {new Date(release.created_at).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}
          </p>
          {release.release_notes && (
            <p className="text-xs text-muted-foreground whitespace-pre-line">{release.release_notes}</p>
          )}
          {saved && (
            <Button size="sm" className="w-full gap-2" onClick={async () => {
              try { await installSavedApk(saved); } catch (e) { toast.error((e as Error).message || "Couldn't open installer"); }
            }}>
              <CheckCircle2 className="h-4 w-4" /> Install now
            </Button>
          )}
          <Button
            size="sm"
            variant={saved ? "outline" : "default"}
            className="w-full gap-2"
            disabled={downloading}
            onClick={async () => {
              setDownloading(true);
              try {
                setPct(null);
                await startDownload(release, setPct);
                markDownloaded(release);
                setSaved(await getSavedApk(release));
              } catch (e) {
                toast.error((e as Error).message || "Download failed");
              } finally {
                setDownloading(false);
              }
            }}
          >
            {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {downloading && pct !== null ? `Downloading ${pct}%` : saved ? "Downloaded" : `Download ${formatSize(release.file_size)}`}
          </Button>
          <p className="text-[10px] text-muted-foreground">After downloading, open the file to install the update.</p>
        </div>
      )}
    </div>
  );
};
