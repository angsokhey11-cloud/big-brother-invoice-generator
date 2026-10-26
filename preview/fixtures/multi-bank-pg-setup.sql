-- Disposable PostgreSQL integration fixture. NEVER run against BIG BROTHER production.
create role anon nologin;
create role authenticated nologin;
create schema if not exists auth;
create function auth.uid() returns uuid language sql stable as $$select '00000000-0000-4000-8000-000000000001'::uuid$$;
create table public.customers(customer_id text primary key,active boolean default true);
create table public.invoices(invoice_id text primary key,invoice_no text,invoice_date date,customer_id text,customer_name_snapshot text,location_code text,salesperson_staff_id text,salesperson_name_snapshot text,grand_total numeric,amount_paid numeric,exchange_rate numeric,currency text);
create table public.bb_verified_bank_transactions(transaction_id text primary key,customer_id text,bank_name text,currency text,status text,amount numeric,used_payment_id text,used_at timestamptz);
create table public.payments(payment_id text primary key,invoice_id text,invoice_no_snapshot text,payment_date date,customer_id text,customer_name_snapshot text,location_code text,salesperson_staff_id text,salesperson_name_snapshot text,payment_method text,bank_payment text,bank_reference text,currency text,exchange_rate numeric,amount numeric,note text,transaction_id text,payment_source text);
create table public.bb_bank_balance_allocations(transaction_id text,payment_id text,payment_source text,applied_bank_amount numeric,applied_invoice_amount numeric,invoice_currency text,reversed_at timestamptz);
create view public.bb_bank_balance_snapshot as select b.transaction_id,b.amount-coalesce(sum(a.applied_bank_amount) filter (where a.reversed_at is null),0) as remaining_amount from public.bb_verified_bank_transactions b left join public.bb_bank_balance_allocations a on a.transaction_id=b.transaction_id group by b.transaction_id,b.amount;
create function public.bb_has_module_access(text,text) returns boolean language sql as $$select true$$;
create function public.bb_has_sales_write() returns boolean language sql as $$select true$$;
create function public.bb_has_location_access(text) returns boolean language sql as $$select true$$;
create sequence public.test_pay_seq;
create function public.bb_next_prefixed_id(regclass,text,text,int) returns text language sql as $$select 'PAY-'||nextval('public.test_pay_seq')::text$$;
create function public.bb_sales_save_invoice_bundle_core_access_v1(p_invoice jsonb,p_payment jsonb) returns jsonb language plpgsql as $$
declare v_id text:=p_invoice->>'invoiceId';v_total numeric:=(p_invoice->>'grandTotal')::numeric;v_paid numeric:=(p_invoice->>'amountPaid')::numeric;
begin
 if v_paid>v_total then raise exception 'Overpayment';end if;
 insert into public.invoices(invoice_id,invoice_no,invoice_date,customer_id,customer_name_snapshot,location_code,grand_total,amount_paid,exchange_rate,currency)
 values(v_id,p_invoice->>'invoiceNo',current_date,p_invoice->>'customerId','Test',p_invoice->>'locationCode',v_total,v_paid,1,p_invoice->>'currency');
 return jsonb_build_object('invoiceId',v_id,'success',true);
end $$;
create function public.test_bank_guard() returns trigger language plpgsql as $$
declare v_bank public.bb_verified_bank_transactions%rowtype;v_remaining numeric;
begin
 select * into v_bank from public.bb_verified_bank_transactions where transaction_id=new.transaction_id for update;
 if not found or v_bank.status<>'AVAILABLE' or v_bank.customer_id<>new.customer_id or v_bank.currency<>new.currency then raise exception 'Invalid bank';end if;
 select remaining_amount into v_remaining from public.bb_bank_balance_snapshot where transaction_id=new.transaction_id;
 if new.amount<=0 or new.amount>v_remaining then raise exception 'Insufficient bank balance';end if;
 if new.transaction_id='TX-B' and new.amount=55 then raise exception 'Injected second-bank failure';end if;
 insert into public.bb_bank_balance_allocations values(new.transaction_id,new.payment_id,'INVOICE',new.amount,new.amount,new.currency,null);
 if new.amount=v_remaining then update public.bb_verified_bank_transactions set status='USED' where transaction_id=new.transaction_id;end if;
 return new;
end $$;
create trigger test_guard before insert on public.payments for each row execute function public.test_bank_guard();
insert into public.customers values('C1',true);
insert into public.bb_verified_bank_transactions(transaction_id,customer_id,bank_name,currency,status,amount)
 values('TX-A','C1','ABA','USD','AVAILABLE',100),('TX-B','C1','ABA','USD','AVAILABLE',200),('TX-KHR-1','C1','ABA','KHR','AVAILABLE',1250),('TX-KHR-2','C1','ABA','KHR','AVAILABLE',2750);
-- Older, verified bank-register entries can have no bank_name.
insert into public.bb_verified_bank_transactions(transaction_id,customer_id,bank_name,currency,status,amount)
 values('TX-OLD-A','C1',null,'USD','AVAILABLE',100),
       ('TX-OLD-B','C1',null,'USD','AVAILABLE',150);
