begin;

create temp table remaining_ambiguous_invoice_items_repair_20260623 (
  id uuid primary key,
  invoice_id uuid not null,
  invoice_number text not null,
  project_id uuid not null,
  phase_id uuid not null,
  category_id uuid not null,
  batch_id uuid not null,
  wallet_id uuid not null,
  quantity integer not null check (quantity > 0),
  unit_price numeric not null check (unit_price > 0)
) on commit drop;

insert into remaining_ambiguous_invoice_items_repair_20260623
(id, invoice_id, invoice_number, project_id, phase_id, category_id, batch_id, wallet_id, quantity, unit_price)
values
('00000000-0000-4000-9000-000000006431','ef484fd4-08eb-4f22-b671-3a9c462ea213','INV-2026-0643','00000000-0000-4000-a000-000000000001','019d5d54-cd75-4939-97af-ee8e0ec4c3a6','08a35df4-c662-441f-82c1-22f39dd363a7','7160493b-feea-4cff-9d67-85adc9968d05','a65791b8-b9c9-4504-b050-e458ee583b6a',3,23500),
('00000000-0000-4000-9000-000000006432','ef484fd4-08eb-4f22-b671-3a9c462ea213','INV-2026-0643','00000000-0000-4000-a000-000000000001','019d5d54-cd75-4939-97af-ee8e0ec4c3a6','bd33569a-2518-430e-8eed-8e727eeca27e','667385fb-a85e-4d8e-a25c-a84a0292bc58','48b3af9a-96da-4b11-a188-57d247f585ed',3,14000),
('00000000-0000-4000-9000-000000006433','ef484fd4-08eb-4f22-b671-3a9c462ea213','INV-2026-0643','00000000-0000-4000-a000-000000000001','019d5d54-cd75-4939-97af-ee8e0ec4c3a6','89291698-6aea-47c9-9c04-2d197e5f7abc','c2dc3af7-bdcc-42b7-95d2-0279b1bcd1f1','ddcd754b-022c-4731-b383-9fe5ef3dd25b',3,9000),
('00000000-0000-4000-9000-000000006441','efbea0b4-3c08-48f9-bd0b-8ec60543bafe','INV-2026-0644','00000000-0000-4000-a000-000000000001','019d5d54-cd75-4939-97af-ee8e0ec4c3a6','08a35df4-c662-441f-82c1-22f39dd363a7','7160493b-feea-4cff-9d67-85adc9968d05','a65791b8-b9c9-4504-b050-e458ee583b6a',2,23500),
('00000000-0000-4000-9000-000000006442','efbea0b4-3c08-48f9-bd0b-8ec60543bafe','INV-2026-0644','00000000-0000-4000-a000-000000000001','019d5d54-cd75-4939-97af-ee8e0ec4c3a6','bd33569a-2518-430e-8eed-8e727eeca27e','667385fb-a85e-4d8e-a25c-a84a0292bc58','48b3af9a-96da-4b11-a188-57d247f585ed',1,14000),
('00000000-0000-4000-9000-000000006443','efbea0b4-3c08-48f9-bd0b-8ec60543bafe','INV-2026-0644','00000000-0000-4000-a000-000000000001','019d5d54-cd75-4939-97af-ee8e0ec4c3a6','89291698-6aea-47c9-9c04-2d197e5f7abc','c2dc3af7-bdcc-42b7-95d2-0279b1bcd1f1','ddcd754b-022c-4731-b383-9fe5ef3dd25b',1,9000),
('00000000-0000-4000-9000-000000006461','69f97623-0352-4b3a-bed7-25621fd7414c','INV-2026-0646','00000000-0000-4000-a000-000000000001','019d5d54-cd75-4939-97af-ee8e0ec4c3a6','08a35df4-c662-441f-82c1-22f39dd363a7','7160493b-feea-4cff-9d67-85adc9968d05','a65791b8-b9c9-4504-b050-e458ee583b6a',2,23500),
('00000000-0000-4000-9000-000000006462','69f97623-0352-4b3a-bed7-25621fd7414c','INV-2026-0646','00000000-0000-4000-a000-000000000001','019d5d54-cd75-4939-97af-ee8e0ec4c3a6','bd33569a-2518-430e-8eed-8e727eeca27e','667385fb-a85e-4d8e-a25c-a84a0292bc58','48b3af9a-96da-4b11-a188-57d247f585ed',2,14000),
('00000000-0000-4000-9000-000000006463','69f97623-0352-4b3a-bed7-25621fd7414c','INV-2026-0646','00000000-0000-4000-a000-000000000001','019d5d54-cd75-4939-97af-ee8e0ec4c3a6','89291698-6aea-47c9-9c04-2d197e5f7abc','c2dc3af7-bdcc-42b7-95d2-0279b1bcd1f1','ddcd754b-022c-4731-b383-9fe5ef3dd25b',2,9000);

select w.id as locked_wallet_id
from public.agent_wallets w
where exists (
  select 1
  from remaining_ambiguous_invoice_items_repair_20260623 p
  where p.wallet_id = w.id
)
for update;

do $$
declare
  unassigned_23500 integer;
begin
  if (select count(*) from remaining_ambiguous_invoice_items_repair_20260623) <> 9 then
    raise exception 'Repair guard failed: expected 9 proposed invoice_item rows';
  end if;

  if (select count(distinct invoice_id) from remaining_ambiguous_invoice_items_repair_20260623) <> 3 then
    raise exception 'Repair guard failed: expected exactly 3 invoices';
  end if;

  if exists (
    select 1
    from remaining_ambiguous_invoice_items_repair_20260623 p
    where p.invoice_number not in ('INV-2026-0643','INV-2026-0644','INV-2026-0646')
  ) then
    raise exception 'Repair guard failed: unapproved invoice_number in repair rows';
  end if;

  if exists (
    select 1
    from remaining_ambiguous_invoice_items_repair_20260623 p
    join public.invoices i on i.id = p.invoice_id
    left join public.invoice_items ii on ii.invoice_id = i.id
    where i.invoice_number <> p.invoice_number
       or i.project_id is distinct from p.project_id
       or i.phase_id is distinct from p.phase_id
       or coalesce(i.active, true) <> true
       or coalesce(i.status, 'pending') not in ('pending', 'paid')
       or ii.id is not null
  ) then
    raise exception 'Repair guard failed: invoice scope/status/project/phase/items mismatch';
  end if;

  if exists (
    select 1
    from remaining_ambiguous_invoice_items_repair_20260623 p
    join public.invoices i on i.id = p.invoice_id
    join public.agent_wallets w on w.id = p.wallet_id
    join public.batches b on b.id = p.batch_id
    join public.card_categories c on c.id = p.category_id
    where w.agent_id is distinct from i.agent_id
       or w.project_id is distinct from p.project_id
       or w.phase_id is distinct from p.phase_id
       or w.category_id is distinct from p.category_id
       or w.batch_id is distinct from p.batch_id
       or b.project_id is distinct from p.project_id
       or b.category_id is distinct from p.category_id
       or c.project_id is distinct from p.project_id
       or c.price is distinct from p.unit_price
  ) then
    raise exception 'Repair guard failed: wallet/batch/category/price mismatch';
  end if;

  if exists (
    select 1
    from (
      select invoice_id, sum(quantity * unit_price) as proposed_total
      from remaining_ambiguous_invoice_items_repair_20260623
      group by invoice_id
    ) p
    join public.invoices i on i.id = p.invoice_id
    where p.proposed_total is distinct from i.total_amount
  ) then
    raise exception 'Repair guard failed: proposed invoice item totals do not match invoice totals';
  end if;

  select b.total_cards - coalesce(sum(w.total_cards), 0)
  into unassigned_23500
  from public.batches b
  left join public.agent_wallets w
    on w.batch_id = b.id
   and w.category_id = b.category_id
  where b.id = '7160493b-feea-4cff-9d67-85adc9968d05'
    and b.category_id = '08a35df4-c662-441f-82c1-22f39dd363a7'
    and b.project_id = '00000000-0000-4000-a000-000000000001'
  group by b.id, b.total_cards;

  if coalesce(unassigned_23500, 0) < 1 then
    raise exception 'Repair guard failed: no real unassigned 23500 batch stock available';
  end if;
end $$;

create temp table wallet_allocation_update_check_20260623 (
  updated_rows integer not null
) on commit drop;

with updated as (
  update public.agent_wallets
  set total_cards = total_cards + 1
  where id = 'a65791b8-b9c9-4504-b050-e458ee583b6a'
    and batch_id = '7160493b-feea-4cff-9d67-85adc9968d05'
    and category_id = '08a35df4-c662-441f-82c1-22f39dd363a7'
    and project_id = '00000000-0000-4000-a000-000000000001'
    and phase_id = '019d5d54-cd75-4939-97af-ee8e0ec4c3a6'
  returning 1
)
insert into wallet_allocation_update_check_20260623(updated_rows)
select count(*)::integer from updated;

do $$
begin
  if (select updated_rows from wallet_allocation_update_check_20260623) <> 1 then
    raise exception 'Repair guard failed: 23500 wallet allocation update did not affect a row';
  end if;
end $$;

insert into public.invoice_items
(id, invoice_id, project_id, category_id, batch_id, wallet_id, quantity, unit_price, created_at)
select id, invoice_id, project_id, category_id, batch_id, wallet_id, quantity, unit_price, now()
from remaining_ambiguous_invoice_items_repair_20260623;

with affected_wallets as (
  select distinct wallet_id
  from remaining_ambiguous_invoice_items_repair_20260623
),
active_item_sold as (
  select ii.wallet_id, coalesce(sum(abs(ii.quantity)), 0)::integer as sold_cards
  from public.invoice_items ii
  join public.invoices i on i.id = ii.invoice_id
  where ii.wallet_id in (select wallet_id from affected_wallets)
    and coalesce(i.active, true) = true
    and coalesce(i.status, 'pending') not in ('cancelled', 'canceled', 'rejected', 'deleted')
  group by ii.wallet_id
)
update public.agent_wallets w
set sold_cards = coalesce(s.sold_cards, 0)
from affected_wallets aw
left join active_item_sold s on s.wallet_id = aw.wallet_id
where w.id = aw.wallet_id;

insert into public.operations_log
(id, operation_group_id, operation_type, table_name, entity_name, record_id,
 reference_text, message_ar, old_values, new_values, project_id, phase_id,
 source, sync_status, created_at, updated_at)
values
(
  gen_random_uuid(),
  '00000000-0000-4000-9000-202606230002',
  'REPAIR_AGENT_WALLET_ALLOCATION_AFTER_AUDIT',
  'agent_wallets',
  'agent_wallet',
  'a65791b8-b9c9-4504-b050-e458ee583b6a',
  'INV-2026-0643 allocation support',
  'Allocate one real unassigned 23500 batch card after stock audit',
  jsonb_build_object('total_cards_before_delta', -1, 'reason', 'stored old absolute value omitted in guarded repair'),
  jsonb_build_object('total_cards_delta', 1, 'batch_id', '7160493b-feea-4cff-9d67-85adc9968d05', 'category_id', '08a35df4-c662-441f-82c1-22f39dd363a7'),
  '00000000-0000-4000-a000-000000000001',
  '019d5d54-cd75-4939-97af-ee8e0ec4c3a6',
  'manual_supabase_repair',
  'synced',
  now(),
  now()
);

insert into public.operations_log
(id, operation_group_id, operation_type, table_name, entity_name, record_id,
 reference_text, message_ar, old_values, new_values, project_id, phase_id,
 source, sync_status, created_at, updated_at)
select
  gen_random_uuid(),
  '00000000-0000-4000-9000-202606230003',
  'REPAIR_AMBIGUOUS_INVOICE_ITEMS_AFTER_REVIEW',
  'invoice_items',
  'invoice',
  i.id,
  i.invoice_number,
  'Repair ambiguous missing invoice_items after review and manual approval',
  jsonb_build_object('had_invoice_items', false, 'total_amount', i.total_amount, 'status', i.status, 'active', i.active),
  jsonb_agg(to_jsonb(p) order by p.id),
  i.project_id,
  i.phase_id,
  'manual_supabase_repair',
  'synced',
  now(),
  now()
from public.invoices i
join remaining_ambiguous_invoice_items_repair_20260623 p on p.invoice_id = i.id
group by i.id, i.invoice_number, i.total_amount, i.status, i.active, i.project_id, i.phase_id;

do $$
begin
  if exists (
    select 1
    from (
      select i.id, i.invoice_number, i.total_amount, count(ii.id) as item_count, coalesce(sum(ii.quantity * ii.unit_price), 0) as item_total
      from public.invoices i
      join public.invoice_items ii on ii.invoice_id = i.id
      where i.invoice_number in ('INV-2026-0643','INV-2026-0644','INV-2026-0646')
      group by i.id, i.invoice_number, i.total_amount
    ) s
    where s.item_total is distinct from s.total_amount
       or (s.invoice_number = 'INV-2026-0643' and s.item_count <> 3)
       or (s.invoice_number = 'INV-2026-0644' and s.item_count <> 3)
       or (s.invoice_number = 'INV-2026-0646' and s.item_count <> 3)
  ) then
    raise exception 'Post-check failed: repaired invoice item totals/counts are incorrect';
  end if;

  if exists (
    select 1
    from public.agent_wallets
    where id in (select distinct wallet_id from remaining_ambiguous_invoice_items_repair_20260623)
      and remaining_cards < 0
  ) then
    raise exception 'Post-check failed: affected wallet remaining_cards is negative';
  end if;

  if exists (
    select 1
    from public.agent_wallets w
    left join (
      select ii.wallet_id, coalesce(sum(abs(ii.quantity)), 0)::integer as derived_sold_cards
      from public.invoice_items ii
      join public.invoices i on i.id = ii.invoice_id
      where ii.wallet_id in (select distinct wallet_id from remaining_ambiguous_invoice_items_repair_20260623)
        and coalesce(i.active, true) = true
        and coalesce(i.status, 'pending') not in ('cancelled', 'canceled', 'rejected', 'deleted')
      group by ii.wallet_id
    ) s on s.wallet_id = w.id
    where w.id in (select distinct wallet_id from remaining_ambiguous_invoice_items_repair_20260623)
      and coalesce(w.sold_cards, 0) <> coalesce(s.derived_sold_cards, 0)
  ) then
    raise exception 'Post-check failed: wallet sold_cards mismatch after recalculation';
  end if;

  if exists (
    select 1
    from public.invoice_items ii
    join public.invoices i on i.id = ii.invoice_id
    where ii.id in (select id from remaining_ambiguous_invoice_items_repair_20260623)
      and i.invoice_number not in ('INV-2026-0643','INV-2026-0644','INV-2026-0646')
  ) then
    raise exception 'Post-check failed: unapproved invoice was touched';
  end if;
end $$;

select i.invoice_number, i.total_amount,
       count(ii.id) as item_count,
       sum(ii.quantity * ii.unit_price) as item_total
from public.invoices i
join public.invoice_items ii on ii.invoice_id = i.id
where i.invoice_number in ('INV-2026-0643','INV-2026-0644','INV-2026-0646')
group by i.id, i.invoice_number, i.total_amount
order by i.invoice_number;

select w.id as wallet_id, w.total_cards, w.sold_cards, w.remaining_cards
from public.agent_wallets w
where w.id in (select distinct wallet_id from remaining_ambiguous_invoice_items_repair_20260623)
order by w.id;

commit;
