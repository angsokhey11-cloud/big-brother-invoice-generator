/* BIG BROTHER Bank V3: verified customer payments are shown to staff and can be applied without retyping.
   The server remains authoritative for customer, amount, currency, exchange rate and one-time use. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const method=()=>String($('paymentMethod')?.value||'').trim();
const clean=s=>String(s??'').trim();
let warned=null;
let lastCustomer='';
let isChecking=false;
let availablePayments=[];
let availableCustomerId='';
let availableLoadSeq=0;
let availableTimer=null;
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
function bankMoney(n,c){
 const cur=clean(c).toUpperCase()==='KHR'?'KHR':'USD';
 return (cur==='KHR'?'៛':'$')+Number(n||0).toLocaleString(undefined,{
   minimumFractionDigits:cur==='USD'?2:0,
   maximumFractionDigits:cur==='USD'?2:0
 });
}
function bankDate(v){
 const m=clean(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
 return m?m[3]+'/'+m[2]+'/'+m[1]:clean(v);
}
function exactBankOption(name){
 const select=$('paymentBank'),bank=clean(name);
 if(!select||!bank)return;
 let option=[...select.options].find(o=>clean(o.value).toLowerCase()===bank.toLowerCase());
 if(!option){
   option=new Option(bank,bank);
   select.add(option);
 }
 select.value=option.value;
 select.dispatchEvent(new Event('change',{bubbles:true}));
}
function applyRegisteredPayment(tx){
 if(!tx)return;
 const id=$('transactionId');
 if(id){
   id.value=clean(tx.transaction_id);
   id.dispatchEvent(new Event('input',{bubbles:true}));
   id.dispatchEvent(new Event('change',{bubbles:true}));
 }
 const cur=$('bbActualBankCurrency');
 if(cur){cur.value=clean(tx.currency).toUpperCase()||'USD';cur.dispatchEvent(new Event('change',{bubbles:true}))}
 const amt=$('bbActualBankAmount');
 if(amt){amt.value=String(tx.amount??'');amt.dispatchEvent(new Event('input',{bubbles:true}))}
 exactBankOption(tx.bank_name);
 document.querySelectorAll('[data-bb-bank-use]').forEach(b=>{
   const active=b.dataset.bbBankUse===clean(tx.transaction_id);
   b.textContent=active?'✓ Selected':'Use';
   b.style.background=active?'#198754':'#174979';
 });
}
function renderAvailablePayments(){
 const box=$('bbRegisteredPayments');
 if(!box)return;
 if(!availableCustomerId){
   box.innerHTML='<div style="font-size:12px;color:#6a7d91">Choose a customer to see verified bank payments.</div>';
   return;
 }
 if(!availablePayments.length){
   box.innerHTML='<div style="font-size:12px;color:#6a7d91">No available registered bank payment for this customer.</div>';
   return;
 }
 box.innerHTML='<div style="font-size:12px;font-weight:900;color:#17457a;margin-bottom:8px">Admin-verified payments for this customer</div>'+
 availablePayments.map(tx=>{
   const inv=clean(tx.invoice_currency||tx.currency).toUpperCase();
   const actual=bankMoney(tx.amount,tx.currency);
   const equiv=bankMoney(tx.equivalent_amount,inv);
   return '<div style="display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center;padding:9px 0;border-top:1px solid #dce7f2">'+
     '<div style="min-width:0"><div style="font-weight:900;color:#173d69;overflow-wrap:anywhere">'+
       clean(tx.transaction_id).replace(/[&<>"']/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]))+
     '</div><div style="font-size:11px;color:#61768c;margin-top:3px">'+
       bankDate(tx.received_date)+' · Original '+actual+' · Remaining '+bankMoney(tx.remaining_amount,tx.currency)+(inv!==clean(tx.currency).toUpperCase()?' → '+bankMoney(tx.equivalent_remaining,inv):'')+
       (tx.bank_name?' · '+clean(tx.bank_name).replace(/[&<>"']/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s])):'')+
     '</div></div>'+
     '<button type="button" data-bb-bank-use="'+clean(tx.transaction_id).replace(/"/g,'&quot;')+'" style="border:0;border-radius:8px;background:#174979;color:#fff;padding:8px 12px;font-weight:800;cursor:pointer">Use</button>'+
   '</div>';
 }).join('');
 box.querySelectorAll('[data-bb-bank-use]').forEach(btn=>{
   btn.onclick=()=>applyRegisteredPayment(availablePayments.find(x=>clean(x.transaction_id)===btn.dataset.bbBankUse));
 });
 if(availablePayments.length===1)applyRegisteredPayment(availablePayments[0]);
}
async function balanceReminder(){
 let box=$('bbCustomerBalanceReminder');
 if(box)return box;
 const header=document.querySelector('.header-main');
 if(!header)return null;
 box=document.createElement('div');
 box.id='bbCustomerBalanceReminder';
 box.setAttribute('role','status');
 box.setAttribute('aria-live','polite');
 box.style.cssText='display:none;flex:0 1 auto;min-width:190px;max-width:360px;padding:8px 13px;border:1px solid #d4dfe9;border-radius:12px;background:#f3f6f9;color:#64748b;text-align:left;line-height:1.35;font-size:12px;box-sizing:border-box';
 const currency=header.querySelector('.header-currency');
 if(currency)header.insertBefore(box,currency);else header.appendChild(box);
 return box;
}
function updateBalanceReminder(rows,state){
 const box=balanceReminder();
 if(!box)return;
 if(state==='empty'){box.style.display='none';box.textContent='';return;}
 box.style.display='';
 if(state==='loading'){box.style.background='#f3f6f9';box.style.borderColor='#d4dfe9';box.textContent='💳 Checking customer bank balance…';return;}
 if(state==='error'){box.style.background='#fff7ed';box.style.borderColor='#fed7aa';box.textContent='💳 Bank balance unavailable — please check Bank payment';return;}
 const balances=Array.isArray(rows)?rows:[];
 const usd=balances.filter(x=>x.currency==='USD').reduce((sum,x)=>sum+Number(x.remaining_amount||0),0);
 const khr=balances.filter(x=>x.currency==='KHR').reduce((sum,x)=>sum+Number(x.remaining_amount||0),0);
 const count=balances.filter(x=>Number(x.remaining_amount)>0).length;
 box.style.background=count?'#effaf2':'#f3f6f9';
 box.style.borderColor=count?'#86d9a2':'#d4dfe9';
 box.style.color=count?'#13663a':'#64748b';
 box.replaceChildren();
 const label=document.createElement('div');
 label.style.cssText='font-size:11px;font-weight:800;letter-spacing:.2px';
 label.textContent='💳 Customer Bank Balance';
 const amount=document.createElement('div');
 amount.style.cssText='font-size:14px;font-weight:900;white-space:normal';
 amount.textContent=count?'
 const customer=window.bbGetSelectedCustomerForBank?.();
 const customerId=clean(customer?.customerId);
 const seq=++availableLoadSeq;
 if(!customerId){
   availableCustomerId='';availablePayments=[];renderAvailablePayments();updateBalanceReminder([], 'empty');return;
 }
 availableCustomerId=customerId;
 updateBalanceReminder([], 'loading');
 const box=$('bbRegisteredPayments');
 if(box)box.innerHTML='<div style="font-size:12px;color:#6a7d91">Checking verified bank payments…</div>';
 try{
   const [rows,balances]=await Promise.all([
     window.BBInvoiceBankRpc('bb_bank_customer_available_transactions',{p_customer_id:customerId}),
     window.BBInvoiceBankRpc('bb_customer_bank_balance_list',{p_customer_id:customerId})
   ]);
   const byId=new Map((Array.isArray(balances)?balances:[]).map(x=>[String(x.transaction_id),x]));
   if(seq!==availableLoadSeq)return;
   availablePayments=(Array.isArray(rows)?rows:[]).map(x=>({...x,...(byId.get(String(x.transaction_id))||{})})).filter(x=>Number(x.remaining_amount)>0);
   updateBalanceReminder(balances);
   renderAvailablePayments();
 }catch(error){
   if(seq!==availableLoadSeq)return;
   availablePayments=[];
   updateBalanceReminder([], 'error');
   if(box)box.innerHTML='<div style="font-size:12px;color:#b42318">Could not load verified payments. '+clean(error?.message||error)+'</div>';
 }
}
function scheduleAvailablePayments(){
 clearTimeout(availableTimer);
 availableTimer=setTimeout(loadAvailablePayments,180);
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
 '<div id="bbRegisteredPayments" style="margin-top:11px;padding:10px;border:1px solid #d7e3ef;border-radius:9px;background:#fff"><div style="font-size:12px;color:#6a7d91">Choose a customer to see verified bank payments.</div></div>'+
 '<p style="margin:10px 0 0;font-size:12px;color:#5f748c">Choose an Admin-verified payment above. Transaction ID, bank currency, amount and receiving bank will fill automatically. The server checks the exact customer and amount again when you save.</p>';
 anchor.insertAdjacentElement('afterend',fields);
 function visibility(){
   const show=['Bank','Partially Paid in Bank','Cash + Bank'].includes(method());
   fields.style.display=show?'':'none';
   if(show)scheduleAvailablePayments();
 }
 $('paymentMethod')?.addEventListener('change',visibility);
 visibility();
 scheduleAvailablePayments();
}
function bankAmountFor(payload){
 return payload.paymentMethod==='Cash + Bank'?Number(payload.splitBankAmount):Number(payload.amountPaid);
}
async function validateBank(payload){
 const actual=Number($('bbActualBankAmount')?.value);
 const curr=$('bbActualBankCurrency')?.value||payload.currency;
 const supplied=clean($('bbActualBankAmount')?.value)!=='';
 if(supplied&&(!Number.isFinite(actual)||actual<=0))throw new Error('Enter a valid actual bank amount.');
 try{
  const good=await window.BBInvoiceBankRpc('bb_bank_validate_invoice_input',{
   p_customer_id:payload.customerId,p_transaction_id:payload.transactionId,
   p_actual_amount:supplied?actual:null,p_actual_currency:curr,p_invoice_currency:payload.currency,
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
customer?.addEventListener('input',()=>{
 if(lastCustomer!==customer.value){
   lastCustomer=customer.value;
   warned=null;
   availablePayments=[];
   scheduleAvailablePayments();
 }
});
customer?.addEventListener('change',scheduleAvailablePayments);
const originalClear=window.clearAllAfterSuccessfulSave;
if(typeof originalClear==='function'){
 window.clearAllAfterSuccessfulSave=function(){
 warned=null;availablePayments=[];availableCustomerId='';updateBalanceReminder([], 'empty');
 if($('bbActualBankAmount'))$('bbActualBankAmount').value='';
 if($('bbRegisteredPayments'))$('bbRegisteredPayments').innerHTML='<div style="font-size:12px;color:#6a7d91">Choose a customer to see verified bank payments.</div>';
 return originalClear.apply(this,arguments)
};
}
install();installSave();
document.addEventListener('DOMContentLoaded',()=>{install();installSave();inputUI()},{once:true});
})();
+usd.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})+'  |  '+khr.toLocaleString('en-US',{maximumFractionDigits:0})+'៛':'No available balance';
 const hint=document.createElement('div');
 hint.style.cssText='font-size:10px;margin-top:2px';
 hint.textContent=count?count+' available transaction'+(count===1?'':'s')+' · Check Bank payment':'No registered bank payment';
 box.append(label,amount,hint);
}
function loadAvailablePayments(){
 const customer=window.bbGetSelectedCustomerForBank?.();
 const customerId=clean(customer?.customerId);
 const seq=++availableLoadSeq;
 if(!customerId){
   availableCustomerId='';availablePayments=[];renderAvailablePayments();return;
 }
 availableCustomerId=customerId;
 const box=$('bbRegisteredPayments');
 if(box)box.innerHTML='<div style="font-size:12px;color:#6a7d91">Checking verified bank payments…</div>';
 try{
   const [rows,balances]=await Promise.all([
     window.BBInvoiceBankRpc('bb_bank_customer_available_transactions',{p_customer_id:customerId}),
     window.BBInvoiceBankRpc('bb_customer_bank_balance_list',{p_customer_id:customerId})
   ]);
   const byId=new Map((Array.isArray(balances)?balances:[]).map(x=>[String(x.transaction_id),x]));
   if(seq!==availableLoadSeq)return;
   availablePayments=(Array.isArray(rows)?rows:[]).map(x=>({...x,...(byId.get(String(x.transaction_id))||{})})).filter(x=>Number(x.remaining_amount)>0);
   renderAvailablePayments();
 }catch(error){
   if(seq!==availableLoadSeq)return;
   availablePayments=[];
   if(box)box.innerHTML='<div style="font-size:12px;color:#b42318">Could not load verified payments. '+clean(error?.message||error)+'</div>';
 }
}
function scheduleAvailablePayments(){
 clearTimeout(availableTimer);
 availableTimer=setTimeout(loadAvailablePayments,180);
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
 '<div id="bbRegisteredPayments" style="margin-top:11px;padding:10px;border:1px solid #d7e3ef;border-radius:9px;background:#fff"><div style="font-size:12px;color:#6a7d91">Choose a customer to see verified bank payments.</div></div>'+
 '<p style="margin:10px 0 0;font-size:12px;color:#5f748c">Choose an Admin-verified payment above. Transaction ID, bank currency, amount and receiving bank will fill automatically. The server checks the exact customer and amount again when you save.</p>';
 anchor.insertAdjacentElement('afterend',fields);
 function visibility(){
   const show=['Bank','Partially Paid in Bank','Cash + Bank'].includes(method());
   fields.style.display=show?'':'none';
   if(show)scheduleAvailablePayments();
 }
 $('paymentMethod')?.addEventListener('change',visibility);
 visibility();
 scheduleAvailablePayments();
}
function bankAmountFor(payload){
 return payload.paymentMethod==='Cash + Bank'?Number(payload.splitBankAmount):Number(payload.amountPaid);
}
async function validateBank(payload){
 const actual=Number($('bbActualBankAmount')?.value);
 const curr=$('bbActualBankCurrency')?.value||payload.currency;
 const supplied=clean($('bbActualBankAmount')?.value)!=='';
 if(supplied&&(!Number.isFinite(actual)||actual<=0))throw new Error('Enter a valid actual bank amount.');
 try{
  const good=await window.BBInvoiceBankRpc('bb_bank_validate_invoice_input',{
   p_customer_id:payload.customerId,p_transaction_id:payload.transactionId,
   p_actual_amount:supplied?actual:null,p_actual_currency:curr,p_invoice_currency:payload.currency,
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
customer?.addEventListener('input',()=>{
 if(lastCustomer!==customer.value){
   lastCustomer=customer.value;
   warned=null;
   availablePayments=[];
   scheduleAvailablePayments();
 }
});
customer?.addEventListener('change',scheduleAvailablePayments);
const originalClear=window.clearAllAfterSuccessfulSave;
if(typeof originalClear==='function'){
 window.clearAllAfterSuccessfulSave=function(){
 warned=null;availablePayments=[];availableCustomerId='';
 if($('bbActualBankAmount'))$('bbActualBankAmount').value='';
 if($('bbRegisteredPayments'))$('bbRegisteredPayments').innerHTML='<div style="font-size:12px;color:#6a7d91">Choose a customer to see verified bank payments.</div>';
 return originalClear.apply(this,arguments)
};
}
install();installSave();
document.addEventListener('DOMContentLoaded',()=>{install();installSave();inputUI()},{once:true});
})();
