/* BIG BROTHER · Invoice Generator Batch Selling-Date Protection V1 (PC + Mobile) */
(function(){
'use strict';
if(window.BBBatchSellingWindowInvoiceV1)return;window.BBBatchSellingWindowInvoiceV1=true;
const $=id=>document.getElementById(id);
const iso=x=>String(x??'').trim().match(/^\d{4}-\d{2}-\d{2}$/)?.[0]||'';
let admin=false,checked=false,hint=null,lastBatchId='';
function selected(){
 try{return typeof window.getSelectedSimpleBatch==='function'?window.getSelectedSimpleBatch():null}
 catch(_){return null}
}
function currentRange(){
 const batch=selected();
 if(!batch)return null;
 const start=iso(batch.sellingDateFrom),end=iso(batch.sellingDateTo);
 return {batchId:String(batch.batchId||''),from:start,to:end,legacy:!start&&!end};
}
function pretty(d){
 const m=iso(d).match(/^(\d{4})-(\d{2})-(\d{2})$/);
 return m?m[3]+'-'+(['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][Number(m[2])-1]||m[2])+'-'+m[1]:String(d||'');
}
function show(message,warning=false){
 if(!hint)return;
 hint.textContent=message;
 hint.style.color=warning?'#b53839':'#1b6b4b';
 hint.style.background=warning?'#fff0f0':'#eaf8ef';
 hint.hidden=!message;
}
function onBatchChange(){
 const limit=currentRange();
 const dateInput=$('invoiceDate');
 if(!dateInput)return;
 const id=limit?.batchId||'';
 const changed=id!==lastBatchId;lastBatchId=id;
 dateInput.removeAttribute('min');dateInput.removeAttribute('max');
 if(!limit){show('');return}
 if(limit.legacy){show('Existing Batch · No selling-date window configured.');return}
 if(!limit.from||!limit.to||limit.from>limit.to){
  show('Batch '+id+' has incomplete allowed selling dates; ask Admin.',true);return;
 }
 if(!admin){
  dateInput.min=limit.from;dateInput.max=limit.to;
  const chosen=iso(dateInput.value);
  if(changed&&(!chosen||chosen<limit.from||chosen>limit.to)){
   dateInput.value=limit.from;
   if(typeof window.updateInvoiceDate==='function')window.updateInvoiceDate(false);
  }
 }
 const chosen=iso(dateInput.value),out=!admin&&chosen&&(chosen<limit.from||chosen>limit.to);
 show((admin?'Admin may correct dates. ':'Staff allowed selling dates: ')+
   pretty(limit.from)+(limit.from===limit.to?'':' → '+pretty(limit.to))+
   (out?' · Selected selling date is OUTSIDE the allowed range.':''),!!out);
}
function checkPayload(payload){
 const batchId=String(payload?.batchNumber||payload?.batchId||'').trim();
 if(!batchId||admin)return;
 const batch=selected();
 if(!batch||String(batch.batchId||'')!==batchId)
   throw Error('Refresh the Batch list before saving. The selected Batch dates could not be verified.');
 const from=iso(batch.sellingDateFrom),to=iso(batch.sellingDateTo),date=iso(payload?.invoiceDate);
 if(!from&&!to)return; // Historical batches retain the existing workflow.
 if(!from||!to||from>to)
   throw Error('Selected Batch has incomplete selling-date limits. Ask Admin.');
 if(!date||date<from||date>to){
  const message='Batch '+batchId+' permits selling dates '+pretty(from)+' to '+pretty(to)+
    '. Staff cannot save this invoice dated '+pretty(date)+'.';
  show(message,true);
  throw Error(message);
 }
}
function protectSave(name){
 const original=window[name];
 if(typeof original!=='function'||original.__bbBatchSellingDateV1)return;
 const wrapped=async function(invoice,...args){
  checkPayload(invoice);
  return original.call(this,invoice,...args);
 };
 wrapped.__bbBatchSellingDateV1=true;window[name]=wrapped;
}
function install(){
 const batch=$('batchNumber'),date=$('invoiceDate');
 if(!batch||!date)return;
 if(!$('bbInvoiceBatchSellingDateHint')){
  hint=document.createElement('div');
  hint.id='bbInvoiceBatchSellingDateHint';hint.hidden=true;
  hint.style.cssText='font-size:11px;font-weight:700;line-height:1.55;padding:7px 9px;margin-top:5px;border-radius:7px;';
  const place=batch.closest('.field')||batch.parentElement;
  place?.append(hint);
 }else hint=$('bbInvoiceBatchSellingDateHint');
 batch.addEventListener('change',onBatchChange);
 date.addEventListener('change',()=>onBatchChange());
 date.addEventListener('input',()=>onBatchChange());
 const oldChange=window.handleSimpleBatchChange;
 if(typeof oldChange==='function'&&!oldChange.__bbBatchDates){
  const patched=function(...args){const out=oldChange.apply(this,args);onBatchChange();return out};
  patched.__bbBatchDates=true;window.handleSimpleBatchChange=patched;
 }
 const oldLoader=window.loadSimpleBatchPicker;
 if(typeof oldLoader==='function'&&!oldLoader.__bbBatchDates){
  const patched=async function(...args){const out=await oldLoader.apply(this,args);onBatchChange();return out};
  patched.__bbBatchDates=true;window.loadSimpleBatchPicker=patched;
 }
 const observer=new MutationObserver(()=>onBatchChange());
 observer.observe(batch,{childList:true,subtree:false});
 protectSave('postSalesInvoiceBundle');
 protectSave('postSalesInvoice');
 onBatchChange();
 if(typeof window.BBInvoiceBankRpc==='function'){
  window.BBInvoiceBankRpc('bb_is_admin').then(value=>{
   admin=value===true;checked=true;onBatchChange();
  }).catch(()=>{admin=false;checked=true;onBatchChange()});
 }
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
else install();
})();