
CREATE TABLE public.shared_backups (
  code text PRIMARY KEY,
  owner_user_id uuid NOT NULL,
  habits jsonb NOT NULL DEFAULT '[]'::jsonb,
  tasks jsonb NOT NULL DEFAULT '[]'::jsonb,
  label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.shared_backups TO service_role;

ALTER TABLE public.shared_backups ENABLE ROW LEVEL SECURITY;

CREATE INDEX shared_backups_owner_idx ON public.shared_backups(owner_user_id);
