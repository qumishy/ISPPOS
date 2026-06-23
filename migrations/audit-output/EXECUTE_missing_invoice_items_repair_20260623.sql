begin;

create temp table invoice_items_repair_20260623 (
  id uuid primary key,
  invoice_id uuid not null,
  project_id uuid not null,
  category_id uuid not null,
  batch_id uuid not null,
  wallet_id uuid not null,
  quantity integer not null check (quantity > 0),
  unit_price numeric not null check (unit_price > 0)
) on commit drop;

insert into invoice_items_repair_20260623
(id, invoice_id, project_id, category_id, batch_id, wallet_id, quantity, unit_price)
values
('00000000-0000-4000-9000-000000006401','2bd6fe18-41ef-472d-b3b1-773ea662d7e9','00000000-0000-4000-a000-000000000001','08a35df4-c662-441f-82c1-22f39dd363a7','7160493b-feea-4cff-9d67-85adc9968d05','a65791b8-b9c9-4504-b050-e458ee583b6a',1,23500),
('00000000-0000-4000-9000-000000006402','2bd6fe18-41ef-472d-b3b1-773ea662d7e9','00000000-0000-4000-a000-000000000001','bd33569a-2518-430e-8eed-8e727eeca27e','667385fb-a85e-4d8e-a25c-a84a0292bc58','48b3af9a-96da-4b11-a188-57d247f585ed',1,14000),
('00000000-0000-4000-9000-000000006403','2bd6fe18-41ef-472d-b3b1-773ea662d7e9','00000000-0000-4000-a000-000000000001','89291698-6aea-47c9-9c04-2d197e5f7abc','c2dc3af7-bdcc-42b7-95d2-0279b1bcd1f1','ddcd754b-022c-4731-b383-9fe5ef3dd25b',1,9000),
('00000000-0000-4000-9000-000000006451','0b73fced-c1e1-4314-afde-6b2a54767cb2','00000000-0000-4000-a000-000000000001','08a35df4-c662-441f-82c1-22f39dd363a7','7160493b-feea-4cff-9d67-85adc9968d05','a65791b8-b9c9-4504-b050-e458ee583b6a',1,23500),
('00000000-0000-4000-9000-000000006452','0b73fced-c1e1-4314-afde-6b2a54767cb2','00000000-0000-4000-a000-000000000001','bd33569a-2518-430e-8eed-8e727eeca27e','667385fb-a85e-4d8e-a25c-a84a0292bc58','48b3af9a-96da-4b11-a188-57d247f585ed',1,14000),
('00000000-0000-4000-9000-000000006453','0b73fced-c1e1-4314-afde-6b2a54767cb2','00000000-0000-4000-a000-000000000001','89291698-6aea-47c9-9c04-2d197e5f7abc','c2dc3af7-bdcc-42b7-95d2-0279b1bcd1f1','ddcd754b-022c-4731-b383-9fe5ef3dd25b',1,9000),
('00000000-0000-4000-9000-000000006471','e8558171-fdb3-43ab-9e82-485b19775a58','00000000-0000-4000-a000-000000000001','08a35df4-c662-441f-82c1-22f39dd363a7','7160493b-feea-4cff-9d67-85adc9968d05','a65791b8-b9c9-4504-b050-e458ee583b6a',1,23500),
('00000000-0000-4000-9000-000000006472','e8558171-fdb3-43ab-9e82-485b19775a58','00000000-0000-4000-a000-000000000001','bd33569a-2518-430e-8eed-8e727eeca27e','667385fb-a85e-4d8e-a25c-a84a0292bc58','48b3af9a-96da-4b11-a188-57d247f585ed',1,14000),
('00000000-0000-4000-9000-000000006473','e8558171-fdb3-43ab-9e82-485b19775a58','00000000-0000-4000-a000-000000000001','89291698-6aea-47c9-9c04-2d197e5f7abc','c2dc3af7-bdcc-42b7-95d2-0279b1bcd1f1','ddcd754b-022c-4731-b383-9fe5ef3dd25b',1,9000),
('00000000-0000-4000-9000-000000006481','2fa82dd2-b089-4e73-9a23-13567acf1bd3','00000000-0000-4000-a000-000000000001','08a35df4-c662-441f-82c1-22f39dd363a7','7160493b-feea-4cff-9d67-85adc9968d05','a65791b8-b9c9-4504-b050-e458ee583b6a',1,23500),
('00000000-0000-4000-9000-000000006482','2fa82dd2-b089-4e73-9a23-13567acf1bd3','00000000-0000-4000-a000-000000000001','bd33569a-2518-430e-8eed-8e727eeca27e','667385fb-a85e-4d8e-a25c-a84a0292bc58','48b3af9a-96da-4b11-a188-57d247f585ed',1,14000),
('00000000-0000-4000-9000-000000006483','2fa82dd2-b089-4e73-9a23-13567acf1bd3','00000000-0000-4000-a000-000000000001','89291698-6aea-47c9-9c04-2d197e5f7abc','c2dc3af7-bdcc-42b7-95d2-0279b1bcd1f1','ddcd754b-022c-4731-b383-9fe5ef3dd25b',1,9000),
('00000000-0000-4000-9000-000000006491','0c914abe-06bf-4fc3-bf16-d1177bfd9641','00000000-0000-4000-a000-000000000001','89291698-6aea-47c9-9c04-2d197e5f7abc','c9d26c14-d6a0-406c-9fc3-612601365918','d924e8f8-1aac-4eda-82b3-d2273e872762',2,9000);

select w.id as locked_wallet_id
from public.agent_wallets w
where exists (
  select 1
  from invoice_items_repair_20260623 p
  where p.wallet_id = w.id
)
for update;

select i.invoice_number, i.status, i.active, i.total_amount,
       count(ii.id) as existing_items,
       coalesce(sum(ii.quantity * ii.unit_price), 0) as existing_item_total
from public.invoices i
left join public.invoice_items ii on ii.invoice_id = i.id
where i.id in (select distinct invoice_id from invoice_items_repair_20260623)
group by i.id, i.invoice_number, i.status, i.active, i.total_amount
order by i.invoice_number;

do $$
begin
  if (select count(*) from invoice_items_repair_20260623) <> 13 then
    raise exception 'Repair guard failed: expected 13 proposed rows';
  end if;

  if (select count(distinct invoice_id) from invoice_items_repair_20260623) <> 5 then
    raise exception 'Repair guard failed: expected exactly 5 invoices';
  end if;

  if exists (
    select 1
    from invoice_items_repair_20260623 p
    join public.invoices i on i.id = p.invoice_id
    where i.invoice_number not in (
      'INV-2026-0640',
      'INV-2026-0645',
      'INV-2026-0647',
      'INV-2026-0648',
      'INV-2026-0649'
    )
  ) then
    raise exception 'Repair guard failed: unapproved invoice included';
  end if;

  if exists (
    select 1
    from invoice_items_repair_20260623 p
    join public.invoices i on i.id = p.invoice_id
    left join public.invoice_items ii on ii.invoice_id = i.id
    left join public.collections c on c.invoice_id = i.id and coalesce(c.active, true) = true
    left join public.collection_invoices ci on ci.invoice_id = i.id
    where coalesce(i.active, true) <> true
       or coalesce(i.status, 'pending') <> 'pending'
       or ii.id is not null
       or c.id is not null
       or ci.invoice_id is not null
  ) then
    raise exception 'Repair guard failed: invoice is not active pending, already has items, or has collections';
  end if;

  if exists (
    select 1
    from invoice_items_repair_20260623 p
    join public.invoices i on i.id = p.invoice_id
    join public.agent_wallets w on w.id = p.wallet_id
    join public.batches b on b.id = p.batch_id
    join public.card_categories c on c.id = p.category_id
    where w.project_id is distinct from p.project_id
       or w.category_id is distinct from p.category_id
       or w.batch_id is distinct from p.batch_id
       or w.agent_id is distinct from i.agent_id
       or w.phase_id is distinct from i.phase_id
       or b.category_id is distinct from p.category_id
       or b.project_id is distinct from p.project_id
       or c.project_id is distinct from p.project_id
       or c.price is distinct from p.unit_price
  ) then
    raise exception 'Repair guard failed: wallet/category/batch/price/phase mismatch';
  end if;

  if exists (
    select 1
    from (
      select invoice_id, sum(quantity * unit_price) as proposed_total
      from invoice_items_repair_20260623
      group by invoice_id
    ) s
    join public.invoices i on i.id = s.invoice_id
    where s.proposed_total is distinct from i.total_amount
  ) then
    raise exception 'Repair guard failed: proposed item totals do not match invoice totals';
  end if;

  if exists (
    select 1
    from (
      select wallet_id, sum(quantity) as proposed_qty
      from invoice_items_repair_20260623
      group by wallet_id
    ) p
    join public.agent_wallets w on w.id = p.wallet_id
    where p.proposed_qty > w.remaining_cards
  ) then
    raise exception 'Repair guard failed: insufficient wallet stock';
  end if;
end $$;

insert into public.invoice_items
(id, invoice_id, project_id, category_id, batch_id, wallet_id, quantity, unit_price, created_at)
select id, invoice_id, project_id, category_id, batch_id, wallet_id, quantity, unit_price, now()
from invoice_items_repair_20260623;

with affected_wallets as (
  select distinct wallet_id
  from invoice_items_repair_20260623
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

do $$
begin
  if exists (
    select 1
    from public.agent_wallets
    where id in (select distinct wallet_id from invoice_items_repair_20260623)
      and remaining_cards < 0
  ) then
    raise exception 'Repair guard failed: wallet remaining_cards became negative';
  end if;
end $$;

insert into public.operations_log
(id, operation_group_id, operation_type, table_name, entity_name, record_id,
 reference_text, message_ar, old_values, new_values, project_id, phase_id,
 source, sync_status, created_at, updated_at)
select
  gen_random_uuid(),
  '00000000-0000-4000-9000-202606230001',
  'REPAIR_MISSING_INVOICE_ITEMS',
  'invoice_items',
  'invoice',
  i.id,
  i.invoice_number,
  'Repair missing invoice_items from wallet/category price audit',
  jsonb_build_object(
    'had_invoice_items', false,
    'total_amount', i.total_amount,
    'status', i.status,
    'active', i.active
  ),
  jsonb_agg(to_jsonb(p) order by p.id),
  i.project_id,
  i.phase_id,
  'manual_supabase_repair',
  'synced',
  now(),
  now()
from public.invoices i
join invoice_items_repair_20260623 p on p.invoice_id = i.id
group by i.id, i.invoice_number, i.total_amount, i.status, i.active, i.project_id, i.phase_id;

select i.invoice_number, i.total_amount,
       count(ii.id) as item_count,
       sum(ii.quantity * ii.unit_price) as item_total
from public.invoices i
join public.invoice_items ii on ii.invoice_id = i.id
where i.id in (select distinct invoice_id from invoice_items_repair_20260623)
group by i.id, i.invoice_number, i.total_amount
order by i.invoice_number;

select w.id as wallet_id, w.total_cards, w.sold_cards, w.remaining_cards
from public.agent_wallets w
where w.id in (select distinct wallet_id from invoice_items_repair_20260623)
order by w.id;

commit;
