/* BIG BROTHER — Desktop Invoice Input Behavior V1
   Desktop only:
   - preserve manually keyed product prices when currency changes
   - accept comma or dot in payment amount inputs
*/
(function(){
'use strict';

const BUILD='20261004-desktop-input6';
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

function revealPaymentMethod(){
  const select=$('paymentMethod');
  if(!select)return;

  document.getElementById('bbPaymentMethodQuickMenu')?.remove();

  try{
    select.scrollIntoView({behavior:'smooth',block:'center',inline:'nearest'});
  }catch(_){}

  try{select.focus({preventScroll:true})}catch(_){select.focus()}

  const menu=document.createElement('div');
  menu.id='bbPaymentMethodQuickMenu';

  [...select.options]
    .filter(option=>String(option.value||'').trim())
    .forEach(option=>{
      const button=document.createElement('button');
      button.type='button';
      button.textContent=option.textContent||option.value;
      button.dataset.value=option.value;
      button.addEventListener('click',()=>{
        select.value=button.dataset.value||'';
        select.dispatchEvent(new Event('change',{bubbles:true}));
        menu.remove();
        try{select.focus({preventScroll:true})}catch(_){}
      });
      menu.appendChild(button);
    });

  document.body.appendChild(menu);

  const rect=select.getBoundingClientRect();
  const menuWidth=Math.max(rect.width,240);
  menu.style.position='fixed';
  menu.style.zIndex='2147483647';
  menu.style.width=menuWidth+'px';
  menu.style.left=Math.min(
    Math.max(8,rect.left),
    Math.max(8,window.innerWidth-menuWidth-8)
  )+'px';

  const estimatedHeight=Math.min(menu.childElementCount*39+8,310);
  const spaceBelow=window.innerHeight-rect.bottom-8;
  const top=spaceBelow>=estimatedHeight
    ? rect.bottom+4
    : Math.max(8,rect.top-estimatedHeight-4);
  menu.style.top=top+'px';

  const closeOutside=event=>{
    if(event.target===select||menu.contains(event.target))return;
    menu.remove();
    document.removeEventListener('pointerdown',closeOutside,true);
  };
  setTimeout(()=>document.addEventListener('pointerdown',closeOutside,true),0);

  const first=menu.querySelector('button');
  if(first){
    try{first.focus({preventScroll:true})}catch(_){first.focus()}
  }
}

function installCompletePaymentGuard(){
  const original=window.completeInvoice;
  if(typeof original!=='function'||original.__bbDesktopPaymentReveal)return;

  const wrapped=async function bbDesktopCompleteInvoice(event){
    const customerName=String($('customerName')?.value||'').trim();

    if(customerName){
      try{
        if(typeof window.fillCustomerInformation==='function'){
          window.fillCustomerInformation();
        }
      }catch(_){}

      let customerId='';
      try{
        const payload=typeof window.buildSalesInvoicePayload==='function'
          ? window.buildSalesInvoicePayload()
          : null;
        customerId=String(payload?.customerId||'').trim();
      }catch(_){}

      if(!customerId){
        if(event){
          event.preventDefault?.();
          event.stopPropagation?.();
        }

        alert('Customer does not exist in Customer Master. Please select a valid customer before completing the invoice.');

        const input=$('customerName');
        if(input){
          try{input.scrollIntoView({behavior:'smooth',block:'center',inline:'nearest'})}catch(_){}
          try{input.focus({preventScroll:true})}catch(_){input.focus()}
          try{input.select()}catch(_){}
        }

        try{
          if(typeof window.showCustomerOptions==='function'){
            window.showCustomerOptions();
          }
        }catch(_){}

        return;
      }
    }

    const payment=String($('paymentMethod')?.value||'').trim();

    if(!payment){
      if(event){
        event.preventDefault?.();
        event.stopPropagation?.();
      }

      revealPaymentMethod();
      return;
    }

    return original.apply(this,arguments);
  };

  wrapped.__bbDesktopPaymentReveal=true;
  window.completeInvoice=wrapped;
}

function init(){
  if(!$('bbPaymentMethodQuickMenuStyle')){
    const style=document.createElement('style');
    style.id='bbPaymentMethodQuickMenuStyle';
    style.textContent=`
      #bbPaymentMethodQuickMenu{
        padding:4px;
        border:1px solid #9fb7d4;
        border-radius:8px;
        background:#fff;
        box-shadow:0 12px 30px rgba(18,45,78,.22);
        max-height:310px;
        overflow:auto;
      }
      #bbPaymentMethodQuickMenu button{
        display:block;
        width:100%;
        min-height:36px;
        padding:8px 12px;
        border:0;
        border-radius:5px;
        background:#fff;
        color:#173b70;
        text-align:left;
        font:600 13px "Segoe UI",Tahoma,Arial,sans-serif;
        cursor:pointer;
      }
      #bbPaymentMethodQuickMenu button:hover,
      #bbPaymentMethodQuickMenu button:focus{
        outline:0;
        background:#1f63b5;
        color:#fff;
      }
    `;
    document.head.appendChild(style);
  }

  prepareAll(document);
  installCurrencyGuard();
  installCompletePaymentGuard();

  const observer=new MutationObserver(records=>{
    records.forEach(record=>{
      record.addedNodes.forEach(node=>{
        if(node?.nodeType===1)prepareAll(node);
      });
    });
    installCurrencyGuard();
    installCompletePaymentGuard();
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