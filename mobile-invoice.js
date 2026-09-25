/* BIG BROTHER — Invoice Generator Mobile UI V1
   Re-arranges existing Invoice Generator DOM only.
   Accounting logic, IDs, Supabase adapter and desktop source are unchanged. */
(function(){
  'use strict';

  const $=(selector,root=document)=>root.querySelector(selector);

  function addPageFlags(){
    document.documentElement.classList.add('bb-mobile-invoice-page');
    const params=new URLSearchParams(location.search);
    if(params.get('embed')==='1')document.documentElement.classList.add('bb-mobile-embedded');
  }

  function moveBatchToHeader(){
    const batch=$('#batchNumber');
    const header=$('.header-currency');
    if(!batch||!header)return;
    const field=batch.parentElement;
    if(!field||field.classList.contains('bb-mobile-batch-field'))return;
    field.classList.add('bb-mobile-batch-field');
    const label=$('label',field);
    if(label)label.textContent='Batch Number';
    header.appendChild(field);
  }

  function buildAddressToggle(){
    const row=$('.address-shipping-row');
    if(!row||$('#bbMobileAddressToggle'))return;

    row.hidden=true;

    const button=document.createElement('button');
    button.type='button';
    button.id='bbMobileAddressToggle';
    button.className='bb-mobile-address-toggle no-print';
    button.setAttribute('aria-expanded','false');
    button.innerHTML=
      '<span class="bb-mobile-address-text">'
      +'<span>📍 Address &amp; Shipping</span>'
      +'<small>Tap to view or edit</small>'
      +'</span>'
      +'<span class="bb-mobile-arrow">▼</span>';

    button.addEventListener('click',()=>{
      const open=button.getAttribute('aria-expanded')==='true';
      button.setAttribute('aria-expanded',String(!open));
      row.hidden=open;
      if(!open){
        setTimeout(()=>$('#customerAddress')?.focus(),30);
      }
    });

    row.parentNode.insertBefore(button,row);
  }

  function reorderMobileSections(){
    const left=$('.bb-left-column');
    const right=$('.bb-right-column');
    if(!left||!right||$('#bbMobilePaymentRow'))return;

    const product=$('.desktop-product-card',left);
    const exchange=$('#exchangeCalculationBox');
    const banking=$('.banking-input-card');
    const totals=$('.totals-box');
    const transaction=$('.transaction-details');
    const note=$('.note-card');
    const actions=$('.bb-action-card');

    const paymentRow=document.createElement('div');
    paymentRow.id='bbMobilePaymentRow';
    paymentRow.className='bb-mobile-payment-row';

    if(totals)paymentRow.appendChild(totals);
    if(transaction)paymentRow.appendChild(transaction);

    const anchor=exchange||product;
    if(anchor&&anchor.parentNode===left){
      anchor.insertAdjacentElement('afterend',paymentRow);
    }else{
      left.appendChild(paymentRow);
    }

    if(note)left.appendChild(note);
    if(banking)left.appendChild(banking);
    if(actions)left.appendChild(actions);
  }

  function keepOnlyMobileActions(){
    const actions=$('.bb-action-card .actions');
    if(actions)actions.setAttribute('aria-hidden','true');

    const bottom=$('.bottom-action-row');
    if(!bottom)return;

    const preview=$('.preview-btn',bottom);
    const complete=$('.complete-btn',bottom);
    [...bottom.children].forEach(node=>{
      if(node!==preview&&node!==complete)node.style.display='none';
    });
  }

  function isIOSMobile(){
    const ua=navigator.userAgent||'';
    return /iPhone|iPad|iPod/i.test(ua) ||
      (navigator.platform==='MacIntel' && Number(navigator.maxTouchPoints||0)>1);
  }

  function isDecimalInvoiceInput(input){
    if(!input || String(input.tagName||'').toLowerCase()!=='input')return false;

    const mode=String(input.getAttribute('inputmode')||input.inputMode||'').toLowerCase();
    if(mode==='decimal')return true;

    const stepRaw=String(input.getAttribute('step')||'').trim().toLowerCase();
    if(stepRaw==='any')return true;
    if(stepRaw){
      const step=Number(stepRaw);
      if(Number.isFinite(step) && step>0 && !Number.isInteger(step))return true;
    }

    const semantic=[
      input.id,
      input.name,
      input.className,
      input.getAttribute('aria-label')
    ].filter(Boolean).join(' ').toLowerCase();

    return /(qty|quantity|price|amount|rate|discount|paid|payment|credit|total|value)/.test(semantic);
  }

  function patchIOSDecimalInput(input){
    if(!isIOSMobile() || !isDecimalInvoiceInput(input) || input.dataset.bbIosInvoiceDecimal==='1')return;

    input.dataset.bbIosInvoiceDecimal='1';

    try{input.type='text'}catch(_){}
    input.setAttribute('inputmode','decimal');
    input.removeAttribute('pattern');
    input.setAttribute('autocapitalize','none');
    input.setAttribute('spellcheck','false');
  }

  function patchIOSDecimalInputs(root=document){
    if(!isIOSMobile())return;

    if(root.matches?.('input'))patchIOSDecimalInput(root);
    root.querySelectorAll?.('input').forEach(patchIOSDecimalInput);
  }

  function normalizeIOSDecimal(event){
    const input=event.target;
    if(!input || input.dataset?.bbIosInvoiceDecimal!=='1')return;

    const raw=String(input.value||'');
    if(!raw.includes(','))return;

    const start=input.selectionStart;
    input.value=raw.replace(/,/g,'.');

    if(typeof start==='number'){
      try{input.setSelectionRange(start,start)}catch(_){}
    }
  }

  function installIOSDecimalSupport(){
    if(!isIOSMobile())return;

    patchIOSDecimalInputs(document);

    document.addEventListener('input',normalizeIOSDecimal,true);

    new MutationObserver(records=>{
      for(const record of records){
        for(const node of record.addedNodes||[]){
          if(node?.nodeType===1)patchIOSDecimalInputs(node);
        }
      }
    }).observe(document.body,{childList:true,subtree:true});

    setTimeout(()=>patchIOSDecimalInputs(document),120);
    setTimeout(()=>patchIOSDecimalInputs(document),500);
    setTimeout(()=>patchIOSDecimalInputs(document),1400);
  }

  function improveMobileInputs(){
    const invoiceNo=$('#invoiceNumber');
    if(invoiceNo){
      invoiceNo.readOnly=false;
      invoiceNo.removeAttribute('readonly');
      invoiceNo.removeAttribute('aria-readonly');
      invoiceNo.setAttribute('autocomplete','off');
    }

    $('#customerName')?.setAttribute('enterkeyhint','next');
    $('#customerPhone')?.setAttribute('enterkeyhint','next');
    $('#customerPhone')?.setAttribute('inputmode','tel');
    $('#customerAddress')?.setAttribute('enterkeyhint','next');
    $('#shippingTo')?.setAttribute('enterkeyhint','next');
    $('#productSearch')?.setAttribute('enterkeyhint','search');
    $('#salesName')?.setAttribute('enterkeyhint','next');
    $('#transactionId')?.setAttribute('enterkeyhint','done');
  }

  function addDesktopSwitch(){
    if(new URLSearchParams(location.search).get('embed')==='1')return;
    if($('#bbMobileDesktopSwitch'))return;

    const header=$('.header-main');
    if(!header)return;

    const link=document.createElement('a');
    link.id='bbMobileDesktopSwitch';
    link.href='index.html';
    link.textContent='Desktop';
    link.title='Switch to Desktop Invoice Generator';
    link.style.cssText='display:block;margin:5px 2px 0 auto;width:max-content;color:#1765c1;font-size:10px;font-weight:800;text-decoration:none';
    header.appendChild(link);
  }

  function preserveAddressVisibilityDuringPrint(){
    window.addEventListener('beforeprint',()=>{
      const row=$('.address-shipping-row');
      if(row)row.dataset.mobileWasHidden=String(row.hidden),row.hidden=false;
    });
    window.addEventListener('afterprint',()=>{
      const row=$('.address-shipping-row');
      if(row&&row.dataset.mobileWasHidden==='true')row.hidden=true;
    });
  }

  function init(){
    addPageFlags();
    moveBatchToHeader();
    buildAddressToggle();
    reorderMobileSections();
    keepOnlyMobileActions();
    improveMobileInputs();
    installIOSDecimalSupport();
    addDesktopSwitch();
    preserveAddressVisibilityDuringPrint();

    /* Direct-sale / payment scripts can reveal extra controls after startup.
       Keep the mobile layout intact without touching their business logic. */
    const observer=new MutationObserver(()=>{
      moveBatchToHeader();
      keepOnlyMobileActions();
    });
    observer.observe(document.body,{childList:true,subtree:true});
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',init,{once:true});
  }else{
    init();
  }
})();
