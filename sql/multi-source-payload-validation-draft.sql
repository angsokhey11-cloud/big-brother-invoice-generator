-- BIG BROTHER multi-source settlement validation: isolated draft, NOT DEPLOYED.
-- Validate the request before any invoice or balance is written.
-- This function only checks payload shape/precision/double-selection/amounts.
-- Authoritative ownership, FX, balance and row locks belong inside the final invoice-save transaction.
create or replace function public.bb_validate_multi_source_payload_draft(
  p_sources jsonb,
  p_invoice_currency text,
  p_invoice_total numeric
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_item jsonb;
  v_kind text;
  v_id text;
  v_currency text;
  v_source_amount numeric;
  v_invoice_amount numeric;
  v_total numeric := 0;
  v_seen text[] := array[]::text[];
  v_key text;
  v_count integer := 0;
begin
  if p_invoice_currency not in ('USD','KHR') or p_invoice_currency is null then
    raise exception 'Invalid invoice currency';
  end if;
  if p_invoice_total is null or p_invoice_total <= 0 then
    raise exception 'Invoice total must be positive';
  end if;
  if p_invoice_total <> trunc(p_invoice_total,case when p_invoice_currency='USD' then 2 else 0 end) then
    raise exception 'Invalid invoice total precision';
  end if;
  if jsonb_typeof(p_sources) is distinct from 'array' then
    raise exception 'settlement_sources must be an array';
  end if;
  if jsonb_array_length(p_sources)>50 then raise exception 'Too many payment sources';end if;
  for v_item in select value from jsonb_array_elements(p_sources)
  loop
    v_count := v_count + 1;
    if jsonb_typeof(v_item) is distinct from 'object' then
      raise exception 'Payment source must be an object';
    end if;
    v_kind:=v_item->>'kind';
    v_id:=nullif(btrim(v_item->>'source_id'),'');
    v_currency:=v_item->>'source_currency';
    if v_kind not in ('BANK_REGISTER','CUSTOMER_CREDIT') or v_id is null or v_currency not in ('USD','KHR') then
      raise exception 'Invalid source identity';
    end if;
    v_key:=v_kind||':'||v_id;
    if v_key=any(v_seen) then raise exception 'Duplicate source identity';end if;
    v_seen:=array_append(v_seen,v_key);
    if coalesce(v_item->>'source_amount','') !~ '^([0-9]+)([.][0-9]+)?$'
       or coalesce(v_item->>'invoice_amount','') !~ '^([0-9]+)([.][0-9]+)?$' then
      raise exception 'Invalid source allocation amount';
    end if;
    v_source_amount:=(v_item->>'source_amount')::numeric;
    v_invoice_amount:=(v_item->>'invoice_amount')::numeric;
    if v_source_amount<=0 or v_invoice_amount<=0 then raise exception 'Amounts must be positive';end if;
    if v_source_amount<>trunc(v_source_amount,case when v_currency='USD' then 2 else 0 end)
       or v_invoice_amount<>trunc(v_invoice_amount,case when p_invoice_currency='USD' then 2 else 0 end) then
      raise exception 'Unsupported amount precision';
    end if;
    if v_currency=p_invoice_currency and v_source_amount<>v_invoice_amount then
      raise exception 'Same currency amount mismatch';
    end if;
    if v_currency<>p_invoice_currency then
      raise exception 'FX multi-source allocation not enabled';
    end if;
    v_total:=v_total+v_invoice_amount;
    if v_total>p_invoice_total then raise exception 'Overallocated invoice';end if;
  end loop;
  return jsonb_build_object(
    'source_count',v_count,
    'applied',v_total,
    'remaining',p_invoice_total-v_total,
    'currency',p_invoice_currency
  );
end;
$$;
revoke all on function public.bb_validate_multi_source_payload_draft(jsonb,text,numeric) from public,anon,authenticated;
-- Do not expose this function as an application RPC before authenticated role checks.
