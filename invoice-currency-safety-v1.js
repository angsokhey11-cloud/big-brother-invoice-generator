/* BIG BROTHER — Invoice Currency Safety Guard V1
   Shared desktop + mobile.
   Suspicious totals require two confirmations before Complete may continue.
*/
(function(){
'use strict';

const BUILD='20261004-currency-safety1';
const $=id=>document.getElementById(id);

function currency(){
  try{
    return String(window.getCurrency?.()||$('currency')?.value||'USD').trim().toUpperCase();
  }catch(_){
    return String($('currency')?.value||'USD').trim().toUpperCase();
  }
}

function grandTotal(){
  const text=String($('grandTotal')?.textContent||'').trim();
  const value=Number(text.replace(/[^0-9.-]/g,''));
  return Number.isFinite(value)?value:0;
}

function suspicious(){
  const cur=currency();
  const total=grandTotal();

  // Let normal invoice validation handle empty/zero-value drafts.
  if(total<=0)return null;

  if(cur==='USD'&&total>10000){
    return {
      currency:cur,
      total,
      reason:'USD invoice total is over $10,000.',
      display:'$'+total.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})
    };
  }

  if(cur==='KHR'&&total<10000){
    return {
      currency:cur,
      total,
      reason:'KHR invoice total is below ៛10,000.',
      display:'៛'+total.toLocaleString(undefined,{maximumFractionDigits:0})
    };
  }

  return null;
}

function focusCurrency(){
  const select=$('currency');
  if(!select)return;

  try{
    select.scrollIntoView({behavior:'smooth',block:'center',inline:'nearest'});
  }catch(_){}

  setTimeout(()=>{
    try{select.focus({preventScroll:true})}catch(_){select.focus()}
    try{
      if(typeof select.showPicker==='function')select.showPicker();
      else select.click();
    }catch(_){
      try{select.click()}catch(__){}
    }
  },80);
}

function confirmTwice(warning){
  const first=
    '⚠️ POSSIBLE WRONG CURRENCY\n\n'+
    warning.reason+'\n'+
    'Current total: '+warning.display+'\n\n'+
    'Please check the selected currency.\n\n'+
    'Is this currency and total really correct?';

  if(!window.confirm(first)){
    focusCurrency();
    return false;
  }

  const second=
    '⚠️ SECOND CONFIRMATION\n\n'+
    'Currency: '+warning.currency+'\n'+
    'Invoice total: '+warning.display+'\n\n'+
    'Confirm again to SAVE this invoice with this currency.';

  if(!window.confirm(second)){
    focusCurrency();
    return false;
  }

  return true;
}

function install(){
  const current=window.completeInvoice;
  if(typeof current!=='function'||current.__bbCurrencySafetyGuard)return;

  const wrapped=async function bbCurrencySafetyComplete(event){
    const warning=suspicious();

    if(warning&&!confirmTwice(warning)){
      if(event){
        event.preventDefault?.();
        event.stopPropagation?.();
      }
      return;
    }

    return current.apply(this,arguments);
  };

  wrapped.__bbCurrencySafetyGuard=true;
  wrapped.__bbCurrencySafetyWrapped=current;
  window.completeInvoice=wrapped;
}

function boot(){
  install();

  // Other desktop/mobile extensions may wrap Complete after this script loads.
  // Re-check briefly and always keep this guard on the outermost live handler.
  let tries=0;
  const timer=setInterval(()=>{
    tries++;
    install();
    if(tries>=40)clearInterval(timer);
  },250);

  window.BB_INVOICE_CURRENCY_SAFETY_BUILD=BUILD;
}

if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded',boot,{once:true});
}else{
  boot();
}
})();