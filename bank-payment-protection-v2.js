/* BIG BROTHER Bank V2: customer-only warning and protected cross-currency inputs.
   Reuses the authoritative invoice/payment RPC and never reveals registered IDs or amounts. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const method=()=>String($('paymentMethod')?.value||'').trim();
const clean=s=>String(s??'').trim();
let warned=null;
let lastCustomer='';
let isChecking=false;
function clearMethod(){
 const select=$('paymentMethod');
 if(select){select.value='';select.dispatchEvent(new Event('change',{bubbles:true}));}
 try{window.handlePaymentMethodChange?.()}catch(_){}
}
function popup(text,buttons){
 return new Promise(resolve=>{
  document.getElementById('bbBankWarningV2')?.remove();
  const overlay=document.createElement('div');
  overlay.id='bbBankWarningV2';overlay.setAttribute('role','alertdialog');overlay.setAttribute('aria-modal','true');
  overlay.style.cssText='position:fixed;inset:0;z-index:2147483600;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(8,24,43,.60);backdrop-filter:blur(3px)';
  const panel=document.createElement('div');
  panel.style.cssText='width:min(440px,100%);padding:25px 22px;border-radius:17px;background:#fff;color:#18324e;font-family:Arial,sans-serif;text-align:center;box-shadow:0 25px 70px #0a274555';
  const icon=document.createElement('div');icon.textContent='!';icon.style.cssText='width:50px;height:50px;display:grid;place-items:center;margin:0 auto 14px;border-radius:50%;background:#fff3df;color:#b67c12;font-size:29px;font-weight:900';
  const title=document.createElement('div');title.textContent='Payment Method Alert';title.style.cssText='font-size:20px;font-weight:900;color:#17457a;margin-bottom:12px';
  const detail=document.createElement('p');detail.textContent=text;detail.style.cssText='font-size:15px;line-height:1.5;color:#465e75;margin:0';
  const actions=document.createElement('div');actions.style.cssText='display:flex;gap:10px;justify-content:center;margin-top:23px';
  const done=value=>{overlay.remove();document.removeEventListener('keydown',onKey);resolve(value)};
  const onKey=e=>{if(e.key==='Escape'){e.preventDefault();done(false)}};
  document.addEventListener('keydown',onKey);
  buttons.forEach(([label,value,primary])=>{
   const btn=document.createElement('button');btn.type='button';btn.textContent=label;btn.style.cssText='flex:1;max-width:185px;min-height:44px;border:0;border-radius:10px;font-size:14px;font-weight:bold;cursor:pointer;background:'+(primary?'#17457a':'#edf1f7')+';color:'+(primary?'#fff':'#3d5874');
   btn.onclick=()=>done(value);actions.appendChild(btn);
  });
  panel.append(icon,title,detail,actions);overlay.appendChild(panel);document.body.appendChild(overlay);
  actions.querySelector('button')?.focus({preventScroll:true});
 });
}
function inputUI(){
 const anchor=$('transactionIdRow')||$('paymentBankRow');
 if(!anchor||$('bbBankV2Fields'))return;
 const fields=document.createElement('div');fields.id='bbBankV2Fields';
 fields.style.cssText='display:none;grid-column:1/-1;padding:13px;border:1px solid #c6d8ed;border-radius:10px;background:#f4f8fc;margin-top:8px';
 fields.innerHTML='<div style="font-weight:800;color:#17457a;margin-bottom:10px">Actual bank transfer</div>'+
 '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">'+
 '<label style="font-size:13px;font-weight:700">Bank currency<select id="bbActualBankCurrency" style="width:100%;margin-top:5px;padding:9px;border:1px solid #adc4db;border-radius:8px"><option value="USD">USD</option><option value="KHR">KHR</option></select></label>'+
 '<label style="font-size:13px;font-weight:700">Actual amount<input id="bbActualBankAmount" type="number" inputmode="decimal" min="0" step="any" placeholder="Amount received" style="width:100%;margin-top:5px;padding:9px;border:1px solid #adc4db;border-radius:8px"></label></div>'+
 '<p style="margin:10px 0 0;font-size:12px;color:#5f748c">For another currency, use the exact exchange rate approved by Admin in the invoice header. The equivalent is checked securely when you save.</p>';
 anchor.insertAdjacentElement('afterend',fields);
 function visibility(){fields.style.display=['Bank','Partially Paid in Bank','Cash + Bank'].includes(method())?'':'none';}
 $('paymentMethod')?.addEventListener('change',visibility);visibility();
}
function bankAmountFor(payload){
 return payload.paymentMethod==='Cash + Bank'?Number(payload.splitBankAmount):Number(payload.amountPaid);
}
async function validateBank(payload){
 const actual=Number($('bbActualBankAmount')?.value);
 const curr=$('bbActualBankCurrency')?.value||payload.currency;
 if(!Number.isFinite(actual)||actual<=0){
  throw new Error('Enter the actual bank amount before completing this invoice.');
 }
 try{
  const good=await window.BBInvoiceBankRpc('bb_bank_validate_invoice_input',{
   p_customer_id:payload.customerId,p_transaction_id:payload.transactionId,
   p_actual_amount:actual,p_actual_currency:curr,p_invoice_currency:payload.currency,
   p_exchange_rate:Number(payload.exchangeRate),p_equivalent_amount:bankAmountFor(payload)
  });
  if(good!==true){
   throw new Error('Bank transaction details do not match an available verified payment. Check customer, amount, currency and approved exchange rate.');
  }
  return true;
 }catch(err){throw err;}
}
function install(){
 inputUI();
 if(typeof window.bbConfirmInvoiceCompletion!=='function'||window.bbConfirmInvoiceCompletion.__bbBankV2)return;
 const original=window.bbConfirmInvoiceCompletion;
 window.bbConfirmInvoiceCompletion=async function(payload){
  const customer=clean(payload.customerId),selected=method(),protectedMethod=selected==='Cash'||selected==='Credit';
  if(!protectedMethod||!customer){warned=null;return original.apply(this,arguments);}
  if(isChecking)return false;
  isChecking=true;
  let available=false;
  try{available=await window.BBInvoiceBankRpc('bb_bank_customer_has_available',{p_customer_id:customer})}
  catch(e){window.bbShowInvoiceSaveError?.(new Error('Could not check registered bank payments. Please reconnect and retry.'));isChecking=false;return false;}
  isChecking=false;
  if(available!==true){warned=null;return original.apply(this,arguments);}
  const key=customer+'|'+selected;
  if(warned!==key){
    warned=key;
    await popup('This customer has an available registered bank payment. Please double-check your payment method.',[['OK',true,true]]);
    clearMethod();
    return false;
  }
  const yes=await popup('Are you sure your payment method is correct?',[['No',false,false],['Yes',true,true]]);
  if(!yes){clearMethod();return false;}
  warned=null;
  return true; // Yes authorizes this already-confirmed choice; do not show a third dialog.
 };
 window.bbConfirmInvoiceCompletion.__bbBankV2=true;
}
function installSave(){
 if(typeof window.postSalesInvoiceBundle!=='function'||window.postSalesInvoiceBundle.__bbBankV2)return;
 const original=window.postSalesInvoiceBundle;
 window.postSalesInvoiceBundle=async function(invoice,payment){
  if(['Bank','Partially Paid in Bank','Cash + Bank'].includes(clean(invoice?.paymentMethod))){
   await validateBank(invoice);
  }
  return original.apply(this,arguments);
 };
 window.postSalesInvoiceBundle.__bbBankV2=true;
}
const customer=$('customerName');
customer?.addEventListener('input',()=>{if(lastCustomer!==customer.value){lastCustomer=customer.value;warned=null}});
const originalClear=window.clearAllAfterSuccessfulSave;
if(typeof originalClear==='function'){
 window.clearAllAfterSuccessfulSave=function(){warned=null;if($('bbActualBankAmount'))$('bbActualBankAmount').value='';return originalClear.apply(this,arguments)};
}
install();installSave();
document.addEventListener('DOMContentLoaded',()=>{install();installSave();inputUI()},{once:true});
})();
