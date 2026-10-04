/* BIG BROTHER — Desktop Invoice Input Behavior V1
   Desktop only:
   - preserve manually keyed product prices when currency changes
   - accept comma or dot in payment amount inputs
*/
(function(){
'use strict';

const BUILD='20261004-desktop-input2';
const $=id=>document.getElementById(id);

function normalizeDecimalText(value){
  let text=String(value??'')
    .replace(/,/g,'.')
    .replace(/[^\d.]/g,'');
  const dot=text.indexOf('.');
  if(dot>=0){
    text=text.slice(0,dot+1)+text.slice(dot+1).replace(/\./g,'');
  }
  return text;
}

function isPaymentAmountInput(input){
  if(!input)return false;
  return [
    'amountPaid',
    'splitCashAmount',
    'splitBankAmount',
    'bbActualBankAmount'
  ].includes(input.id);
}

function preparePaymentInput(input){
  if(!isPaymentAmountInput(input)||input.dataset.bbPaymentComma==='1')return;
  input.dataset.bbPaymentComma='1';
  try{input.type='text'}catch(_){}
  input.setAttribute('inputmode','decimal');
  input.setAttribute('autocomplete','off');
  input.setAttribute('pattern','[0-9]*[.,]?[0-9]*');
  input.value=normalizeDecimalText(input.value);
}

function normalizePaymentInput(input){
  if(!isPaymentAmountInput(input))return;
  preparePaymentInput(input);
  const oldValue=String(input.value??'');
  const nextValue=normalizeDecimalText(oldValue);
  if(nextValue===oldValue)return;
  let start=null;
  try{start=input.selectionStart}catch(_){}
  input.value=nextValue;
  if(start!=null){
    const invalidBefore=(oldValue.slice(0,start).match(/[^\d.,]/g)||[]).length;
    const nextPos=Math.max(0,start-invalidBefore);
    try{input.setSelectionRange(nextPos,nextPos)}catch(_){}
  }
}

document.addEventListener('input',event=>{
  const input=event.target;
  if(input?.classList?.contains('product-price-input')){
    const row=input.closest('.product');
    if(row)row.dataset.bbManualPrice='1';
  }
  if(isPaymentAmountInput(input))normalizePaymentInput(input);
},true);

document.addEventListener('change',event=>{
  if(isPaymentAmountInput(event.target))normalizePaymentInput(event.target);
},true);

document.addEventListener('focusin',event=>{
  if(isPaymentAmountInput(event.target))preparePaymentInput(event.target);
},true);

function prepareAll(root=document){
  ['amountPaid','splitCashAmount','splitBankAmount','bbActualBankAmount'].forEach(id=>{
    const input=(root?.id===id?root:null)||root?.querySelector?.('#'+id);
    if(input)preparePaymentInput(input);
  });
}

function installCurrencyGuard(){
  const original=window.changeCurrency;
  if(typeof original!=='function'||original.__bbDesktopManualPriceGuard)return;

  const wrapped=function bbDesktopManualPriceCurrencyChange(){
    /* Desktop rule: currency switching must NEVER rewrite the number
       already visible in a product Price box. The operator owns that value. */
    const priceRows=[...document.querySelectorAll('#productList .product')]
      .map(row=>({
        row,
        input:row.querySelector('.product-price-input'),
        value:row.querySelector('.product-price-input')?.value??''
      }))
      .filter(item=>item.input);

    const result=original.apply(this,arguments);

    const currency=String(window.getCurrency?.()||$('currency')?.value||'USD').toUpperCase();

    priceRows.forEach(item=>{
      if(!item.input||!document.body.contains(item.input))return;
      item.input.value=item.value;
      item.input.step=currency==='KHR'?'1':'0.0001';

      /* Keep the underlying row price aligned with the unchanged visible
         number so later customer-price refreshes do not convert it again. */
      item.row.dataset.bbManualPrice='1';
      const selectedValue=Number(String(item.value).replace(/,/g,'.'))||0;
      const rate=Number($('exchangeRate')?.value)||0;
      const usdValue=currency==='KHR'&&rate>0
        ? selectedValue/rate
        : selectedValue;
      item.row.dataset.usdPrice=String(usdValue);

      try{
        const lineId=String(item.row.dataset.lineId||'');
        const selected=Array.isArray(window.selectedProducts)
          ? window.selectedProducts.find(p=>String(p?.id||'')===lineId)
          : null;
        if(selected){
          selected.usdPrice=usdValue;
          selected.manualPrice=true;
        }
      }catch(_){}
    });

    if(typeof window.calculate==='function')window.calculate();
    return result;
  };
  wrapped.__bbDesktopManualPriceGuard=true;
  window.changeCurrency=wrapped;
}

function init(){
  prepareAll(document);
  installCurrencyGuard();

  const observer=new MutationObserver(records=>{
    records.forEach(record=>{
      record.addedNodes.forEach(node=>{
        if(node?.nodeType===1)prepareAll(node);
      });
    });
    installCurrencyGuard();
  });
  observer.observe(document.body,{childList:true,subtree:true});

  window.BB_INVOICE_DESKTOP_INPUT_BUILD=BUILD;
}

if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded',init,{once:true});
}else{
  init();
}
})();