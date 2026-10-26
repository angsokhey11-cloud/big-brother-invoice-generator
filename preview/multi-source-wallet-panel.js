/* BIG BROTHER multi-source visual preview — isolated branch, no save hooks */
(function(){
'use strict';
const wallet=window.BBMultiSourceWalletPreview;
if(!wallet)return;
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let rows=[],customer='',currency='USD';
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
function render(){
 const p=ensure();if(!p)return;
 const selected=wallet.snapshot();
 p.innerHTML='<div style="font-weight:900;font-size:15px;margin-bottom:4px">Multi-Source Wallet — Development Preview</div>'+
 '<div style="font-size:11px;color:#8a4a00;margin-bottom:10px">Preview only. Existing invoice Save cannot use multiple sources yet.</div>'+
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
 const d=event.detail||{};customer=String(d.customerId||'');
 currency=document.getElementById('currency')?.value==='KHR'?'KHR':'USD';
 wallet.reset(customer,currency);
 wallet.loadBankRows({customerId:customer,currency,rows:d.balances||[]});
 rows=(Array.isArray(d.balances)?d.balances:[]).filter(x=>String(x.customer_id)===customer&&Number(x.remaining_amount)>0).map(x=>({kind:'BANK_REGISTER',id:String(x.transaction_id),currency:String(x.currency||'').toUpperCase(),available:String(x.remaining_amount)}));
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
document.addEventListener('DOMContentLoaded',()=>{render()},{once:true});
})();
