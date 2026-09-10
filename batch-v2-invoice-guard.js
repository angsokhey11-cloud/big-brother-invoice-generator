/* BIG BROTHER — Invoice Generator Batch V2 availability layer V1.1 */
(function(){
'use strict';
const EPS=0.000001;
const num=v=>Number(v)||0;
const clean=v=>String(v==null?'':v).trim();

function batch(){
  try{return typeof getSelectedSimpleBatch==='function'?getSelectedSimpleBatch():null}catch(_){return null}
}
function remaining(row){return num(row?.remainingQty!==undefined?row.remainingQty:row?.pendingQty)}
function masterProduct(code){
  try{return (Array.isArray(products)?products:[]).find(p=>clean(p.code)===clean(code))||null}catch(_){return null}
}
function exactRows(b){
  const src=Array.isArray(b?.exactItems)?b.exactItems:(Array.isArray(b?.items)?b.items:[]);
  return src.filter(x=>clean(x.productCode)&&remaining(x)>EPS);
}
function groupRows(b){
  return (Array.isArray(b?.groupItems)?b.groupItems:[])
    .filter(g=>clean(g.groupCode)&&clean(g.groupName)&&remaining(g)>EPS)
    .map(g=>({
      entryType:'GROUP',
      code:clean(g.groupCode),
      name:clean(g.groupName),
      groupCode:clean(g.groupCode),
      groupName:clean(g.groupName),
      unit:clean(g.unit),
      barcode:'',productBarcode:'',category:'Product Group',usdPrice:0,active:true,
      remainingQty:remaining(g),
      members:(Array.isArray(g.members)?g.members:[]).filter(m=>remaining(m)>EPS)
    }));
}
function pendingProduct(){
  try{
    if(typeof pendingInvoiceProduct==='undefined'||!pendingInvoiceProduct)return null;
    return pendingInvoiceProduct.product||pendingInvoiceProduct;
  }catch(_){return null}
}
function formatQty(v){return num(v).toLocaleString(undefined,{maximumFractionDigits:3})}

/* When a Batch is selected, its live stock becomes the product catalogue. */
window.getSelectedBatchGroupProducts=function(){const b=batch();return b?groupRows(b):[]};
window.getInvoiceSearchPool=function(){
  const b=batch();
  if(!b){
    try{return (Array.isArray(products)?products:[]).map(p=>({...p,entryType:'EXACT'}))}catch(_){return []}
  }
  const exact=exactRows(b).map(row=>{
    const p=masterProduct(row.productCode)||{};
    return {...p,
      entryType:'EXACT',
      code:clean(row.productCode),
      name:clean(row.productName)||clean(p.name)||clean(row.productCode),
      unit:clean(row.unit)||clean(p.unit),
      remainingQty:remaining(row),
      batchId:clean(b.batchId)
    };
  });
  return [...groupRows(b),...exact];
};
window.findInvoiceSearchProductByCode=function(code){
  const wanted=clean(code);
  if(!wanted)return null;
  return getInvoiceSearchPool().find(x=>clean(x.code)===wanted)||null;
};

function refreshBatchHint(){
  const b=batch();
  const status=document.getElementById('simpleBatchStatus');
  if(!status||!b)return;
  const rem=num(b.totalRemainingQty);
  status.textContent='✓ '+clean(b.batchId)+' · Live Batch stock '+formatQty(rem)+' remaining · zero-stock items are unavailable.';
  status.style.color='#2f855a';
}
const oldChange=window.handleSimpleBatchChange;
if(typeof oldChange==='function'){
  window.handleSimpleBatchChange=function(){const r=oldChange.apply(this,arguments);setTimeout(refreshBatchHint,0);return r};
}

/* Show live availability inside the quantity popup. */
const oldQtyPrompt=window.openInvoiceQtyPrompt;
if(typeof oldQtyPrompt==='function'){
  window.openInvoiceQtyPrompt=function(product,effectiveUsdPrice){
    const out=oldQtyPrompt.apply(this,arguments);
    const b=batch();
    const m=document.getElementById('invoiceQtyMessage');
    if(b&&m&&product){
      const limit=remaining(product);
      m.textContent=limit>EPS
        ? 'Batch Available: '+formatQty(limit)+' in '+clean(b.batchId)+'.'
        : 'This item has no stock remaining in '+clean(b.batchId)+'.';
      m.style.color=limit>EPS?'#2f855a':'#c53030';
    }
    return out;
  };
}

/* Stop obvious over-quantity entries before save; Supabase remains authoritative. */
const qtyForm=document.getElementById('invoiceQtyForm');
if(qtyForm){
  qtyForm.addEventListener('submit',function(event){
    const b=batch();
    if(!b)return;
    const p=pendingProduct();
    if(!p)return;
    const q=num(document.getElementById('invoiceQtyInput')?.value);
    const limit=remaining(p);
    const m=document.getElementById('invoiceQtyMessage');
    if(!(limit>EPS)){
      event.preventDefault();event.stopImmediatePropagation();
      if(m){m.textContent='This item has no stock remaining in '+clean(b.batchId)+'.';m.style.color='#c53030';}
      return;
    }
    if(q>limit+EPS){
      event.preventDefault();event.stopImmediatePropagation();
      if(m){m.textContent='Only '+formatQty(limit)+' remaining in '+clean(b.batchId)+'.';m.style.color='#c53030';}
      return;
    }
    if(m){m.textContent='Batch Available after this line: '+formatQty(limit-q)+' in '+clean(b.batchId)+'.';m.style.color='#2f855a';}
  },true);
}

/* Refresh product choices when live Batch data finishes loading. */
const oldLoad=window.loadSimpleBatchPicker;
if(typeof oldLoad==='function'){
  window.loadSimpleBatchPicker=async function(){const r=await oldLoad.apply(this,arguments);refreshBatchHint();try{renderInvoiceProductOptions()}catch(_){}return r};
}
setTimeout(refreshBatchHint,0);
})();
