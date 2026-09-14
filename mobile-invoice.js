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

  function improveMobileInputs(){
    const invoiceNo=$('#invoiceNumber');
    if(invoiceNo){
      invoiceNo.readOnly=true;
      invoiceNo.setAttribute('aria-readonly','true');
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
