/* BIG BROTHER — Invoice Generator Split Payment V1
   Shared mobile + desktop payment extension.
   Payment Method: Cash + Bank
   One fully-paid invoice -> two Supabase payment rows. */
(function(){
  'use strict';

  const METHOD='Cash + Bank';
  const BUILD='20260924-cashbank1';
  const $=id=>document.getElementById(id);
  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0};
  const clean=v=>String(v==null?'':v).trim();

  function isSplit(){
    return clean($('paymentMethod')?.value)===METHOD;
  }

  function grandTotal(){
    const text=clean($('grandTotal')?.textContent);
    return num(text.replace(/[^0-9.-]/g,''));
  }

  function currency(){
    try{return clean(window.getCurrency?.()||$('currency')?.value||'USD').toUpperCase()}catch(_){return 'USD'}
  }

  function tolerance(){
    return currency()==='KHR'?0.5:0.005;
  }

  function ensureOption(){
    const select=$('paymentMethod');
    if(!select)return;
    if([...select.options].some(o=>o.value===METHOD))return;
    const option=document.createElement('option');
    option.value=METHOD;
    option.textContent=METHOD;
    const credit=[...select.options].find(o=>o.value==='Credit');
    if(credit)credit.insertAdjacentElement('beforebegin',option);
    else select.appendChild(option);
  }

  function field(id,label){
    const row=document.createElement('div');
    row.id=id+'Row';
    row.style.display='none';
    row.innerHTML=
      '<label for="'+id+'">'+label+'</label>'+
      '<input id="'+id+'" type="number" inputmode="decimal" min="0" step="0.01" value="" autocomplete="off">';
    return row;
  }

  function ensureFields(){
    const grid=document.querySelector('.transaction-details .grid-2');
    if(!grid)return;

    if(!$('splitCashAmount')){
      const cash=field('splitCashAmount','Cash Amount');
      const bank=field('splitBankAmount','Bank Amount');
      const bankRow=$('paymentBankRow');
      grid.insertBefore(cash,bankRow||null);
      grid.insertBefore(bank,bankRow||null);

      const help=document.createElement('div');
      help.id='splitPaymentHelpRow';
      help.style.cssText='display:none;grid-column:1/-1;font-size:12px;font-weight:700;color:#60758b;margin-top:-2px';
      help.innerHTML='<span id="splitPaymentHelp">Cash + Bank must equal Grand Total.</span>';
      grid.insertBefore(help,bankRow||null);

      for(const id of ['splitCashAmount','splitBankAmount']){
        $(id)?.addEventListener('input',()=>{
          updateStatus();
          forcePaidTotal();
        });
      }
    }
  }

  function setVisible(el,show){
    if(el)el.style.display=show?'':'none';
  }

  function forcePaidTotal(){
    if(!isSplit())return;
    const paid=$('amountPaid');
    if(!paid)return;
    const total=grandTotal();
    if(Math.abs(num(paid.value)-total)>tolerance())paid.value=total;
    paid.readOnly=true;
    paid.setAttribute('aria-readonly','true');
  }

  function splitValues(){
    return {
      cash:Math.max(0,num($('splitCashAmount')?.value)),
      bank:Math.max(0,num($('splitBankAmount')?.value))
    };
  }

  function updateStatus(){
    const help=$('splitPaymentHelp');
    if(!help)return;
    const {cash,bank}=splitValues();
    const total=grandTotal();
    const sum=cash+bank;
    const remaining=total-sum;
    const symbol=currency()==='KHR'?'៛':'$';

    if(!isSplit()){
      help.textContent='Cash + Bank must equal Grand Total.';
      help.style.color='#60758b';
      return;
    }

    if(cash<=0||bank<=0){
      help.textContent='Enter both Cash Amount and Bank Amount.';
      help.style.color='#b66a00';
      return;
    }

    if(Math.abs(remaining)<=tolerance()){
      help.textContent='✓ Split total matches Grand Total: '+symbol+total.toLocaleString(undefined,{minimumFractionDigits:currency()==='KHR'?0:2,maximumFractionDigits:currency()==='KHR'?0:2});
      help.style.color='#198754';
    }else{
      const word=remaining>0?'Remaining':'Over';
      help.textContent=word+': '+symbol+Math.abs(remaining).toLocaleString(undefined,{minimumFractionDigits:currency()==='KHR'?0:2,maximumFractionDigits:currency()==='KHR'?0:2});
      help.style.color='#c62828';
    }
  }

  function applyUI(){
    ensureOption();
    ensureFields();

    const split=isSplit();
    setVisible($('splitCashAmountRow'),split);
    setVisible($('splitBankAmountRow'),split);
    setVisible($('splitPaymentHelpRow'),split);

    if(split){
      setVisible($('paymentBankRow'),true);
      setVisible($('transactionIdRow'),true);
      forcePaidTotal();
    }else{
      const paid=$('amountPaid');
      if(paid){
        paid.readOnly=false;
        paid.removeAttribute('aria-readonly');
      }
    }
    updateStatus();
  }

  function validateSplit(showAlert){
    if(!isSplit())return true;
    const total=grandTotal();
    const {cash,bank}=splitValues();
    const bankName=clean($('paymentBank')?.value);
    const tx=clean($('transactionId')?.value);

    let message='';
    if(total<=0)message='Grand Total must be greater than 0.';
    else if(cash<=0)message='Please enter the Cash Amount.';
    else if(bank<=0)message='Please enter the Bank Amount.';
    else if(Math.abs((cash+bank)-total)>tolerance()){
      message='Cash Amount + Bank Amount must equal the Grand Total.\n\nGrand Total: '+total+'\nCash: '+cash+'\nBank: '+bank;
    }else if(!bankName)message='Please select a Payment Bank.';
    else if(!tx)message='Transaction ID is required for the Bank portion.';

    if(message&&showAlert)alert(message);
    return !message;
  }

  function installLogic(){
    if(window.__bbCashBankInstalled)return;
    window.__bbCashBankInstalled=true;

    ensureOption();
    ensureFields();

    const originalCalculate=window.calculate;
    if(typeof originalCalculate==='function'){
      window.calculate=function bbSplitCalculate(){
        const result=originalCalculate.apply(this,arguments);
        if(isSplit()){
          const paid=$('amountPaid');
          const total=grandTotal();
          if(paid&&Math.abs(num(paid.value)-total)>tolerance()){
            paid.value=total;
            originalCalculate.apply(this,arguments);
          }
          if(paid){
            paid.readOnly=true;
            paid.setAttribute('aria-readonly','true');
          }
        }
        updateStatus();
        return result;
      };
    }

    const originalHandle=window.handlePaymentMethodChange;
    if(typeof originalHandle==='function'){
      window.handlePaymentMethodChange=function bbSplitPaymentMethodChange(){
        const result=originalHandle.apply(this,arguments);
        applyUI();
        if(isSplit()&&typeof window.calculate==='function')window.calculate();
        return result;
      };
    }

    const originalState=window.getFinalInvoiceState;
    if(typeof originalState==='function'){
      window.getFinalInvoiceState=function bbSplitFinalInvoiceState(){
        const state=originalState.apply(this,arguments);
        if(isSplit()){
          const {cash,bank}=splitValues();
          state.amountPaid=state.grandTotal;
          state.creditAmount=0;
          state.outstanding=0;
          state.invoiceHasCredit=false;
          state.splitCashAmount=cash;
          state.splitBankAmount=bank;
        }
        return state;
      };
    }

    const originalBuildInvoice=window.buildSalesInvoicePayload;
    if(typeof originalBuildInvoice==='function'){
      window.buildSalesInvoicePayload=function bbSplitBuildInvoicePayload(){
        const payload=originalBuildInvoice.apply(this,arguments);
        if(isSplit()){
          const {cash,bank}=splitValues();
          payload.paymentMethod=METHOD;
          payload.amountPaid=payload.grandTotal;
          payload.creditAmount=0;
          payload.outstanding=0;
          payload.status='Paid';
          payload.splitCashAmount=cash;
          payload.splitBankAmount=bank;
          payload.bankReference=payload.transactionId||'';
        }
        return payload;
      };
    }

    const originalShould=window.shouldCreatePaymentRecord;
    window.shouldCreatePaymentRecord=function bbSplitShouldCreatePaymentRecord(payload){
      if(clean(payload?.paymentMethod)===METHOD)return true;
      return typeof originalShould==='function'?originalShould(payload):false;
    };

    const originalBuildPayment=window.buildPaymentPayload;
    window.buildPaymentPayload=function bbSplitBuildPaymentPayload(payload){
      if(clean(payload?.paymentMethod)===METHOD){
        return {
          invoiceId:payload.invoiceId,
          invoiceNo:payload.invoiceNo,
          paymentDate:payload.invoiceDate,
          customer:payload.customer,
          locationCode:payload.locationCode,
          salesperson:payload.salesperson,
          paymentMethod:METHOD,
          bankPayment:payload.paymentBank||'',
          transactionId:payload.transactionId||'',
          bankReference:payload.transactionId||'',
          currency:payload.currency,
          exchangeRate:payload.exchangeRate,
          amount:Number(payload.grandTotal)||0,
          cashAmount:Number(payload.splitCashAmount)||0,
          bankAmount:Number(payload.splitBankAmount)||0,
          note:'Initial split invoice payment'
        };
      }
      return typeof originalBuildPayment==='function'?originalBuildPayment(payload):null;
    };

    for(const fnName of ['clearAllAfterSuccessfulSave','clearAll']){
      const original=window[fnName];
      if(typeof original!=='function')continue;
      window[fnName]=function bbSplitClear(){
        const result=original.apply(this,arguments);
        if($('splitCashAmount'))$('splitCashAmount').value='';
        if($('splitBankAmount'))$('splitBankAmount').value='';
        applyUI();
        return result;
      };
    }

    /* Capture before the legacy/desktop Complete handler.
       Supabase remains the final authoritative validation too. */
    document.addEventListener('click',event=>{
      const button=event.target?.closest?.('.complete-btn');
      if(!button||!isSplit())return;
      if(!validateSplit(true)){
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
      }
    },true);

    $('paymentMethod')?.addEventListener('change',()=>setTimeout(applyUI,0));
    window.addEventListener('pageshow',()=>setTimeout(applyUI,0));

    applyUI();
    if(typeof window.calculate==='function')window.calculate();
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',installLogic,{once:true});
  }else{
    installLogic();
  }

  window.BB_INVOICE_SPLIT_PAYMENT_BUILD=BUILD;
})();