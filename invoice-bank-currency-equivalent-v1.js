/* BIG BROTHER — Two-way invoice/bank currency equivalent V1.
   Bank balance stays in original bank currency; invoice payment in invoice currency.
   Uses invoice rate unless registered bank has an explicitly approved cross-rate.
   Both desktop and mobile. No automatic posting or wallet mutations. */
(function(){
'use strict';
if(window.__bbInvoiceBankEquivalentV1)return;
window.__bbInvoiceBankEquivalentV1=true;
const $=id=>document.getElementById(id);
const number=x=>{const n=Number(String(x??'').replace(/,/g,''));return Number.isFinite(n)?n:0};
const invoiceCurrency=()=>String(window.getCurrency?.()||$('currency')?.value||'USD').trim().toUpperCase();
const bankCurrency=()=>String($('bbActualBankCurrency')?.value||'USD').trim().toUpperCase();
function rate(){
 const r=number(window.getExchangeRate?.()||$('exchangeRate')?.value||$('exchangeRateInput')?.value);
 return r>1?r:0;
}
function money(value,cur){
 return (cur==='KHR'?'៛':'$')+Number(value).toLocaleString(undefined,{minimumFractionDigits:cur==='USD'?2:0,maximumFractionDigits:cur==='USD'?2:0});
}
function equivalent(value,from,to,r){
 if(from===to)return value;
 if(!(r>1))return NaN;
 return from==='KHR'?value/r:value*r;
}
function safeFloor(amount,cur){
 const scale=cur==='USD'?100:1;
 return Math.max(0,Math.floor((amount+1e-9)*scale)/scale);
}
function getTotal(){
 return number(String($('grandTotal')?.textContent||'').replace(/[^0-9.-]/g,''));
}
function ensure(){
 const actual=$('bbActualBankAmount');
 if(!actual||$('bbInvoiceBankEquivalentV1'))return;
 const panel=document.createElement('div');
 panel.id='bbInvoiceBankEquivalentV1';
 panel.style.cssText='margin-top:10px;padding:10px 12px;background:#eff7ff;border:1px solid #c9def5;border-radius:10px;color:#173d69;font-size:12px;line-height:1.5;grid-column:1/-1';
 panel.innerHTML='<div style="font-weight:800">Bank currency equivalent</div><div id="bbBankEquivalentText" aria-live="polite">Enter the bank amount to calculate.</div><div id="bbBankEquivalentAvailable" style="font-size:11px;color:#5b7088"></div><button type="button" id="bbBankEquivalentApply" style="display:none;margin-top:6px;border:0;border-radius:7px;background:#18558f;color:#fff;padding:7px 12px;font-weight:700;cursor:pointer">Apply equivalent to invoice</button>';
 const parent=actual.parentElement;
 parent?.insertAdjacentElement('afterend',panel);
 $('bbBankEquivalentApply')?.addEventListener('click',()=>apply());
}
let selection=null;
function activeCustomerId(){
 return String(window.bbGetSelectedCustomerForBank?.()?.customerId||'').trim();
}
function clearSelectedEquivalent(){
 selection=null;
 update();
}

function context(){
 const from=bankCurrency(),to=invoiceCurrency(),invoiceRate=rate(),actual=number($('bbActualBankAmount')?.value);
 const active=activeCustomerId();
 if(selection && (!active||selection.customer_id!==active))selection=null;
 const tx=selection&&selection.transaction_id===String($('transactionId')?.value||'').trim()?selection:null;
 const approved=tx?number(tx.approved_exchange_rate):0;
 const r=tx&&from!==to&&approved>1?approved:invoiceRate;
 const mismatch=!!(tx&&from!==to&&approved>1&&invoiceRate>1&&Math.abs(approved-invoiceRate)>0.000001);
 const available=tx?number(tx.remaining_amount):null;
 const converted=tx?equivalent(available,from,to,r):null;
 const method=String($('paymentMethod')?.value||'');
 const total=getTotal();
 const planned=method==='Cash + Bank'?number($('splitBankAmount')?.value):
  method==='Partially Paid in Bank'?number($('amountPaid')?.value):
  method==='Bank'?total:0;
 const debit=equivalent(planned,to,from,r);
 const remaining=tx?available-debit:null;
 const over=tx&&Number.isFinite(debit)&&debit>available+(from==='KHR'?0.5:0.005);
 return {from,to,r,actual,tx,available,converted,method,total,planned,debit,remaining,over,mismatch};
}
function update(){
 ensure();
 const panel=$('bbInvoiceBankEquivalentV1');if(!panel)return;
 const c=context(),{from,to,r,actual,tx,available,converted,method,total,planned,debit,remaining,over,mismatch}=c;
 const enabled=['Cash + Bank','Bank','Partially Paid in Bank'].includes(method);
 panel.style.display=enabled?'':'none';
 const label=$('bbBankEquivalentText'),info=$('bbBankEquivalentAvailable'),button=$('bbBankEquivalentApply');
 if(!enabled){
  label.textContent='Enter the actual bank amount to use.';
  info.textContent='';
  button.style.display='none';
  selection=null;
  return;
 }
 const value=equivalent(actual,from,to,r);
 if(actual<=0||!Number.isFinite(value)||!Number.isFinite(debit)){
  label.textContent=actual<=0?'Enter the actual bank amount to use.':'Enter a valid exchange rate.';
  info.textContent='';button.style.display='none';return;
 }
 label.textContent=money(actual,from)+' = '+money(value,to)+(from===to?' (same currency)':' (1 USD = '+r.toLocaleString()+' KHR)');
 const bankEnough=value+(to==='KHR'?0.5:0.005)>=planned;
 const after=tx?Math.max(0,remaining):0;
 if(tx){
  info.style.color=over||mismatch?'#b42318':'#198754';
  info.textContent='Registered available: '+money(available,from)+
   ' · This invoice uses: '+money(debit,from)+
   ' · Remaining after saving: '+money(after,from)+
   (over?' ⚠ Bank amount exceeds the remaining registered balance.':'')+
   (mismatch?' ⚠ Invoice exchange rate differs from the registered approved rate.':'');
 }else{
  info.style.color='#5b7088';
  info.textContent='No registered transfer selected. This is an entered bank amount; a registered remaining balance is not confirmed.';
 }
 if(method==='Bank'){
  if(tx&&!over&&!mismatch&&!bankEnough){
   info.style.color='#b42318';
   info.textContent+=' ⚠ Bank amount is insufficient for the full invoice.';
  }
  button.style.display='none';
 }else{
  button.style.display=actual>0&&!mismatch?'':'none';
  button.textContent=method==='Partially Paid in Bank'?'Apply entered amount to Amount Paid':'Apply entered bank amount to invoice';
 }
}
function apply(){
 const {to,from,r,actual,available,method,total,over,mismatch}=context();
 if(method==='Bank'||actual<=0||mismatch)return update();
 const cash=method==='Cash + Bank'?number($('splitCashAmount')?.value):0;
 const intended=equivalent(actual,from,to,r);
 if(!Number.isFinite(intended)||intended<=0)return update();
 const cap=available===null?intended:Math.min(intended,equivalent(available,from,to,r));
 const applied=safeFloor(Math.min(cap,Math.max(0,total-cash)),to);
 const input=method==='Cash + Bank'?$('splitBankAmount'):$('amountPaid');
 if(!input||!applied)return;
 input.value=String(applied);
 input.dispatchEvent(new Event('input',{bubbles:true}));
 input.dispatchEvent(new Event('change',{bubbles:true}));
 update();
}
function syncBank(){
 // Never overwrite an explicitly chosen partial amount on input/selection.
 // Apply button alone transfers the available amount into payment fields.
 update();
}

document.addEventListener('bb:registered-bank-selected',event=>{
 const tx=event.detail||null;
 const current=activeCustomerId();
 selection=current&&tx&&tx.transaction_id&&String(tx.customer_id||'')===current?tx:null;
 // Keep the previous first-use convenience for Partial Bank: fill Amount
 // Paid only when empty. Never overwrite an amount the accountant entered.
 if(selection&&String($('paymentMethod')?.value||'')==='Partially Paid in Bank'
    &&number($('amountPaid')?.value)<=0)apply();
 else update();
});
// Clear the cached registered balance on Undo, customer changes, new invoice,
// or when manual Transaction ID replaces a registered transfer.
document.addEventListener('bb:registered-bank-cleared',clearSelectedEquivalent);
document.addEventListener('input',event=>{
 if(event.target?.id==='customerName'&&selection&&selection.customer_id!==activeCustomerId())
  clearSelectedEquivalent();
 if(['bbActualBankAmount','exchangeRate','exchangeRateInput'].includes(event.target?.id))syncBank();
 else if(['splitCashAmount','splitBankAmount','amountPaid','transactionId'].includes(event.target?.id))update();
});
document.addEventListener('change',event=>{
 if(['bbActualBankCurrency','currency','exchangeRate','exchangeRateInput'].includes(event.target?.id))syncBank();
 else if(event.target?.id==='paymentMethod')update();
});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',update,{once:true});else update();
setTimeout(update,350);
})();
