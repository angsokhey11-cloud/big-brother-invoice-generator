/* BIG BROTHER — Invoice Generator Mobile Preview Scale V1
   Matches the proven 794px scaling method used by Your Invoices Mobile. */
(function(){
  'use strict';

  const BASE_WIDTH=794;
  let fitTimer=null;

  const $=(selector,root=document)=>root.querySelector(selector);

  function fitInvoicePreview(){
    const modal=$('#invoicePreviewModal');
    if(!modal||!modal.classList.contains('open'))return;

    const content=$('#invoicePreviewContent',modal);
    const invoice=$('.final-invoice',content||modal);
    if(!content||!invoice)return;

    let stage=$('.bb-mobile-invoice-preview-stage',content);

    if(!stage){
      stage=document.createElement('div');
      stage.className='bb-mobile-invoice-preview-stage';
      invoice.parentNode.insertBefore(stage,invoice);
      stage.appendChild(invoice);
    }else if(invoice.parentNode!==stage){
      stage.appendChild(invoice);
    }

    const availableWidth=Math.max(260,content.clientWidth);
    const scale=Math.min(1,availableWidth/BASE_WIDTH);

    stage.style.setProperty('--bb-invoice-scale',String(scale));

    const naturalHeight=Math.max(
      invoice.offsetHeight,
      invoice.scrollHeight,
      1
    );

    stage.style.height=Math.ceil(naturalHeight*scale)+'px';
    stage.style.width=Math.ceil(BASE_WIDTH*scale)+'px';
    stage.style.marginLeft='auto';
    stage.style.marginRight='auto';
  }

  function runFit(){
    clearTimeout(fitTimer);
    fitTimer=setTimeout(()=>{
      requestAnimationFrame(()=>{
        fitInvoicePreview();
        const content=$('#invoicePreviewContent');
        if(content)content.scrollTop=0;
      });
    },45);
  }

  function watchPreview(){
    const modal=$('#invoicePreviewModal');
    const content=$('#invoicePreviewContent');
    if(!modal||!content)return;

    if(!modal.dataset.bbMobilePreviewWatch){
      modal.dataset.bbMobilePreviewWatch='1';

      new MutationObserver(()=>{
        if(modal.classList.contains('open')){
          runFit();
          setTimeout(fitInvoicePreview,180);
          setTimeout(fitInvoicePreview,500);
        }
      }).observe(modal,{
        attributes:true,
        attributeFilter:['class','aria-hidden']
      });
    }

    if(!content.dataset.bbMobilePreviewWatch){
      content.dataset.bbMobilePreviewWatch='1';

      new MutationObserver(()=>{
        if(modal.classList.contains('open')){
          runFit();
          setTimeout(fitInvoicePreview,120);
        }
      }).observe(content,{
        childList:true,
        subtree:true
      });
    }

    window.addEventListener('resize',fitInvoicePreview,{passive:true});
    window.addEventListener('orientationchange',()=>{
      setTimeout(fitInvoicePreview,120);
      setTimeout(fitInvoicePreview,420);
    },{passive:true});
  }

  function init(){
    watchPreview();

    /* Preview DOM is already in the legacy source, but retry once in case another
       startup patch finishes immediately after this mobile script. */
    setTimeout(watchPreview,120);
    setTimeout(watchPreview,500);
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',init,{once:true});
  }else{
    init();
  }
})();
