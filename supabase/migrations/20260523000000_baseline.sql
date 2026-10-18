-- =============================================================
-- BASELINE MIGRATION — Matches the schema already applied via
-- the Supabase SQL Editor. Do NOT run this again manually.
-- =============================================================

-- ── Extensions ────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── Shared trigger function ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_backup_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- ── app_role enum + user_roles ────────────────────────────────
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');
CREATE TABLE IF NOT EXISTS public.user_roles (
  id      UUID     PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID     NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role    app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- ── has_role() ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- ── user_roles policies ───────────────────────────────────────
CREATE POLICY "Users can view own roles"     ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Only admins can insert roles" ON public.user_roles FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Only admins can update roles" ON public.user_roles FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Only admins can delete roles" ON public.user_roles FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));


-- ── user_backups ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_backups (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL,
  pin_code   TEXT        DEFAULT NULL,
  pin_hash   TEXT        NOT NULL,
  habits     JSONB       NOT NULL DEFAULT '[]'::jsonb,
  tasks      JSONB       NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unique_user_backup UNIQUE (user_id),
  CONSTRAINT unique_pin_hash    UNIQUE (pin_hash)
);
GRANT ALL ON public.user_backups TO service_role;
ALTER TABLE public.user_backups ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_user_backups_updated_at
  BEFORE UPDATE ON public.user_backups
  FOR EACH ROW EXECUTE FUNCTION public.update_backup_updated_at();
CREATE POLICY "Users can view own backup"   ON public.user_backups FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own backup" ON public.user_backups FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own backup" ON public.user_backups FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own backup" ON public.user_backups FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ── profiles ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  username   TEXT        NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_backup_updated_at();
CREATE POLICY "Users can view own profile"    ON public.profiles FOR SELECT       USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all profiles"  ON public.profiles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can insert own profile"  ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own profile"  ON public.profiles FOR UPDATE       USING (auth.uid() = user_id);

-- ── check_username_available() ────────────────────────────────
CREATE OR REPLACE FUNCTION public.check_username_available(target_username text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public' AS $$
  SELECT NOT EXISTS (SELECT 1 FROM public.profiles WHERE username = trim(target_username));
$$;

-- ── handle_new_user() trigger ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
BEGIN
  IF (NEW.raw_user_meta_data ->> 'username') IS NULL OR NOT ((NEW.raw_user_meta_data ->> 'username') ~ '^[^\s]{1,30}$') THEN
    RAISE EXCEPTION 'Invalid username format';
  END IF;
  INSERT INTO public.profiles (user_id, username)
  VALUES (NEW.id, NEW.raw_user_meta_data ->> 'username');
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
