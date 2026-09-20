/* BIG BROTHER — Mobile Customer Telegram Invoice Share V1
   Mobile Invoice Generator only.
   The saved Supabase invoice is authoritative for eligibility/payment status.
   Telegram remains notification-only. */
(function(){
  'use strict';

  const SUPABASE_URL='https://sjfhlaclgmkwwofzstok.supabase.co';
  const SUPABASE_KEY='sb_publishable_w762jR65CWwlO30fKQsYOw_6L9grx8S';
  const SESSION_KEY='BB_SUPABASE_DEV_SESSION_V1';
  const SEND_URL=SUPABASE_URL+'/functions/v1/bb-telegram-invoice-send';

  let session=null;

  function clean(value){
    return String(value==null?'':value).trim();
  }

  function esc(value){
    return clean(value).replace(/[&<>"']/g,c=>({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
    }[c]));
  }

  function readSession(){
    try{return JSON.parse(localStorage.getItem(SESSION_KEY)||'null')}catch(_){return null}
  }

  function saveSession(value){
    session=value||null;
    try{
      if(!value){localStorage.removeItem(SESSION_KEY);return}
      if(!value.expires_at&&value.expires_in){
        value.expires_at=Math.floor(Date.now()/1000)+Number(value.expires_in);
      }
      localStorage.setItem(SESSION_KEY,JSON.stringify(value));
    }catch(_){}
  }

  async function parse(response){
    const text=await response.text();
    let data={};
    try{data=text?JSON.parse(text):{}}catch(_){data={message:text}}
    if(!response.ok||data.success===false){
      const error=new Error(data.message||data.error||('Request failed ('+response.status+')'));
      error.status=response.status;
      error.data=data;
      throw error;
    }
    return data;
  }

  async function refreshSession(){
    const current=readSession();
    if(!current?.refresh_token)throw new Error('Please sign in to BIG BROTHER.');
    const response=await fetch(SUPABASE_URL+'/auth/v1/token?grant_type=refresh_token',{
      method:'POST',
      headers:{apikey:SUPABASE_KEY,'Content-Type':'application/json'},
      body:JSON.stringify({refresh_token:current.refresh_token}),
      cache:'no-store'
    });
    const next=await parse(response);
    saveSession(next);
    return next;
  }

  async function ensureSession(){
    session=readSession();
    if(!session?.access_token)throw new Error('Please sign in to BIG BROTHER.');
    const now=Math.floor(Date.now()/1000);
    if(session.expires_at&&Number(session.expires_at)<now+45){
      await refreshSession();
    }
    return session;
  }

  async function requestJson(payload,retry=true){
    await ensureSession();
    const doRequest=()=>fetch(SEND_URL,{
      method:'POST',
      headers:{
        apikey:SUPABASE_KEY,
        Authorization:'Bearer '+session.access_token,
        'Content-Type':'application/json'
      },
      body:JSON.stringify(payload||{}),
      cache:'no-store'
    });
    let response=await doRequest();
    if(response.status===401&&retry){
      await refreshSession();
      response=await doRequest();
    }
    return parse(response);
  }

  async function sendImage(invoiceId,blob,retry=true){
    await ensureSession();
    const form=new FormData();
    form.append('invoice_id',invoiceId);
    form.append('image',blob,'big-brother-invoice.png');

    const doRequest=()=>fetch(SEND_URL,{
      method:'POST',
      headers:{
        apikey:SUPABASE_KEY,
        Authorization:'Bearer '+session.access_token
      },
      body:form,
      cache:'no-store'
    });

    let response=await doRequest();
    if(response.status===401&&retry){
      await refreshSession();
      return sendImage(invoiceId,blob,false);
    }
    return parse(response);
  }

  function money(value,currency){
    const n=Number(value)||0;
    const cur=clean(currency).toUpperCase()||'USD';
    if(cur==='KHR')return 'KHR '+Math.round(n).toLocaleString('en-US');
    return '$'+n.toLocaleString('en-US',{
      minimumFractionDigits:2,
      maximumFractionDigits:2
    });
  }

  function statusMeta(status){
    const key=clean(status).toUpperCase();
    if(key==='PAID')return {icon:'✅',label:'PAID',cls:'paid'};
    if(key==='PARTIAL')return {icon:'🟡',label:'PARTIAL PAYMENT',cls:'partial'};
    return {icon:'🟠',label:'CREDIT',cls:'credit'};
  }

  function closeModal(){
    document.getElementById('bbTelegramInvoiceModal')?.remove();
  }

  function askToSend(data){
    closeModal();

    return new Promise(resolve=>{
      const invoice=data?.invoice||{};
      const customer=data?.customer||{};
      const destination=data?.destination||{};
      const status=statusMeta(invoice.payment_status);

      const modal=document.createElement('div');
      modal.id='bbTelegramInvoiceModal';
      modal.className='bb-tg-invoice-backdrop';
      modal.innerHTML=`
        <div class="bb-tg-invoice-card" role="dialog" aria-modal="true" aria-labelledby="bbTgInvoiceTitle">
          <div class="bb-tg-invoice-head">
            <div>
              <div class="bb-tg-invoice-kicker">TELEGRAM CUSTOMER INVOICE</div>
              <h2 id="bbTgInvoiceTitle">Send Invoice to Telegram?</h2>
            </div>
            <button type="button" class="bb-tg-invoice-x" aria-label="Close">×</button>
          </div>

          <div class="bb-tg-invoice-status ${status.cls}">
            <span>${status.icon}</span>
            <strong>${esc(status.label)}</strong>
          </div>

          <div class="bb-tg-invoice-details">
            <div><span>Customer</span><strong>${esc(customer.customer_name||customer.customer_id||'Customer')}</strong></div>
            <div><span>Invoice</span><strong>${esc(invoice.invoice_no||'')}</strong></div>
            <div><span>Total</span><strong>${esc(money(invoice.grand_total,invoice.currency))}</strong></div>
            <div><span>Paid</span><strong>${esc(money(invoice.amount_paid,invoice.currency))}</strong></div>
            <div><span>Outstanding</span><strong>${esc(money(invoice.outstanding,invoice.currency))}</strong></div>
            <div><span>Destination</span><strong>${esc(destination.label||'Telegram')}</strong></div>
          </div>

          ${destination.verified===false?'<div class="bb-tg-invoice-warning">⚠️ This customer route has not been Test Topic verified yet.</div>':''}

          <div class="bb-tg-invoice-note">
            BIG BROTHER will send this exact saved invoice picture to the configured customer group/topic.
          </div>

          <div class="bb-tg-invoice-actions">
            <button type="button" class="bb-tg-invoice-cancel">Not Now</button>
            <button type="button" class="bb-tg-invoice-send">✈ Send Invoice</button>
          </div>
        </div>`;

      document.body.appendChild(modal);

      let settled=false;
      const finish=value=>{
        if(settled)return;
        settled=true;
        closeModal();
        resolve(value);
      };

      modal.querySelector('.bb-tg-invoice-x')?.addEventListener('click',()=>finish(false));
      modal.querySelector('.bb-tg-invoice-cancel')?.addEventListener('click',()=>finish(false));
      modal.querySelector('.bb-tg-invoice-send')?.addEventListener('click',()=>finish(true));
      modal.addEventListener('click',event=>{
        if(event.target===modal)finish(false);
      });
    });
  }

  function showSending(data){
    closeModal();
    const modal=document.createElement('div');
    modal.id='bbTelegramInvoiceModal';
    modal.className='bb-tg-invoice-backdrop';
    const invoice=data?.invoice||{};
    modal.innerHTML=`
      <div class="bb-tg-invoice-card bb-tg-invoice-progress">
        <div class="bb-tg-invoice-spinner" aria-hidden="true"></div>
        <h2>Sending Invoice…</h2>
        <p>${esc(invoice.invoice_no||'Invoice')} is being delivered to the customer's Telegram topic.</p>
      </div>`;
    document.body.appendChild(modal);
  }

  function showResult(title,message,kind='success'){
    closeModal();
    return new Promise(resolve=>{
      const modal=document.createElement('div');
      modal.id='bbTelegramInvoiceModal';
      modal.className='bb-tg-invoice-backdrop';
      modal.innerHTML=`
        <div class="bb-tg-invoice-card bb-tg-invoice-result ${esc(kind)}">
          <div class="bb-tg-invoice-result-icon">${kind==='success'?'✅':'⚠️'}</div>
          <h2>${esc(title)}</h2>
          <p>${esc(message)}</p>
          <button type="button" class="bb-tg-invoice-done">Done</button>
        </div>`;
      document.body.appendChild(modal);
      modal.querySelector('.bb-tg-invoice-done')?.addEventListener('click',()=>{
        closeModal();
        resolve();
      });
    });
  }

  async function afterComplete(payload,saveResult){
    const invoiceId=clean(saveResult?.invoiceId||payload?.invoiceId);
    if(!invoiceId)return;

    let eligibility;
    try{
      eligibility=await requestJson({
        action:'eligibility',
        invoice_id:invoiceId
      });
    }catch(error){
      console.warn('Telegram invoice eligibility check failed:',error);
      return;
    }

    if(!eligibility?.eligible)return;

    const shouldSend=await askToSend(eligibility);
    if(!shouldSend)return;

    showSending(eligibility);

    try{
      if(typeof window.createInvoiceImage!=='function'){
        throw new Error('Invoice image generator is unavailable.');
      }
      const image=await window.createInvoiceImage();
      const result=await sendImage(invoiceId,image);

      await showResult(
        'Invoice Sent',
        (result?.invoice_no||eligibility.invoice?.invoice_no||'Invoice')+
        ' was sent to '+(result?.destination_label||eligibility.destination?.label||'the customer Telegram topic')+'.',
        'success'
      );
    }catch(error){
      console.error('Telegram invoice send failed:',error);
      const retryAvailable=error?.data?.retry_available===true;
      await showResult(
        'Telegram Send Failed',
        (error?.message||'Could not send the invoice.')+
        (retryAvailable?' The invoice picture was saved safely and can be retried from Telegram Bot Manager.':''),
        'error'
      );
    }
  }

  window.BBTelegramInvoiceShare={
    afterComplete,
    eligibility:invoiceId=>requestJson({action:'eligibility',invoice_id:invoiceId})
  };
})();