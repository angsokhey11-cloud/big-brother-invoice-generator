/* BIG BROTHER — Batch Sale source selection V2 (staged).
   Stock source selected for every tracked batch invoice line.
   No automatic zero-cost-first deduction. Backend validates atomically. */
(function(){
'use strict';
if(window.BBBatchSaleSourceV2)return;
window.BBBatchSaleSourceV2=true;
const EPS=0.000001;
const $=s=>document.querySelector(s);
const rows=()=>[...document.querySelectorAll('#productList .product')];
const num=v=>Number(v)||0,clean=v=>String(v??'').trim();
const fmt=v=>num(v).toLocaleString('en-US',{maximumFractionDigits:4});
const selected=()=>{try{return typeof getSelectedSimpleBatch==='function'?getSelectedSimpleBatch():null}catch(_){return null}};
const hasBatch=()=>!!clean($('#batchNumber')?.value);
const type=row=>clean(row.dataset.entryType||'EXACT').toUpperCase();
const factor=row=>Math.max(1,num(row.dataset.bbSellingFactor)||1);
const qtyInput=row=>row.querySelector('.product-qty-input');
const sourceRow=row=>row.querySelector('.bb-batch-source-v2');
const isTracked=row=>{
 if(type(row)==='GROUP')return true;
 try{
  const meta=typeof getInvoiceSearchPool==='function'
    ?getInvoiceSearchPool().find(p=>clean(p.code)===clean(row.dataset.productCode)):null;
  if(clean(meta?.itemType||'PRODUCT').toUpperCase()==='SERVICE'||meta?.trackStock===false)return false;
 }catch(_){}
 return true;
};
function members(row,batch){
 if(!batch)return [];
 if(type(row)==='GROUP'){
  const code=clean(row.dataset.productGroupCode||row.dataset.productCode);
  const group=(batch.groupItems||[]).find(g=>clean(g.groupCode)===code);
  return group?group.members||[]:[];
 }
 const item=(batch.exactItems||[]).find(x=>clean(x.productCode)===clean(row.dataset.productCode));
 return item?[item]:[];
}
function available(m,key){return Math.max(0,num(m[key]));}
function panelBalance(row,batch){
 const m=members(row,batch);
 return {p:m.reduce((t,x)=>t+available(x,'purchasedRemainingQty'),0),
         z:m.reduce((t,x)=>t+available(x,'zeroCostRemainingQty'),0)};
}
const style=document.createElement('style');
style.textContent='.bb-batch-source-v2{margin:8px 0;padding:9px 10px;background:#f3f8ff;border:1px solid #c9def4;border-radius:9px;font-size:11px;color:#173f77}.bb-batch-source-v2 .bb-bss-head{display:flex;align-items:center;justify-content:space-between;gap:9px;font-weight:900}.bb-batch-source-v2 .bb-bss-balance{font-size:10px;color:#5c718b;margin:5px 0 7px}.bb-batch-source-v2 select,.bb-batch-source-v2 input{box-sizing:border-box;max-width:100%;min-height:34px;border:1px solid #b9cfe6;border-radius:7px;padding:5px 7px;background:#fff;color:#173f77;font:inherit;font-weight:700}.bb-batch-source-v2 .bb-bss-fields{display:grid;grid-template-columns:minmax(105px,1.1fr) repeat(2,minmax(70px,.7fr));gap:7px;align-items:end}.bb-batch-source-v2 label{display:grid;gap:3px;font-size:9px;font-weight:800}.bb-batch-source-v2 .bb-bss-mixed{display:none}.bb-batch-source-v2[data-mode="MIXED"] .bb-bss-mixed{display:grid}.bb-batch-source-v2 .bb-bss-message{color:#a43630;margin-top:6px;font-size:10px;font-weight:800}.bb-batch-source-v2 .bb-bss-message.ok{color:#157750}@media(max-width:460px){.bb-batch-source-v2 .bb-bss-fields{grid-template-columns:1fr 1fr}.bb-batch-source-v2 .bb-bss-field-source{grid-column:1/-1}}';
document.head.appendChild(style);
function refreshRows(){
 const batch=selected();
 for(const row of rows()){
  const old=sourceRow(row);
  const has=!!batch&&isTracked(row);
  if(!has){if(old)old.hidden=true;if(qtyInput(row))qtyInput(row).readOnly=false;continue}
  let panel=old;
  if(!panel){
   panel=document.createElement('div');panel.className='bb-batch-source-v2 no-print';
   panel.innerHTML='<div class="bb-bss-head">Batch Stock Source <span class="bb-bss-title"></span></div><div class="bb-bss-balance"></div><div class="bb-bss-fields"><label class="bb-bss-field-source">Stock Source<select class="bb-bss-mode"><option value="">Select source…</option><option value="PURCHASED">Purchased</option><option value="ZERO_COST">Zero-Cost</option><option value="MIXED">Mixed</option></select></label><label class="bb-bss-mixed">Purchased Qty<input class="bb-bss-p" type="number" min="0" step="any" inputmode="decimal"></label><label class="bb-bss-mixed">Zero-Cost Qty<input class="bb-bss-z" type="number" min="0" step="any" inputmode="decimal"></label></div><div class="bb-bss-message"></div>';
   row.appendChild(panel);
   panel.querySelector('.bb-bss-mode').addEventListener('change',()=>{panel.dataset.mode=panel.querySelector('.bb-bss-mode').value;const q=qtyInput(row);if(q)q.readOnly=panel.dataset.mode==='MIXED';if(panel.dataset.mode==='MIXED'){panel.querySelector('.bb-bss-p').value=clean(q?.value);panel.querySelector('.bb-bss-z').value='0'}updatePanel(row)});
   for(const key of ['p','z'])panel.querySelector('.bb-bss-'+key).addEventListener('input',()=>{if(panel.dataset.mode==='MIXED'){const q=qtyInput(row);if(q)q.value=String(num(panel.querySelector('.bb-bss-p').value)+num(panel.querySelector('.bb-bss-z').value));try{window.calculate?.()}catch(_){}}updatePanel(row)});
   qtyInput(row)?.addEventListener('input',()=>updatePanel(row));
  }
  const bid=clean(batch.batchId);
  if(panel.dataset.batchId!==bid){panel.dataset.batchId=bid;panel.querySelector('.bb-bss-mode').value='';panel.dataset.mode='';panel.querySelector('.bb-bss-p').value='';panel.querySelector('.bb-bss-z').value='';}
  panel.hidden=false;updatePanel(row,batch);
 }
}
function updatePanel(row,batch=selected()){
 const panel=sourceRow(row);if(!panel||panel.hidden)return;
 const b=panelBalance(row,batch);
 panel.querySelector('.bb-bss-balance').textContent='Batch Available · Purchased '+fmt(b.p)+' · Zero-Cost '+fmt(b.z)+' · Total '+fmt(b.p+b.z);
 const mode=clean(panel.querySelector('.bb-bss-mode').value);
 panel.dataset.mode=mode;
 const q=num(qtyInput(row)?.value)*factor(row);
 const message=panel.querySelector('.bb-bss-message');
 if(!mode){message.textContent='Choose the exact source before completing the invoice.';message.className='bb-bss-message';return}
 const result=splitAmounts(row,q);
 if(Math.abs(result.p+result.z-q)>EPS){message.textContent='Purchased + Zero-Cost must equal Invoice Qty.';message.className='bb-bss-message';return}
 if(result.p>b.p+EPS||result.z>b.z+EPS){message.textContent='Selected source exceeds available Batch stock.';message.className='bb-bss-message';return}
 message.textContent='Selected · Purchased '+fmt(result.p)+' · Zero-Cost '+fmt(result.z);
 message.className='bb-bss-message ok';
}
function splitAmounts(row,baseQty){
 const panel=sourceRow(row),mode=clean(panel?.querySelector('.bb-bss-mode')?.value);
 if(mode==='PURCHASED')return {p:baseQty,z:0};
 if(mode==='ZERO_COST')return {p:0,z:baseQty};
 if(mode==='MIXED')return {p:num(panel.querySelector('.bb-bss-p').value)*factor(row),z:num(panel.querySelector('.bb-bss-z').value)*factor(row)};
 throw Error('Select Batch Stock Source for '+clean(row.dataset.product||row.dataset.productCode));
}
function allocations(row,baseQty,batch){
 const sources=members(row,batch);
 if(!sources.length)throw Error(clean(row.dataset.product||row.dataset.productCode)+': no available Batch source rows.');
 const split=splitAmounts(row,baseQty);
 if(split.p<0||split.z<0||Math.abs(split.p+split.z-baseQty)>EPS)throw Error('Source quantities do not match Invoice Qty for '+clean(row.dataset.product));
 const allocation=new Map(), sourceKeys=[['p','purchasedRemainingQty'],['z','zeroCostRemainingQty']];
 for(const [k,key] of sourceKeys){
  let need=split[k];if(need<=EPS)continue;
  for(const member of sources){
   if(need<=EPS)break;
   const code=clean(member.productCode),max=available(member,key);
   const take=Math.min(need,max);
   if(take<=EPS)continue;
   let current=allocation.get(code);
   if(!current){current={productCode:code,qty:0,purchasedQty:0,zeroCostQty:0};allocation.set(code,current)}
   current[k==='p'?'purchasedQty':'zeroCostQty']+=take;current.qty+=take;need-=take;
  }
  if(need>EPS)throw Error(clean(row.dataset.product||row.dataset.productCode)+': insufficient '+(k==='p'?'Purchased':'Zero-Cost')+' Batch stock, short by '+fmt(need));
 }
 const result=[...allocation.values()].filter(a=>a.qty>EPS).map(a=>Object.fromEntries(Object.entries(a).map(([k,v])=>[k,typeof v==='number'?Number(v.toFixed(6)):v])));
 if(Math.abs(result.reduce((t,a)=>t+a.qty,0)-baseQty)>EPS)throw Error('Allocation total does not match Invoice Qty');
 return result;
}
function validateAndApply(payload,batch){
 if(!payload||!Array.isArray(payload.items))throw Error('Invoice source payload is unavailable.');
 const requested=new Map();
 for(const item of payload.items){
  const row=rows().find(r=>clean(r.dataset.lineId)===clean(item.lineId));
  if(!row||!isTracked(row)||num(item.qty)<=EPS)continue;
  const allocationsForLine=allocations(row,num(item.qty),batch);
  for(const a of allocationsForLine){
   let z=requested.get(a.productCode)||{p:0,z:0};
   z.p+=a.purchasedQty;z.z+=a.zeroCostQty;requested.set(a.productCode,z);
  }
  item.stockAllocations=allocationsForLine;
 }
 for(const [code,requestedSource] of requested){
  const src=(batch.exactItems||[]).find(m=>clean(m.productCode)===code);
  if(!src)throw Error('Batch source data unavailable for '+code);
  if(requestedSource.p>available(src,'purchasedRemainingQty')+EPS||requestedSource.z>available(src,'zeroCostRemainingQty')+EPS)
   throw Error(code+': selected source quantities exceed current Batch availability.');
 }
 return payload;
}
const originalBuild=window.buildSalesInvoicePayload;
if(typeof originalBuild==='function')window.buildSalesInvoicePayload=function(){const payload=originalBuild.apply(this,arguments);if(!hasBatch())return payload;return validateAndApply(payload,selected())};
const originalComplete=window.completeInvoice;
if(typeof originalComplete==='function')window.completeInvoice=async function(event){
 if(!hasBatch())return originalComplete.apply(this,arguments);
 event?.preventDefault?.();
 try{
  const id=clean($('#batchNumber')?.value);
  if(!id)throw Error('Choose an Open Batch.');
  const rsp=await window.requestSimpleBatchList?.();
  if(!rsp?.success)throw Error('Could not refresh live Batch source balances.');
  const current=(typeof normalizeSimpleBatchRows==='function'?normalizeSimpleBatchRows(rsp.batches||[]):[])
   .find(b=>b.batchId===id);
  if(!current)throw Error('The selected Batch is no longer open or accessible.');
  const payload=originalBuild?.();
  validateAndApply(payload,current);
 }catch(error){alert('Batch Stock Source: '+(error?.message||String(error)));return}
 return originalComplete.apply(this,arguments);
};
$('#batchNumber')?.addEventListener('change',()=>setTimeout(refreshRows,0));
const list=$('#productList');if(list)new MutationObserver(refreshRows).observe(list,{childList:true,subtree:false});
window.addEventListener('load',refreshRows);
setTimeout(refreshRows,0);
})();