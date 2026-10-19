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

function context(){
 const from=bankCurrency(),to=invoiceCurrency(),r=rate(),actual=number($('bbActualBankAmount')?.value);
 const tx=selection&&selection.transaction_id===String($('transactionId')?.value||'').trim()?selection:null;
 const available=tx?number(tx.remaining_amount):actual;
 const converted=equivalent(available,from,to,r);
 const method=String($('paymentMethod')?.value||'');
 return {from,to,r,actual,tx,available,converted,method,total:getTotal()};
}
function update(){
 ensure();
 const panel=$('bbInvoiceBankEquivalentV1');if(!panel)return;
 const c=context(),{from,to,r,actual,tx,available,converted,method,total}=c;
 const enabled=['Cash + Bank','Bank','Partially Paid in Bank'].includes(method);
 panel.style.display=enabled?'':'none';if(!enabled)return;
 const label=$('bbBankEquivalentText'),info=$('bbBankEquivalentAvailable'),button=$('bbBankEquivalentApply');
 const value=equivalent(actual,from,to,r);
 if(actual<=0||!Number.isFinite(value)||!Number.isFinite(converted)){
  label.textContent=actual<=0?'Enter the actual bank transfer amount.':'Enter a valid exchange rate.';
  info.textContent='';button.style.display='none';return;
 }
 label.textContent=money(actual,from)+' = '+money(value,to)+(from===to?' (same currency)':' (1 USD = '+r.toLocaleString()+' KHR)');
 if(method==='Bank'){
  const ok=converted+(to==='USD'?0.005:0.5)>=total;
  info.style.color=ok?'#198754':'#b42318';
  info.textContent='Registered available: '+money(available,from)+' ≈ '+money(converted,to)+'. '+(ok?'✓ Covers full bank payment.':'Insufficient for full invoice. Select partial bank or a larger transfer.');
  button.style.display='none';
 }else{
  info.style.color='#5b7088';
  info.textContent=tx?'Registered remaining: '+money(available,from)+' ≈ '+money(converted,to):'Equivalent is calculated in invoice currency.';
  button.style.display=converted>0?'':'none';
  button.textContent=method==='Partially Paid in Bank'?'Apply to Amount Paid':'Apply equivalent to invoice';
 }
}
function apply(){
 const {to,converted,method,total}=context();
 if(method==='Bank'||!(converted>0))return update();
 const cash=method==='Cash + Bank'?number($('splitCashAmount')?.value):0;
 const applied=safeFloor(Math.min(converted,Math.max(0,total-cash)),to);
 const input=method==='Cash + Bank'?$('splitBankAmount'):$('amountPaid');
 if(!input||!applied)return;
 input.value=String(applied);
 input.dispatchEvent(new Event('input',{bubbles:true}));
 input.dispatchEvent(new Event('change',{bubbles:true}));
 update();
}
function syncBank(){
 if(String($('paymentMethod')?.value||'')==='Partially Paid in Bank')apply();
 else update();
}
document.addEventListener('bb:registered-bank-selected',event=>{
 const tx=event.detail||null;
 selection=tx&&tx.transaction_id?tx:null;
 update();
 if(selection)syncBank();
});
document.addEventListener('input',event=>{
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
