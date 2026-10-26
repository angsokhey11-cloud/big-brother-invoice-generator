-- BIG BROTHER: draft, additive server bank-source reservation model.
-- NOT deployed. Must be called within same transaction as invoice creation.
-- Locks existing bank transaction balance row BEFORE writing allocations.
-- Existing bb_bank_balance_snapshot may be a view: use the authoritative base table
-- after verifying actual deployed function definitions; never update the snapshot directly.
-- Stub is intentionally fail-closed, not callable.
create or replace function public.bb_sales_save_multi_source_draft(
 p_invoice jsonb,p_payment jsonb
) returns jsonb language plpgsql security invoker set search_path=''
as $$
begin
 if jsonb_typeof(p_payment->'settlement_sources') is distinct from 'array' then
  raise exception 'Missing settlement_sources array';
 end if;
 if jsonb_array_length(p_payment->'settlement_sources')=0 then
  raise exception 'No multi-source allocations';
 end if;
 -- IMPORTANT: do NOT call the legacy single-source save and then apply
 -- extra allocations. Either all source deductions and invoice save commit,
 -- or none do. Resolve customer ownership, bank balance, FX, lock order and
 -- idempotency inside the SAME server-side transaction before enabling.
 raise exception 'Multi-source invoice save not enabled: atomic payment integration required';
end $$;
revoke all on function public.bb_sales_save_multi_source_draft(jsonb,jsonb) from public,anon,authenticated;
