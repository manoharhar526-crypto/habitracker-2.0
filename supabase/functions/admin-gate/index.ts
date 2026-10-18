import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

import { checkRateLimit, hashSecret, verifySecret, sha256Hex } from "../_shared/security.ts";

// Accepts PBKDF2 hashes and legacy unsalted SHA-256 (64 hex chars).
async function checkCode(code: string, stored: string): Promise<{ ok: boolean; legacy: boolean }> {
  if (stored.length === 64) {
    const h = await sha256Hex(code);
    let d = 0;
    for (let i = 0; i < 64; i++) d |= h.charCodeAt(i) ^ stored.charCodeAt(i);
    return { ok: d === 0, legacy: true };
  }
  return { ok: await verifySecret(code, stored), legacy: false };
}

async function verifyAdmin(authHeader: string) {
  const client = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) return null;

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: roleData } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .maybeSingle();

  if (!roleData) return null;
  return { userId: user.id, supabaseAdmin };
}

Deno.serve(async (req) => {
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("cf-connecting-ip") ||
      "unknown";

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const admin = await verifyAdmin(authHeader);
    if (!admin) return json({ error: "Admin access required" }, 403);

    const { supabaseAdmin, userId } = admin;
    const body = await req.json().catch(() => ({}));
    const action = body?.action;

    if (action === "verify") {
      if (await checkRateLimit(supabaseAdmin, `${userId}:${ip}`, "admin-verify", 8, 60)) {
        return json({ error: "Too many attempts. Try again in a minute." }, 429);
      }

      const code = body?.code;
      if (typeof code !== "string" || code.length < 1 || code.length > 128) {
        return json({ error: "Invalid secret code" }, 400);
      }

      const { data: row } = await supabaseAdmin
        .from("admin_secret")
        .select("id, code_hash")
        .limit(1)
        .maybeSingle();

      if (!row?.code_hash) return json({ error: "Secret code is not configured" }, 500);

      const { ok, legacy } = await checkCode(code, row.code_hash);
      if (!ok) return json({ error: "Incorrect secret code" }, 401);
      // Upgrade legacy SHA-256 hash to PBKDF2 on first successful use.
      if (legacy) {
        await supabaseAdmin.from("admin_secret").update({ code_hash: await hashSecret(code) }).eq("id", row.id);
      }

      return json({ verified: true });
    }

    if (action === "reset") {
      const currentCode = body?.currentCode;
      const newCode = body?.newCode;

      if (typeof currentCode !== "string" || typeof newCode !== "string") {
        return json({ error: "Both current and new secret codes are required" }, 400);
      }
      if (newCode.length < 4 || newCode.length > 128) {
        return json({ error: "New secret code must be 4-128 characters" }, 400);
      }

      const { data: row } = await supabaseAdmin
        .from("admin_secret")
        .select("id, code_hash")
        .limit(1)
        .maybeSingle();

      if (!row) return json({ error: "Secret code is not configured" }, 500);

      if (await checkRateLimit(supabaseAdmin, `${userId}:${ip}`, "admin-reset", 5, 300)) {
        return json({ error: "Too many attempts. Try again later." }, 429);
      }
      const { ok } = await checkCode(currentCode, row.code_hash);
      if (!ok) return json({ error: "Current secret code is incorrect" }, 401);

      const { error: updateError } = await supabaseAdmin
        .from("admin_secret")
        .update({ code_hash: await hashSecret(newCode), updated_by: userId })
        .eq("id", row.id);

      if (updateError) return json({ error: "Could not update secret code" }, 500);

      return json({ success: true });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (err) {
    console.error("admin-gate error:", err);
    return json({ error: "An unexpected error occurred" }, 500);
  }
});
