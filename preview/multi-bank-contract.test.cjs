/* BIG BROTHER MULTI-BANK — offline, zero-database-write contract checks.
 * Run: node preview/multi-bank-contract.test.cjs
 * No Supabase credentials or production records required.
 */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const base=path.resolve(__dirname,'..');
const sql=fs.readFileSync(path.join(base,'sql/multi-bank-atomic-invoice-save-v1.sql'),'utf8');
const adapter=fs.readFileSync(path.join(base,'supabase-adapter.js'),'utf8');
const panel=fs.readFileSync(path.join(base,'preview/multi-source-wallet-panel.js'),'utf8');
const tests=[
 ['single SQL transaction boundary',()=>assert.match(sql,/\nbegin;[\s\S]*commit;\s*$/)],
 ['no trailing statements after COMMIT',()=>assert.equal((sql.match(/\ncommit;/g)||[]).length,1)],
 ['source rows locked',()=>assert.match(sql,/for update;/i)],
 ['source ID locks ordered',()=>assert.match(sql,/array_agg\(distinct upper/)],
 ['bank allocation trigger reused',()=>assert.match(sql,/insert into public\.payments/)],
 ['all allocations verified',()=>assert.match(sql,/Missing bank allocation after invoice save/)],
 ['exact source and amount verified',()=>assert.match(sql,/Multi-bank allocation source or amount mismatch/)],
 ['all bank payment IDs returned',()=>assert.match(sql,/'paymentIds',v_payment_ids/)],
 ['legacy paymentId compatibility',()=>assert.match(sql,/'paymentId',v_payment_ids->>0/)],
 ['idempotency keyed by UUID',()=>assert.match(sql,/request_id uuid primary key/)],
 ['same-currency bank-only restriction',()=>assert.match(sql,/Source currency differs from invoice currency/)],
 ['full bank invoice guarded',()=>assert.match(sql,/Full Bank payment must cover entire invoice/)],
 ['partial bank invoice guarded',()=>assert.match(sql,/Partially paid invoice must have a positive outstanding balance/)],
 ['invoice payment reconciled',()=>assert.match(sql,/Payment allocations do not equal the saved invoice amount/)],
 ['no auto privilege grant',()=>assert.match(sql,/revoke all on function public\.bb_sales_save_invoice_multi_bank_v1/)],
 ['feature disabled by default',()=>assert.match(adapter,/BB_MULTI_BANK_SAVE_ENABLED!==true/)],
 ['secure Local Brain UUID fallback',()=>{const fallback=adapter.split('function bbNewSettlementRequestId()')[1]?.split('window.postSalesInvoiceBundle')[0]||'';assert.match(fallback,/getRandomValues\(bytes\)/);assert.doesNotMatch(fallback,/Math\.random\(/);assert.match(fallback,/bytes\[6\]/);assert.match(fallback,/bytes\[8\]/)}],
 ['definitive error clears multi-bank retry token',()=>assert.match(adapter,/if\(multiBank\)sessionStorage\.removeItem\('bb-multi-bank-request:'\+invoiceId\)/)],
 ['backend RPC route',()=>assert.match(adapter,/bb_sales_save_invoice_multi_bank_v1/)],
 ['picker-to-save payload connected',()=>assert.match(adapter,/settlement_sources:selectedWallet\.settlement_sources/)],
 ['one-item preview cannot fall through',()=>assert.match(panel,/v\.selected\.length<2\)throw/)],
 ['wallet customer revalidated',()=>assert.match(panel,/customer!==activeCustomer/)],
 ['wallet currency revalidated',()=>assert.match(panel,/activeCurrency!==currency/)],
 ['invoice currency switch clears wallet immediately',()=>assert.match(panel,/event\.target\?\.id!=='currency'[\s\S]*wallet\.reset\(customer,currency\)/)],
 ['Sync Bank refresh keeps eligible selection',()=>{const refresh=panel.split("document.addEventListener('bb:bank-cache-updated'")[1]?.split('function clearMultiBankSelection')[0]||'';assert.match(refresh,/wallet\.loadBankRows/);assert.doesNotMatch(refresh,/wallet\.reset\(customer,currency\)/)}],
];
for(const [name,fn] of tests){fn();console.log('PASS',name)}
console.log(tests.length+' static contract checks passed. This does NOT validate SQL execution or concurrency.');
