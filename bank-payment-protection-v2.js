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
let userSelectedRegisteredId='';
let adminMayTypeManualId=false;
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
function clearRegisteredSelection(){
 userSelectedRegisteredId='';
 const field=$('transactionId');
 if(field){field.value='';field.dispatchEvent(new Event('input',{bubbles:true}));}
 const amt=$('bbActualBankAmount');if(amt)amt.value='';
 const bank=$('paymentBank');if(bank){bank.value='';bank.dispatchEvent(new Event('change',{bubbles:true}));}
 renderAvailablePayments();
}
function applyRegisteredPayment(tx){
 if(!tx)return;
 userSelectedRegisteredId=clean(tx.transaction_id);
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
 document.dispatchEvent(new CustomEvent('bb:registered-bank-selected',{detail:{transaction_id:clean(tx.transaction_id),original_amount:Number(tx.original_amount??tx.amount??0),remaining_amount:Number(tx.remaining_amount||0),approved_exchange_rate:Number(tx.approved_exchange_rate||1),currency:clean(tx.currency).toUpperCase(),invoice_currency:clean(tx.invoice_currency||tx.currency).toUpperCase()}}));
 document.querySelectorAll('[data-bb-bank-use]').forEach(b=>{
   const active=userSelectedRegisteredId===b.dataset.bbBankUse;
   b.textContent=active?'✓ Selected (Undo)':'Use';
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
   const actual=bankMoney(tx.original_amount??tx.amount,tx.currency);
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
   btn.onclick=()=>{
   if(userSelectedRegisteredId===btn.dataset.bbBankUse){clearRegisteredSelection();return;}
   applyRegisteredPayment(availablePayments.find(x=>clean(x.transaction_id)===btn.dataset.bbBankUse));
  };
  const active=!!userSelectedRegisteredId&&btn.dataset.bbBankUse===userSelectedRegisteredId;
  btn.textContent=active?'✓ Selected (Undo)':'Use';
  btn.style.background=active?'#198754':'#174979';
 });
 // Never auto-select even when exactly one registered payment is available.
}
const bankCachePrefix='bb-bank-bulk-v1:';
function bankIdentity(){
 const token=window.BBInvoiceBankAuthToken?.()||'';
 if(token){try{const claims=JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));return claims.sub||'unknown';}catch(_){}}
 return '';
}
function bulkCacheKey(){const id=bankIdentity();if(!id)throw Error('Please sign in before syncing bank balances');return bankCachePrefix+id;}
function bulkRead(){try{return JSON.parse(localStorage.getItem(bulkCacheKey())||'null');}catch(_){return null;}}
function bulkWrite(snapshot){localStorage.setItem(bulkCacheKey(),JSON.stringify(snapshot));}
function customerCachedRows(id){return (bulkRead()?.rows||[]).filter(x=>clean(x.customer_id)===clean(id)&&Number(x.remaining_amount)>0);}
function loadCachedPayments(id){
 const rows=customerCachedRows(id);
 availablePayments=rows;
 renderAvailablePayments();
 return {transactions:rows};
}
function invalidateUsedBankTransaction(customerId,transactionId){
 const saved=bulkRead();if(!saved)return;
 saved.rows=(saved.rows||[]).filter(x=>!(clean(x.customer_id)===clean(customerId)&&clean(x.transaction_id)===clean(transactionId)));
 bulkWrite(saved);
 document.dispatchEvent(new CustomEvent('bb:bank-cache-invalidated',{detail:{customerId}}));
}
document.addEventListener('bb:bank-sync-request',async()=>{
 const customerId=clean(window.bbGetSelectedCustomerForBank?.()?.customerId);
 document.dispatchEvent(new CustomEvent('bb:bank-sync-status',{detail:{customerId,loading:true}}));
 try{
  const rows=await window.BBInvoiceBankRpc('bb_invoice_bank_bulk_sync',{});
  if(!Array.isArray(rows))throw Error('Unexpected bank sync response');
  const syncedAt=Date.now();
  // Replace the complete snapshot, removing balances spent on other devices.
  bulkWrite({rows,syncedAt});
  const current=clean(window.bbGetSelectedCustomerForBank?.()?.customerId);
  availableCustomerId=current;
  loadCachedPayments(current);
  document.dispatchEvent(new CustomEvent('bb:bank-cache-updated',{detail:{customerId:current,balances:customerCachedRows(current),transactions:availablePayments,syncedAt,count:rows.length}}));
  document.dispatchEvent(new CustomEvent('bb:bank-sync-status',{detail:{customerId:current,loading:false,success:true,count:rows.length}}));
 }catch(error){
  document.dispatchEvent(new CustomEvent('bb:bank-sync-status',{detail:{customerId,loading:false,error:String(error?.message||error)}}));
 }
});
function scheduleAvailablePayments(){
 clearTimeout(availableTimer);
 const id=clean(window.bbGetSelectedCustomerForBank?.()?.customerId);
 if(availableCustomerId!==id){
  availableCustomerId=id;availableLoadSeq++;
  if(userSelectedRegisteredId){userSelectedRegisteredId='';if($('transactionId'))$('transactionId').value='';if($('bbActualBankAmount'))$('bbActualBankAmount').value='';}
 }
 if(id)loadCachedPayments(id);else{availablePayments=[];renderAvailablePayments();}
}
document.addEventListener('bb:bank-sync-request',async()=>{
 const id=clean(window.bbGetSelectedCustomerForBank?.()?.customerId);
 if(!id)return;
 document.dispatchEvent(new CustomEvent('bb:bank-sync-status',{detail:{customerId:id,loading:true}}));
 try{await loadAvailablePayments();document.dispatchEvent(new CustomEvent('bb:bank-sync-status',{detail:{customerId:id,loading:false,success:true}}));}
 catch(error){document.dispatchEvent(new CustomEvent('bb:bank-sync-status',{detail:{customerId:id,loading:false,error:String(error?.message||error)}}));}
});
function inputUI(){
 const anchor=$('transactionIdRow')||$('paymentBankRow');
 if(!anchor||$('bbBankV2Fields'))return;
 const fields=document.createElement('div');fields.id='bbBankV2Fields';
 fields.style.cssText='display:none;grid-column:1/-1;padding:13px;border:1px solid #c6d8ed;border-radius:10px;background:#f4f8fc;margin-top:8px';
 fields.innerHTML='<div style="font-weight:800;color:#17457a;margin-bottom:10px">Actual bank transfer</div>'+
 '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">'+
 '<label style="font-size:13px;font-weight:700">Bank currency<select id="bbActualBankCurrency" style="width:100%;margin-top:5px;padding:9px;border:1px solid #adc4db;border-radius:8px"><option value="USD">USD</option><option value="KHR">KHR</option></select></label>'+
 '<label style="font-size:13px;font-weight:700">Actual amount<input id="bbActualBankAmount" type="number" inputmode="decimal" min="0" step="any" placeholder="Amount received" style="width:100%;margin-top:5px;padding:9px;border:1px solid #adc4db;border-radius:8px"></label></div>'+
 '<div id="bbRegisteredPayments" style="margin-top:11px;padding:10px;border:1px solid #d7e3ef;border-radius:9px;background:#fff"><div style="font-size:12px;color:#6a7d91">Available registered transfers (optional).</div></div>'+
 '<p style="margin:10px 0 0;font-size:12px;color:#5f748c">Registered balances are optional. Click Use only when the payment belongs to this sale. Staff must ask Admin to register a different bank transfer before using it; only Admin can type a new Transaction ID. Unused registered balances remain untouched.</p>';
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
async function installManualIdLock(){
 const tx=$('transactionId');
 if(!tx)return;
 // Fail closed until Supabase confirms this user is an active Admin.
 tx.readOnly=true;
 tx.setAttribute('aria-readonly','true');
 tx.placeholder='Select Use on a registered bank transfer';
 let info=$('bbManualBankIdPolicy');
 if(!info){
  info=document.createElement('div');info.id='bbManualBankIdPolicy';
  info.style.cssText='font-size:11px;color:#5c7089;margin-top:4px;line-height:1.4';
  ($('transactionIdRow')||tx.parentElement)?.appendChild(info);
 }
 info.textContent='Staff: choose Use above. Manual Transaction ID entry is Admin-only.';
 try{
  adminMayTypeManualId=(await window.BBInvoiceBankRpc('bb_is_admin'))===true;
 }catch(err){
  adminMayTypeManualId=false;
  console.warn('Admin ID permission check unavailable; keep manual field locked.',err);
 }
 tx.readOnly=!adminMayTypeManualId;
 tx.setAttribute('aria-readonly',String(!adminMayTypeManualId));
 if(adminMayTypeManualId){
  tx.placeholder='Enter new Transaction ID or select Use';
  info.textContent='Admin: manual Transaction ID allowed. Registered transfers are optional.';
 }
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
   throw new Error(adminMayTypeManualId?'Bank Transaction ID is unavailable or does not match a registered transfer. Check the customer and remaining balance.':'Staff must select Use on an available Admin-registered transfer. Manual bank Transaction IDs are Admin-only.');
  }
  return true;
 }catch(err){throw err;}
}
function install(){
 // Registered bank balances are optional: no Cash/Credit warning or forced selection.
 // Keep the Invoice Generator's original confirmation flow unchanged.
}
function installBankReuseDuplicateCheck(){
 // The payments table stores one payment per invoice. A previously allocated
 // registered transfer remains a valid reference while its REAL wallet still
 // has funds. Only relax the early *UI* duplicate warning for an explicit
 // customer-matched Use selection. The DB enforces locks, customer, balance,
 // currency, and manual-ID uniqueness during the actual save.
 const original=window.checkPaymentTransactionIdAvailable;
 if(typeof original!=='function'||original.__bbRegisteredBalanceReuse)return;
 const wrapped=async function(transactionId){
  const result=await original.apply(this,arguments);
  const currentCustomer=clean(window.bbGetSelectedCustomerForBank?.()?.customerId);
  const selected=clean(userSelectedRegisteredId);
  const matching=availablePayments.some(tx=>
    clean(tx.transaction_id).toLowerCase()===selected.toLowerCase()&&
    Number(tx.remaining_amount)>0&&
    clean(tx.customer_id)===currentCustomer
  );
  if(result?.exists===true&&!result?.pending&&
     selected&&selected.toLowerCase()===clean(transactionId).toLowerCase()&&
     currentCustomer&&currentCustomer===availableCustomerId&&matching){
    return {...result,exists:false,registeredBalanceReuse:true};
  }
  return result;
 };
 wrapped.__bbRegisteredBalanceReuse=true;
 window.checkPaymentTransactionIdAvailable=wrapped;
}
async function refreshRemainingRegisteredBalances(){
 // After a partial use, refresh remaining funds from Supabase rather than
 // permanently removing the original transfer from the local dropdown.
 try{
  const rows=await window.BBInvoiceBankRpc('bb_invoice_bank_bulk_sync',{});
  if(!Array.isArray(rows))return;
  const syncedAt=Date.now();
  bulkWrite({rows,syncedAt});
  const customerId=clean(window.bbGetSelectedCustomerForBank?.()?.customerId);
  availableCustomerId=customerId;
  loadCachedPayments(customerId);
  document.dispatchEvent(new CustomEvent('bb:bank-cache-updated',{
    detail:{customerId,balances:customerCachedRows(customerId),
      transactions:availablePayments,syncedAt,count:rows.length}
  }));
 }catch(error){
  console.warn('Verified bank balance refresh after invoice:',error);
 }
}
function installSave(){
 if(typeof window.postSalesInvoiceBundle!=='function'||window.postSalesInvoiceBundle.__bbBankV2)return;
 const original=window.postSalesInvoiceBundle;
 window.postSalesInvoiceBundle=async function(invoice,payment){
  // The multi-bank endpoint validates every source on the server. Running
  // the legacy single-transaction check here would reject valid multi-source
  // payments; keep it unchanged for all ordinary payments.
  const wallet=window.BBInvoiceMultiSourceSelection?.();
  const multiBank=wallet?.settlement_sources?.length>=2;
  if(multiBank&&window.BB_MULTI_BANK_SAVE_ENABLED!==true)
    throw new Error('Multi-bank payment saving has not been enabled.');
  if(!multiBank&&['Bank','Partially Paid in Bank','Cash + Bank'].includes(clean(invoice?.paymentMethod))){
   await validateBank(invoice);
  }
  const usedRegisteredId=userSelectedRegisteredId;
  const usedCustomerId=availableCustomerId;
  const result=await original.apply(this,arguments);
  if(usedRegisteredId&&result!==false){
   invalidateUsedBankTransaction(usedCustomerId,usedRegisteredId);
   // Invoice is already saved; do not make success depend on cache refresh.
   void refreshRemainingRegisteredBalances();
  }
  return result;
 };
 window.postSalesInvoiceBundle.__bbBankV2=true;
}
const customer=$('customerName');
customer?.addEventListener('input',()=>{
 if(lastCustomer!==customer.value){
   lastCustomer=customer.value;
   warned=null;
   scheduleAvailablePayments();
 }
});
customer?.addEventListener('change',scheduleAvailablePayments);
$('transactionId')?.addEventListener('input',()=>{
 if(userSelectedRegisteredId&&clean($('transactionId').value)!==userSelectedRegisteredId){
   userSelectedRegisteredId='';
   if($('bbActualBankAmount'))$('bbActualBankAmount').value='';
 }
 document.querySelectorAll('[data-bb-bank-use]').forEach(btn=>{
   const active=!!userSelectedRegisteredId&&btn.dataset.bbBankUse===userSelectedRegisteredId;
   btn.textContent=active?'✓ Selected (Undo)':'Use';
   btn.style.background=active?'#198754':'#174979';
 });
});
const originalClear=window.clearAllAfterSuccessfulSave;
if(typeof originalClear==='function'){
 window.clearAllAfterSuccessfulSave=function(){
 warned=null;availablePayments=[];availableCustomerId='';userSelectedRegisteredId='';
 if($('bbActualBankAmount'))$('bbActualBankAmount').value='';
 if($('bbRegisteredPayments'))$('bbRegisteredPayments').innerHTML='<div style="font-size:12px;color:#6a7d91">Choose a customer to see verified bank payments.</div>';
 return originalClear.apply(this,arguments)
};
}
install();installSave();installBankReuseDuplicateCheck();
if(document.readyState!=='loading'){inputUI();installManualIdLock();}
document.addEventListener('DOMContentLoaded',()=>{install();installSave();installBankReuseDuplicateCheck();inputUI();installManualIdLock()},{once:true});
})();
