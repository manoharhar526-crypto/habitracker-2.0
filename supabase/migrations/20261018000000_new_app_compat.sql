-- Compatibility migration: lets the NEW app + NEW edge functions run on the OLD database.
-- Additive and idempotent: it does NOT delete or modify any existing user data.

-- 1) rate_limits: used by supabase/functions/_shared/security.ts (login / admin attempt limiting)
CREATE TABLE IF NOT EXISTS public.rate_limits (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier   text        NOT NULL,
  action       text        NOT NULL,
  attempts     integer     NOT NULL DEFAULT 1,
  window_start timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_rate_limits_identifier_action UNIQUE (identifier, action)
);
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;  -- no policies: service_role (edge functions) only
REVOKE ALL ON public.rate_limits FROM anon, authenticated;
GRANT ALL ON public.rate_limits TO service_role;

-- 2) user_backups.pin_lookup: keyed fingerprint of the PIN, used by backup-manager (PIN availability check)
--    Existing rows keep NULL and continue to work (restore/verify still use pin_hash).
ALTER TABLE public.user_backups ADD COLUMN IF NOT EXISTS pin_lookup text;
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_backups_pin_lookup
  ON public.user_backups (pin_lookup) WHERE pin_lookup IS NOT NULL;
