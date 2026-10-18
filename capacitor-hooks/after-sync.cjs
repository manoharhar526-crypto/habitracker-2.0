#!/usr/bin/env node
/**
 * after-sync.cjs — runs automatically after `npx cap sync` / `cap copy` / `cap update`
 * via the `capacitor:sync:after` / `capacitor:copy:after` / `capacitor:update:after`
 * npm script hooks declared in package.json.
 *
 * Copies all nine Habitracker home-screen widget sources into the generated
 *
 * Safe to run repeatedly — re-copies files and skips manifest patch if
 * already applied. Silent no-op if android/ folder doesn't exist yet
 * (e.g. iOS-only or web build).
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const TEMPLATE = path.join(ROOT, "android-widget-template");
const ANDROID = path.join(ROOT, "android", "app", "src", "main");
const PKG_DIR = path.join(ANDROID, "java", "com", "habitracker", "app", "widgets");
const LAYOUT_DIR = path.join(ANDROID, "res", "layout");
const XML_DIR = path.join(ANDROID, "res", "xml");
const DRAWABLE_DIR = path.join(ANDROID, "res", "drawable");
const MANIFEST = path.join(ANDROID, "AndroidManifest.xml");
const STRINGS_XML = path.join(ANDROID, "res", "values", "strings.xml");
const ROOT_GRADLE = path.join(ROOT, "android", "build.gradle");
const APP_GRADLE = path.join(ROOT, "android", "app", "build.gradle");
const VARIABLES_GRADLE = path.join(ROOT, "android", "variables.gradle");

if (!fs.existsSync(path.join(ROOT, "android"))) {
  // No android platform yet — nothing to do
  process.exit(0);
}
if (!fs.existsSync(TEMPLATE)) {
  console.warn("[widgets] android-widget-template/ missing — skipping");
  process.exit(0);
}

const ensureDir = (d) => fs.mkdirSync(d, { recursive: true });
const copyAll = (from, to, ext) => {
  ensureDir(to);
  for (const f of fs.readdirSync(from)) {
    if (!f.endsWith(ext)) continue;
    fs.copyFileSync(path.join(from, f), path.join(to, f));
  }
};

console.log("[widgets] copying widget sources into android/");
copyAll(path.join(TEMPLATE, "kotlin"), PKG_DIR, ".kt");
copyAll(path.join(TEMPLATE, "res-layout"), LAYOUT_DIR, ".xml");
copyAll(path.join(TEMPLATE, "res-xml"), XML_DIR, ".xml");
copyAll(path.join(TEMPLATE, "res-drawable"), DRAWABLE_DIR, ".xml");
console.log("[widgets] copied Kotlin, layout, and widget-provider XML files ✓");

// App icon, notification icon, Goku sound and Luffy image live in assets/ so they
// survive android/ being regenerated — copy them in on every sync.
const ASSETS = path.join(ROOT, "assets");
const RES = path.join(ANDROID, "res");
const copyTree = (from, to) => {
  if (!fs.existsSync(from)) return 0;
  let n = 0;
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, e.name);
    const dst = path.join(to, e.name);
    if (e.isDirectory()) n += copyTree(src, dst);
    else { ensureDir(to); fs.copyFileSync(src, dst); n++; }
  }
  return n;
};
let assetCount = 0;
assetCount += copyTree(path.join(ASSETS, "android-icons"), RES);
assetCount += copyTree(path.join(ASSETS, "notification-icon"), RES);
const sound = path.join(ASSETS, "sound", "hey_its_me_goku.mp3");
if (fs.existsSync(sound)) {
  ensureDir(path.join(RES, "raw"));
  fs.copyFileSync(sound, path.join(RES, "raw", "hey_its_me_goku.mp3"));
  assetCount++;
}
const luffy = path.join(ASSETS, "notification-image", "luffy.png");
if (fs.existsSync(luffy)) {
  ensureDir(DRAWABLE_DIR);
  fs.copyFileSync(luffy, path.join(DRAWABLE_DIR, "luffy.png"));
  assetCount++;
}
console.log(`[assets] copied ${assetCount} icon/sound/image files into android/ ✓`);

const patchFile = (file, patcher) => {
  if (!fs.existsSync(file)) return;
  const before = fs.readFileSync(file, "utf8");
  const after = patcher(before);
  if (after !== before) fs.writeFileSync(file, after);
};

for (const f of fs.readdirSync(XML_DIR).filter((name) => name.startsWith("widget_info_") && name.endsWith(".xml"))) {
  patchFile(path.join(XML_DIR, f), (s) =>
    s.includes("android:previewImage")
      ? s
      : s.replace(/android:previewLayout="([^"]+)"/, 'android:previewLayout="$1"\n    android:previewImage="@mipmap/ic_launcher"')
  );
}

patchFile(VARIABLES_GRADLE, (s) =>
  s.includes("kotlinVersion")
    ? s
    : s.replace("targetSdkVersion = 34", "targetSdkVersion = 34\n    kotlinVersion = '1.9.22'")
);

patchFile(ROOT_GRADLE, (s) =>
  s.includes("org.jetbrains.kotlin:kotlin-gradle-plugin")
    ? s
    : s.replace(
        "classpath 'com.android.tools.build:gradle:8.2.1'",
        "classpath 'com.android.tools.build:gradle:8.2.1'\n        classpath 'org.jetbrains.kotlin:kotlin-gradle-plugin:1.9.22'"
      )
);

patchFile(APP_GRADLE, (s) => {
  let out = s.includes("org.jetbrains.kotlin.android")
    ? s
    : s.replace("apply plugin: 'com.android.application'", "apply plugin: 'com.android.application'\napply plugin: 'org.jetbrains.kotlin.android'");
  if (!out.includes("kotlinOptions")) {
    out = out.replace(
      /\n}\s*\n\nrepositories \{/,
      "\n    kotlinOptions {\n        jvmTarget = '17'\n    }\n}\n\nrepositories {"
    );
  }
  return out;
});

patchFile(STRINGS_XML, (s) => {
  if (s.includes('name="widget_month_grid"') && s.includes('name="widget_today_summary"')) return s;
  // Strip any old widget label block, then re-emit the current 7 labels
  let out = s.replace(/\s*<string name="widget_[^"]+">[^<]*<\/string>/g, "");
  const labels = `
    <string name="widget_month_grid">Monthly Tracking Grid</string>
    <string name="widget_skip_days">Habit Skip Days</string>
    <string name="widget_analytics">Habit Analytics</string>
    <string name="widget_calendar">Calendar</string>
    <string name="widget_all_time_stats">All-Time Statistics</string>
    <string name="widget_habit_reports">Habit Reports</string>
    <string name="widget_task_reports">Task Reports</string>
    <string name="widget_today_summary">Today Summary</string>`;
  return out.replace("</resources>", `${labels}\n</resources>`);
});

// Patch AndroidManifest.xml
if (!fs.existsSync(MANIFEST)) {
  console.warn("[widgets] AndroidManifest.xml not found — skipping patch");
  process.exit(0);
}

let manifest = fs.readFileSync(MANIFEST, "utf8");
manifest = manifest.replace(/android:allowBackup="true"/g, 'android:allowBackup="false"')
  .replace(/\s*<uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES"\s*\/>/g, "");
const additions = fs.readFileSync(
  path.join(TEMPLATE, "manifest-additions.xml"),
  "utf8"
);
// Strip the leading explanatory <!-- ... --> comment
const receivers = additions
  .replace(/<!--[\s\S]*?-->/, "")
  .trim()
  .replace(/<receiver(?![^>]*android:icon=)/g, '<receiver android:icon="@mipmap/ic_launcher"')
  .split("\n")
  .map((l) => "        " + l)
  .join("\n");

const block =
  "\n        <!-- HABITRACKER_WIDGETS_BEGIN -->\n" +
  receivers +
  "\n        <!-- HABITRACKER_WIDGETS_END -->\n    ";

if (manifest.includes("HABITRACKER_WIDGETS_BEGIN")) {
  if (!manifest.includes("android:installLocation")) {
    manifest = manifest.replace(
      '<manifest xmlns:android="http://schemas.android.com/apk/res/android">',
      '<manifest xmlns:android="http://schemas.android.com/apk/res/android"\n    android:installLocation="internalOnly">'
    );
  }
  manifest = manifest.replace(
    /\n\s*<!-- HABITRACKER_WIDGETS_BEGIN -->[\s\S]*?<!-- HABITRACKER_WIDGETS_END -->\n\s*/,
    block
  );
  const ensurePerm2 = (name) => {
    if (!manifest.includes(name)) {
      manifest = manifest.replace("</manifest>", `    <uses-permission android:name="${name}" />\n</manifest>`);
    }
  };
  ensurePerm2("android.permission.RECEIVE_BOOT_COMPLETED");
  ensurePerm2("android.permission.WAKE_LOCK");
  fs.writeFileSync(MANIFEST, manifest);
  console.log("[widgets] ✓ refreshed widget receivers + boot/alarm in AndroidManifest.xml");
  process.exit(0);
}

if (!manifest.includes("</application>")) {
  console.error("[widgets] </application> tag not found in manifest");
  process.exit(1);
}

if (!manifest.includes("android:installLocation")) {
  manifest = manifest.replace(
    '<manifest xmlns:android="http://schemas.android.com/apk/res/android">',
    '<manifest xmlns:android="http://schemas.android.com/apk/res/android"\n    android:installLocation="internalOnly">'
  );
}

// Ensure boot + wake permissions for AlarmManager-driven widget refresh
const ensurePerm = (name) => {
  const tag = `<uses-permission android:name="${name}" />`;
  if (!manifest.includes(name)) {
    manifest = manifest.replace("</manifest>", `    ${tag}\n</manifest>`);
  }
};
ensurePerm("android.permission.RECEIVE_BOOT_COMPLETED");
ensurePerm("android.permission.WAKE_LOCK");
ensurePerm("android.permission.POST_NOTIFICATIONS");
ensurePerm("android.permission.VIBRATE");
ensurePerm("android.permission.SCHEDULE_EXACT_ALARM");

manifest = manifest.replace("</application>", block + "</application>");
fs.writeFileSync(MANIFEST, manifest);
console.log("[widgets] ✓ injected widget receivers + boot/alarm into AndroidManifest.xml");
