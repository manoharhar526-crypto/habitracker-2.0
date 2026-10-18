// Shared security helpers for edge functions: DB-backed rate limiting
// (survives cold starts, shared across instances) and PBKDF2 hashing.
// deno-lint-ignore-file no-explicit-any

export async function checkRateLimit(
  supabaseAdmin: any,
  identifier: string,
  action: string,
  maxAttempts: number,
  windowSeconds: number,
): Promise<boolean> {
  try {
    const windowStart = new Date(Date.now() - windowSeconds * 1000).toISOString();
    const { data, error } = await supabaseAdmin
      .from("rate_limits")
      .select("id, attempts, window_start")
      .eq("identifier", identifier)
      .eq("action", action)
      .maybeSingle();
    if (error) { console.warn("rate limit lookup failed", error.message); return false; }
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
    await supabaseAdmin.from("rate_limits").update({ attempts: data.attempts + 1 }).eq("id", data.id);
    return false;
  } catch (e) {
    console.warn("rate limit check failed", e);
    return false;
  }
}

const toHex = (b: Uint8Array) => Array.from(b).map(x => x.toString(16).padStart(2, "0")).join("");
const fromHex = (h: string) => new Uint8Array(h.match(/.{2}/g)!.map(b => parseInt(b, 16)));

async function pbkdf2(secret: string, salt: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 100_000, hash: "SHA-256" }, key, 256);
  return new Uint8Array(bits);
}

/** 16-byte salt + 32-byte key, hex encoded (96 chars). */
export async function hashSecret(secret: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await pbkdf2(secret, salt);
  const out = new Uint8Array(48);
  out.set(salt); out.set(key, 16);
  return toHex(out);
}

export function timingSafeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}

export async function verifySecret(secret: string, stored: string): Promise<boolean> {
  if (!stored || stored.length !== 96) return false;
  try {
    const all = fromHex(stored);
    return timingSafeEqualBytes(await pbkdf2(secret, all.slice(0, 16)), all.slice(16));
  } catch {
    return false;
  }
}

export async function sha256Hex(value: string): Promise<string> {
  return toHex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))));
}

/**
 * Deterministic keyed fingerprint of a PIN (HMAC-SHA256 with a server-only
 * pepper). Same PIN → same fingerprint, so uniqueness can be enforced, but it
 * can't be reversed without the pepper. Never send it to the client.
 */
export async function pinFingerprint(pin: string): Promise<string> {
  const pepper = Deno.env.get("PIN_PEPPER") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pepper), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return toHex(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(pin))));
}
