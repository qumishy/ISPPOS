-- App Updates Manifest
-- Stores the latest APK version metadata for in-app update checks.
-- The app queries this table to determine if an update is available.

CREATE TABLE IF NOT EXISTS public.app_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform text NOT NULL DEFAULT 'android',
  latest_version text NOT NULL,
  latest_build_number integer NOT NULL DEFAULT 0,
  apk_url text DEFAULT '',
  release_notes text DEFAULT '',
  force_update boolean DEFAULT false,
  minimum_supported_build integer DEFAULT 0,
  published_at timestamptz DEFAULT now(),
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Fast lookup for the active record per platform
CREATE INDEX IF NOT EXISTS idx_app_updates_platform_active
  ON public.app_updates (platform, active)
  WHERE active = true;

-- Enable RLS
ALTER TABLE public.app_updates ENABLE ROW LEVEL SECURITY;

-- Public read access for the active manifest record
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'App updates are publicly readable'
    AND tablename = 'app_updates'
  ) THEN
    CREATE POLICY "App updates are publicly readable"
      ON public.app_updates FOR SELECT
      USING (active = true);
  END IF;
END $$;

GRANT SELECT ON public.app_updates TO anon;
GRANT SELECT ON public.app_updates TO authenticated;

-- Seed the current version record
INSERT INTO public.app_updates (
  platform,
  latest_version,
  latest_build_number,
  apk_url,
  release_notes,
  force_update,
  minimum_supported_build,
  active
) VALUES (
  'android',
  '2.0.2',
  20,
  '',
  'الإصدار الحالي',
  false,
  0,
  true
);

NOTIFY pgrst, 'reload schema';
