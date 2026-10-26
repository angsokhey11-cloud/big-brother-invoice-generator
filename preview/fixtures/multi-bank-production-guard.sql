-- PostgreSQL 17 test only: production bank guard, obtained by read-only
-- introspection from BIG BROTHER. No customer/payment rows were copied.
-- Apply AFTER the disposable test fixture; NEVER apply to real accounting DB.
drop trigger test_guard on public.payments;
create schema if not exists private;
create table public.company_deposits(collection_transaction_id text);
alter table public.bb_verified_bank_transactions add column approved_exchange_rate numeric;
alter table public.payments add column actual_bank_amount numeric;
alter table public.payments add column actual_bank_currency text;
alter table public.payments add column approved_bank_rate numeric;
create or replace function public.bb_is_admin() returns boolean
language sql stable as $$select coalesce(current_setting('bb_test.is_admin',true),'on')<>'off'$$;

CREATE OR REPLACE FUNCTION private.bb_bank_guard_payment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 tid text:=upper(trim(coalesce(new.transaction_id,'')));
 reg public.bb_verified_bank_transactions%rowtype;
 inv text;
 rate numeric;
 debit numeric;
 spent numeric;
 remains numeric;
 tolerance numeric;
 source text:=upper(trim(coalesce(new.payment_source,'')));
begin
 if tid='' then
   if lower(trim(coalesce(new.payment_method,'')))='bank' then raise exception 'Bank Transaction ID required'; end if;
   return new;
 end if;
 perform pg_advisory_xact_lock(hashtext('BB_BANK_TX_'||tid));
 -- Nonbank references must stay unique too, even without the old index.
 if lower(trim(coalesce(new.payment_method,'')))<>'bank' then
   if exists(select 1 from public.payments p where upper(trim(coalesce(p.transaction_id,'')))=tid)
   then raise exception 'Transaction ID already exists'; end if;
   return new;
 end if;
 if exists(select 1 from public.company_deposits where upper(trim(coalesce(collection_transaction_id,'')))=tid)
 then raise exception 'Bank Transaction ID already used by company deposit'; end if;
 select * into reg from public.bb_verified_bank_transactions where upper(trim(transaction_id))=tid for update;
 if not found then
  -- Only a registered, AVAILABLE wallet may reuse its real transfer ID.
  -- For unregistered/manual IDs keep the original strict uniqueness rule.
  if exists(select 1 from public.payments p where upper(trim(coalesce(p.transaction_id,'')))=tid)
  then raise exception 'Transaction ID already exists'; end if;
  if not public.bb_is_admin() then
   raise exception 'Manual Bank Transaction ID is Admin-only. Staff must choose an Admin-registered bank payment.';
  end if;
  return new;
 end if;
 if source not in ('INVOICE','RECEIVABLE') then
  raise exception 'Verified customer bank balance must be used from Invoice or A/R collection';
 end if;
 if reg.status<>'AVAILABLE' then raise exception 'Verified bank balance already fully used or cancelled'; end if;
 if nullif(new.customer_id,'') is null or new.customer_id<>reg.customer_id then
  raise exception 'Verified bank balance belongs to another customer';
 end if;
 inv:=upper(trim(coalesce(new.currency,'')));
 if inv not in ('USD','KHR') then raise exception 'Unsupported invoice currency'; end if;
 rate:=case when reg.currency=inv then 1
   when coalesce(reg.approved_exchange_rate,0)>1 then reg.approved_exchange_rate
   else new.exchange_rate end;
 if reg.currency<>inv then
  if rate is null or rate<=1 or abs(coalesce(new.exchange_rate,0)-rate)>0.000001 then
   raise exception 'Payment exchange rate must match the approved or invoice exchange rate';
  end if;
 end if;
 if reg.bank_name is not null and lower(trim(coalesce(new.bank_payment,'')))<>lower(trim(reg.bank_name)) then
  raise exception 'Verified bank receiving bank does not match';
 end if;
 if coalesce(new.amount,0)<=0 then raise exception 'Bank balance usage amount must be positive'; end if;
 debit:=case when reg.currency=inv then new.amount
   when reg.currency='KHR' then new.amount*rate
   else new.amount/rate end;
 select coalesce(sum(a.applied_bank_amount),0) into spent
 from public.bb_bank_balance_allocations a where a.transaction_id=reg.transaction_id and a.reversed_at is null;
 remains:=reg.amount-spent;
 tolerance:=case when reg.currency='KHR' then 0.5 else 0.005 end;
 if remains<=0 or debit>remains+tolerance then
   raise exception 'Bank balance insufficient: remaining % %',greatest(remains,0),reg.currency;
 end if;
 debit:=least(debit,remains);
 insert into public.bb_bank_balance_allocations(transaction_id,payment_id,payment_source,
   applied_bank_amount,applied_invoice_amount,invoice_currency)
 values(reg.transaction_id,new.payment_id,case when source='INVOICE' then 'INVOICE' else 'AR' end,
   debit,new.amount,inv);
 new.actual_bank_amount:=debit;
 new.actual_bank_currency:=reg.currency;
 new.approved_bank_rate:=rate;
 if remains-debit<=tolerance then
  update public.bb_verified_bank_transactions set status='USED',
   used_payment_id=new.payment_id,used_at=now() where transaction_id=reg.transaction_id;
 end if;
 return new;
end $function$
;

create trigger bb_bank_guard_payment_insert before insert on public.payments
for each row execute function private.bb_bank_guard_payment();

-- Inject a downstream failure to prove full rollback after the actual guard
-- has inserted its allocation row. Triggers execute in name order.
create function public.test_reject_second_bank() returns trigger language plpgsql as $$
begin
 if new.transaction_id='TX-B' and new.amount=55 then
  raise exception 'Injected second-bank failure';
 end if;
 return new;
end $$;
create trigger zz_multi_bank_test_reject before insert on public.payments
for each row execute function public.test_reject_second_bank();
