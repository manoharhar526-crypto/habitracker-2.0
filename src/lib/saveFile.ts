import { Capacitor } from "@capacitor/core";
import { toast } from "sonner";

const toBase64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });

/**
 * Saves a file in a way that works both in the browser and inside the
 * Android app (the app's web view ignores normal link downloads).
 * On the phone the file goes to Documents/HabiTracker and is opened right away.
 */
export async function saveFile(blob: Blob, filename: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return;
  }

  const { Filesystem, Directory } = await import("@capacitor/filesystem");
  const data = await toBase64(blob);
  let uri: string;
  try {
    const res = await Filesystem.writeFile({
      path: `HabiTracker/${filename}`,
      data,
      directory: Directory.Documents,
      recursive: true,
    });
    uri = res.uri;
    toast.success(`Saved to Documents/HabiTracker/${filename}`);
  } catch {
    // Newer phones may block Documents — fall back to app storage.
    const res = await Filesystem.writeFile({ path: filename, data, directory: Directory.Cache, recursive: true });
    uri = res.uri;
    toast.success(`Saved ${filename}`);
  }
  try {
    const { FileOpener } = await import("@capacitor-community/file-opener");
    await FileOpener.open({ filePath: uri, contentType: blob.type.split(";")[0] || "application/octet-stream" });
  } catch {
    if (filename.endsWith(".csv")) {
      toast.info("No spreadsheet app found to open it. Install Google Sheets or Excel to view it.");
    }
  }
}
