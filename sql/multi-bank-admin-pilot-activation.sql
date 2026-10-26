-- BIG BROTHER — CONTROLLED ADMIN-ONLY MULTI-BANK PILOT
-- NOT DEPLOYED. Apply ONLY after sql/multi-bank-atomic-invoice-save-v1.sql
-- has been reviewed and deployed and the admin browser pilot is ready.
-- Granting authenticated does NOT permit staff to save: the SQL function itself
-- enforces public.bb_is_admin() and all existing invoice/location permissions.
-- Run only with explicit approval, after scheduling an admin test invoice.
begin;
do $verify$
declare v_sql text;
begin
 if to_regprocedure('public.bb_sales_save_invoice_multi_bank_v1(jsonb,jsonb)') is null then
   raise exception 'Multi-bank save function is missing. Deploy core SQL first.';
 end if;
 v_sql:=pg_get_functiondef('public.bb_sales_save_invoice_multi_bank_v1(jsonb,jsonb)'::regprocedure);
 if position('Multi-bank invoice pilot is Admin-only' in v_sql)=0 then
   raise exception 'Admin-only server guard not present. Refusing activation.';
 end if;
 if not exists (
  select 1 from pg_trigger
  where tgrelid='public.payments'::regclass
    and tgname='bb_bank_guard_payment_insert'
    and tgenabled in ('O','A')
 ) then raise exception 'Verified bank guard trigger is not enabled'; end if;
 if not exists (
  select 1 from pg_class t join pg_namespace n on n.oid=t.relnamespace
  where n.nspname='public' and t.relname='bb_invoice_multi_bank_requests'
    and t.relrowsecurity
 ) then raise exception 'Request protection table RLS not enabled'; end if;
end $verify$;
grant execute on function public.bb_sales_save_invoice_multi_bank_v1(jsonb,jsonb)
 to authenticated;
commit;

-- IMMEDIATE ROLLBACK (execute separately if pilot is stopped):
-- revoke execute on function public.bb_sales_save_invoice_multi_bank_v1(jsonb,jsonb) from authenticated;
-- Then remove ?bbMultiBankPilot=1 from the admin's browser URL.
-- Do NOT drop the request ledger or delete invoices/payments to disable the pilot.
