-- Make collection numbers unique per project instead of globally.
-- Safe guards:
--   * aborts if duplicates already exist inside the same project
--   * drops only the old global collection_number unique constraint
--   * does not delete rows
--   * does not change amounts
--   * does not alter invoice_items

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.collections
    WHERE collection_number IS NOT NULL
    GROUP BY project_id, collection_number
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot create project-scoped collection number uniqueness: duplicate collection_number exists within the same project.';
  END IF;
END $$;

ALTER TABLE public.collections
  DROP CONSTRAINT IF EXISTS collections_collections_number_key;

ALTER TABLE public.collections
  DROP CONSTRAINT IF EXISTS collections_collection_number_key;

DROP INDEX IF EXISTS public.collections_project_collection_number_key;

CREATE UNIQUE INDEX IF NOT EXISTS collections_project_collection_number_key
  ON public.collections(project_id, collection_number);

COMMIT;
