import { supabase } from "@/integrations/supabase/client";

/** Version of the app currently running on this device. Bump on every release. */
export const APP_VERSION = "2.1.2.25";
export const UPDATES_BUCKET = "app-updates";

export interface AppRelease {
  id: string;
  version: string;
  apk_name: string;
  file_path: string;
  file_size: number | null;
  release_notes: string | null;
  is_published: boolean;
  is_required: boolean;
  created_at: string;
  updated_at: string;
  /** Derived: whether users get a notification for this upload. */
  notify?: boolean;
}

const SILENT = "[[no-notify]]";
/** The notify choice is stored as a hidden marker in the notes (no database change needed). */
export function encodeNotes(notes: string, notify: boolean): string | null {
  const n = notes.trim();
  if (notify) return n || null;
  return n ? `${n}\n${SILENT}` : SILENT;
}
export function decodeRelease(r: AppRelease): AppRelease {
  const raw = r.release_notes ?? "";
  const silent = raw.includes(SILENT);
  const notes = raw.replace(SILENT, "").trim();
  return { ...r, release_notes: notes || null, notify: !silent };
}

export const releasesTable = () => (supabase as any).from("app_releases");

/**
 * Files live in a private bucket, so a short-lived signed link is created on
 * demand instead of using a permanent public URL.
 */
export async function getDownloadUrl(r: AppRelease): Promise<string> {
  const { data, error } = await supabase.storage
    .from(UPDATES_BUCKET)
    .createSignedUrl(r.file_path, 60 * 60, { download: r.apk_name });
  if (error || !data?.signedUrl) throw new Error(error?.message || "Couldn't create a download link");
  return data.signedUrl;
}

/**
 * Download inside the app. On the phone app the APK is saved to the app's
 * cache and the Android installer opens directly (no browser). On the web a
 * normal file download is triggered on the same page.
 */
const SAVED_KEY = "downloadedApk";
type SavedApk = { id: string; filePath: string };

/** The APK already saved on this phone for this release, if it is still there. */
export async function getSavedApk(r: AppRelease): Promise<string | null> {
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) return null;
    const saved = JSON.parse(localStorage.getItem(SAVED_KEY) || "null") as SavedApk | null;
    if (!saved || saved.id !== r.id) return null;
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    await Filesystem.stat({ path: r.apk_name, directory: Directory.Data });
    return saved.filePath;
  } catch { return null; }
}

/** Opens the Android installer for an already-downloaded APK. */
export async function installSavedApk(filePath: string): Promise<void> {
  const { FileOpener } = await import("@capacitor-community/file-opener");
  await FileOpener.open({ filePath, contentType: "application/vnd.android.package-archive" });
}

/**
 * Fast resumable upload: sends the file in 6 MB pieces, reports progress and
 * speed, and retries a piece automatically if the connection drops.
 */
export async function uploadApk(
  path: string, file: File,
  onProgress?: (sent: number, total: number, bytesPerSec: number) => void,
): Promise<void> {
  const { Upload } = await import("tus-js-client");
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Please sign in again");
  const start = Date.now();
  await new Promise<void>((resolve, reject) => {
    const up = new Upload(file, {
      endpoint: `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/upload/resumable`,
      retryDelays: [0, 1000, 3000, 5000, 10000],
      headers: { authorization: `Bearer ${session.access_token}`, "x-upsert": "true" },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      metadata: { bucketName: UPDATES_BUCKET, objectName: path, contentType: "application/vnd.android.package-archive", cacheControl: "3600" },
      chunkSize: 6 * 1024 * 1024,
      onError: reject,
      onProgress: (sent, total) => onProgress?.(sent, total, sent / Math.max(0.001, (Date.now() - start) / 1000)),
      onSuccess: () => resolve(),
    });
    up.findPreviousUploads().then((prev) => {
      if (prev.length) up.resumeFromPreviousUpload(prev[0]);
      up.start();
    });
  });
}

export async function startDownload(r: AppRelease, onProgress?: (pct: number) => void): Promise<void> {
  const { Capacitor } = await import("@capacitor/core");
  if (Capacitor.isNativePlatform()) {
    const existing = await getSavedApk(r);
    if (existing) return installSavedApk(existing);
    const url = await getDownloadUrl(r);
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    const sub = onProgress
      ? await Filesystem.addListener("progress", (p) => {
          if (p.contentLength > 0) onProgress(Math.round((p.bytes / p.contentLength) * 100));
        })
      : null;
    let res;
    try {
      res = await Filesystem.downloadFile({ url, path: r.apk_name, directory: Directory.Data, progress: !!onProgress });
    } finally { await sub?.remove(); }
    const filePath =
      res.path ?? (await Filesystem.getUri({ path: r.apk_name, directory: Directory.Data })).uri;
    try { localStorage.setItem(SAVED_KEY, JSON.stringify({ id: r.id, filePath })); } catch { /* ignore */ }
    await installSavedApk(filePath);
    return;
  }
  const url = await getDownloadUrl(r);
  // Hand the link straight to the browser so the download starts instantly
  // and shows progress, instead of loading the whole file in memory first.
  const a = document.createElement("a");
  a.href = url;
  a.download = r.apk_name;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Compare dotted versions ("v2.1.10" > "2.1.9"). Returns >0 if a is newer. */
export function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/i, "").split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.replace(/^v/i, "").split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

export const formatSize = (b: number | null) =>
  !b ? "" : b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`;

/** The newest published upload by date (year, month, day, time) — version number is ignored. */
export async function fetchLatestRelease(): Promise<AppRelease | null> {
  const { data, error } = await releasesTable()
    .select("*").eq("is_published", true)
    .order("created_at", { ascending: false }).limit(1);
  if (error || !data?.length) return null;
  return decodeRelease(data[0] as AppRelease);
}

const SEEN_KEY = "lastDownloadedReleaseAt";
/** True when this upload is newer than the last one downloaded on this device. */
export function isNewerThanDownloaded(r: AppRelease): boolean {
  try {
    const seen = localStorage.getItem(SEEN_KEY);
    return !seen || new Date(r.created_at).getTime() > new Date(seen).getTime();
  } catch { return true; }
}
export function markDownloaded(r: AppRelease) {
  try { localStorage.setItem(SEEN_KEY, r.created_at); } catch { /* ignore */ }
}

const NOTIFIED_KEY = "lastNotifiedReleaseAt";
/** Shows a phone notification once for each new upload the admin chose to announce. */
export async function notifyIfNewRelease(): Promise<void> {
  try {
    const r = await fetchLatestRelease();
    const seen = localStorage.getItem(NOTIFIED_KEY);
    if (!seen) { localStorage.setItem(NOTIFIED_KEY, r?.created_at ?? new Date().toISOString()); return; }
    if (!r || new Date(r.created_at).getTime() <= new Date(seen).getTime()) return;
    localStorage.setItem(NOTIFIED_KEY, r.created_at);
    if (!r.notify || !isNewerThanDownloaded(r)) return;
    const { sendNotification } = await import("@/lib/notificationUtils");
    await sendNotification(`New update available: v${r.version.replace(/^v/i, "")}`,
      r.release_notes?.split("\n")[0] || "Open Settings to download the latest version.");
  } catch { /* offline — try again later */ }
}

/** Daily check times (local device time). */
const CHECK_HOURS = [6, 20];
const LAST_SLOT_KEY = "lastUpdateCheckSlot";

/** Most recent 6:00 / 20:00 slot that has already passed. */
function lastPassedSlot(now = new Date()): Date {
  const slots = [-1, 0].flatMap((dayOff) =>
    CHECK_HOURS.map((h) => {
      const d = new Date(now);
      d.setDate(d.getDate() + dayOff);
      d.setHours(h, 0, 0, 0);
      return d;
    }),
  );
  return slots.filter((d) => d <= now).sort((a, b) => b.getTime() - a.getTime())[0];
}

function nextSlot(now = new Date()): Date {
  for (const dayOff of [0, 1]) for (const h of CHECK_HOURS) {
    const d = new Date(now);
    d.setDate(d.getDate() + dayOff);
    d.setHours(h, 0, 0, 0);
    if (d > now) return d;
  }
  return new Date(now.getTime() + 12 * 3600e3);
}

/** Runs the check if a 6 AM / 8 PM slot passed since the last scheduled check. */
export async function runScheduledCheckIfDue(): Promise<void> {
  try {
    const slot = lastPassedSlot();
    const done = localStorage.getItem(LAST_SLOT_KEY);
    if (done && new Date(done).getTime() >= slot.getTime()) return;
    localStorage.setItem(LAST_SLOT_KEY, slot.toISOString());
    await notifyIfNewRelease();
  } catch { /* ignore */ }
}

/**
 * Checks for new updates at 6:00 AM and 8:00 PM local time. While the app is
 * running a timer fires at each slot; if the app was closed at that time, the
 * missed check runs as soon as the app is opened or resumed.
 */
export function startScheduledUpdateChecks(): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const arm = () => {
    const wait = Math.max(1000, nextSlot().getTime() - Date.now());
    timer = setTimeout(async () => { await runScheduledCheckIfDue(); arm(); }, Math.min(wait, 2 ** 31 - 1));
  };
  const onVis = () => { if (document.visibilityState === "visible") { void runScheduledCheckIfDue(); clearTimeout(timer); arm(); } };
  void runScheduledCheckIfDue();
  arm();
  document.addEventListener("visibilitychange", onVis);
  return () => { clearTimeout(timer); document.removeEventListener("visibilitychange", onVis); };
}
