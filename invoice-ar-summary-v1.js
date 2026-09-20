/* BIG BROTHER — Invoice Customer A/R Summary V1
   - Draft preview: live current A/R + projected current credit invoice
   - Saved invoice: exact post-save A/R from Supabase
   - Never blocks the accounting save if summary lookup fails
*/
(function(){
  'use strict';

  if(window.BBInvoiceARSummaryV1)return;

  const SUPABASE_URL='https://sjfhlaclgmkwwofzstok.supabase.co';
  const SUPABASE_KEY='sb_publishable_w762jR65CWwlO30fKQsYOw_6L9grx8S';
  const SESSION_KEY='BB_SUPABASE_DEV_SESSION_V1';
  const FUNCTION_URL=SUPABASE_URL+'/functions/v1/bb-invoice-ar-summary';

  let session=null;
  let currentSummary=null;
  let draftInFlight=null;
  let draftKey='';
  let draftFetchedAt=0;

  function clean(value){
    return String(value==null?'':value).trim();
  }

  function num(value){
    const n=Number(value);
    return Number.isFinite(n)?n:0;
  }

  function cloneTotals(value){
    const out={};
    const source=value&&typeof value==='object'?value:{};
    Object.keys(source).forEach(key=>{
      const amount=num(source[key]);
      if(amount>0.000001)out[String(key).toUpperCase()]=amount;
    });
    return out;
  }

  function readSession(){
    try{return JSON.parse(localStorage.getItem(SESSION_KEY)||'null')}catch(_){return null}
  }

  function saveSession(value){
    session=value||null;
    try{
      if(!value){
        localStorage.removeItem(SESSION_KEY);
        return;
      }
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

  async function request(payload,retry=true){
    await ensureSession();

    const doRequest=()=>fetch(FUNCTION_URL,{
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

  function getDraftContext(){
    try{
      if(typeof window.buildSalesInvoicePayload!=='function')return null;
      const payload=window.buildSalesInvoicePayload();
      if(!payload)return null;

      const customerId=clean(payload.customerId);
      const locationCode=clean(payload.locationCode);

      if(!customerId||!locationCode)return null;

      return {
        customerId,
        locationCode,
        invoiceNo:clean(payload.invoiceNo),
        paymentMethod:clean(payload.paymentMethod),
        currency:clean(payload.currency).toUpperCase()||'USD',
        outstanding:Math.max(0,num(payload.outstanding)),
        customerName:clean(payload.customer)
      };
    }catch(_){
      return null;
    }
  }

  function projectDraft(server,context){
    const previous=cloneTotals(server?.latest_outstanding?.totals);
    const latest=cloneTotals(previous);
    let openInvoiceCount=Number(server?.latest_outstanding?.openInvoiceCount||0);

    if(context.outstanding>0.000001){
      latest[context.currency]=(num(latest[context.currency])+context.outstanding);
      openInvoiceCount+=1;
    }

    return {
      mode:'projected',
      customer_id:context.customerId,
      customer_name:context.customerName||server?.customer?.customer_name||'',
      invoice_no:context.invoiceNo,
      invoice_id:'',
      currency:context.currency,
      this_invoice_outstanding:context.outstanding,
      previous_outstanding:{
        totals:previous,
        openInvoiceCount:Number(server?.latest_outstanding?.openInvoiceCount||0)
      },
      latest_outstanding:{
        totals:latest,
        openInvoiceCount
      },
      generated_at:server?.generated_at||new Date().toISOString()
    };
  }

  function savedSummary(server){
    const invoice=server?.invoice||{};
    return {
      mode:'saved',
      customer_id:clean(server?.customer?.customer_id),
      customer_name:clean(server?.customer?.customer_name),
      invoice_no:clean(invoice.invoice_no),
      invoice_id:clean(invoice.invoice_id),
      currency:clean(invoice.currency).toUpperCase()||'USD',
      this_invoice_outstanding:Math.max(0,num(invoice.outstanding)),
      previous_outstanding:{
        totals:cloneTotals(server?.previous_outstanding?.totals),
        openInvoiceCount:Number(server?.previous_outstanding?.openInvoiceCount||0)
      },
      latest_outstanding:{
        totals:cloneTotals(server?.latest_outstanding?.totals),
        openInvoiceCount:Number(server?.latest_outstanding?.openInvoiceCount||0)
      },
      generated_at:server?.generated_at||new Date().toISOString()
    };
  }

  async function loadDraft(force=false){
    const context=getDraftContext();

    if(
      !context ||
      context.outstanding<=0.000001
    ){
      currentSummary=null;
      return null;
    }

    const key=context.customerId+'|'+context.locationCode+'|'+context.invoiceNo+'|'+
      context.currency+'|'+context.outstanding;

    if(
      !force &&
      currentSummary?.mode==='projected' &&
      draftKey===key &&
      Date.now()-draftFetchedAt<5000
    ){
      return currentSummary;
    }

    if(!force&&draftInFlight&&draftKey===key)return draftInFlight;

    draftKey=key;

    draftInFlight=(async()=>{
      try{
        const data=await request({
          customer_id:context.customerId,
          location_code:context.locationCode
        });
        currentSummary=projectDraft(data,context);
        draftFetchedAt=Date.now();
        return currentSummary;
      }catch(error){
        console.warn('BIG BROTHER invoice A/R draft summary:',error);
        return currentSummary;
      }finally{
        draftInFlight=null;
      }
    })();

    return draftInFlight;
  }

  async function loadSaved(invoiceId){
    const id=clean(invoiceId);
    if(!id)return null;

    try{
      const data=await request({invoice_id:id});
      currentSummary=savedSummary(data);
      draftKey='';
      draftFetchedAt=Date.now();
      return currentSummary;
    }catch(error){
      console.warn('BIG BROTHER invoice A/R saved summary:',error);
      return currentSummary;
    }
  }

  function summaryForState(state){
    if(!state||num(state.outstanding)<=0.000001)return null;
    if(!currentSummary)return null;

    const invoiceNo=clean(state.invoiceNo);
    if(
      currentSummary.invoice_no &&
      invoiceNo &&
      currentSummary.invoice_no!==invoiceNo
    ){
      return null;
    }

    return currentSummary;
  }

  function clear(){
    currentSummary=null;
    draftKey='';
    draftFetchedAt=0;
  }

  function installWrappers(){
    if(window.__bbInvoiceARSummaryInstalled)return;

    const originalSave=window.postSalesInvoiceBundle;
    const originalClear=window.clearAllAfterSuccessfulSave;
    const originalPreview=window.previewInvoice;
    const originalImage=window.createInvoiceImage;

    if(
      typeof originalSave!=='function' ||
      typeof originalClear!=='function' ||
      typeof originalPreview!=='function' ||
      typeof originalImage!=='function'
    ){
      setTimeout(installWrappers,60);
      return;
    }

    window.__bbInvoiceARSummaryInstalled=true;

    window.postSalesInvoiceBundle=async function(invoicePayload,paymentPayload){
      const result=await originalSave.apply(this,arguments);

      try{
        if(num(invoicePayload?.outstanding)>0.000001){
          await loadSaved(result?.invoiceId||invoicePayload?.invoiceId);
        }else{
          clear();
        }
      }catch(error){
        console.warn('BIG BROTHER invoice A/R post-save summary:',error);
      }

      return result;
    };

    window.previewInvoice=async function(event){
      try{await loadDraft(true)}catch(_){}
      return originalPreview.call(this,event);
    };

    window.createInvoiceImage=async function(){
      /*
       * If post-save exact data already matches this invoice, keep it.
       * Otherwise refresh draft A/R immediately before image creation.
       */
      const context=getDraftContext();
      const exactMatches=
        currentSummary?.mode==='saved' &&
        clean(currentSummary.invoice_no)===clean(context?.invoiceNo);

      if(!exactMatches){
        try{await loadDraft(true)}catch(_){}
      }

      return originalImage.apply(this,arguments);
    };

    window.clearAllAfterSuccessfulSave=function(){
      try{
        return originalClear.apply(this,arguments);
      }finally{
        clear();
      }
    };

    const scheduleDraft=()=>{
      clearTimeout(scheduleDraft.timer);
      scheduleDraft.timer=setTimeout(()=>{
        loadDraft(false).catch(()=>{});
      },220);
    };

    ['customerName','paymentMethod','amountPaid','currency','exchangeRate']
      .forEach(id=>{
        const input=document.getElementById(id);
        if(!input)return;
        input.addEventListener('change',scheduleDraft);
        input.addEventListener('input',scheduleDraft);
      });
  }

  window.BBInvoiceARSummaryV1={
    loadDraft,
    loadSaved,
    summaryForState,
    clear,
    get current(){return currentSummary}
  };

  window.BBInvoiceARSummaryForState=summaryForState;

  installWrappers();
})();