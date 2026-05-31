-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.agent_wallets (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  agent_id uuid,
  batch_id uuid,
  category_id uuid,
  from_card integer NOT NULL DEFAULT 1,
  to_card integer NOT NULL DEFAULT 1,
  sold_cards integer DEFAULT 1,
  remaining_cards integer DEFAULT (((to_card - from_card) + 1) - sold_cards),
  issued_by uuid,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  total_cards integer NOT NULL DEFAULT 0,
  CONSTRAINT agent_wallets_pkey PRIMARY KEY (id),
  CONSTRAINT agent_wallets_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.users(id),
  CONSTRAINT agent_wallets_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.batches(id),
  CONSTRAINT agent_wallets_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.card_categories(id),
  CONSTRAINT agent_wallets_issued_by_fkey FOREIGN KEY (issued_by) REFERENCES public.users(id)
);
CREATE TABLE public.app_permissions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  entity_type text NOT NULL CHECK (entity_type = ANY (ARRAY['ROLE'::text, 'USER'::text])),
  entity_id text NOT NULL,
  screen_name text NOT NULL,
  can_view boolean DEFAULT false,
  can_add boolean DEFAULT false,
  can_edit boolean DEFAULT false,
  can_delete boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  CONSTRAINT app_permissions_pkey PRIMARY KEY (id)
);
CREATE TABLE public.batches (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  batch_number text NOT NULL UNIQUE,
  category_id uuid,
  serial_number text NOT NULL,
  total_cards integer NOT NULL DEFAULT 39,
  available_cards integer NOT NULL DEFAULT 39,
  received_date date DEFAULT CURRENT_DATE,
  status text DEFAULT 'active'::text CHECK (status = ANY (ARRAY['active'::text, 'depleted'::text, 'critical'::text])),
  created_at timestamp with time zone DEFAULT now(),
  active boolean DEFAULT true,
  CONSTRAINT batches_pkey PRIMARY KEY (id),
  CONSTRAINT batches_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.card_categories(id)
);
CREATE TABLE public.card_categories (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  price numeric NOT NULL,
  is_active boolean DEFAULT true,
  active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT card_categories_pkey PRIMARY KEY (id)
);
CREATE TABLE public.cards (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  card_code text NOT NULL UNIQUE,
  batch_id uuid,
  category_id uuid,
  status text DEFAULT 'available'::text CHECK (status = ANY (ARRAY['available'::text, 'invoiced'::text, 'sold'::text, 'returned'::text])),
  invoice_id uuid,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT cards_pkey PRIMARY KEY (id),
  CONSTRAINT cards_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.batches(id),
  CONSTRAINT cards_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.card_categories(id),
  CONSTRAINT fk_cards_invoice FOREIGN KEY (invoice_id) REFERENCES public.invoices(id)
);
CREATE TABLE public.collection_invoices (
  collection_id uuid NOT NULL,
  invoice_id uuid NOT NULL,
  amount numeric,
  CONSTRAINT collection_invoices_pkey PRIMARY KEY (collection_id, invoice_id),
  CONSTRAINT collection_invoices_collection_id_fkey FOREIGN KEY (collection_id) REFERENCES public.collections(id),
  CONSTRAINT collection_invoices_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id)
);
CREATE TABLE public.collections (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  collection_number text NOT NULL UNIQUE,
  agent_id uuid,
  pos_id uuid,
  amount numeric NOT NULL,
  method text DEFAULT 'cash'::text CHECK (method = ANY (ARRAY['cash'::text, 'transfer'::text, 'check'::text])),
  reference_number text,
  status text DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])),
  approved_by uuid,
  approved_at timestamp with time zone,
  rejection_reason text,
  notes text,
  collection_date date DEFAULT CURRENT_DATE,
  created_at timestamp with time zone DEFAULT now(),
  invoice_id uuid,
  active boolean DEFAULT true,
  approval_notes text,
  supply_id uuid,
  CONSTRAINT collections_pkey PRIMARY KEY (id),
  CONSTRAINT collections_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.users(id),
  CONSTRAINT collections_pos_id_fkey FOREIGN KEY (pos_id) REFERENCES public.pos_customers(id),
  CONSTRAINT collections_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.users(id),
  CONSTRAINT collections_supply_id_fkey FOREIGN KEY (supply_id) REFERENCES public.supplies(id)
);
CREATE TABLE public.invoice_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  invoice_id uuid,
  category_id uuid,
  batch_id uuid,
  quantity integer NOT NULL,
  unit_price numeric NOT NULL,
  total_price numeric DEFAULT ((quantity)::numeric * unit_price),
  created_at timestamp with time zone DEFAULT now(),
  wallet_id uuid,
  from_card text,
  to_card text,
  CONSTRAINT invoice_items_pkey PRIMARY KEY (id),
  CONSTRAINT invoice_items_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id),
  CONSTRAINT invoice_items_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.card_categories(id),
  CONSTRAINT invoice_items_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.batches(id)
);
CREATE TABLE public.invoices (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  invoice_number text NOT NULL UNIQUE,
  pos_id uuid,
  agent_id uuid,
  type text DEFAULT 'credit'::text CHECK (type = ANY (ARRAY['cash'::text, 'credit'::text])),
  total_amount numeric DEFAULT 0,
  paid_amount numeric DEFAULT 0,
  status text DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'paid'::text, 'partial'::text, 'overdue'::text, 'cancelled'::text])),
  notes text,
  invoice_date date DEFAULT CURRENT_DATE,
  due_date date,
  created_at timestamp with time zone DEFAULT now(),
  net_amount numeric DEFAULT 0,
  active boolean DEFAULT true,
  approved_amount real DEFAULT 0,
  approval_notes text,
  CONSTRAINT invoices_pkey PRIMARY KEY (id),
  CONSTRAINT invoices_pos_id_fkey FOREIGN KEY (pos_id) REFERENCES public.pos_customers(id),
  CONSTRAINT invoices_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.users(id)
);
CREATE TABLE public.journal_entries (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  entry_type text NOT NULL,
  reference_id uuid,
  reference_type text,
  amount numeric NOT NULL,
  description text,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT journal_entries_pkey PRIMARY KEY (id),
  CONSTRAINT journal_entries_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id)
);
CREATE TABLE public.pos_customers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  owner_name text,
  phone text,
  city text,
  credit_limit numeric DEFAULT 10000,
  credit_used numeric DEFAULT 0,
  is_blocked boolean DEFAULT false,
  assigned_agent_id uuid,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  active boolean DEFAULT true,
  CONSTRAINT pos_customers_pkey PRIMARY KEY (id),
  CONSTRAINT pos_customers_assigned_agent_id_fkey FOREIGN KEY (assigned_agent_id) REFERENCES public.users(id)
);
CREATE TABLE public.supplies (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  supply_number text,
  user_id uuid,
  amount numeric DEFAULT 0,
  notes text,
  type text DEFAULT 'deposit'::text,
  created_at timestamp with time zone DEFAULT now(),
  status text DEFAULT 'pending'::text,
  approved_at timestamp with time zone,
  approval_notes text,
  agent_id uuid,
  CONSTRAINT supplies_pkey PRIMARY KEY (id),
  CONSTRAINT supplies_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.users(id)
);
CREATE TABLE public.user_permissions (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  screen_name text NOT NULL,
  can_view boolean DEFAULT true,
  can_add boolean DEFAULT false,
  can_edit boolean DEFAULT false,
  can_delete boolean DEFAULT false,
  synced integer DEFAULT 1,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT user_permissions_pkey PRIMARY KEY (id),
  CONSTRAINT user_permissions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.users (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  username text NOT NULL UNIQUE,
  role text NOT NULL CHECK (role = ANY (ARRAY['admin'::text, 'agent'::text, 'cashier'::text, 'viewer'::text])),
  phone text,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  password_hash text DEFAULT '1234'::text,
  push_token text,
  CONSTRAINT users_pkey PRIMARY KEY (id)
);