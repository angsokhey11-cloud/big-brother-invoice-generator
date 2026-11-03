-- BIG BROTHER | LOCAL V5/V6 | 03-Nov-2026
-- STAGED FOR V3.4 APPROVED SQL CODE-SYNC GATE (NOT AUTO-EXECUTING).
-- Must be hash-approved by current controller; NEVER run via Cloud->Local business-data sync.
-- Direct Sale / No Batch: ONLY physical default warehouse (Purchased or Zero Cost).
-- Batch Sale: existing BATCH_PENDING/BATCH_ZERO_COST path unchanged.
-- Historical warehouse-only location corrections are fully audited and atomic.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='180s';

DO $bb_source_fix$
DECLARE
 f text; def text; tail text; patched text;
 pos int; refs int; expected int;
 v_wh text:=public.bb_stock_default_warehouse_internal();
 n int;
 lookup text:=$location_lookup$
    select coalesce(a.from_location_code,a.location_code)
    into v_warehouse_location_code
    from public.stock_activity a
    where a.product_code=v_line.product_code
      and upper(coalesce(a.movement_type,''))='DIRECT_SALE'
      and upper(coalesce(a.from_bucket,'')) in ('WAREHOUSE_GOOD','WAREHOUSE_ZERO_COST')
      and (a.client_request_id='INVOICE:'||v_line.line_id
        or a.client_request_id like 'INVOICE:'||v_line.line_id||':%')
    order by a.created_at desc,a.transaction_id desc
    limit 1;
    v_warehouse_location_code:=coalesce(nullif(v_warehouse_location_code,''),
      public.bb_stock_default_warehouse_internal());
    select location_name into v_location_name
$location_lookup$;
BEGIN
 IF v_wh IS NULL OR NOT EXISTS(
    SELECT 1 FROM public.locations l
    WHERE l.location_code=v_wh AND coalesce(l.active,true)
 ) THEN RAISE EXCEPTION 'Local gate: default warehouse missing/inactive'; END IF;
 IF to_regclass('public.stock_activity') IS NULL
  OR to_regclass('public.invoice_lines') IS NULL
  OR to_regclass('public.system_activity_log') IS NULL
 THEN RAISE EXCEPTION 'Local gate: required stock/invoice/audit tables missing'; END IF;
 SELECT count(*) INTO n
 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
 JOIN pg_namespace ns ON ns.oid=c.relnamespace
 WHERE ns.nspname='public' AND c.relname='invoice_lines'
   AND t.tgname IN ('trg_invoice_lines_stock_direct_sale',
      'trg_invoice_lines_stock_direct_sale_source_v1')
   AND t.tgenabled IN ('O','A') AND NOT t.tgisinternal;
 IF n<>2 THEN RAISE EXCEPTION 'Local gate: expected two active invoice stock triggers, found %',n; END IF;

 FOR f IN SELECT unnest(ARRAY[
    'bb_stock_invoice_line_after_insert',
    'bb_stock_invoice_line_source_aware_after_insert',
    'bb_invoice_reversal_direct_stock_v2_internal'
 ]) LOOP
   SELECT pg_get_functiondef(p.oid) INTO STRICT def
   FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
   WHERE ns.nspname='public' AND p.proname=f;
   IF position('  v_location_name text;' IN def)=0 THEN
     RAISE EXCEPTION 'Local gate: % declaration changed',f; END IF;
   IF f='bb_stock_invoice_line_after_insert' THEN
     IF def !~* 'v_invoice[.]batch_id[[:space:]]+is[[:space:]]+null[[:space:]]+and[[:space:]]+coalesce' THEN
       RAISE EXCEPTION 'Local gate: missing double-stock-deduction skip'; END IF;
     pos:=position('  -- DIRECT SALE' IN def);
     IF pos=0 THEN RAISE EXCEPTION 'Local gate: legacy Direct Sale boundary changed'; END IF;
     tail:=substr(def,pos); expected:=4;
   ELSE
     tail:=def; expected:=7;
     IF def !~* 'v_invoice[.]batch_id[[:space:]]+is[[:space:]]+not[[:space:]]+null[[:space:]]+then[[:space:]]+return[[:space:]]+new' THEN
       RAISE EXCEPTION 'Local gate: % does not skip batch invoices',f; END IF;
   END IF;
   refs:=(length(tail)-length(replace(tail,'v_invoice.location_code','')))/
         length('v_invoice.location_code');

   IF refs=0 THEN
     IF position('v_warehouse_location_code' IN tail)=0 THEN
       RAISE EXCEPTION 'Local gate: % source definition unrecognized',f; END IF;
     IF f='bb_invoice_reversal_direct_stock_v2_internal'
       AND position('a.client_request_id like' IN def)=0 THEN
       RAISE EXCEPTION 'Local gate: corrected reversal lacks original-source lookup'; END IF;
     RAISE NOTICE 'Already fixed: %',f;
     CONTINUE;
   END IF;
   IF refs<>expected OR position('v_warehouse_location_code' IN def)>0 THEN
     RAISE EXCEPTION 'Local gate: unexpected % definition (% sales-region references)',f,refs; END IF;
   IF f='bb_stock_invoice_line_after_insert' THEN
     patched:=left(def,pos-1)||
        replace(substr(def,pos),'v_invoice.location_code','v_warehouse_location_code');
   ELSE
     patched:=replace(def,'v_invoice.location_code','v_warehouse_location_code');
   END IF;
   patched:=replace(patched,'  v_location_name text;',
     E'  v_location_name text;\n  v_warehouse_location_code text := public.bb_stock_default_warehouse_internal();');
   IF f='bb_invoice_reversal_direct_stock_v2_internal' THEN
     IF patched !~* 'select[[:space:]]+location_name[[:space:]]+into[[:space:]]+v_location_name' THEN
       RAISE EXCEPTION 'Local gate: reversal source lookup boundary missing'; END IF;
     patched:=regexp_replace(patched,
       'select[[:space:]]+location_name[[:space:]]+into[[:space:]]+v_location_name',
       lookup,'i');
     IF position('a.client_request_id like' IN patched)=0 THEN
       RAISE EXCEPTION 'Local gate: reversal source lookup insertion failed'; END IF;
   END IF;
   EXECUTE patched;
   RAISE NOTICE 'Fixed: %',f;
 END LOOP;
END
$bb_source_fix$;

-- Warehouse validators MUST use default warehouse source, not batch stock
-- or negative/positive balances in an invoice's sales province.
CREATE OR REPLACE FUNCTION public.bb_stock_warehouse_purchased_qty_internal(p_product_code text)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $wh_purchased$
SELECT coalesce(sum(
  CASE WHEN upper(coalesce(a.to_bucket,''))='WAREHOUSE_GOOD'
   AND coalesce(a.to_location_code,a.location_code)=public.bb_stock_default_warehouse_internal()
   THEN a.qty ELSE 0 END
 -
  CASE WHEN upper(coalesce(a.from_bucket,''))='WAREHOUSE_GOOD'
   AND coalesce(a.from_location_code,a.location_code)=public.bb_stock_default_warehouse_internal()
   THEN a.qty ELSE 0 END
),0)::numeric
FROM public.stock_activity a WHERE a.product_code=p_product_code
$wh_purchased$;

CREATE OR REPLACE FUNCTION public.bb_stock_warehouse_zero_cost_qty_internal(p_product_code text)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $wh_zero$
SELECT coalesce(sum(
  CASE WHEN upper(coalesce(a.to_bucket,''))='WAREHOUSE_ZERO_COST'
   AND coalesce(a.to_location_code,a.location_code)=public.bb_stock_default_warehouse_internal()
   THEN a.qty ELSE 0 END
 -
  CASE WHEN upper(coalesce(a.from_bucket,''))='WAREHOUSE_ZERO_COST'
   AND coalesce(a.from_location_code,a.location_code)=public.bb_stock_default_warehouse_internal()
   THEN a.qty ELSE 0 END
),0)::numeric
FROM public.stock_activity a WHERE a.product_code=p_product_code
$wh_zero$;

-- Preserve the existing RPC response shape and permission rules.
CREATE OR REPLACE FUNCTION public.bb_sales_direct_stock_balances()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $direct_balances$
DECLARE balances jsonb;
BEGIN
 IF NOT public.bb_is_active_user() THEN
   RAISE EXCEPTION 'BIG BROTHER access denied'; END IF;
 IF NOT public.bb_has_module_access('invoice_generator','create') THEN
   RAISE EXCEPTION 'Invoice Generator create access denied'; END IF;
 WITH wh AS (
   SELECT a.product_code,
   coalesce(sum(
     CASE WHEN upper(coalesce(a.to_bucket,''))='WAREHOUSE_GOOD'
      AND coalesce(a.to_location_code,a.location_code)=w.code
      THEN a.qty ELSE 0 END -
     CASE WHEN upper(coalesce(a.from_bucket,''))='WAREHOUSE_GOOD'
      AND coalesce(a.from_location_code,a.location_code)=w.code
      THEN a.qty ELSE 0 END),0) AS purchased,
   coalesce(sum(
     CASE WHEN upper(coalesce(a.to_bucket,''))='WAREHOUSE_ZERO_COST'
      AND coalesce(a.to_location_code,a.location_code)=w.code
      THEN a.qty ELSE 0 END -
     CASE WHEN upper(coalesce(a.from_bucket,''))='WAREHOUSE_ZERO_COST'
      AND coalesce(a.from_location_code,a.location_code)=w.code
      THEN a.qty ELSE 0 END),0) AS zero_cost
   FROM public.stock_activity a
   CROSS JOIN (SELECT public.bb_stock_default_warehouse_internal() AS code) w
   GROUP BY a.product_code
 )
 SELECT coalesce(jsonb_agg(jsonb_build_object(
   'productCode',p.product_code,
   'productName',p.product_name,
   'unit',coalesce(p.unit,''),
   'purchasedAvailable',round(greatest(coalesce(wh.purchased,0),0),6),
   'zeroCostAvailable',round(greatest(coalesce(wh.zero_cost,0),0),6),
   'totalAvailable',round(greatest(coalesce(wh.purchased,0),0)+
                          greatest(coalesce(wh.zero_cost,0),0),6)
 ) ORDER BY p.product_name,p.product_code),'[]'::jsonb)
 INTO balances FROM public.products p
 LEFT JOIN wh ON wh.product_code=p.product_code
 WHERE coalesce(p.active,true);
 RETURN jsonb_build_object('success',true,'version','DIRECT-SALE-STOCK-SOURCE-V1',
                           'balances',balances);
END
$direct_balances$;

-- Historical cleanup only on mislocated DIRECT_SALE/DIRECT_SALE_RETURN movements.
-- Before-image is a FULL stock_activity JSON in permanent system_activity_log.
-- No invoice, price, batch or purchase records are updated.
DO $direct_history$
DECLARE
 wh text:=public.bb_stock_default_warehouse_internal();
 warehouse_name text;
 n bigint; logged bigint; n_out bigint; n_return bigint;
BEGIN
 SELECT location_name INTO STRICT warehouse_name
 FROM public.locations WHERE location_code=wh;
 PERFORM pg_advisory_xact_lock(hashtext('BB_STOCK_WRITE'));
 IF EXISTS(
   SELECT 1 FROM public.stock_activity a
   WHERE a.batch_id IS NOT NULL
     AND upper(coalesce(a.movement_type,'')) IN ('DIRECT_SALE','DIRECT_SALE_RETURN')
     AND ((upper(coalesce(a.movement_type,''))='DIRECT_SALE'
         AND coalesce(a.from_location_code,a.location_code)<>wh)
       OR (upper(coalesce(a.movement_type,''))='DIRECT_SALE_RETURN'
         AND coalesce(a.to_location_code,a.location_code)<>wh))
 ) THEN RAISE EXCEPTION 'Local drift: Direct Sale movement linked to a batch. Stop.'; END IF;

 SELECT count(*) INTO n FROM public.stock_activity a
 WHERE (upper(coalesce(a.movement_type,''))='DIRECT_SALE'
        AND upper(coalesce(a.from_bucket,'')) IN ('WAREHOUSE_GOOD','WAREHOUSE_ZERO_COST')
        AND coalesce(a.from_location_code,a.location_code)<>wh)
 OR (upper(coalesce(a.movement_type,''))='DIRECT_SALE_RETURN'
        AND upper(coalesce(a.to_bucket,'')) IN ('WAREHOUSE_GOOD','WAREHOUSE_ZERO_COST')
        AND coalesce(a.to_location_code,a.location_code)<>wh);

 IF n>0 THEN
   INSERT INTO public.system_activity_log(
     actor_name,module_key,action,entity_type,entity_id,location_code,summary,metadata)
   SELECT 'BIG BROTHER Code Sync','Stock Management',
     'DIRECT_SALE_WAREHOUSE_SOURCE_REPAIR_V1','stock_activity',
     a.transaction_id,coalesce(a.from_location_code,a.to_location_code,a.location_code),
     'Direct Sale physical source corrected; original complete row retained',
     jsonb_build_object('migrationId','20261103_direct_sale_warehouse_source_local_v1',
                        'original',to_jsonb(a),'correctWarehouse',wh)
   FROM public.stock_activity a WHERE
     (upper(coalesce(a.movement_type,''))='DIRECT_SALE'
       AND upper(coalesce(a.from_bucket,'')) IN ('WAREHOUSE_GOOD','WAREHOUSE_ZERO_COST')
       AND coalesce(a.from_location_code,a.location_code)<>wh)
     OR
     (upper(coalesce(a.movement_type,''))='DIRECT_SALE_RETURN'
       AND upper(coalesce(a.to_bucket,'')) IN ('WAREHOUSE_GOOD','WAREHOUSE_ZERO_COST')
       AND coalesce(a.to_location_code,a.location_code)<>wh);
   GET DIAGNOSTICS logged=ROW_COUNT;
   IF logged<>n THEN RAISE EXCEPTION 'Audit count % not equal to stock rows %',logged,n; END IF;

   UPDATE public.stock_activity a
   SET location_code=wh,from_location_code=wh,location_name_snapshot=warehouse_name,
       updated_at=now()
   WHERE upper(coalesce(a.movement_type,''))='DIRECT_SALE'
     AND upper(coalesce(a.from_bucket,'')) IN ('WAREHOUSE_GOOD','WAREHOUSE_ZERO_COST')
     AND coalesce(a.from_location_code,a.location_code)<>wh;
   GET DIAGNOSTICS n_out=ROW_COUNT;

   UPDATE public.stock_activity a
   SET location_code=wh,to_location_code=wh,location_name_snapshot=warehouse_name,
       updated_at=now()
   WHERE upper(coalesce(a.movement_type,''))='DIRECT_SALE_RETURN'
     AND upper(coalesce(a.to_bucket,'')) IN ('WAREHOUSE_GOOD','WAREHOUSE_ZERO_COST')
     AND coalesce(a.to_location_code,a.location_code)<>wh;
   GET DIAGNOSTICS n_return=ROW_COUNT;

   IF n_out+n_return<>n THEN
     RAISE EXCEPTION 'Warehouse source correction count mismatch'; END IF;
   PERFORM public.bb_stock_touch_revision_internal();
   RAISE NOTICE 'Audited % warehouse source movements; corrected % sales and % returns',
       n,n_out,n_return;
 ELSE
   RAISE NOTICE 'Historical Direct Sale locations already match physical warehouse';
 END IF;
END
$direct_history$;

DO $verify_direct_source$
DECLARE n bigint;
BEGIN
 SELECT count(*) INTO n FROM public.stock_activity
 WHERE upper(coalesce(movement_type,''))='DIRECT_SALE'
   AND upper(coalesce(from_bucket,'')) NOT IN ('WAREHOUSE_GOOD','WAREHOUSE_ZERO_COST');
 IF n<>0 THEN RAISE EXCEPTION 'Direct Sale used a non-warehouse source: %',n; END IF;
 SELECT count(*) INTO n FROM public.stock_activity
 WHERE (upper(coalesce(movement_type,''))='DIRECT_SALE'
    AND upper(coalesce(from_bucket,'')) IN ('WAREHOUSE_GOOD','WAREHOUSE_ZERO_COST')
    AND coalesce(from_location_code,location_code)<>public.bb_stock_default_warehouse_internal())
 OR (upper(coalesce(movement_type,''))='DIRECT_SALE_RETURN'
    AND upper(coalesce(to_bucket,'')) IN ('WAREHOUSE_GOOD','WAREHOUSE_ZERO_COST')
    AND coalesce(to_location_code,location_code)<>public.bb_stock_default_warehouse_internal());
 IF n<>0 THEN RAISE EXCEPTION 'Direct Sale source location mismatch remains: %',n; END IF;
 RAISE NOTICE 'PASS No Batch draws only from exact default warehouse, not batch stock';
END
$verify_direct_source$;
COMMIT;
