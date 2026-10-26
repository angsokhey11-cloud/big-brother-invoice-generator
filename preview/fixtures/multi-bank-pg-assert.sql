-- Must run only in a disposable test DB after fixture + implementation.
do $test$
declare
 v_input jsonb := jsonb_build_object('invoiceId','T-OK','invoiceNo','T-OK','locationCode','TK-01','customerId','C1','currency','USD','paymentMethod','Partially Paid in Bank','grandTotal',150,'amountPaid',100);
 v_payment jsonb := jsonb_build_object('settlement_request_id','11111111-1111-4111-8111-111111111111','settlement_sources',jsonb_build_array(
   jsonb_build_object('kind','BANK_REGISTER','source_id','TX-A','source_currency','USD','source_amount','40','invoice_amount','40'),
   jsonb_build_object('kind','BANK_REGISTER','source_id','TX-B','source_currency','USD','source_amount','60','invoice_amount','60')));
 v_response jsonb;v_retry jsonb;v_error text;v_allocated numeric;
begin
 -- Admin-only pilot: authenticated nonadmins cannot create new settlements.
 perform set_config('bb_test.is_admin','off',true);
 begin
  perform public.bb_sales_save_invoice_multi_bank_v1(v_input,v_payment);
  raise exception 'Nonadmin unexpectedly saved invoice';
 exception when others then
  get stacked diagnostics v_error=message_text;
  if v_error not like '%Admin-only%' then raise exception 'Incorrect admin rejection: %',v_error;end if;
 end;
 perform set_config('bb_test.is_admin','on',true);
 if exists(select 1 from public.invoices where invoice_id='T-OK') then raise exception 'Admin rejection wrote invoice';end if;
 raise notice 'PASS admin-only pilot restriction';
 v_response:=public.bb_sales_save_invoice_multi_bank_v1(v_input,v_payment);
 if v_response->>'sourceCount'<>'2' or jsonb_array_length(v_response->'paymentIds')<>2 then raise exception 'Incorrect payment response %',v_response;end if;
 v_retry:=public.bb_sales_save_invoice_multi_bank_v1(v_input,v_payment);
 if v_retry<>v_response then raise exception 'Idempotent retry changed response';end if;
 if (select count(*) from public.payments where invoice_id='T-OK')<>2 then raise exception 'Retry created duplicate payments';end if;
 if (select remaining_amount from public.bb_bank_balance_snapshot where transaction_id='TX-A')<>60 then raise exception 'Incorrect TX-A remaining';end if;
 if (select remaining_amount from public.bb_bank_balance_snapshot where transaction_id='TX-B')<>140 then raise exception 'Incorrect TX-B remaining';end if;
 raise notice 'PASS successful allocations and idempotent retry';
 -- Simulate second bank trigger failure AFTER the invoice and first payment insert.
 begin
  perform public.bb_sales_save_invoice_multi_bank_v1(
   jsonb_build_object('invoiceId','T-FAIL','invoiceNo','T-FAIL','locationCode','TK-01','customerId','C1','currency','USD','paymentMethod','Partially Paid in Bank','grandTotal',100,'amountPaid',85),
   jsonb_build_object('settlement_request_id','22222222-2222-4222-8222-222222222222','settlement_sources',jsonb_build_array(
    jsonb_build_object('kind','BANK_REGISTER','source_id','TX-A','source_currency','USD','source_amount','30','invoice_amount','30'),
    jsonb_build_object('kind','BANK_REGISTER','source_id','TX-B','source_currency','USD','source_amount','55','invoice_amount','55'))));
  raise exception 'FAILED: injected second payment unexpectedly succeeded';
 exception when others then
  get stacked diagnostics v_error=message_text;
  if v_error not like '%Injected second-bank failure%' then raise exception 'Unexpected rejection: %',v_error;end if;
 end;
 if exists(select 1 from public.invoices where invoice_id='T-FAIL') then raise exception 'Failed invoice was not rolled back';end if;
 if exists(select 1 from public.payments where invoice_id='T-FAIL') then raise exception 'First payment was not rolled back';end if;
 if exists(select 1 from public.bb_invoice_multi_bank_requests where invoice_id='T-FAIL') then raise exception 'Failed request was not rolled back';end if;
 if (select remaining_amount from public.bb_bank_balance_snapshot where transaction_id='TX-A')<>60 then raise exception 'First bank was deducted after rollback';end if;
 if (select remaining_amount from public.bb_bank_balance_snapshot where transaction_id='TX-B')<>140 then raise exception 'Second bank was deducted after rollback';end if;
 raise notice 'PASS rollback of invoice, first bank payment and both wallet balances';

 -- Verify a retry with changed source amount never reuses prior settlement ID.
 begin
  perform public.bb_sales_save_invoice_multi_bank_v1(v_input,
    jsonb_set(v_payment,'{settlement_sources,0,source_amount}',to_jsonb('41'::text)));
  raise exception 'Unexpected changed-retry success';
 exception when others then
  get stacked diagnostics v_error=message_text;
  if v_error not like '%already belongs to another payload%' then
   raise exception 'Wrong changed-retry rejection: %',v_error;
  end if;
 end;
 if (select count(*) from public.payments where invoice_id='T-OK')<>2 then
  raise exception 'Duplicate payments after changed retry';
 end if;
 raise notice 'PASS changed settlement retry rejected';
 -- Insufficient funds must reject the entire proposed invoice.
 begin
  perform public.bb_sales_save_invoice_multi_bank_v1(
    jsonb_build_object('invoiceId','T-OVER','invoiceNo','T-OVER','locationCode','TK-01','customerId','C1','currency','USD','paymentMethod','Partially Paid in Bank','grandTotal',300,'amountPaid',250),
    jsonb_build_object('settlement_request_id','33333333-3333-4333-8333-333333333333','settlement_sources',jsonb_build_array(
      jsonb_build_object('kind','BANK_REGISTER','source_id','TX-A','source_currency','USD','source_amount','70','invoice_amount','70'),
      jsonb_build_object('kind','BANK_REGISTER','source_id','TX-B','source_currency','USD','source_amount','180','invoice_amount','180'))));
  raise exception 'Unexpected overdraft success';
 exception when others then
  get stacked diagnostics v_error=message_text;
  if v_error not like '%Insufficient registered bank balance%' then
   raise exception 'Wrong overdraft rejection: %',v_error;
  end if;
 end;
 if exists(select 1 from public.invoices where invoice_id='T-OVER') then
  raise exception 'Rejected overdraft saved an invoice';
 end if;
 raise notice 'PASS overspend rejected without invoice save';


 -- Full Bank payment should settle exactly the grand total using two transfers.
 v_response:=public.bb_sales_save_invoice_multi_bank_v1(
  jsonb_build_object('invoiceId','T-FULL','invoiceNo','T-FULL','locationCode','TK-01','customerId','C1','currency','USD','paymentMethod','Bank','grandTotal',50,'amountPaid',50),
  jsonb_build_object('settlement_request_id','44444444-4444-4444-8444-444444444444','settlement_sources',jsonb_build_array(
   jsonb_build_object('kind','BANK_REGISTER','source_id','TX-A','source_currency','USD','source_amount','20','invoice_amount','20'),
   jsonb_build_object('kind','BANK_REGISTER','source_id','TX-B','source_currency','USD','source_amount','30','invoice_amount','30'))));
 if v_response->>'sourceCount'<>'2' then raise exception 'Full bank invoice missing allocations';end if;
 if (select sum(amount) from public.payments where invoice_id='T-FULL')<>50 then raise exception 'Full bank paid amount mismatch';end if;
 if (select remaining_amount from public.bb_bank_balance_snapshot where transaction_id='TX-A')<>40 then raise exception 'Full bank TX-A remaining incorrect';end if;
 if (select remaining_amount from public.bb_bank_balance_snapshot where transaction_id='TX-B')<>110 then raise exception 'Full bank TX-B remaining incorrect';end if;
 raise notice 'PASS full bank invoice with two transfers';


 -- Two registered KHR balances fund a partially paid KHR invoice.
 v_response:=public.bb_sales_save_invoice_multi_bank_v1(
  jsonb_build_object('invoiceId','T-KHR','invoiceNo','T-KHR','locationCode','TK-01','customerId','C1','currency','KHR','paymentMethod','Partially Paid in Bank','grandTotal',4000,'amountPaid',3000),
  jsonb_build_object('settlement_request_id','55555555-5555-4555-8555-555555555555','settlement_sources',jsonb_build_array(
   jsonb_build_object('kind','BANK_REGISTER','source_id','TX-KHR-1','source_currency','KHR','source_amount','1000','invoice_amount','1000'),
   jsonb_build_object('kind','BANK_REGISTER','source_id','TX-KHR-2','source_currency','KHR','source_amount','2000','invoice_amount','2000'))));
 if v_response->>'sourceCount'<>'2' then raise exception 'KHR payment source count wrong';end if;
 if (select remaining_amount from public.bb_bank_balance_snapshot where transaction_id='TX-KHR-1')<>250 then raise exception 'KHR source 1 balance wrong';end if;
 if (select remaining_amount from public.bb_bank_balance_snapshot where transaction_id='TX-KHR-2')<>750 then raise exception 'KHR source 2 balance wrong';end if;
 raise notice 'PASS two-source KHR bank allocation';


 -- A fully paid KHR invoice must consume exactly its total.
 v_response:=public.bb_sales_save_invoice_multi_bank_v1(
  jsonb_build_object('invoiceId','T-KHR-FULL','invoiceNo','T-KHR-FULL','locationCode','TK-01','customerId','C1','currency','KHR','paymentMethod','Bank','grandTotal',500,'amountPaid',500),
  jsonb_build_object('settlement_request_id','66666666-6666-4666-8666-666666666666','settlement_sources',jsonb_build_array(
   jsonb_build_object('kind','BANK_REGISTER','source_id','TX-KHR-1','source_currency','KHR','source_amount','200','invoice_amount','200'),
   jsonb_build_object('kind','BANK_REGISTER','source_id','TX-KHR-2','source_currency','KHR','source_amount','300','invoice_amount','300'))));
 if (select sum(amount) from public.payments where invoice_id='T-KHR-FULL')<>500 then raise exception 'Fully paid KHR amount mismatch';end if;
 if (select remaining_amount from public.bb_bank_balance_snapshot where transaction_id='TX-KHR-1')<>50 then raise exception 'Fully paid KHR source 1 mismatch';end if;
 if (select remaining_amount from public.bb_bank_balance_snapshot where transaction_id='TX-KHR-2')<>450 then raise exception 'Fully paid KHR source 2 mismatch';end if;
 raise notice 'PASS full KHR bank invoice with two transfers';
 -- V1 deliberately rejects cross-currency settlement rather than applying an unverified FX conversion.
 begin
  perform public.bb_sales_save_invoice_multi_bank_v1(
   jsonb_build_object('invoiceId','T-MIX','invoiceNo','T-MIX','locationCode','TK-01','customerId','C1','currency','USD','paymentMethod','Partially Paid in Bank','grandTotal',100,'amountPaid',40),
   jsonb_build_object('settlement_request_id','77777777-7777-4777-8777-777777777777','settlement_sources',jsonb_build_array(
    jsonb_build_object('kind','BANK_REGISTER','source_id','TX-A','source_currency','USD','source_amount','20','invoice_amount','20'),
    jsonb_build_object('kind','BANK_REGISTER','source_id','TX-KHR-1','source_currency','KHR','source_amount','20','invoice_amount','20'))));
  raise exception 'Unexpected mixed-currency settlement success';
 exception when others then
  get stacked diagnostics v_error=message_text;
  if v_error not like '%wrong customer or currency%' then raise exception 'Unexpected mixed currency rejection: %',v_error;end if;
 end;
 if exists(select 1 from public.invoices where invoice_id='T-MIX') then raise exception 'Mixed-currency rejection persisted invoice';end if;
 raise notice 'PASS mixed-currency allocation safely rejected';

 -- Legacy verified bank rows may have blank receiving-bank names. Admin must
 -- explicitly pick a concrete Payment Bank; no guessed or silent backfill.
 begin
  perform public.bb_sales_save_invoice_multi_bank_v1(
   jsonb_build_object('invoiceId','T-BANK-BLANK','invoiceNo','T-BANK-BLANK','locationCode','TK-01','customerId','C1','currency','USD','paymentMethod','Partially Paid in Bank','grandTotal',100,'amountPaid',55),
   jsonb_build_object('settlement_request_id','88888888-8888-4888-8888-888888888888','settlement_sources',jsonb_build_array(
    jsonb_build_object('kind','BANK_REGISTER','source_id','TX-OLD-A','source_currency','USD','source_amount','20','invoice_amount','20'),
    jsonb_build_object('kind','BANK_REGISTER','source_id','TX-OLD-B','source_currency','USD','source_amount','35','invoice_amount','35'))));
  raise exception 'Blank receiving bank unexpectedly allowed';
 exception when others then
  get stacked diagnostics v_error=message_text;
  if v_error not like '%Select the actual receiving Payment Bank%' then
   raise exception 'Wrong blank-bank rejection: %',v_error;
  end if;
 end;
 if exists(select 1 from public.invoices where invoice_id='T-BANK-BLANK') then
  raise exception 'Blank-bank rejection committed invoice';
 end if;

 v_response:=public.bb_sales_save_invoice_multi_bank_v1(
  jsonb_build_object('invoiceId','T-BANK-BLANK','invoiceNo','T-BANK-BLANK','locationCode','TK-01','customerId','C1','currency','USD','paymentMethod','Partially Paid in Bank','paymentBank','ABA','grandTotal',100,'amountPaid',55),
  jsonb_build_object('settlement_request_id','88888888-8888-4888-8888-888888888888','settlement_sources',jsonb_build_array(
   jsonb_build_object('kind','BANK_REGISTER','source_id','TX-OLD-A','source_currency','USD','source_amount','20','invoice_amount','20'),
   jsonb_build_object('kind','BANK_REGISTER','source_id','TX-OLD-B','source_currency','USD','source_amount','35','invoice_amount','35'))));
 if v_response->>'sourceCount'<>'2' then raise exception 'Legacy bank payments not saved';end if;
 if (select count(*) from public.payments where invoice_id='T-BANK-BLANK' and bank_payment='ABA')<>2 then
  raise exception 'Explicit admin-selected bank not on both payments';end if;
 if (select remaining_amount from public.bb_bank_balance_snapshot where transaction_id='TX-OLD-A')<>80 then
  raise exception 'Old bank A remaining amount incorrect';end if;
 if (select remaining_amount from public.bb_bank_balance_snapshot where transaction_id='TX-OLD-B')<>115 then
  raise exception 'Old bank B remaining amount incorrect';end if;
 raise notice 'PASS legacy null bank names with explicit admin Payment Bank and both allocations';


end $test$;
