ALTER TABLE public.invoice_card_returns
  DROP CONSTRAINT IF EXISTS invoice_card_returns_status_valid;

ALTER TABLE public.invoice_card_returns
  ADD CONSTRAINT invoice_card_returns_status_valid
  CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled', 'canceled')) NOT VALID;
