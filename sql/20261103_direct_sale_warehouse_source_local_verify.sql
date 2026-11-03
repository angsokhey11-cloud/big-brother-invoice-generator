-- BIG BROTHER LOCAL V5/V6 | READ ONLY | 2026-11-03
-- Run through Approved SQL Gate verification (not Cloud -> Local data sync).
-- NO MUTATION / NO INVOICE OR BATCH CREATION.
WITH warehouse AS (SELECT public.bb_stock_default_warehouse_internal() AS code),
summary AS (
 SELECT
  (SELECT count(*) FROM public.invoices WHERE batch_id IS NULL) AS no_batch_invoices,
  (SELECT count(*) FROM public.stock_activity a
    WHERE upper(coalesce(a.movement_type,''))='DIRECT_SALE'
      AND upper(coalesce(a.from_bucket,'')) IN ('BATCH_PENDING','BATCH_ZERO_COST')) AS direct_sale_batch_bucket_rows,
  (SELECT count(*) FROM public.stock_activity a
    WHERE upper(coalesce(a.movement_type,''))='DIRECT_SALE'
      AND upper(coalesce(a.from_bucket,'')) NOT IN ('WAREHOUSE_GOOD','WAREHOUSE_ZERO_COST')) AS direct_sale_other_bucket_rows,
  (SELECT count(*) FROM public.stock_activity a CROSS JOIN warehouse w
    WHERE upper(coalesce(a.movement_type,''))='DIRECT_SALE'
      AND upper(coalesce(a.from_bucket,'')) IN ('WAREHOUSE_GOOD','WAREHOUSE_ZERO_COST')
      AND coalesce(a.from_location_code,a.location_code)<>w.code) AS direct_sale_wrong_wh_rows,
  (SELECT count(*) FROM public.stock_activity a CROSS JOIN warehouse w
    WHERE upper(coalesce(a.movement_type,''))='DIRECT_SALE_RETURN'
      AND upper(coalesce(a.to_bucket,'')) IN ('WAREHOUSE_GOOD','WAREHOUSE_ZERO_COST')
      AND coalesce(a.to_location_code,a.location_code)<>w.code) AS direct_return_wrong_wh_rows,
  (SELECT count(*) FROM public.stock_activity a
    WHERE upper(coalesce(a.movement_type,''))='BATCH_SALE'
      AND upper(coalesce(a.from_bucket,'')) IN ('BATCH_PENDING','BATCH_ZERO_COST')) AS batch_sale_rows,
  (SELECT count(*) FROM public.system_activity_log
    WHERE action='DIRECT_SALE_WAREHOUSE_SOURCE_REPAIR_V1'
      AND metadata->>'migrationId'='20261103_direct_sale_warehouse_source_local_v1') AS audited_corrections
)
SELECT w.code AS physical_warehouse, s.*,
 CASE WHEN s.direct_sale_batch_bucket_rows=0 AND s.direct_sale_other_bucket_rows=0
   AND s.direct_sale_wrong_wh_rows=0 AND s.direct_return_wrong_wh_rows=0
   THEN 'PASS' ELSE 'BLOCK' END AS no_batch_stock_guard
FROM summary s CROSS JOIN warehouse w;

-- Check the actual purchased/zero cost physical warehouse quantities for the
-- product that originally exposed the bug. Batch quantities are listed separately.
SELECT p.product_code,p.product_name,
  public.bb_stock_warehouse_purchased_qty_internal(p.product_code) AS warehouse_purchased,
  public.bb_stock_warehouse_zero_cost_qty_internal(p.product_code) AS warehouse_zero_cost,
  b.batch_purchased AS batch_purchased,
  b.batch_zero_cost AS batch_zero_cost
FROM public.products p
LEFT JOIN public.bb_stock_balance_zero_cost_v1_internal() b ON b.product_code=p.product_code
WHERE p.product_code='KIRB-2L';

-- Source isolation on invoice-line trigger definitions.
SELECT t.tgname,t.tgenabled,
       CASE WHEN t.tgenabled IN ('O','A') THEN 'ENABLED' ELSE 'BLOCK' END AS trigger_status
FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
WHERE c.relname='invoice_lines'
AND t.tgname IN ('trg_invoice_lines_stock_direct_sale',
                  'trg_invoice_lines_stock_direct_sale_source_v1')
ORDER BY t.tgname;
