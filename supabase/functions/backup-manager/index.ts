import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { pinFingerprint } from "../_shared/security.ts";

// ── CORS ──────────────────────────────────────────────────────────────────────
const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") || "*";
const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ── PIN crypto ────────────────────────────────────────────────────────────────
async function hashPin(pin: string): Promise<string> {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    "raw", encoder.encode(pin), "PBKDF2", false, ["deriveBits"]
  );
  const derivedBits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 100_000, hash: "SHA-256" },
    keyMaterial, 256
  );
  const combined = new Uint8Array(16 + 32);
  combined.set(salt);
  combined.set(new Uint8Array(derivedBits), 16);
  return Array.from(combined).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function verifyPin(pin: string, storedHash: string): Promise<boolean> {
  if (!storedHash || storedHash.length < 96) return false;
  try {
    const encoder = new TextEncoder();
    const combined = new Uint8Array(storedHash.match(/.{2}/g)!.map(b => parseInt(b, 16)));
    const salt = combined.slice(0, 16);
    const storedKey = combined.slice(16);
    const keyMaterial = await crypto.subtle.importKey(
      "raw", encoder.encode(pin), "PBKDF2", false, ["deriveBits"]
    );
    const derivedBits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt, iterations: 100_000, hash: "SHA-256" },
      keyMaterial, 256
    );
    const derived = new Uint8Array(derivedBits);
    if (derived.length !== storedKey.length) return false;
    let result = 0;
    for (let i = 0; i < derived.length; i++) result |= derived[i] ^ storedKey[i];
    return result === 0;
  } catch {
    return false;
  }
}

// ── DB-backed rate limiting ───────────────────────────────────────────────────
async function checkRateLimit(
  supabaseAdmin: ReturnType<typeof createClient>,
  identifier: string,
  action: string,
  maxAttempts: number,
  windowSeconds: number
): Promise<boolean> {
  try {
    const windowStart = new Date(Date.now() - windowSeconds * 1000).toISOString();

    const { data, error } = await supabaseAdmin
      .from("rate_limits")
      .select("id, attempts, window_start")
      .eq("identifier", identifier)
      .eq("action", action)
      .maybeSingle();

    if (error) return false;

    if (!data) {
      await supabaseAdmin.from("rate_limits").insert({ identifier, action });
      return false;
    }

    if (data.window_start < windowStart) {
      await supabaseAdmin.from("rate_limits")
        .update({ attempts: 1, window_start: new Date().toISOString() })
        .eq("id", data.id);
      return false;
    }

    if (data.attempts >= maxAttempts) return true;

    await supabaseAdmin.from("rate_limits")
      .update({ attempts: data.attempts + 1 })
      .eq("id", data.id);
    return false;
  } catch {
    return false;
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // ── Auth ────────────────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return jsonResponse({ error: "Unauthorized" }, 401);

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) return jsonResponse({ error: "Unauthorized" }, 401);
    const userId = user.id;

    // ── Parse body with size guard ──────────────────────────────────────────
    const contentLength = parseInt(req.headers.get("content-length") || "0");
    if (contentLength > 600_000) return jsonResponse({ error: "Payload too large" }, 413);

    const body = await req.json();
    const { action } = body;

    // ── check ───────────────────────────────────────────────────────────────
    if (action === "check") {
      const { data } = await supabaseAdmin
        .from("user_backups")
        .select("id, created_at, updated_at")
        .eq("user_id", userId)
        .maybeSingle();
      return jsonResponse({ hasBackup: !!data, backup: data });
    }

    // ── check-pin-available ─────────────────────────────────────────────────
    if (action === "check-pin-available") {
      const { pin } = body;
      if (!pin || typeof pin !== "string" || pin.trim().length < 4)
        return jsonResponse({ error: "PIN must be at least 4 characters" }, 400);

      const limited = await checkRateLimit(supabaseAdmin, userId, "check-pin", 20, 60);
      if (limited) return jsonResponse({ error: "Too many requests" }, 429);

      const { data: ownBackup } = await supabaseAdmin
        .from("user_backups")
        .select("id")
        .eq("user_id", userId)
        .maybeSingle();
      if (ownBackup) return jsonResponse({ available: true });

      const lookup = await pinFingerprint(pin.trim());
      const { data: taken } = await supabaseAdmin
        .from("user_backups").select("id").eq("pin_lookup", lookup).maybeSingle();
      return jsonResponse({ available: !taken });
    }

    // ── validate PIN for backup/restore/delete ──────────────────────────────
    const { pin } = body;
    if (!pin || typeof pin !== "string" || pin.trim().length < 4)
      return jsonResponse({ error: "PIN must be at least 4 characters" }, 400);
    if (pin.length > 64)
      return jsonResponse({ error: "PIN too long" }, 400);

    const trimmedPin = pin.trim();

    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || userId;
    const pinLimited = await checkRateLimit(supabaseAdmin, `${clientIp}:${action}`, "pin-action", 10, 300);
    if (pinLimited) return jsonResponse({ error: "Too many attempts. Try again in 5 minutes." }, 429);

    // ── backup ──────────────────────────────────────────────────────────────
    if (action === "backup") {
      const { habits, tasks } = body;
      if (!Array.isArray(habits) || !Array.isArray(tasks))
        return jsonResponse({ error: "Invalid data format" }, 400);
      if (JSON.stringify({ habits, tasks }).length > 500_000)
        return jsonResponse({ error: "Backup data too large" }, 400);

      const { data: existing } = await supabaseAdmin
        .from("user_backups")
        .select("id, pin_hash")
        .eq("user_id", userId)
        .maybeSingle();

      if (existing) {
        const pinMatches = await verifyPin(trimmedPin, existing.pin_hash ?? "");
        if (!pinMatches)
          return jsonResponse({ error: "Wrong PIN. Use your original PIN to update." }, 403);

        const { error: upErr } = await supabaseAdmin
          .from("user_backups")
          .update({ habits, tasks, updated_at: new Date().toISOString() })
          .eq("id", existing.id);
        if (upErr) throw upErr;
        return jsonResponse({ success: true, message: "Backup updated" });
      }

      const newHash = await hashPin(trimmedPin);
      const pin_lookup = await pinFingerprint(trimmedPin);
      const { error: insErr } = await supabaseAdmin
        .from("user_backups")
        .insert({ user_id: userId, pin_hash: newHash, pin_lookup, pin_code: null, habits, tasks });

      if (insErr) {
        if (insErr.code === "23505") return jsonResponse({ error: "PIN already taken. Choose another." }, 409);
        throw insErr;
      }
      return jsonResponse({ success: true, message: "Backup created" }, 201);
    }

    // ── restore ─────────────────────────────────────────────────────────────
    if (action === "restore") {
      const { data: backup } = await supabaseAdmin
        .from("user_backups")
        .select("pin_hash, habits, tasks")
        .eq("user_id", userId)
        .maybeSingle();

      if (!backup) return jsonResponse({ error: "No backup found for this account." }, 404);

      const pinMatches = await verifyPin(trimmedPin, backup.pin_hash ?? "");
      if (!pinMatches) return jsonResponse({ error: "Incorrect PIN." }, 403);

      return jsonResponse({ success: true, habits: backup.habits, tasks: backup.tasks });
    }

    // ── delete ──────────────────────────────────────────────────────────────
    if (action === "delete") {
      const { data: backup } = await supabaseAdmin
        .from("user_backups")
        .select("id, pin_hash")
        .eq("user_id", userId)
        .maybeSingle();

      if (!backup) return jsonResponse({ error: "No backup found." }, 404);

      const pinMatches = await verifyPin(trimmedPin, backup.pin_hash ?? "");
      if (!pinMatches) return jsonResponse({ error: "Incorrect PIN." }, 403);

      const { error: delErr } = await supabaseAdmin
        .from("user_backups")
        .delete()
        .eq("id", backup.id);
      if (delErr) throw delErr;

      return jsonResponse({ success: true, message: "Backup deleted" });
    }

    return jsonResponse({ error: "Invalid action" }, 400);

  } catch (err) {
    console.error("backup-manager error:", err);
    return jsonResponse({ error: "An unexpected error occurred" }, 500);
  }
});
