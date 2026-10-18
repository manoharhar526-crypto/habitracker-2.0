import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

import { checkRateLimit } from "../_shared/security.ts";

Deno.serve(async (req) => {
  
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const clientIp =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("cf-connecting-ip") ||
      "unknown";

    const limiter = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    if (await checkRateLimit(limiter, clientIp, "auth-login", 10, 60)) {
      return new Response(
        JSON.stringify({ error: "Too many login attempts. Please try again later." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { username, password } = await req.json();

    if (!username || typeof username !== "string" || !password || typeof password !== "string") {
      return new Response(
        JSON.stringify({ error: "Username and password are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const trimmedUsername = username.trim();
    
    if (!/^[^\s]{1,30}$/.test(trimmedUsername) || password.length > 128) {
      return new Response(
        JSON.stringify({ error: "Invalid credentials" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use service role to look up email by username
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("user_id")
      .eq("username", trimmedUsername)
      .maybeSingle();

    if (profileError || !profile) {
      return new Response(
        JSON.stringify({ error: "Invalid username or password" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get user email from auth
    const { data: { user }, error: userError } = await supabaseAdmin.auth.admin.getUserById(
      profile.user_id
    );

    if (userError || !user || !user.email) {
      return new Response(
        JSON.stringify({ error: "Invalid username or password" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Sign in and check admin role in parallel
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!
    );

    const [signInResult, roleResult] = await Promise.all([
      supabaseClient.auth.signInWithPassword({
        email: user.email,
        password: password,
      }),
      supabaseAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", profile.user_id)
        .eq("role", "admin")
        .maybeSingle(),
    ]);

    if (signInResult.error) {
      const msg = signInResult.error.message?.toLowerCase().includes("email not confirmed")
        ? "Please confirm your email before logging in. Check your inbox."
        : "Invalid username or password";
      const status = signInResult.error.message?.toLowerCase().includes("email not confirmed") ? 403 : 401;
      return new Response(
        JSON.stringify({ error: msg }),
        { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        session: signInResult.data.session,
        user: signInResult.data.user,
        is_admin: !!roleResult.data,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Login error:", err);
    return new Response(
      JSON.stringify({ error: "An unexpected error occurred" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
