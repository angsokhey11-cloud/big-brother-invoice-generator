-- BIG BROTHER multi-registered-bank invoice save V1
-- Feature-branch implementation, NOT DEPLOYED.
-- REQUIRES integration test with actual Invoice Generator and database.
-- This V1 intentionally permits ONLY same-currency registered bank balances:
-- Bank (fully paid) or Partially Paid in Bank. Cash + Bank and customer credits
-- must use a later integration that settles every component together.
-- Existing private.bb_bank_guard_payment trigger is the balance authority.

begin;

create table if not exists public.bb_invoice_multi_bank_requests (
 request_id uuid primary key,
 actor_user_id uuid not null,
 payload_fingerprint text not null,
 invoice_id text not null unique references public.invoices(invoice_id),
 response jsonb not null,
 created_at timestamptz not null default now()
);
alter table public.bb_invoice_multi_bank_requests enable row level security;
revoke all on public.bb_invoice_multi_bank_requests from public,anon,authenticated;

create or replace function public.bb_sales_save_invoice_multi_bank_v1(
 p_invoice jsonb,
 p_payment jsonb
) returns jsonb
language plpgsql
security definer
set search_path=''
as $fn$
declare
  v_actor uuid := auth.uid();
  v_req uuid;
  v_existing public.bb_invoice_multi_bank_requests%rowtype;
  v_fingerprint text;
  v_location text := btrim(coalesce(p_invoice->>'locationCode',''));
  v_customer text := nullif(btrim(coalesce(p_invoice->>'customerId','')),'');
  v_currency text := upper(btrim(coalesce(p_invoice->>'currency','')));
  v_method text := btrim(coalesce(p_invoice->>'paymentMethod',''));
  v_sources jsonb := p_payment->'settlement_sources';
  v_item jsonb;
  v_source_id text;
  v_source public.bb_verified_bank_transactions%rowtype;
  v_amount numeric;
  v_total numeric := 0;
  v_count int;
  v_precision int;
  v_details jsonb := '[]'::jsonb;
  v_ids text[];
  v_key text;
  v_invoice_result jsonb;
  v_invoice public.invoices%rowtype;
  v_payment_id text;
  v_result jsonb;
begin
  if v_actor is null then raise exception 'Sign-in required'; end if;
  if not public.bb_has_module_access('invoice_generator','create')
     or not public.bb_has_sales_write() then
    raise exception 'Invoice Generator create permission denied';
  end if;
  if not public.bb_has_location_access(v_location) then
    raise exception 'Invoice location access denied';
  end if;
  if v_customer is null or not exists(
    select 1 from public.customers c where c.customer_id=v_customer
      and coalesce(c.active,true)=true
  ) then raise exception 'A valid customer ID is required'; end if;
  if v_currency not in ('USD','KHR') then raise exception 'Unsupported currency'; end if;
  if v_method not in ('Bank','Partially Paid in Bank') then
    raise exception 'This endpoint only supports Bank or Partially Paid in Bank';
  end if;
  if jsonb_typeof(v_sources) is distinct from 'array'
    or jsonb_array_length(v_sources) not between 2 and 30 then
    raise exception 'Select between 2 and 30 registered bank transactions';
  end if;
  v_precision := case when v_currency='USD' then 2 else 0 end;
  v_req := nullif(p_payment->>'settlement_request_id','')::uuid;
  if v_req is null then raise exception 'A settlement_request_id UUID is required'; end if;

  v_fingerprint:=md5(p_invoice::text||'|'||p_payment::text);
  -- Serializes retries for the same request, and prevents two simultaneous
  -- identical invoice submissions creating separate payment sets.
  perform pg_advisory_xact_lock(hashtext('BB_MULTI_BANK_REQ_'||v_req::text));
  select * into v_existing
    from public.bb_invoice_multi_bank_requests r where r.request_id=v_req;
  if found then
    if v_existing.actor_user_id<>v_actor
       or v_existing.payload_fingerprint<>v_fingerprint then
      raise exception 'Settlement request ID already belongs to another payload';
    end if;
    return v_existing.response;
  end if;

  -- Normalize, deduplicate and lock every source in deterministic order.
  select array_agg(distinct upper(btrim(x->>'source_id')) order by upper(btrim(x->>'source_id')))
    into v_ids
    from jsonb_array_elements(v_sources) x;
  if coalesce(array_length(v_ids,1),0)<>jsonb_array_length(v_sources)
    or exists(select 1 from jsonb_array_elements(v_sources) x
       where x->>'kind'<>'BANK_REGISTER'
          or nullif(btrim(x->>'source_id'),'') is null) then
    raise exception 'Duplicate or invalid registered bank source';
  end if;

  foreach v_key in array v_ids loop
    perform pg_advisory_xact_lock(hashtext('BB_BANK_TX_'||v_key));
    select * into v_source from public.bb_verified_bank_transactions b
     where upper(btrim(b.transaction_id))=v_key for update;
    if not found or v_source.status<>'AVAILABLE'
      or v_source.customer_id<>v_customer or v_source.currency<>v_currency then
      raise exception 'Source % unavailable, wrong customer or currency',v_key;
    end if;
  end loop;

  -- Validate each source amount against the server-side wallet view.
  for v_item in select value from jsonb_array_elements(v_sources)
  loop
    v_source_id:=upper(btrim(v_item->>'source_id'));
    if coalesce(v_item->>'source_amount','') !~ '^[0-9]+([.][0-9]+)?$'
      then raise exception 'Invalid amount for %',v_source_id; end if;
    v_amount:=(v_item->>'source_amount')::numeric;
    if v_amount<=0 or v_amount<>trunc(v_amount,v_precision)
       then raise exception 'Unsupported amount or precision for %',v_source_id; end if;
    if (v_item->>'source_currency') is distinct from v_currency then
       raise exception 'Source currency differs from invoice currency'; end if;
    select * into v_source from public.bb_verified_bank_transactions b
      where upper(btrim(b.transaction_id))=v_source_id;
    if v_amount>coalesce((select s.remaining_amount
                       from public.bb_bank_balance_snapshot s
                       where s.transaction_id=v_source.transaction_id),0) then
       raise exception 'Insufficient registered bank balance for %',v_source_id; end if;
    v_total:=v_total+v_amount;
    v_details:=v_details||jsonb_build_array(
      jsonb_build_object('source_id',v_source.transaction_id,
                         'bank_name',v_source.bank_name,'amount',v_amount)
    );
  end loop;

  -- p_payment NULL prevents the legacy save from inserting an accidental
  -- single bank payment; we insert one payment per bank source below.
  -- The original function still creates stock lines and the invoice record.
  v_invoice_result:=public.bb_sales_save_invoice_bundle_core_access_v1(
     p_invoice||jsonb_build_object(
        'transactionId',v_ids[1],
        'paymentBank',(select b.bank_name from public.bb_verified_bank_transactions b where upper(btrim(b.transaction_id))=v_ids[1]),
        'amountPaid',v_total
     ),
     null
  );
  select * into v_invoice from public.invoices i
    where i.invoice_id=v_invoice_result->>'invoiceId' for update;
  if not found then raise exception 'Invoice save returned missing invoice'; end if;
  if v_total<>v_invoice.amount_paid then
    raise exception 'Payment allocations do not equal the saved invoice amount';
  end if;

  -- Each inserted payment automatically calls the bank guard trigger, which
  -- locks the source and inserts bb_bank_balance_allocations.
  for v_item in select value from jsonb_array_elements(v_details)
  loop
    v_payment_id:=public.bb_next_prefixed_id('public.payments'::regclass,'payment_id','PAY',4);
    insert into public.payments (
      payment_id,invoice_id,invoice_no_snapshot,payment_date,
      customer_id,customer_name_snapshot,location_code,
      salesperson_staff_id,salesperson_name_snapshot,
      payment_method,bank_payment,bank_reference,currency,exchange_rate,
      amount,note,transaction_id,payment_source
    ) values (
      v_payment_id,v_invoice.invoice_id,v_invoice.invoice_no,v_invoice.invoice_date,
      v_invoice.customer_id,v_invoice.customer_name_snapshot,v_invoice.location_code,
      v_invoice.salesperson_staff_id,v_invoice.salesperson_name_snapshot,
      'Bank',nullif(v_item->>'bank_name',''),v_item->>'source_id',
      v_currency,v_invoice.exchange_rate,(v_item->>'amount')::numeric,
      'Initial invoice multi-source bank allocation',
      v_item->>'source_id','Invoice'
    );
  end loop;

  -- Fail closed unless every successful payment created its bank allocation.
  select count(*) into v_count
    from public.bb_bank_balance_allocations a
    join public.payments p on p.payment_id=a.payment_id
   where p.invoice_id=v_invoice.invoice_id
     and p.payment_source='Invoice'
     and a.reversed_at is null;
  if v_count<>jsonb_array_length(v_sources) then
    raise exception 'Missing bank allocation after invoice save';
  end if;

  v_result:=v_invoice_result||jsonb_build_object(
     'multiSource',true,'sourceCount',v_count,
     'allocatedBank',v_total,'settlementRequestId',v_req
  );
  insert into public.bb_invoice_multi_bank_requests
   (request_id,actor_user_id,payload_fingerprint,invoice_id,response)
  values(v_req,v_actor,v_fingerprint,v_invoice.invoice_id,v_result);
  return v_result;
end $fn$;

-- Keep unavailable to clients until end-to-end and concurrency tests pass.
revoke all on function public.bb_sales_save_invoice_multi_bank_v1(jsonb,jsonb)
 from public,anon,authenticated;
commit;
