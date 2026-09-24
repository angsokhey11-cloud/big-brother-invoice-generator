/* BIG BROTHER — Desktop Confirmed Invoice Google Sheets Backup V2
   Supabase remains authoritative. Google Sheets is audit/continuity backup only.
   Backup payload is persisted locally before background send so invoice save stays fast. */
(function(){
  'use strict';

  const ENDPOINT='https://script.google.com/macros/s/AKfycbxnlB1T6sbqdItYfyXa6wYquXN6URbJhvWJOkE_cM57wsSWK0_uFEsK_DuWr_caQVgd/exec';
  const QUEUE_KEY='BB_INVOICE_BACKUP_QUEUE_V1';
  const MAX_QUEUE=100;

  const clean=v=>String(v==null?'':v).trim();
  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0};

  function sessionUserEmail(){
    try{
      const s=JSON.parse(localStorage.getItem('BB_SUPABASE_DEV_SESSION_V1')||'null');
      return clean(s?.user?.email||'');
    }catch(_){return''}
  }

  function toUsd(value,payload){
    const amount=num(value);
    const currency=clean(payload?.currency).toUpperCase();
    const rate=num(payload?.exchangeRate);
    return currency==='KHR'&&rate>0?amount/rate:amount;
  }

  function backupPayload(invoice){
    const items=Array.isArray(invoice?.items)?invoice.items:[];
    return {
      invoiceNo:clean(invoice?.invoiceNo),
      invoiceDate:clean(invoice?.invoiceDate),
      customerName:clean(invoice?.customer),
      customerPhone:clean(document.getElementById('customerPhone')?.value),
      customerAddress:clean(document.getElementById('customerAddress')?.value),
      items:items.map(item=>({
        productCode:clean(item?.productCode),
        productName:clean(item?.productName||item?.name),
        unit:clean(item?.unit),
        qty:num(item?.qty),
        unitPrice:toUsd(item?.unitPrice,invoice),
        amount:toUsd(item?.amount,invoice)
      })),
      productCount:items.length,
      totalQty:items.reduce((sum,item)=>sum+num(item?.qty),0),
      subtotalUSD:toUsd(invoice?.subtotal,invoice),
      discountUSD:toUsd(invoice?.discount,invoice),
      totalUSD:toUsd(invoice?.grandTotal,invoice),
      paidUSD:toUsd(invoice?.amountPaid,invoice),
      receivableUSD:toUsd(invoice?.creditAmount??invoice?.outstanding,invoice),
      paymentMethod:clean(invoice?.paymentMethod),
      transactionId:clean(invoice?.transactionId||invoice?.bankReference),
      salesman:clean(invoice?.salesperson),
      location:clean(invoice?.locationCode),
      note:clean(invoice?.note),
      supabaseInvoiceId:clean(invoice?.invoiceId),
      createdBy:sessionUserEmail(),
      invoiceCurrency:clean(invoice?.currency),
      exchangeRate:num(invoice?.exchangeRate)
    };
  }

  function readQueue(){
    try{
      const q=JSON.parse(localStorage.getItem(QUEUE_KEY)||'[]');
      return Array.isArray(q)?q:[];
    }catch(_){return[]}
  }

  function writeQueue(q){
    try{localStorage.setItem(QUEUE_KEY,JSON.stringify(q.slice(-MAX_QUEUE)))}catch(_){}
  }

  function payloadKey(payload){
    return clean(payload?.supabaseInvoiceId)||clean(payload?.invoiceNo);
  }

  function enqueue(payload){
    const key=payloadKey(payload);
    if(!key)return;
    const q=readQueue();
    if(!q.some(x=>payloadKey(x)===key))q.push(payload);
    writeQueue(q);
  }

  function dequeue(payload){
    const key=payloadKey(payload);
    if(!key)return;
    writeQueue(readQueue().filter(x=>payloadKey(x)!==key));
  }

  async function send(payload){
    await fetch(ENDPOINT,{
      method:'POST',
      mode:'no-cors',
      cache:'no-store',
      keepalive:true,
      headers:{'Content-Type':'text/plain;charset=UTF-8'},
      body:JSON.stringify(payload)
    });
    return true;
  }

  function dispatchConfirmedInvoice(invoice){
    const payload=backupPayload(invoice);
    enqueue(payload);
    send(payload)
      .then(()=>dequeue(payload))
      .catch(error=>console.warn('BIG BROTHER invoice backup queued for retry:',error));
    return true;
  }

  async function retryQueue(){
    const q=readQueue();
    if(!q.length)return;
    for(const payload of q){
      try{
        await send(payload);
        dequeue(payload);
      }catch(_){/* keep queued */}
    }
  }

  function install(){
    const bundle=window.postSalesInvoiceBundle;
    if(typeof bundle==='function'&&!bundle.__bbBackupWrapped){
      const wrapped=async function(invoicePayload,paymentPayload){
        const result=await bundle.call(this,invoicePayload,paymentPayload);
        try{
          const backupInvoice={
            ...(invoicePayload||{}),
            invoiceId:String(result?.invoiceId||invoicePayload?.invoiceId||'').trim()
          };
          dispatchConfirmedInvoice(backupInvoice);
        }catch(error){console.warn('BIG BROTHER invoice backup:',error)}
        return result;
      };
      wrapped.__bbBackupWrapped=true;
      window.postSalesInvoiceBundle=wrapped;
    }

    const single=window.postSalesInvoice;
    if(typeof single==='function'&&!single.__bbBackupWrapped){
      const wrapped=async function(payload){
        const result=await single.call(this,payload);
        try{
          const backupInvoice={
            ...(payload||{}),
            invoiceId:String(result?.invoiceId||payload?.invoiceId||'').trim()
          };
          dispatchConfirmedInvoice(backupInvoice);
        }catch(error){console.warn('BIG BROTHER invoice backup:',error)}
        return result;
      };
      wrapped.__bbBackupWrapped=true;
      window.postSalesInvoice=wrapped;
    }

    retryQueue().catch(()=>{});
  }

  function loadFastCompletePatch(){
    if(document.getElementById('bbDesktopInvoiceFastCompleteV2'))return;
    const script=document.createElement('script');
    script.id='bbDesktopInvoiceFastCompleteV2';
    script.src='invoice-fast-complete-desktop-v2.js?v=20260924-desktopconfirm4';
    script.async=false;
    (document.head||document.documentElement).appendChild(script);
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',install,{once:true});
    document.addEventListener('DOMContentLoaded',loadFastCompletePatch,{once:true});
  }else{
    install();
    loadFastCompletePatch();
  }

  window.BBInvoiceBackupDesktopV2={retry:retryQueue,dispatch:dispatchConfirmedInvoice,endpoint:ENDPOINT};
})();
