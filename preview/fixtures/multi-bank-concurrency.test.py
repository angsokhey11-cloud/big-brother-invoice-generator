#!/usr/bin/env python3
"""Concurrent wallet overspend regression, disposable PostgreSQL only."""
import concurrent.futures
import os
import subprocess

DB = ["psql", "-X", "-v", "ON_ERROR_STOP=1", "-h", "localhost",
      "-U", "postgres", "-d", "multibank_test", "-At", "-c"]

def attempt(n):
    invoice = f"T-RACE-{n}"
    request = f"88888888-8888-4888-8888-{n:012d}"
    sql = f"""
select public.bb_sales_save_invoice_multi_bank_v1(
 jsonb_build_object('invoiceId','{invoice}','invoiceNo','{invoice}',
  'locationCode','TK-01','customerId','C1','currency','USD',
  'paymentMethod','Partially Paid in Bank','grandTotal',100,'amountPaid',60),
 jsonb_build_object('settlement_request_id','{request}',
  'settlement_sources',jsonb_build_array(
   jsonb_build_object('kind','BANK_REGISTER','source_id','TX-A','source_currency','USD','source_amount','35','invoice_amount','35'),
   jsonb_build_object('kind','BANK_REGISTER','source_id','TX-B','source_currency','USD','source_amount','25','invoice_amount','25'))));
"""
    return subprocess.run(DB + [sql], capture_output=True, text=True,
                          env=os.environ.copy())

with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
    results = list(pool.map(attempt, [1, 2]))
wins = [x for x in results if x.returncode == 0]
losses = [x for x in results if x.returncode != 0]
for i, result in enumerate(results, 1):
    print(f"Attempt {i}: {'ACCEPTED' if result.returncode == 0 else 'REJECTED'}")
    if result.returncode:
        print(result.stderr.strip()[-700:])
if len(wins) != 1 or len(losses) != 1:
    raise SystemExit("FAIL: concurrent allocations must have exactly one winner")
if "Insufficient registered bank balance" not in losses[0].stderr:
    raise SystemExit("FAIL: loser rejected for unexpected reason")

verification = subprocess.run(DB + ["""
select
  (select count(*) from public.invoices where invoice_id like 'T-RACE-%'),
  (select count(*) from public.payments where invoice_id like 'T-RACE-%'),
  (select remaining_amount from public.bb_bank_balance_snapshot where transaction_id='TX-A'),
  (select remaining_amount from public.bb_bank_balance_snapshot where transaction_id='TX-B');
"""], capture_output=True, text=True, env=os.environ.copy(), check=True)
actual = verification.stdout.strip().split("|")
if actual != ["1", "2", "5", "85"]:
    raise SystemExit(f"FAIL: race produced incorrect invoice/payment/balances {actual}")
print("PASS concurrent overspend prevented: one invoice, two payments, exact balances")
