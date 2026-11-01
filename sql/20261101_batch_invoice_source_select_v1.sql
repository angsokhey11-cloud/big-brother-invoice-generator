-- Cloud Batch Sale source select staged; no automatic deployment.
-- Applies only to invoice source allocations explicitly provided by user.
CREATE OR REPLACE FUNCTION public.bb_sales_save_invoice_bundle_core_v1(p_invoice jsonb, p_payment jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_invoice_id text:=trim(coalesce(p_invoice->>'invoiceId',''));
  v_invoice_no text:=trim(coalesce(p_invoice->>'invoiceNo',''));
  v_invoice_date date:=coalesce(nullif(p_invoice->>'invoiceDate','')::date,current_date);
  v_due_date date:=nullif(p_invoice->>'dueDate','')::date;
  v_location_code text:=trim(coalesce(p_invoice->>'locationCode',''));
  v_customer_id text:=nullif(trim(coalesce(p_invoice->>'customerId','')),'');
  v_customer_name text:=trim(coalesce(p_invoice->>'customer',''));
  v_salesperson_staff_id text:=nullif(trim(coalesce(p_invoice->>'salespersonStaffId','')),'');
  v_salesperson_name text:=trim(coalesce(p_invoice->>'salesperson',''));
  v_payment_method text:=trim(coalesce(p_invoice->>'paymentMethod',''));
  v_currency text:=upper(trim(coalesce(p_invoice->>'currency','USD')));
  v_exchange_rate numeric:=greatest(coalesce(nullif(p_invoice->>'exchangeRate','')::numeric,1),0);
  v_discount numeric:=greatest(coalesce(nullif(p_invoice->>'discount','')::numeric,0),0);
  v_amount_paid numeric:=greatest(coalesce(nullif(p_invoice->>'amountPaid','')::numeric,0),0);
  v_batch text:=nullif(trim(coalesce(p_invoice->>'batchNumber','')),'');
  v_shipping text:=nullif(trim(coalesce(p_invoice->>'shippingTo','')),'');
  v_note text:=nullif(trim(coalesce(p_invoice->>'note','')),'');
  v_bank text:=nullif(trim(coalesce(p_invoice->>'paymentBank','')),'');
  v_tx text:=nullif(trim(coalesce(p_invoice->>'transactionId','')),'');
  v_subtotal numeric:=0;
  v_grand numeric:=0;
  v_outstanding numeric:=0;
  v_status text;
  v_items jsonb:=coalesce(p_invoice->'items','[]'::jsonb);
  v_item jsonb;
  v_line_no integer:=0;
  v_line_id text;
  v_entry text;
  v_product_code text;
  v_group_code text;
  v_display_code text;
  v_product_name text;
  v_barcode text;
  v_unit text;
  v_qty numeric;
  v_unit_price numeric;
  v_line_total numeric;
  v_alloc jsonb;
  v_need numeric;
  v_take numeric;
  v_r record;
  v_count integer;
  v_payment_id text:='';
  v_payment_amount numeric:=0;
  v_payment_method_normalized text;
  v_client_line_id text;
begin
  if not public.bb_has_sales_write() then
    raise exception 'BIG BROTHER sales write access denied';
  end if;

  if v_invoice_no='' then raise exception 'Invoice No. is required'; end if;
  if v_location_code='' then raise exception 'Main Location is required'; end if;
  if v_customer_name='' then raise exception 'Customer is required'; end if;
  if v_salesperson_name='' then raise exception 'Sale Person is required'; end if;
  if v_payment_method='' then raise exception 'Payment Method is required'; end if;
  if v_currency not in ('USD','KHR') then raise exception 'Currency must be USD or KHR'; end if;
  if jsonb_typeof(v_items)<>'array' or jsonb_array_length(v_items)=0 then raise exception 'At least one Product is required'; end if;

  if not exists(select 1 from public.locations where location_code=v_location_code and active=true) then
    raise exception 'Main Location % is not active',v_location_code;
  end if;


  if v_invoice_id='' then
    v_invoice_id := 'BB-' || to_char(clock_timestamp() at time zone 'Asia/Phnom_Penh','YYYYMMDD-HH24MISSMS') || '-' || substr(md5(random()::text),1,5);
  end if;
  if exists(select 1 from public.invoices where invoice_id=v_invoice_id) then
    raise exception 'Invoice ID already exists. Please retry.';
  end if;

  if v_customer_id is not null then
    if not exists(select 1 from public.customers c where c.customer_id=v_customer_id and coalesce(c.active,true)=true) then
      v_customer_id:=null;
    end if;
  end if;
  if v_customer_id is null then
    select count(*),min(c.customer_id)
    into v_count,v_customer_id
    from public.customers c
    where lower(trim(coalesce(c.customer_name,'')))=lower(v_customer_name)
      and coalesce(c.location_code,'')=v_location_code
      and coalesce(c.active,true)=true;
    if v_count<>1 then v_customer_id:=null; end if;
  end if;

  if v_salesperson_staff_id is not null and not exists(
    select 1 from public.staff s where s.staff_id=v_salesperson_staff_id and lower(coalesce(s.status,'active'))='active'
  ) then
    v_salesperson_staff_id:=null;
  end if;
  if v_salesperson_staff_id is null then
    select count(*),min(s.staff_id)
    into v_count,v_salesperson_staff_id
    from public.staff s
    where lower(trim(s.staff_name))=lower(v_salesperson_name)
      and lower(coalesce(s.status,'active'))='active';
    if v_count<>1 then v_salesperson_staff_id:=null; end if;
  end if;

  if v_batch is not null then
    if not exists(
      select 1 from public.stock_batches b
      where b.batch_id=v_batch
        and upper(coalesce(b.status,'OPEN')) not in ('CLOSED','CANCELLED','CANCELED')
    ) then raise exception 'Batch % is not open',v_batch; end if;
    if exists(select 1 from public.stock_batches b where b.batch_id=v_batch and b.location_code<>v_location_code) then
      raise exception 'Batch % belongs to a different Location',v_batch;
    end if;
  end if;

  -- Validate products and calculate authoritative subtotal from line quantities/prices.
  for v_item in select value from jsonb_array_elements(v_items)
  loop
    v_entry:=upper(trim(coalesce(v_item->>'entryType','EXACT')));
    v_qty:=greatest(coalesce(nullif(v_item->>'qty','')::numeric,0),0);
    v_unit_price:=greatest(coalesce(nullif(v_item->>'unitPrice','')::numeric,0),0);
    if v_qty<=0 then continue; end if;

    if v_entry='GROUP' then
      v_group_code:=nullif(trim(coalesce(v_item->>'productGroupCode',v_item->>'productCode')),'');
      if v_group_code is null or not exists(select 1 from public.product_groups g where g.group_code=v_group_code and g.active=true) then
        raise exception 'Product Group % is invalid',coalesce(v_group_code,'');
      end if;
      if v_batch is null then raise exception 'Product Group % requires a Batch',v_group_code; end if;
    elsif v_entry='EXACT' then
      v_product_code:=nullif(trim(coalesce(v_item->>'productCode','')),'');
      if v_product_code is null or not exists(select 1 from public.products p where p.product_code=v_product_code and p.active=true) then
        raise exception 'Product % is invalid',coalesce(v_product_code,'');
      end if;
    else
      raise exception 'Invalid line Entry Type: %',v_entry;
    end if;

    v_subtotal:=v_subtotal+(v_qty*v_unit_price);
    v_line_no:=v_line_no+1;
  end loop;

  if v_line_no=0 then raise exception 'Purchase quantities are empty'; end if;
  v_discount:=least(v_discount,v_subtotal);
  v_grand:=greatest(v_subtotal-v_discount,0);
  v_amount_paid:=least(v_amount_paid,v_grand);

  if v_payment_method in ('Cash','Bank') then v_amount_paid:=v_grand; end if;
  if v_payment_method='Credit' then v_amount_paid:=0; end if;
  v_outstanding:=greatest(v_grand-v_amount_paid,0);
  v_status:=case when v_outstanding<=0 then 'Paid' when v_amount_paid>0 then 'Processing' else 'Unpaid' end;

  if v_payment_method in ('Bank','Partially Paid in Bank') then
    if v_bank is null then raise exception 'Payment Bank is required'; end if;
    if v_tx is null then raise exception 'Transaction ID is required for Bank payment'; end if;
  end if;
  -- A registered transfer can fund multiple invoices until its balance is
  -- consumed. Manual/unregistered transaction IDs remain strictly unique.
  if v_tx is not null
     and exists(select 1 from public.payments p where lower(trim(p.transaction_id))=lower(v_tx))
     and not (v_payment_method in ('Bank','Partially Paid in Bank')
       and v_customer_id is not null and exists(
         select 1 from public.bb_verified_bank_transactions r
         join public.bb_bank_balance_snapshot b on b.transaction_id=r.transaction_id
         where lower(trim(r.transaction_id))=lower(v_tx)
           and r.customer_id=v_customer_id and b.customer_id=v_customer_id
           and r.status='AVAILABLE' and b.remaining_amount>0
       ))
  then
    raise exception 'Transaction ID already exists';
  end if;

  insert into public.invoices(
    invoice_id,invoice_no,invoice_date,customer_id,customer_name_snapshot,
    salesperson_staff_id,salesperson_name_snapshot,payment_method,currency,exchange_rate,
    subtotal,discount,grand_total,amount_paid,change_amount,outstanding,status,note,due_date,
    bank_payment,bank_reference,credit_amount,batch_number,location_code,shipping_to_legacy
  ) values (
    v_invoice_id,v_invoice_no,v_invoice_date,v_customer_id,v_customer_name,
    v_salesperson_staff_id,v_salesperson_name,v_payment_method,v_currency,v_exchange_rate,
    v_subtotal,v_discount,v_grand,v_amount_paid,0,v_outstanding,v_status,v_note,v_due_date,
    v_bank,v_tx,v_outstanding,v_batch,v_location_code,v_shipping
  );

  v_line_no:=0;
  for v_item in select value from jsonb_array_elements(v_items)
  loop
    v_entry:=upper(trim(coalesce(v_item->>'entryType','EXACT')));
    v_qty:=greatest(coalesce(nullif(v_item->>'qty','')::numeric,0),0);
    if v_qty<=0 then continue; end if;
    v_unit_price:=greatest(coalesce(nullif(v_item->>'unitPrice','')::numeric,0),0);
    v_line_total:=v_qty*v_unit_price;
    v_line_no:=v_line_no+1;
    v_client_line_id:=trim(coalesce(v_item->>'lineId',''));
    v_line_id:=case when v_client_line_id<>'' and not exists(select 1 from public.invoice_lines where line_id=v_client_line_id)
                    then v_client_line_id
                    else 'LINE-' || to_char(clock_timestamp(),'YYYYMMDDHH24MISSMS') || '-' || v_line_no::text || '-' || substr(md5(random()::text),1,5)
               end;
    v_product_name:=nullif(trim(coalesce(v_item->>'productName','')),'');
    v_barcode:=nullif(trim(coalesce(v_item->>'productBarcode','')),'');
    v_unit:=nullif(trim(coalesce(v_item->>'unit','')),'');
    v_alloc:=null;

    /* ========================================================
       DIRECT SALE SOURCE ALLOCATION V1
       ======================================================== */

    if

      v_batch is null

      and

      jsonb_typeof(
        v_item->'stockAllocations'
      )
      =
      'array'

      and

      jsonb_array_length(
        v_item->'stockAllocations'
      )
      >
      0

    then

      v_alloc :=
        v_item->'stockAllocations';

    end if;

    -- Batch Exact stock source allocations preserve the operator's explicit split.
    -- Direct Sale retains its existing handling; Group lines remain legacy allocated.
    if v_batch is not null and v_entry='EXACT' and v_item ? 'stockAllocations' then
      if jsonb_typeof(v_item->'stockAllocations') <> 'array'
         or jsonb_array_length(v_item->'stockAllocations') = 0 then
        raise exception 'Batch line requires Purchased or Zero-Cost allocation';
      end if;
      v_alloc := (
        select jsonb_agg(jsonb_build_object(
          'productCode',trim(coalesce(v_item->>'productCode','')),
          'source',upper(trim(coalesce(e.value->>'source',''))),
          'qty',e.value->'qty'))
        from jsonb_array_elements(v_item->'stockAllocations') e
      );
    end if;

    if v_entry='EXACT' then
      v_product_code:=trim(coalesce(v_item->>'productCode',''));
      v_group_code:=null;
      v_display_code:=v_product_code;
      if v_product_name is null or v_barcode is null or v_unit is null then
        select coalesce(v_product_name,p.product_name),coalesce(v_barcode,p.barcode),coalesce(v_unit,p.unit)
        into v_product_name,v_barcode,v_unit
        from public.products p where p.product_code=v_product_code;
      end if;
    else
      v_product_code:=null;
      v_group_code:=trim(coalesce(v_item->>'productGroupCode',v_item->>'productCode'));
      v_display_code:=v_group_code;
      if v_product_name is null then select g.group_name into v_product_name from public.product_groups g where g.group_code=v_group_code; end if;

      v_alloc:='[]'::jsonb;
      v_need:=v_qty;
      for v_r in
        select r.product_code,greatest(r.difference_qty,0) as available
        from public.v_batch_reconciliation r
        join public.product_group_mapping m
          on m.product_code=r.product_code
         and m.group_code=v_group_code
         and m.use_group=true
         and lower(m.status)='active'
        where r.batch_id=v_batch
        order by r.product_code
      loop
        exit when v_need<=0.0000001;
        v_take:=least(v_need,v_r.available);
        if v_take>0 then
          v_alloc:=v_alloc || jsonb_build_array(jsonb_build_object('productCode',v_r.product_code,'qty',v_take));
          v_need:=v_need-v_take;
        end if;
      end loop;
      if v_need>0.0000001 then
        raise exception 'Batch % does not have enough remaining stock for Group % (short by %)',v_batch,v_group_code,v_need;
      end if;
    end if;

    insert into public.invoice_lines(
      line_id,invoice_id,invoice_no_snapshot,line_no,entry_type,product_code,product_group_code,
      display_product_code,product_name_snapshot,product_barcode_snapshot,product_note,qty,unit_snapshot,
      unit_price,line_total,stock_allocation_json
    ) values (
      v_line_id,v_invoice_id,v_invoice_no,v_line_no,v_entry,v_product_code,v_group_code,
      v_display_code,v_product_name,v_barcode,nullif(trim(coalesce(v_item->>'productNote','')),''),v_qty,v_unit,
      v_unit_price,v_line_total,v_alloc
    );
  end loop;

  if p_payment is not null and jsonb_typeof(p_payment)='object' and v_amount_paid>0 then
    v_payment_amount:=least(greatest(coalesce(nullif(p_payment->>'amount','')::numeric,v_amount_paid),0),v_amount_paid);
    if v_payment_amount>0 then
      v_payment_method_normalized:=case when v_payment_method in ('Bank','Partially Paid in Bank') then 'Bank' else 'Cash' end;
      v_payment_id:=public.bb_next_prefixed_id('public.payments'::regclass,'payment_id','PAY',4);
      insert into public.payments(
        payment_id,invoice_id,invoice_no_snapshot,payment_date,customer_id,customer_name_snapshot,
        location_code,salesperson_staff_id,salesperson_name_snapshot,payment_method,bank_payment,
        bank_reference,currency,exchange_rate,amount,note,transaction_id,payment_source
      ) values (
        v_payment_id,v_invoice_id,v_invoice_no,v_invoice_date,v_customer_id,v_customer_name,
        v_location_code,v_salesperson_staff_id,v_salesperson_name,v_payment_method_normalized,
        case when v_payment_method_normalized='Bank' then v_bank else null end,
        case when v_payment_method_normalized='Bank' then v_tx else null end,
        v_currency,v_exchange_rate,v_payment_amount,
        coalesce(nullif(trim(coalesce(p_payment->>'note','')),''),'Initial invoice payment'),
        case when v_payment_method_normalized='Bank' then v_tx else null end,'Invoice'
      );
    end if;
  end if;

  return jsonb_build_object(
    'success',true,
    'invoiceId',v_invoice_id,
    'invoiceNo',v_invoice_no,
    'paymentId',v_payment_id,
    'subtotal',v_subtotal,
    'grandTotal',v_grand,
    'amountPaid',v_amount_paid,
    'outstanding',v_outstanding,
    'status',v_status
  );
exception
  when unique_violation then
    if position('uq_payments_transaction_id_normalized' in sqlerrm)>0 then
      raise exception 'Transaction ID already exists';
    elsif position('uq_invoices_invoice_no_customer_id' in sqlerrm)>0 then
      raise exception 'Invoice No. % already exists for this Customer',v_invoice_no;
    elsif position('invoices_invoice_no_key' in sqlerrm)>0 then
      raise exception 'Invoice No. % already exists',v_invoice_no;
    else
      raise;
    end if;
end;
$function$


CREATE OR REPLACE FUNCTION public.bb_stock_invoice_line_after_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$

declare


  v_invoice
    public.invoices%rowtype;


  v_batch
    public.stock_batches%rowtype;


  v_batch_item
    public.stock_batch_items%rowtype;


  v_available numeric;


  v_movement_id text;

  v_transaction_id text;


  v_location_name text;


  v_allocations jsonb;

  v_elem jsonb;


  v_alloc_qty numeric;

  v_alloc_code text;

  v_alloc_total numeric :=
    0;


  v_product_name text;

  v_unit text;


  v_zero_sold numeric;

  v_purchased_sold numeric;


  v_purchase_cost numeric;


begin
  -- SERVICE / non-stock items are revenue only; never touch inventory.
  if exists (
    select 1
    from public.products p
    where p.product_code=new.product_code
      and (
        upper(coalesce(p.item_type,'PRODUCT'))='SERVICE'
        or coalesce(p.track_stock,true)=false
      )
  ) then
    return new;
  end if;


  if not public.bb_stock_ready_internal() then

    return new;

  end if;



  select *

  into v_invoice

  from public.invoices

  where invoice_id =
        new.invoice_id;


  if not found then

    return new;

  end if;



  -- ==========================================================
  -- BATCH SALE
  -- ==========================================================

  if v_invoice.batch_id is not null then


    perform pg_advisory_xact_lock(
      hashtext(
        'BB_STOCK_WRITE'
      )
    );


    select *

    into v_batch

    from public.stock_batches

    where batch_id =
          v_invoice.batch_id

    for update;


    if not found then

      raise exception
        'Linked Batch % was not found',
        v_invoice.batch_id;

    end if;



    if upper(
      coalesce(
        v_batch.status,
        ''
      )
    ) <> 'OPEN'
    then

      raise exception
        'Batch % is % and cannot accept another sale',
        v_batch.batch_id,
        v_batch.status;

    end if;



    select stock_movement_id

    into v_movement_id

    from public.sales_stock_sync

    where invoice_id =
          v_invoice.invoice_id

    for update;



    if v_movement_id is null then


      v_movement_id :=

        public.bb_next_prefixed_id(

          'public.stock_activity'::regclass,

          'movement_id',

          'STK',

          6

        );



      insert into public.sales_stock_sync(

        invoice_id,

        invoice_no_snapshot,

        invoice_date,

        batch_number,

        sync_type,

        status,

        stock_movement_id,

        error_text,

        synced_at,

        updated_at

      )
      values(

        v_invoice.invoice_id,

        v_invoice.invoice_no,

        v_invoice.invoice_date,

        v_batch.batch_id,

        'BATCH_SALE',

        'Syncing',

        v_movement_id,

        null,

        null,

        now()

      )

      on conflict(
        invoice_id
      )

      do update set

        invoice_no_snapshot =
          excluded.invoice_no_snapshot,

        invoice_date =
          excluded.invoice_date,

        batch_number =
          excluded.batch_number,

        sync_type =
          'BATCH_SALE',

        status =
          'Syncing',

        stock_movement_id =
          coalesce(
            public.sales_stock_sync.stock_movement_id,
            excluded.stock_movement_id
          ),

        error_text =
          null,

        updated_at =
          now()

      returning stock_movement_id
      into v_movement_id;


    end if;



    -- ========================================================
    -- ALLOCATION
    -- ========================================================

    if upper(
      coalesce(
        new.entry_type,
        'EXACT'
      )
    ) = 'EXACT'
    then


      if new.product_code is null then

        raise exception
          'Batch Sale requires an exact Product Code';

      end if;


      -- Explicit source allocation only when submitted for an EXACT batch line.
      -- Older invoices without this field retain ZERO_COST_FIRST behavior.
      if new.stock_allocation_json is not null then
        if jsonb_typeof(new.stock_allocation_json)<>'array'
           or jsonb_array_length(new.stock_allocation_json)=0 then
          raise exception 'Invalid exact Batch Stock allocation';
        end if;
        if exists (
          select 1 from jsonb_array_elements(new.stock_allocation_json) e
          group by upper(trim(coalesce(e.value->>'source',''))),trim(coalesce(e.value->>'productCode',''))
          having count(*)>1
        ) then
          raise exception 'Duplicate Batch source allocation for invoice line %',new.line_id;
        end if;
        v_allocations:=new.stock_allocation_json;
      else
      v_allocations :=

        jsonb_build_array(

          jsonb_build_object(

            'productCode',
              new.product_code,

            'qty',
              new.qty

          )

        );
      end if;


    elsif upper(
      new.entry_type
    ) = 'GROUP'
    then


      v_allocations :=
        coalesce(
          new.stock_allocation_json,
          '[]'::jsonb
        );


      if jsonb_typeof(
        v_allocations
      ) <> 'array'

      or

      jsonb_array_length(
        v_allocations
      ) = 0

      then

        raise exception
          'Batch Group line % has no stock allocation',
          new.line_id;

      end if;


    else


      raise exception
        'Unsupported Batch Sale line type %',
        new.entry_type;


    end if;



    -- ========================================================
    -- EACH EXACT PRODUCT
    -- ========================================================

    for v_elem in

      select value

      from jsonb_array_elements(
        v_allocations
      )

    loop


      v_alloc_code :=
        nullif(
          trim(
            coalesce(
              v_elem->>'productCode',
              ''
            )
          ),
          ''
        );


      v_alloc_qty :=
        coalesce(
          nullif(
            v_elem->>'qty',
            ''
          )::numeric,
          0
        );



      if v_alloc_code is null

         or

         v_alloc_qty <= 0

      then

        raise exception
          'Invalid Batch stock allocation on line %',
          new.line_id;

      end if;



      v_alloc_total :=
        v_alloc_total
        +
        v_alloc_qty;



      select *

      into v_batch_item

      from public.stock_batch_items

      where batch_id =
            v_batch.batch_id

        and product_code =
            v_alloc_code

      for update;



      if not found then

        raise exception
          'Product % is not available in Batch %',
          v_alloc_code,
          v_batch.batch_id;

      end if;



      v_available :=

        v_batch_item.purchased_pending_qty_snapshot

        +

        v_batch_item.zero_cost_pending_qty_snapshot;



      if v_alloc_qty >
         v_available
         +
         0.000001
      then

        raise exception
          '%: Invoice Qty % is greater than Batch % remaining %',
          v_alloc_code,
          v_alloc_qty,
          v_batch.batch_id,
          v_available;

      end if;



      if v_elem ? 'source' then
        if upper(trim(v_elem->>'source')) not in ('PURCHASED','ZERO_COST') then
          raise exception 'Unsupported Batch stock source for %',v_alloc_code;
        end if;
        if coalesce(v_elem->>'qty','')='' or v_alloc_qty<=0 then
          raise exception 'Batch source allocation quantity must be positive';
        end if;
        v_zero_sold:=case when upper(trim(v_elem->>'source'))='ZERO_COST' then v_alloc_qty else 0 end;
        v_purchased_sold:=case when upper(trim(v_elem->>'source'))='PURCHASED' then v_alloc_qty else 0 end;
        if v_zero_sold>v_batch_item.zero_cost_pending_qty_snapshot+0.000001 then
          raise exception '%: Zero-Cost Batch stock insufficient',v_alloc_code;
        end if;
      else
      -- ZERO-COST FIRST

      v_zero_sold :=

        least(

          v_alloc_qty,

          greatest(
            v_batch_item.zero_cost_pending_qty_snapshot,
            0
          )

        );



      v_purchased_sold :=

        greatest(

          v_alloc_qty
          -
          v_zero_sold,

          0

        );



      end if;

      if v_purchased_sold >
         v_batch_item.purchased_pending_qty_snapshot
         +
         0.000001
      then

        raise exception
          '%: Purchased Batch source balance is insufficient',
          v_alloc_code;

      end if;



      update public.stock_batch_items

      set

        pending_qty_snapshot =
          greatest(
            pending_qty_snapshot
            -
            v_alloc_qty,
            0
          ),


        zero_cost_pending_qty_snapshot =
          greatest(
            zero_cost_pending_qty_snapshot
            -
            v_zero_sold,
            0
          ),


        purchased_pending_qty_snapshot =
          greatest(
            purchased_pending_qty_snapshot
            -
            v_purchased_sold,
            0
          ),


        sold_qty_snapshot =
          sold_qty_snapshot
          +
          v_alloc_qty,


        zero_cost_sold_qty_snapshot =
          zero_cost_sold_qty_snapshot
          +
          v_zero_sold,


        purchased_sold_qty_snapshot =
          purchased_sold_qty_snapshot
          +
          v_purchased_sold,


        source_updated_at =
          now(),


        updated_at =
          now()


      where batch_id =
            v_batch.batch_id

        and product_code =
            v_alloc_code;



      select

        coalesce(
          p.product_name,
          v_alloc_code
        ),

        coalesce(
          p.unit,
          ''
        )

      into
        v_product_name,
        v_unit

      from public.products p

      where p.product_code =
            v_alloc_code;



      -- ======================================================
      -- ZERO-COST SALE
      -- ======================================================

      if v_zero_sold > 0 then


        v_transaction_id :=

          public.bb_next_prefixed_id(

            'public.stock_activity'::regclass,

            'transaction_id',

            'TRX',

            6

          );



        insert into public.stock_activity(

          transaction_id,

          batch_id,

          activity_date,
          activity_type,

          product_code,
          product_name_snapshot,

          qty,

          unit_snapshot,

          location_code,
          from_location_code,

          salesman_staff_id,
          salesman_name_snapshot,

          reference_no,
          related_invoice_no,

          note,

          source_created_at,

          movement_id,

          flow,
          movement_type,

          from_bucket,
          to_bucket,

          source_entity_type,

          source_id,
          source_name,

          customer_id,
          customer_name_snapshot,

          unit_cost,
          line_value,

          location_name_snapshot,

          client_request_id

        )
        values(

          v_transaction_id,

          v_batch.batch_id,

          v_invoice.invoice_date,
          'Stock Out',

          v_alloc_code,
          coalesce(
            v_product_name,
            v_alloc_code
          ),

          v_zero_sold,

          v_unit,

          v_batch.location_code,
          v_batch.location_code,

          v_batch.salesman_staff_id,
          v_batch.salesman_name_snapshot,

          v_invoice.invoice_no,
          v_invoice.invoice_no,

          'Automatic Batch Sale · ZERO-COST FIRST',

          now(),

          v_movement_id,

          'OUTFLOW',
          'BATCH_SALE',

          'BATCH_ZERO_COST',
          'EXTERNAL',

          'CUSTOMER',

          v_invoice.customer_id,
          v_invoice.customer_name_snapshot,

          v_invoice.customer_id,
          v_invoice.customer_name_snapshot,

          0,
          0,

          coalesce(
            v_batch.location_name_snapshot,
            v_batch.location_code
          ),

          'BATCH-INVOICE:'
          ||
          new.line_id
          ||
          ':'
          ||
          v_alloc_code
          ||
          ':ZERO'

        );


      end if;



      -- ======================================================
      -- PURCHASED SALE
      -- ======================================================

      if v_purchased_sold > 0 then


        v_purchase_cost :=

          public.bb_stock_average_cost_internal(
            v_alloc_code
          );



        v_transaction_id :=

          public.bb_next_prefixed_id(

            'public.stock_activity'::regclass,

            'transaction_id',

            'TRX',

            6

          );



        insert into public.stock_activity(

          transaction_id,

          batch_id,

          activity_date,
          activity_type,

          product_code,
          product_name_snapshot,

          qty,

          unit_snapshot,

          location_code,
          from_location_code,

          salesman_staff_id,
          salesman_name_snapshot,

          reference_no,
          related_invoice_no,

          note,

          source_created_at,

          movement_id,

          flow,
          movement_type,

          from_bucket,
          to_bucket,

          source_entity_type,

          source_id,
          source_name,

          customer_id,
          customer_name_snapshot,

          unit_cost,
          line_value,

          location_name_snapshot,

          client_request_id

        )
        values(

          v_transaction_id,

          v_batch.batch_id,

          v_invoice.invoice_date,
          'Stock Out',

          v_alloc_code,
          coalesce(
            v_product_name,
            v_alloc_code
          ),

          v_purchased_sold,

          v_unit,

          v_batch.location_code,
          v_batch.location_code,

          v_batch.salesman_staff_id,
          v_batch.salesman_name_snapshot,

          v_invoice.invoice_no,
          v_invoice.invoice_no,

          'Automatic Batch Sale · PURCHASED AFTER ZERO-COST',

          now(),

          v_movement_id,

          'OUTFLOW',
          'BATCH_SALE',

          'BATCH_PENDING',
          'EXTERNAL',

          'CUSTOMER',

          v_invoice.customer_id,
          v_invoice.customer_name_snapshot,

          v_invoice.customer_id,
          v_invoice.customer_name_snapshot,

          v_purchase_cost,

          round(
            v_purchased_sold
            *
            v_purchase_cost,
            6
          ),

          coalesce(
            v_batch.location_name_snapshot,
            v_batch.location_code
          ),

          'BATCH-INVOICE:'
          ||
          new.line_id
          ||
          ':'
          ||
          v_alloc_code
          ||
          ':PURCHASED'

        );


      end if;


    end loop;



    if abs(
      v_alloc_total
      -
      new.qty
    ) > 0.000001
    then

      raise exception
        'Batch stock allocation % does not match Invoice line Qty %',
        v_alloc_total,
        new.qty;

    end if;



    update public.stock_batches

    set

      sold_qty =

        (

          select coalesce(
            sum(
              sold_qty_snapshot
            ),
            0
          )

          from public.stock_batch_items

          where batch_id =
                v_batch.batch_id

        ),


      updated_at =
        now(),


      source_updated_at =
        now()


    where batch_id =
          v_batch.batch_id;



    perform public.bb_stock_refresh_batch_status_internal(
      v_batch.batch_id
    );



    update public.sales_stock_sync

    set

      sync_type =
        'BATCH_SALE',

      status =
        'Synced',

      error_text =
        null,

      synced_at =
        now(),

      updated_at =
        now()

    where invoice_id =
          v_invoice.invoice_id;



    perform public.bb_stock_touch_revision_internal();


    return new;


  end if;



  -- ==========================================================
  -- LEGACY BATCH NUMBER REFERENCE
  -- ==========================================================

  if nullif(
    trim(
      coalesce(
        v_invoice.batch_number,
        ''
      )
    ),
    ''
  ) is not null
  then


    insert into public.sales_stock_sync(

      invoice_id,

      invoice_no_snapshot,

      invoice_date,

      batch_number,

      sync_type,

      status,

      stock_movement_id,

      error_text,

      synced_at,

      updated_at

    )
    values(

      v_invoice.invoice_id,

      v_invoice.invoice_no,

      v_invoice.invoice_date,

      v_invoice.batch_number,

      'LEGACY_BATCH_REFERENCE',

      'Tracked',

      null,

      null,

      now(),

      now()

    )

    on conflict(
      invoice_id
    )

    do update set

      invoice_no_snapshot =
        excluded.invoice_no_snapshot,

      invoice_date =
        excluded.invoice_date,

      batch_number =
        excluded.batch_number,

      sync_type =
        'LEGACY_BATCH_REFERENCE',

      status =
        'Tracked',

      error_text =
        null,

      synced_at =
        now(),

      updated_at =
        now();


    return new;


  end if;



  -- ==========================================================
  -- DIRECT SALE
  --
  -- Direct sale remains PURCHASED Warehouse only.
  -- Genuine Zero-Cost must first be released to a Batch.
  -- ==========================================================

  if upper(
    coalesce(
      new.entry_type,
      'EXACT'
    )
  ) <> 'EXACT'

  or

  new.product_code is null

  then

    raise exception
      'Direct Sale Stock requires an exact Product Code';

  end if;



  perform pg_advisory_xact_lock(
    hashtext(
      'BB_STOCK_WRITE'
    )
  );



  v_available :=

    public.bb_stock_warehouse_purchased_qty_internal(
      new.product_code
    );



  if new.qty >
     v_available
     +
     0.000001
  then

    raise exception
      '%: Invoice Qty % is greater than Purchased Warehouse Stock %',
      coalesce(
        new.product_name_snapshot,
        new.product_code
      ),
      new.qty,
      v_available;

  end if;



  select stock_movement_id

  into v_movement_id

  from public.sales_stock_sync

  where invoice_id =
        v_invoice.invoice_id

  for update;



  if v_movement_id is null then


    v_movement_id :=

      public.bb_next_prefixed_id(

        'public.stock_activity'::regclass,

        'movement_id',

        'STK',

        6

      );



    insert into public.sales_stock_sync(

      invoice_id,

      invoice_no_snapshot,

      invoice_date,

      batch_number,

      sync_type,

      status,

      stock_movement_id,

      error_text,

      synced_at,

      updated_at

    )
    values(

      v_invoice.invoice_id,

      v_invoice.invoice_no,

      v_invoice.invoice_date,

      null,

      'DIRECT_SALE',

      'Syncing',

      v_movement_id,

      null,

      null,

      now()

    )

    on conflict(
      invoice_id
    )

    do update set

      invoice_no_snapshot =
        excluded.invoice_no_snapshot,

      invoice_date =
        excluded.invoice_date,

      batch_number =
        null,

      sync_type =
        'DIRECT_SALE',

      status =
        'Syncing',

      stock_movement_id =
        coalesce(
          public.sales_stock_sync.stock_movement_id,
          excluded.stock_movement_id
        ),

      error_text =
        null,

      updated_at =
        now()

    returning stock_movement_id
    into v_movement_id;


  end if;



  v_transaction_id :=

    public.bb_next_prefixed_id(

      'public.stock_activity'::regclass,

      'transaction_id',

      'TRX',

      6

    );



  select location_name

  into v_location_name

  from public.locations

  where location_code =
        v_invoice.location_code;



  v_purchase_cost :=

    public.bb_stock_average_cost_internal(
      new.product_code
    );



  insert into public.stock_activity(

    transaction_id,

    activity_date,
    activity_type,

    product_code,
    product_name_snapshot,

    qty,

    unit_snapshot,

    location_code,
    from_location_code,

    salesman_staff_id,
    salesman_name_snapshot,

    reference_no,
    related_invoice_no,

    note,

    source_created_at,

    movement_id,

    flow,
    movement_type,

    from_bucket,
    to_bucket,

    source_entity_type,

    source_id,
    source_name,

    customer_id,
    customer_name_snapshot,

    unit_cost,
    line_value,

    location_name_snapshot,

    client_request_id

  )
  values(

    v_transaction_id,

    v_invoice.invoice_date,
    'Stock Out',

    new.product_code,
    coalesce(
      new.product_name_snapshot,
      new.product_code
    ),

    new.qty,

    coalesce(
      new.unit_snapshot,
      ''
    ),

    v_invoice.location_code,
    v_invoice.location_code,

    v_invoice.salesperson_staff_id,
    v_invoice.salesperson_name_snapshot,

    v_invoice.invoice_no,
    v_invoice.invoice_no,

    'Automatic Purchased Stock Direct Sale from Supabase Invoice',

    now(),

    v_movement_id,

    'OUTFLOW',
    'DIRECT_SALE',

    'WAREHOUSE_GOOD',
    'EXTERNAL',

    'CUSTOMER',

    v_invoice.customer_id,
    v_invoice.customer_name_snapshot,

    v_invoice.customer_id,
    v_invoice.customer_name_snapshot,

    v_purchase_cost,

    round(
      new.qty
      *
      v_purchase_cost,
      6
    ),

    coalesce(
      v_location_name,
      v_invoice.location_code
    ),

    'INVOICE:'
    ||
    new.line_id

  );



  update public.sales_stock_sync

  set

    status =
      'Synced',

    error_text =
      null,

    synced_at =
      now(),

    updated_at =
      now()

  where invoice_id =
        v_invoice.invoice_id;



  perform public.bb_stock_touch_revision_internal();


  return new;


end;

$function$
