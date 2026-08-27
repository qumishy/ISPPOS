-- Make collection numbers unique per project instead of globally.
-- Abort without changing schema when same-project duplicates need review.

begin;

do $$
begin
  if exists (
    select 1
    from public.collections
    where collection_number is not null
    group by project_id, collection_number
    having count(*) > 1
  ) then
    raise exception 'Cannot create project-scoped collection number uniqueness: duplicate collection_number exists within the same project.';
  end if;
end $$;

alter table public.collections
  drop constraint if exists collections_collections_number_key;

alter table public.collections
  drop constraint if exists collections_collection_number_key;

drop index if exists public.collections_project_collection_number_key;

create unique index if not exists collections_project_collection_number_key
  on public.collections(project_id, collection_number);

commit;
