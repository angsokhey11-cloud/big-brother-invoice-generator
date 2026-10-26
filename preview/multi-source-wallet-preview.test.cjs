const a=require('node:assert/strict');
const w=require('./multi-source-wallet-preview.cjs');
w.reset('C1','USD');
const rows=[{customer_id:'C1',transaction_id:'BANK-1',currency:'USD',remaining_amount:22.20},{customer_id:'C1',transaction_id:'BANK-2',currency:'USD',remaining_amount:284.60},{customer_id:'C2',transaction_id:'BANK-3',currency:'USD',remaining_amount:999}];
a.equal(w.loadBankRows({customerId:'C1',currency:'USD',rows}).selected.length,0);
w.choose('BANK_REGISTER','BANK-1','22.20');
w.choose('BANK_REGISTER','BANK-2','100.00');
a.equal(w.snapshot().total,'122.20');
a.equal(w.snapshot().saveEnabled,false);
a.throws(()=>w.choose('BANK_REGISTER','BANK-2','300'),/exceeds/);
a.throws(()=>w.choose('BANK_REGISTER','BANK-3','10'),/not found/);
w.unchoose('BANK_REGISTER','BANK-1');
a.equal(w.snapshot().total,'100.00');
w.reset('C2','USD');a.equal(w.snapshot().selected.length,0);

// Regression: selections survive a refresh only while amounts remain available.
w.reset('C1','USD');
w.loadBankRows({customerId:'C1',currency:'USD',rows});
w.choose('BANK_REGISTER','BANK-1','22.20');
w.choose('BANK_REGISTER','BANK-2','100.00');
a.equal(w.loadBankRows({customerId:'C1',currency:'USD',rows}).selected.length,2);
const lowered=rows.map(r=>r.transaction_id==='BANK-1'?{...r,remaining_amount:10}:r);
a.equal(w.loadBankRows({customerId:'C1',currency:'USD',rows:lowered}).selected.length,1);
a.equal(w.snapshot().total,'100.00');
// New customer's bank balance cannot be selected with the old customer active.
a.throws(()=>w.choose('BANK_REGISTER','BANK-3','10'),/not found/);
// Fractional riel amounts are not allowed.
w.reset('C1','KHR');
w.loadBankRows({customerId:'C1',currency:'KHR',rows:[{customer_id:'C1',transaction_id:'KHR-1',currency:'KHR',remaining_amount:5000}]});
a.throws(()=>w.choose('BANK_REGISTER','KHR-1','100.5'),/precision/);
w.choose('BANK_REGISTER','KHR-1','1000');
a.equal(w.snapshot().total,'1000');
w.reset('C2','USD');
a.equal(w.snapshot().selected.length,0);


 // Currency switch for same customer must invalidate every prior selection.
w.reset('C1','USD');
w.loadBankRows({customerId:'C1',currency:'USD',rows});
w.choose('BANK_REGISTER','BANK-1','10.00');
const khrRows=[{customer_id:'C1',transaction_id:'KHR-2',currency:'KHR',remaining_amount:9000}];
const afterCurrencyChange=w.loadBankRows({customerId:'C1',currency:'KHR',rows:khrRows});
a.equal(afterCurrencyChange.currency,'KHR');
a.equal(afterCurrencyChange.selected.length,0);
a.equal(afterCurrencyChange.total,'0');
a.throws(()=>w.choose('BANK_REGISTER','BANK-1','10'),/not found/);
w.choose('BANK_REGISTER','KHR-2','5000');
a.equal(w.snapshot().total,'5000');

// A changed bank-currency field must not preserve a prior allocation.
w.reset('C1','USD');
w.loadBankRows({customerId:'C1',currency:'USD',rows});
w.choose('BANK_REGISTER','BANK-1','10.00');
const switchedSource=rows.map(r=>r.transaction_id==='BANK-1'?{...r,currency:'KHR'}:r);
a.equal(w.loadBankRows({customerId:'C1',currency:'USD',rows:switchedSource}).selected.length,0);
a.throws(()=>w.choose('BANK_REGISTER','BANK-1','10'),/Currency conversion/);

console.log('Wallet preview regression tests passed');
