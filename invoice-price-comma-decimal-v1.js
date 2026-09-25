/* BIG BROTHER — Invoice price comma decimal support V1
   In every invoice PRICE field, "," is treated exactly like ".".
   Applies to desktop + mobile and to dynamically added product price rows. */
(function(){
'use strict';

function isPriceInput(el){
  return !!el && (
    el.id === 'invoicePriceInput' ||
    el.classList?.contains('product-price-input')
  );
}

function normalizePriceText(value){
  let text=String(value??'')
    .replace(/,/g,'.')
    .replace(/[^\d.]/g,'');

  const dot=text.indexOf('.');
  if(dot>=0){
    text=
      text.slice(0,dot+1) +
      text.slice(dot+1).replace(/\./g,'');
  }
  return text;
}

function normalizeInput(input){
  if(!isPriceInput(input)) return false;

  const oldValue=String(input.value??'');
  const nextValue=normalizePriceText(oldValue);
  if(nextValue===oldValue) return false;

  let start=null;
  try{start=input.selectionStart}catch(_){}

  input.value=nextValue;

  if(start!=null){
    const commasBefore=(oldValue.slice(0,start).match(/,/g)||[]).length;
    const invalidBefore=(oldValue.slice(0,start).match(/[^\d.,]/g)||[]).length;
    const nextPos=Math.max(0,start-invalidBefore);
    try{input.setSelectionRange(nextPos,nextPos)}catch(_){}
  }
  return true;
}

function prepareInput(input){
  if(!isPriceInput(input) || input.dataset.bbCommaDecimal==='1') return;
  input.dataset.bbCommaDecimal='1';

  /* type=text is intentional: browsers disagree on whether type=number
     accepts a comma. Business logic still receives a normalized dot value. */
  try{input.type='text'}catch(_){}
  input.setAttribute('inputmode','decimal');
  input.setAttribute('autocomplete','off');
  input.setAttribute('pattern','[0-9]*[.,]?[0-9]*');
  normalizeInput(input);
}

function prepareAll(root=document){
  if(root?.nodeType===1 && isPriceInput(root)) prepareInput(root);
  root?.querySelectorAll?.('#invoicePriceInput,.product-price-input').forEach(prepareInput);
}

/* Capture runs before the legacy inline oninput=priceChanged(this),
   so Number(input.value) always sees "." rather than ",". */
document.addEventListener('input',event=>{
  const input=event.target;
  if(!isPriceInput(input)) return;
  prepareInput(input);
  normalizeInput(input);
},true);

document.addEventListener('change',event=>{
  const input=event.target;
  if(!isPriceInput(input)) return;
  prepareInput(input);
  normalizeInput(input);
},true);

document.addEventListener('focusin',event=>{
  if(isPriceInput(event.target)) prepareInput(event.target);
},true);

function init(){
  prepareAll(document);
  const observer=new MutationObserver(records=>{
    records.forEach(record=>{
      record.addedNodes.forEach(node=>{
        if(node?.nodeType===1) prepareAll(node);
      });
    });
  });
  observer.observe(document.body,{childList:true,subtree:true});
}

if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded',init,{once:true});
}else{
  init();
}

window.BBInvoicePriceCommaDecimal={
  normalize:normalizePriceText,
  prepareAll
};
})();