/* BIG BROTHER Batch Invoice Sale: operator-selectable Purchased + Zero-Cost.
   Exact stock products only; Group and Service items retain their existing logic.
   Pair with 20261101_batch_invoice_source_select_v1.sql before enabling. */
(function(){
'use strict';
if(window.BBBatchSourceSelectV1)return;
window.BBBatchSourceSelectV1=true;
const EPS=0.000001;
const clean=x=>String(x==null?'':x).trim();
const qty=x=>{const n=Number(x);return Number.isFinite(n)?n:0};
const rows=()=>[...document.querySelectorAll('#productList .product')];
const active=()=>{try{return !!(typeof getSelectedSimpleBatch==='function'&&getSelectedSimpleBatch())}catch(_){return false}};
const batch=()=>{try{return getSelectedSimpleBatch()}catch(_){return null}};
const entry=row=>clean(row?.dataset?.entryType||'EXACT').toUpperCase();
const tracked=row=>entry(row)==='EXACT'&&clean(row?.dataset?.itemType||'PRODUCT').toUpperCase()!=='SERVICE'&&clean(row?.dataset?.trackStock||'true').toLowerCase()!=='false';
const stockItem=code=>{const b=batch();return (b?.exactItems||b?.items||[]).find(x=>clean(x.productCode)===code)||null};
function sourceAvailable(item,source){
 const keys=source==='PURCHASED'?['purchasedPendingQty','purchasedRemainingQty']:['zeroCostPendingQty','zeroCostRemainingQty'];
 for(const key of keys)if(item?.[key]!==undefined&&item[key]!==null)return Math.max(0,qty(item[key]));
 return null;
}
const rowQty=row=>row.querySelector('.product-qty-input');
function panelValues(row){
 const panel=row.querySelector('.bb-batch-source-select');
 if(!panel)return null;
 const p=panel.querySelector('[data-source="PURCHASED"]'),z=panel.querySelector('[data-source="ZERO_COST"]');
 return {p:qty(p.value),z:qty(z.value),rawP:p.value,rawZ:z.value};
}
function draw(){
 const enabled=active();
 for(const row of rows()){
  const prior=row.querySelector('.bb-batch-source-select');
  if(!enabled||!tracked(row)){if(prior)prior.remove();continue}
  const code=clean(row.dataset.productCode),item=stockItem(code),pMax=sourceAvailable(item,'PURCHASED'),zMax=sourceAvailable(item,'ZERO_COST');
  if(pMax===null||zMax===null){if(prior)prior.remove();continue}
  if(prior&&prior.dataset.batch===clean(batch()?.batchId)&&prior.dataset.code===code)continue;
  if(prior)prior.remove();
  const panel=document.createElement('div');panel.className='bb-batch-source-select';
  panel.dataset.batch=clean(batch()?.batchId);panel.dataset.code=code;
  const label=document.createElement('div');label.textContent='Batch Sale stock source · Purchased / Zero-Cost';label.className='bb-batch-source-title';
  const make=(name,key,max)=>{const wrap=document.createElement('label');wrap.textContent=name+' (available '+max+')';const input=document.createElement('input');input.type='number';input.min='0';input.step='any';input.max=String(max);input.dataset.source=key;input.setAttribute('aria-label',name+' stock sale quantity');wrap.append(input);return wrap};
  const inputs=document.createElement('div');inputs.className='bb-batch-source-grid';
  inputs.append(make('Purchased','PURCHASED',pMax),make('Zero-Cost','ZERO_COST',zMax));
  const status=document.createElement('div');status.className='bb-batch-source-status';
  panel.append(label,inputs,status);
  const invoiceQty=Math.max(0,qty(rowQty(row)?.value));
  const initialZero=Math.min(invoiceQty,zMax);
  panel.querySelector('[data-source="ZERO_COST"]').value=String(initialZero);
  panel.querySelector('[data-source="PURCHASED"]').value=String(Math.max(0,invoiceQty-initialZero));
  function message(){
   const values=panelValues(row),lineQty=qty(rowQty(row)?.value);
   const ok=values&&values.rawP!==''&&values.rawZ!==''&&values.p>=0&&values.z>=0&&values.p<=pMax+EPS&&values.z<=zMax+EPS&&Math.abs(values.p+values.z-lineQty)<=EPS;
   status.textContent=ok?'Source total '+(values.p+values.z)+' / Invoice '+lineQty:'Purchased + Zero-Cost must equal invoice quantity and remain within available stock';
   status.style.color=ok?'#2f855a':'#b42318';
  }
  inputs.addEventListener('input',message);rowQty(row)?.addEventListener('input',message);message();
  row.append(panel);
 }
}
const css=document.createElement('style');
css.textContent='.bb-batch-source-select{margin:7px 0;padding:8px;border:1px solid #bed0e4;border-radius:8px;background:#f5f9ff;font-size:11px}.bb-batch-source-title{font-weight:800;color:#17457a;margin-bottom:5px}.bb-batch-source-grid{display:flex;flex-wrap:wrap;gap:9px}.bb-batch-source-grid label{display:flex;flex-direction:column;color:#17457a;font-weight:700;gap:3px}.bb-batch-source-grid input{width:110px;max-width:100%;box-sizing:border-box;padding:5px;border:1px solid #acc2dd;border-radius:6px}.bb-batch-source-status{font-weight:700;margin-top:4px}';
document.head.appendChild(css);
const priorBuild=window.buildSalesInvoicePayload;
if(typeof priorBuild==='function'){
 window.buildSalesInvoicePayload=function(){
  const payload=priorBuild.apply(this,arguments);
  if(!active()||!Array.isArray(payload?.items))return payload;
  for(const item of payload.items){
   if(clean(item.entryType||'EXACT').toUpperCase()!=='EXACT')continue;
   const row=rows().find(x=>clean(x.dataset.lineId)===clean(item.lineId));
   if(!row||!tracked(row))continue;
   const vals=panelValues(row);
   if(!vals)continue;
   item.stockAllocations=[...(vals.p>EPS?[{source:'PURCHASED',qty:vals.p}]:[]),...(vals.z>EPS?[{source:'ZERO_COST',qty:vals.z}]:[])];
  }
  return payload;
 };
}
const priorComplete=window.completeInvoice;
if(typeof priorComplete==='function'){
 window.completeInvoice=function(event){
  if(!active())return priorComplete.apply(this,arguments);
  draw();
  for(const row of rows()){
   if(!tracked(row))continue;
   const panel=row.querySelector('.bb-batch-source-select');
   const lineQty=qty(rowQty(row)?.value);
   const v=panelValues(row);
   const item=stockItem(clean(row.dataset.productCode));
   const pMax=sourceAvailable(item,'PURCHASED'),zMax=sourceAvailable(item,'ZERO_COST');
   if(!v||!item||pMax===null||zMax===null||v.rawP===''||v.rawZ===''||
     v.p<0||v.z<0||v.p>pMax+EPS||v.z>zMax+EPS||Math.abs(v.p+v.z-lineQty)>EPS){
    if(event){event.preventDefault();event.stopPropagation();}
    alert('Batch source selection is incomplete or exceeds stock for '+clean(row.dataset.productCode)+'. Choose Purchased and Zero-Cost quantities before saving.');
    row.scrollIntoView({block:'center',behavior:'smooth'});return;
   }
  }
  return priorComplete.apply(this,arguments);
 };
}
const init=()=>{
 const host=document.getElementById('productList');
 if(host)new MutationObserver(draw).observe(host,{childList:true});
 const original=window.handleSimpleBatchChange;
 if(typeof original==='function')window.handleSimpleBatchChange=function(){const r=original.apply(this,arguments);setTimeout(draw,0);return r};
 const originalLoad=window.loadSimpleBatchPicker;
 if(typeof originalLoad==='function')window.loadSimpleBatchPicker=async function(){const result=await originalLoad.apply(this,arguments);draw();return result};
 draw();
};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
