/* BIG BROTHER multi-source visual preview — isolated branch, no save hooks */
(function(){
'use strict';
const wallet=window.BBMultiSourceWalletPreview;
// Admin pilot must be explicitly opted in. Hide the unfinished picker from staff.
if(!wallet || window.BB_MULTI_BANK_SAVE_ENABLED!==true)return;
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let rows=[],customer='',currency='USD';
// Customer identity, not a typed name or the previous Sync Bank response,
// owns every visible wallet balance and checkbox.
function activeCustomerId(){
 return String(window.bbGetSelectedCustomerForBank?.()?.customerId||'').trim();
}
function reconcileCustomer(){
 const current=activeCustomerId();
 // The low-level preview engine also listens to cache events. A late event
 // could otherwise restore its previous-customer state before this panel
 // rejects the event, so reconcile BOTH the displayed and engine IDs.
 if(current!==customer || wallet.snapshot().customerId!==current){
  customer=current;
  rows=[];
  currency=document.getElementById('currency')?.value==='KHR'?'KHR':'USD';
  wallet.reset(customer,currency);
 }
 return current;
}
function ensure(){
 const anchor=document.getElementById('bbRegisteredPayments');if(!anchor)return null;
 let panel=document.getElementById('bbMultiWalletPreview');
 if(!panel){
  panel=document.createElement('section');panel.id='bbMultiWalletPreview';
  panel.style.cssText='margin:12px 0;padding:14px;background:#f2f7fd;border:1px solid #c9daee;border-radius:12px;font:13px Arial,sans-serif;color:#17457a';
  anchor.insertAdjacentElement('afterend',panel);
 }
 return panel;
}
function syncLegacyBankReference(selected){
 // When two transfers are chosen, their real transaction IDs travel in
 // settlement_sources. The old single-reference text field is irrelevant.
 const method=document.getElementById('paymentMethod')?.value||'';
 const bankMethod=method==='Bank'||method==='Partially Paid in Bank';
 const hasBankPortion=bankMethod||method==='Cash + Bank';
 const usingWallet=bankMethod&&selected.selected.length>=2;
 const row=document.getElementById('transactionIdRow');
 if(!row)return;
 // Cash + Bank still requires its own registered/manual bank Transaction ID.
 // Hiding it here previously overrode split-payment-v1's visibility rule.
 row.style.display=hasBankPortion&&!usingWallet?'':'none';
 let note=document.getElementById('bbMultiWalletReferencesNotice');
 if(!note){
  note=document.createElement('div');
  note.id='bbMultiWalletReferencesNotice';
  note.style.cssText='font-size:11px;color:#17613d;font-weight:700;margin:4px 0 10px';
  row.insertAdjacentElement('afterend',note);
 }
 note.style.display=usingWallet?'block':'none';
 note.textContent='Using '+selected.selected.length+' selected registered bank transaction IDs automatically. No manual Transaction ID required.';
}
function render(){
 // Never render an old customer's cached rows, even if no new Sync Bank
 // event was emitted after the selected customer changed.
 reconcileCustomer();
 const p=ensure();if(!p)return;
 const method=document.getElementById('paymentMethod')?.value||'';
 const bankMethod=method==='Bank'||method==='Partially Paid in Bank';
 // Multi-bank pilot V1 does NOT support Cash + Bank. Clear its selections
 // when switching methods so split payments use the original single-ID path.
 let selected=wallet.snapshot();
 if(!bankMethod&&selected.selected.length){
  wallet.reset(customer,currency);
  wallet.loadBankRows({customerId:customer,currency,rows:rows.map(r=>({
   customer_id:customer,transaction_id:r.id,currency:r.currency,remaining_amount:r.available
  }))});
  selected=wallet.snapshot();
 }
 p.style.display=bankMethod?'':'none';
 syncLegacyBankReference(selected);
 if(!bankMethod)return;
 p.innerHTML='<div style="font-weight:900;font-size:15px;margin-bottom:4px">Multi-Source Wallet — Development Preview</div>'+
 '<div style="font-size:11px;color:#8a4a00;margin-bottom:10px">'+(window.BB_MULTI_BANK_SAVE_ENABLED===true?'ADMIN PILOT: This selection will allocate real registered bank balances if the server approves invoice Save.':'Preview only. Existing invoice Save cannot use multiple sources yet.')+'</div>'+
 (!rows.length?'<div>No registered balances loaded. Press Sync Bank first.</div>':
 rows.map(r=>{
 const key=r.kind+':'+r.id,used=selected.selected.find(x=>x.kind+':'+x.id===key);
 return '<div style="display:flex;align-items:center;gap:8px;border-top:1px solid #dbe6f2;padding:9px 0">'+
 '<label style="display:flex;align-items:center;gap:6px;min-width:0;flex:1"><input type="checkbox" data-wallet-id="'+escape(r.id)+'" '+(used?'checked':'')+' '+(r.currency!==currency?'disabled':'')+'>'+
 '<span style="overflow-wrap:anywhere">'+escape(r.id)+'<small style="display:block;color:#667c91">Available '+escape(r.available)+' '+escape(r.currency)+'</small></span></label>'+
 '<input aria-label="Amount for '+escape(r.id)+'" data-wallet-amount="'+escape(r.id)+'" inputmode="decimal" style="max-width:90px;padding:6px;border:1px solid #c6d4e6;border-radius:6px" value="'+escape(used?.useAmount||'')+'" placeholder="Amount" '+(r.currency!==currency?'disabled':'')+'></div>';
 }).join(''))+
 '<div style="font-weight:bold;padding-top:8px">Selected: '+escape(selected.total)+' '+escape(currency)+'</div>'+
 '<div id="bbMultiWalletPreviewError" style="font-size:11px;color:#ba3434"></div>';
 p.querySelectorAll('[data-wallet-id]').forEach(c=>c.addEventListener('change',()=>{
  const id=c.dataset.walletId,amount=p.querySelector('[data-wallet-amount="'+CSS.escape(id)+'"]');
  try{if(c.checked)wallet.choose('BANK_REGISTER',id,amount.value||rows.find(x=>x.id===id)?.available);else wallet.unchoose('BANK_REGISTER',id);render();}
  catch(e){c.checked=false;p.querySelector('#bbMultiWalletPreviewError').textContent=e.message;}
 }));
 p.querySelectorAll('[data-wallet-amount]').forEach(input=>input.addEventListener('change',()=>{
  const id=input.dataset.walletAmount,enabled=!!p.querySelector('[data-wallet-id="'+CSS.escape(id)+'"]')?.checked;
  if(!enabled)return;
  try{wallet.choose('BANK_REGISTER',id,input.value);render();}
  catch(e){p.querySelector('#bbMultiWalletPreviewError').textContent=e.message;}
 }));
}
document.addEventListener('bb:bank-cache-updated',event=>{
 const d=event.detail||{};
 const active=reconcileCustomer();
 // Ignore an old/late bank-sync event for a previous customer. No external
 // event is allowed to replace the current customer's wallet context.
 if(!active||String(d.customerId||'').trim()!==active){
  render();
  return;
 }
 currency=document.getElementById('currency')?.value==='KHR'?'KHR':'USD';
 const eligible=(Array.isArray(d.balances)?d.balances:[]).filter(x=>
  String(x.customer_id||'').trim()===active&&
  String(x.transaction_id||'').trim()&&
  Number.isFinite(Number(x.remaining_amount))&&Number(x.remaining_amount)>0
 );
 // Preserve amounts only for unchanged, eligible sources belonging to this
 // customer; the selector clears outdated/insufficient allocations.
 wallet.loadBankRows({customerId:active,currency,rows:eligible});
 rows=eligible.map(x=>({kind:'BANK_REGISTER',id:String(x.transaction_id),currency:String(x.currency||'').toUpperCase(),available:String(x.remaining_amount)}));
 render();
});
function clearMultiBankSelection(){
  customer='';rows=[];currency='USD';
  wallet.reset('','USD');
  document.getElementById('bbMultiWalletPreview')?.remove();
}
const originalClearAfterSuccess=window.clearAllAfterSuccessfulSave;
if(typeof originalClearAfterSuccess==='function'){
 window.clearAllAfterSuccessfulSave=function(){
  clearMultiBankSelection();
  return originalClearAfterSuccess.apply(this,arguments);
 };
}
const originalClearAll=window.clearAll;
if(typeof originalClearAll==='function'){
 window.clearAll=function(){
  clearMultiBankSelection();
  return originalClearAll.apply(this,arguments);
 };
}
window.BBInvoiceMultiSourceSelection=function(){
 // Fail closed for any stale customer, even if the app changed selection
 // programmatically without firing an input/change event.
 const active=activeCustomerId();
 if(active!==customer) {
  const hadOldSelections=wallet.snapshot().selected.length>0;
  reconcileCustomer();
  render();
  if(hadOldSelections)
   throw Error('Customer wallet selection changed. Choose this customer\'s bank balances again.');
  return null;
 }
 const method=document.getElementById('paymentMethod')?.value||'';
 if(method!=='Bank'&&method!=='Partially Paid in Bank')return null;
 const v=wallet.snapshot();
 if(v.selected.length===0)return null;
 const activeCustomer=String(window.bbGetSelectedCustomerForBank?.()?.customerId||'');
 if(!customer || v.customerId!==customer || customer!==activeCustomer)
   throw Error('Customer wallet selection is stale. Sync Bank again.');
 const activeCurrency=document.getElementById('currency')?.value==='KHR'?'KHR':'USD';
 if(activeCurrency!==currency)throw Error('Invoice currency changed. Sync Bank again.');
 if(v.selected.length<2)throw Error('Select at least two bank transactions or clear this wallet preview before saving.');
 if(v.selected.some(x=>x.currency!==currency))throw Error('Currency mismatch in selected bank sources');
 return {
  settlement_sources:v.selected.map(x=>({
   kind:'BANK_REGISTER',source_id:x.id,source_currency:x.currency,
   source_amount:x.useAmount,invoice_amount:x.useAmount
  })),
  selected_total:v.total,currency:v.currency,customer_id:v.customerId
 };
};
// A currency switch invalidates previous payment selections immediately.
// Keep cached rows visible, but require fresh selections in the new currency.
document.addEventListener('change',event=>{
 if(event.target?.id!=='currency')return;
 const nextCurrency=event.target.value==='KHR'?'KHR':'USD';
 if(nextCurrency===currency)return;
 currency=nextCurrency;
 wallet.reset(customer,currency);
 wallet.loadBankRows({customerId:customer,currency,rows:rows.map(r=>({
  customer_id:customer,transaction_id:r.id,currency:r.currency,remaining_amount:r.available
 }))});
 render();
});
document.getElementById('paymentMethod')?.addEventListener('change',()=>render());
// A customer switch must invalidate visible transfers immediately; Sync Bank
// is not required to clear a previous customer's balance or selections.
function onCustomerChanged(){
 if(activeCustomerId()!==customer)render();
}
document.getElementById('customerName')?.addEventListener('input',onCustomerChanged);
document.getElementById('customerName')?.addEventListener('change',onCustomerChanged);
document.addEventListener('DOMContentLoaded',()=>{render()},{once:true});
})();
