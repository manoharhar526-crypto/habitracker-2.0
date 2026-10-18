/**
 * nativeStorage.ts — Hydrates localStorage from Capacitor Preferences on
 * native (Android/iOS) BEFORE the Supabase client reads its auth token.
 *
 * Why: on some Android WebViews, localStorage gets cleared by the system
 * (low storage, app data cleanup, OEM behavior). Capacitor Preferences uses
 * native SharedPreferences, which survives. We mirror all "sb-*" auth keys
 * (plus our own app keys) between the two so the user stays logged in.
 *
 * Strategy:
 *   1. On startup → read all keys from Preferences, write into localStorage.
 *   2. Monkey-patch localStorage.setItem/removeItem to also write to Preferences.
 *   3. Synchronous reads continue to hit localStorage as normal.
 */
import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import { toast } from "sonner";

const MIRROR_PREFIXES = ["sb-", "habitracker_", "app_", "user_"];

const shouldMirror = (key: string) =>
  MIRROR_PREFIXES.some((p) => key.startsWith(p));

let warned = false;
const reportFailure = () => {
  console.warn("[nativeStorage] native persistence unavailable");
  if (warned) return;
  warned = true;
  setTimeout(() => toast.warning("Your phone could not save your login safely. Avoid clearing app data until this is resolved."), 3000);
};

export async function hydrateLocalStorageFromNative(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { keys } = await Preferences.keys();
    for (const k of keys) {
      if (!shouldMirror(k)) continue;
      const { value } = await Preferences.get({ key: k });
      if (value !== null && localStorage.getItem(k) == null) {
        try { localStorage.setItem(k, value); } catch { /* quota — skip */ }
      }
    }

    // Mirror future writes back to Preferences
    const origSet = localStorage.setItem.bind(localStorage);
    const origRemove = localStorage.removeItem.bind(localStorage);
    const origClear = localStorage.clear.bind(localStorage);

    localStorage.setItem = (key: string, value: string) => {
      origSet(key, value);
      if (shouldMirror(key)) Preferences.set({ key, value }).catch(reportFailure);
    };
    localStorage.removeItem = (key: string) => {
      origRemove(key);
      if (shouldMirror(key)) Preferences.remove({ key }).catch(reportFailure);
    };
    localStorage.clear = () => {
      origClear();
      Preferences.clear().catch(reportFailure);
    };
  } catch (e) {
    reportFailure();
  }
}
