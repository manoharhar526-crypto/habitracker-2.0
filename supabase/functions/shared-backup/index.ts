import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const normalizeCode = (raw: unknown): string | null => {
  if (typeof raw !== "string") return null;
  const c = raw.trim().toLowerCase();
  if (c.length < 4 || c.length > 64) return null;
  if (!/^[a-z0-9_-]+$/.test(c)) return null;
  return c;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const admin = createClient(supabaseUrl, serviceKey);

    const token = authHeader.slice("Bearer ".length);
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData?.user?.id) return json({ error: "Unauthorized" }, 401);
    const user = { id: userData.user.id };

    const contentLength = parseInt(req.headers.get("content-length") || "0");
    if (contentLength > 800_000) return json({ error: "Payload too large" }, 413);

    const body = await req.json().catch(() => ({}));
    const { action } = body ?? {};

    // ── list codes owned by the caller ──────────────────────────────────────
    if (action === "list-mine") {
      const { data, error } = await admin
        .from("shared_backups")
        .select("code, label, created_at, updated_at")
        .eq("owner_user_id", user.id)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return json({ success: true, backups: data ?? [] });
    }

    // ── check whether a code is available ───────────────────────────────────
    if (action === "check") {
      const code = normalizeCode(body.code);
      if (!code) return json({ error: "Code must be 4-64 chars: a-z, 0-9, _ or -" }, 400);
      const { data } = await admin
        .from("shared_backups")
        .select("code, owner_user_id")
        .eq("code", code)
        .maybeSingle();
      if (!data) return json({ available: true });
      return json({ available: false, mine: data.owner_user_id === user.id });
    }

    // ── save (reserve + write). Only the code owner can write to a code. ────
    if (action === "save") {
      const code = normalizeCode(body.code);
      if (!code) return json({ error: "Code must be 4-64 chars: a-z, 0-9, _ or -" }, 400);
      const habits = body.habits, tasks = body.tasks;
      if (!Array.isArray(habits) || !Array.isArray(tasks))
        return json({ error: "Invalid data" }, 400);
      if (JSON.stringify({ habits, tasks }).length > 700_000)
        return json({ error: "Backup too large" }, 400);
      const label = typeof body.label === "string" ? body.label.slice(0, 60) : null;

      const { data: existing } = await admin
        .from("shared_backups")
        .select("code, owner_user_id")
        .eq("code", code)
        .maybeSingle();

      if (existing) {
        if (existing.owner_user_id !== user.id)
          return json({ error: "Code already taken. Pick another." }, 409);
        const { error } = await admin
          .from("shared_backups")
          .update({ habits, tasks, label, updated_at: new Date().toISOString() })
          .eq("code", code);
        if (error) throw error;
        return json({ success: true, code, updated: true });
      }

      const { error: insErr } = await admin.from("shared_backups").insert({
        code, owner_user_id: user.id, habits, tasks, label,
      });
      if (insErr) {
        if (insErr.code === "23505")
          return json({ error: "Code already taken. Pick another." }, 409);
        throw insErr;
      }
      return json({ success: true, code, created: true }, 201);
    }

    // ── restore by code (any user's code) ───────────────────────────────────
    if (action === "restore") {
      const code = normalizeCode(body.code);
      if (!code) return json({ error: "Invalid code" }, 400);
      const { data, error } = await admin
        .from("shared_backups")
        .select("habits, tasks, label, updated_at, owner_user_id")
        .eq("code", code)
        .maybeSingle();
      if (error) throw error;
      // A missing user-entered code is an expected application result, not an
      // Edge Function transport/runtime failure. Keep the response successful
      // so clients can show the message without triggering a fatal 404 overlay.
      if (!data) return json({ success: false, error: "No backup found for that code.", notFound: true });
      return json({
        success: true,
        habits: data.habits,
        tasks: data.tasks,
        label: data.label,
        updatedAt: data.updated_at,
        mine: data.owner_user_id === user.id,
      });
    }

    // ── delete (owner only) ─────────────────────────────────────────────────
    if (action === "delete") {
      const code = normalizeCode(body.code);
      if (!code) return json({ error: "Invalid code" }, 400);
      const { data: existing } = await admin
        .from("shared_backups")
        .select("owner_user_id")
        .eq("code", code)
        .maybeSingle();
      if (!existing) return json({ error: "Not found" }, 404);
      if (existing.owner_user_id !== user.id)
        return json({ error: "You don't own this code." }, 403);
      const { error } = await admin.from("shared_backups").delete().eq("code", code);
      if (error) throw error;
      return json({ success: true });
    }

    return json({ error: "Invalid action" }, 400);
  } catch (err) {
    console.error("shared-backup error:", err);
    return json({ error: "Unexpected error" }, 500);
  }
});
