import { createRoot } from "react-dom/client";
import "./index.css";
import { hydrateLocalStorageFromNative } from "./lib/nativeStorage";

let appStarted = false;

const startApp = async () => {
  if (appStarted) return;
  appStarted = true;

  // Hydrate native-backed storage BEFORE Supabase client (in App tree) reads it
  await hydrateLocalStorageFromNative();

  const { default: App } = await import("./App.tsx");
  const { initNotificationsOnNative } = await import("./lib/notificationUtils");
  await initNotificationsOnNative();
  const root = document.getElementById("root");
  if (!root) return;
  createRoot(root).render(<App />);
};

if ((window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.()) {
  document.addEventListener("deviceready", () => startApp(), false);
  setTimeout(() => startApp(), 2000); // fallback if deviceready doesn't fire
} else {
  startApp();
}
