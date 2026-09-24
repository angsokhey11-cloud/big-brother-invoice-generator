/* BIG BROTHER — Desktop Invoice Product Button Picker V1
   Desktop only.
   Replaces the search box with:
   - Add Product button
   - Calculator-style Use Product Groups checkbox
   - one horizontal row of up to 7 Product Name buttons
   - live Batch remaining-product filtering
*/
(function(){
  'use strict';

  const BUILD='20260924-desktopproductbuttons1';
  const PAGE_SIZE=7;
  const EPS=0.000001;

  const PRODUCT_ORDER=[
    'KIR3-2L','KIRB-2L','KIR0-830','KIR3-830',
    'FF-2L','AF-2L','VP-2L','OM-2L',
    'GF-190','GF-1L','GFJ-1L',
    'KIRP-Y135','KIRS-Y135','KIRV-Y135',
    'CH-O220','CHM-220','CHP-220','CHS-220','CHT-220'
  ];
  const GROUP_ORDER=[
    'KIR-2L-GRP','KIR-830-GRP',
    'FF-2L','AF-2L','VP-2L','OM-2L',
    'GF-190','GF-1L','GFJ-1L',
    'KIR-135-GRP','CMP-220ML-GRP'
  ];

  const PRODUCT_RANK=new Map(PRODUCT_ORDER.map((code,index)=>[code,index]));
  const GROUP_RANK=new Map(GROUP_ORDER.map((code,index)=>[code,index]));

  const clean=value=>String(value==null?'':value).trim();
  const num=value=>{
    const n=Number(value);
    return Number.isFinite(n)?n:0;
  };
  const q=selector=>document.querySelector(selector);

  let page=0;
  let useGroups=false;
  let open=false;
  let refreshing=false;

  function codeOf(product){
    return clean(product?.code||product?.productCode).toUpperCase();
  }

  function nameOf(product){
    return clean(product?.name||product?.productName)||codeOf(product)||'Product';
  }

  function isGroup(product){
    return clean(product?.entryType).toUpperCase()==='GROUP';
  }

  function remainingOf(product){
    return num(
      product?.remainingQty!==undefined
        ? product.remainingQty
        : product?.pendingQty
    );
  }

  function accountId(){
    try{
      const session=JSON.parse(
        localStorage.getItem('BB_SUPABASE_DEV_SESSION_V1')||'null'
      );
      return clean(session?.user?.id||session?.user?.email)||'anonymous';
    }catch(_){
      return 'anonymous';
    }
  }

  function groupPreferenceKey(){
    return 'bb_invoice_desktop_use_groups_v1_'+accountId();
  }

  function readGroupPreference(){
    try{
      return localStorage.getItem(groupPreferenceKey())==='1';
    }catch(_){
      return false;
    }
  }

  function saveGroupPreference(){
    try{
      localStorage.setItem(
        groupPreferenceKey(),
        useGroups?'1':'0'
      );
    }catch(_){}
  }

  function productCompare(a,b){
    const ac=codeOf(a);
    const bc=codeOf(b);
    const ar=PRODUCT_RANK.has(ac)?PRODUCT_RANK.get(ac):9999;
    const br=PRODUCT_RANK.has(bc)?PRODUCT_RANK.get(bc):9999;
    if(ar!==br)return ar-br;
    return nameOf(a).localeCompare(nameOf(b),undefined,{sensitivity:'base'});
  }

  function groupCompare(a,b){
    const ac=codeOf(a);
    const bc=codeOf(b);
    const ar=GROUP_RANK.has(ac)?GROUP_RANK.get(ac):9999;
    const br=GROUP_RANK.has(bc)?GROUP_RANK.get(bc):9999;
    if(ar!==br)return ar-br;
    return productCompare(a,b);
  }

  function selectedBatch(){
    try{
      return typeof getSelectedSimpleBatch==='function'
        ? getSelectedSimpleBatch()
        : null;
    }catch(_){
      return null;
    }
  }

  function rawPool(){
    try{
      return typeof getInvoiceSearchPool==='function'
        ? getInvoiceSearchPool()
        : [];
    }catch(_){
      return [];
    }
  }

  function groupedBatchRows(batch,pool){
    const groups=pool.filter(row=>isGroup(row)&&remainingOf(row)>EPS);
    const memberCodes=new Set();

    (Array.isArray(batch?.groupItems)?batch.groupItems:[])
      .filter(group=>remainingOf(group)>EPS)
      .forEach(group=>{
        (Array.isArray(group?.members)?group.members:[])
          .forEach(member=>{
            if(remainingOf(member)>EPS){
              const code=clean(member?.productCode).toUpperCase();
              if(code)memberCodes.add(code);
            }
          });
      });

    const unmatchedExact=pool.filter(row=>
      !isGroup(row) &&
      remainingOf(row)>EPS &&
      !memberCodes.has(codeOf(row))
    );

    return [...groups,...unmatchedExact].sort(groupCompare);
  }

  function visibleRows(){
    const batch=selectedBatch();
    const pool=rawPool();

    if(!batch){
      return pool
        .filter(row=>!isGroup(row))
        .slice()
        .sort(productCompare);
    }

    if(useGroups){
      return groupedBatchRows(batch,pool);
    }

    return pool
      .filter(row=>!isGroup(row)&&remainingOf(row)>EPS)
      .slice()
      .sort(productCompare);
  }

  function totalPages(rows){
    return Math.max(1,Math.ceil(rows.length/PAGE_SIZE));
  }

  function normalizedPage(rows){
    const pages=totalPages(rows);
    if(page>=pages)page=pages-1;
    if(page<0)page=0;
    return page;
  }

  function pickerContextText(rows){
    const batch=selectedBatch();
    if(batch){
      return clean(batch.batchId)+' · Remaining products only · '+rows.length+' item'+(rows.length===1?'':'s');
    }
    return 'Direct Sale · All Products · '+rows.length+' item'+(rows.length===1?'':'s');
  }

  function syncToggle(){
    const toggle=q('#bbInvoiceDesktopUseGroups');
    const label=q('#bbInvoiceDesktopGroupLabel');
    const batch=selectedBatch();

    if(!toggle)return;

    toggle.checked=batch?useGroups:false;
    toggle.disabled=!batch;

    if(label){
      label.classList.toggle('disabled',!batch);
      label.title=batch
        ? 'Show Product Groups like Calculator.'
        : 'Product Groups are available when a Batch is selected.';
    }
  }

  function render(){
    const wrap=q('#bbInvoiceDesktopPicker');
    const panel=q('#bbInvoiceDesktopProductPanel');
    const buttons=q('#bbInvoiceDesktopProductButtons');
    const meta=q('#bbInvoiceDesktopProductMeta');
    const pageText=q('#bbInvoiceDesktopProductPage');
    const prev=q('#bbInvoiceDesktopProductPrev');
    const next=q('#bbInvoiceDesktopProductNext');
    const add=q('#bbInvoiceDesktopProductAdd');

    if(!wrap||!panel||!buttons||!meta||!pageText||!prev||!next||!add)return;

    const rows=visibleRows();
    const current=normalizedPage(rows);
    const pages=totalPages(rows);
    const start=current*PAGE_SIZE;
    const pageRows=rows.slice(start,start+PAGE_SIZE);

    syncToggle();

    meta.textContent=pickerContextText(rows);
    pageText.textContent=rows.length?((current+1)+' / '+pages):'0 / 0';
    prev.disabled=current<=0;
    next.disabled=current>=pages-1 || !rows.length;

    add.textContent=refreshing?'Refreshing Batch…':(open?'Close Products':'+ Add Product');
    add.disabled=refreshing;

    panel.hidden=!open;

    buttons.innerHTML='';

    if(!open)return;

    if(!rows.length){
      const empty=document.createElement('div');
      empty.className='bb-invoice-product-empty';
      empty.textContent=selectedBatch()
        ? 'No remaining products in this Batch.'
        : 'No products are available.';
      buttons.appendChild(empty);
      return;
    }

    pageRows.forEach(product=>{
      const button=document.createElement('button');
      button.type='button';
      button.className='bb-invoice-product-name-button';
      button.textContent=nameOf(product);

      const remaining=remainingOf(product);
      if(selectedBatch()&&remaining>EPS){
        button.title='Remaining: '+remaining.toLocaleString(undefined,{maximumFractionDigits:3});
      }else{
        button.title=codeOf(product);
      }

      button.addEventListener('click',()=>{
        open=false;
        render();
        try{
          if(typeof selectInvoiceProduct==='function'){
            selectInvoiceProduct(product);
          }
        }catch(error){
          console.error('Invoice Product button:',error);
        }
      });

      buttons.appendChild(button);
    });
  }

  async function refreshBatchBeforeOpen(){
    const batch=selectedBatch();
    if(!batch||refreshing)return;

    refreshing=true;
    render();

    const wanted=clean(batch.batchId);

    try{
      if(typeof requestSimpleBatchList!=='function')return;

      const data=await requestSimpleBatchList();

      if(
        data?.success &&
        Array.isArray(data.batches) &&
        typeof normalizeSimpleBatchRows==='function'
      ){
        const nextRows=normalizeSimpleBatchRows(data.batches);

        try{
          simpleBatchRows=nextRows;
        }catch(_){}

        try{
          if(typeof writeSimpleBatchCache==='function'){
            writeSimpleBatchCache(nextRows);
          }
        }catch(_){}

        try{
          if(typeof renderSimpleBatchPicker==='function'){
            renderSimpleBatchPicker(wanted);
          }
        }catch(_){}

        try{
          if(typeof applySimpleBatchLocation==='function'&&selectedBatch()){
            applySimpleBatchLocation();
          }
        }catch(_){}

        try{
          if(typeof updateSimpleBatchStatus==='function'){
            updateSimpleBatchStatus();
          }
        }catch(_){}
      }
    }catch(error){
      console.warn('Invoice Batch product refresh:',error);
    }finally{
      refreshing=false;
      page=0;
      render();
    }
  }

  async function toggleOpen(){
    if(refreshing)return;

    if(open){
      open=false;
      render();
      return;
    }

    open=true;
    page=0;
    render();

    if(selectedBatch()){
      await refreshBatchBeforeOpen();
    }
  }

  function installStyles(){
    if(q('#bbInvoiceDesktopProductPickerStyle'))return;

    const style=document.createElement('style');
    style.id='bbInvoiceDesktopProductPickerStyle';
    style.textContent=`
      /* Desktop Invoice Generator Product Picker V1 */
      .bb-product-search-wrap#productSelector{
        display:none !important;
      }

      .desktop-product-toolbar.bb-fast-product-toolbar{
        display:none !important;
      }

      #bbInvoiceDesktopPicker{
        position:relative;
        z-index:5200;
        margin:0 0 10px;
      }

      .bb-invoice-product-picker-bar{
        display:grid;
        grid-template-columns:minmax(0,1fr) auto auto;
        gap:10px;
        align-items:center;
        min-height:48px;
        padding:7px 8px 7px 12px;
        border:1px solid #c9d6e5;
        border-radius:10px;
        background:#f8fbff;
      }

      .bb-invoice-product-picker-label{
        min-width:0;
      }

      .bb-invoice-product-picker-label strong{
        display:block;
        color:#173f77;
        font-size:13px;
        line-height:1.2;
      }

      #bbInvoiceDesktopProductMeta{
        display:block;
        margin-top:3px;
        color:#718298;
        font-size:10px;
        line-height:1.2;
        white-space:nowrap;
        overflow:hidden;
        text-overflow:ellipsis;
      }

      #bbInvoiceDesktopGroupLabel{
        display:flex;
        align-items:center;
        gap:6px;
        min-height:34px;
        padding:0 8px;
        border-radius:8px;
        color:#31516f;
        font-size:11px;
        font-weight:800;
        white-space:nowrap;
        cursor:pointer;
        user-select:none;
      }

      #bbInvoiceDesktopGroupLabel.disabled{
        opacity:.48;
        cursor:not-allowed;
      }

      #bbInvoiceDesktopUseGroups{
        width:16px;
        height:16px;
        margin:0;
        accent-color:#245fae;
      }

      #bbInvoiceDesktopProductAdd{
        min-width:128px;
        min-height:36px;
        border:0;
        border-radius:8px;
        padding:0 13px;
        background:#1f548d;
        color:#fff;
        font-size:12px;
        font-weight:900;
        cursor:pointer;
      }

      #bbInvoiceDesktopProductAdd:hover:not(:disabled){
        background:#194878;
      }

      #bbInvoiceDesktopProductAdd:disabled{
        opacity:.62;
        cursor:wait;
      }

      #bbInvoiceDesktopProductPanel{
        position:absolute;
        left:0;
        right:0;
        top:calc(100% + 6px);
        padding:8px;
        border:1px solid #c8d7e7;
        border-radius:11px;
        background:#fff;
        box-shadow:0 16px 38px rgba(24,55,91,.20);
      }

      #bbInvoiceDesktopProductPanel[hidden]{
        display:none !important;
      }

      .bb-invoice-product-panel-head{
        display:flex;
        align-items:center;
        justify-content:flex-end;
        gap:6px;
        min-height:26px;
        margin-bottom:7px;
      }

      .bb-invoice-product-page{
        min-width:40px;
        color:#718298;
        font-size:10px;
        font-weight:800;
        text-align:center;
      }

      .bb-invoice-product-page-button{
        width:28px;
        height:26px;
        border:1px solid #d1dce8;
        border-radius:7px;
        background:#f5f8fc;
        color:#24517f;
        font-size:17px;
        font-weight:900;
        line-height:1;
        cursor:pointer;
      }

      .bb-invoice-product-page-button:disabled{
        opacity:.35;
        cursor:default;
      }

      #bbInvoiceDesktopProductButtons{
        display:grid;
        grid-template-columns:repeat(7,minmax(0,1fr));
        gap:7px;
        align-items:stretch;
      }

      .bb-invoice-product-name-button{
        min-width:0;
        min-height:54px;
        border:1px solid #c9d8e8;
        border-radius:9px;
        padding:7px 5px;
        background:#f7fbff;
        color:#153f70;
        font-size:11px;
        font-weight:900;
        line-height:1.22;
        text-align:center;
        cursor:pointer;
        overflow:hidden;
        display:-webkit-box;
        -webkit-box-orient:vertical;
        -webkit-line-clamp:3;
      }

      .bb-invoice-product-name-button:hover,
      .bb-invoice-product-name-button:focus-visible{
        border-color:#6c9bd0;
        background:#eaf4ff;
        outline:none;
      }

      .bb-invoice-product-empty{
        grid-column:1 / -1;
        min-height:54px;
        display:flex;
        align-items:center;
        justify-content:center;
        border:1px dashed #cad6e4;
        border-radius:9px;
        color:#718298;
        font-size:11px;
        font-weight:700;
      }

    `;
    document.head.appendChild(style);
  }

  function installUi(){
    const oldSelector=q('#productSelector');
    if(!oldSelector||q('#bbInvoiceDesktopPicker'))return !!q('#bbInvoiceDesktopPicker');

    const wrap=document.createElement('div');
    wrap.id='bbInvoiceDesktopPicker';
    wrap.className='no-print';
    wrap.innerHTML=
      '<div class="bb-invoice-product-picker-bar">'+
        '<div class="bb-invoice-product-picker-label">'+
          '<strong>Product Name</strong>'+
          '<span id="bbInvoiceDesktopProductMeta">Loading products…</span>'+
        '</div>'+
        '<label id="bbInvoiceDesktopGroupLabel">'+
          '<input type="checkbox" id="bbInvoiceDesktopUseGroups">'+
          '<span>Use Product Groups</span>'+
        '</label>'+
        '<button type="button" id="bbInvoiceDesktopProductAdd">+ Add Product</button>'+
      '</div>'+
      '<div id="bbInvoiceDesktopProductPanel" hidden>'+
        '<div class="bb-invoice-product-panel-head">'+
          '<button type="button" class="bb-invoice-product-page-button" id="bbInvoiceDesktopProductPrev" aria-label="Previous products">‹</button>'+
          '<span class="bb-invoice-product-page" id="bbInvoiceDesktopProductPage">0 / 0</span>'+
          '<button type="button" class="bb-invoice-product-page-button" id="bbInvoiceDesktopProductNext" aria-label="Next products">›</button>'+
        '</div>'+
        '<div id="bbInvoiceDesktopProductButtons"></div>'+
      '</div>';

    oldSelector.insertAdjacentElement('beforebegin',wrap);

    q('#bbInvoiceDesktopProductAdd')?.addEventListener('click',toggleOpen);

    q('#bbInvoiceDesktopProductPrev')?.addEventListener('click',()=>{
      page=Math.max(0,page-1);
      render();
    });

    q('#bbInvoiceDesktopProductNext')?.addEventListener('click',()=>{
      page+=1;
      render();
    });

    const toggle=q('#bbInvoiceDesktopUseGroups');
    if(toggle){
      toggle.addEventListener('change',()=>{
        if(!selectedBatch()){
          toggle.checked=false;
          return;
        }
        useGroups=toggle.checked===true;
        saveGroupPreference();
        page=0;
        render();
      });
    }

    document.addEventListener('click',event=>{
      const picker=q('#bbInvoiceDesktopPicker');
      if(!open||!picker||picker.contains(event.target))return;
      open=false;
      render();
    });

    document.addEventListener('keydown',event=>{
      if(event.key!=='Escape'||!open)return;
      open=false;
      render();
      q('#bbInvoiceDesktopProductAdd')?.focus();
    });

    return true;
  }

  function wrapBatchChange(){
    const original=window.handleSimpleBatchChange;
    if(typeof original!=='function'||original.__bbDesktopProductPickerWrapped)return;

    const wrapped=function(){
      const result=original.apply(this,arguments);
      page=0;
      open=false;
      setTimeout(render,0);
      return result;
    };
    wrapped.__bbDesktopProductPickerWrapped=true;
    window.handleSimpleBatchChange=wrapped;
  }

  function wrapClearFunctions(){
    const after=window.clearAllAfterSuccessfulSave;
    if(typeof after==='function'&&!after.__bbDesktopProductPickerWrapped){
      const wrapped=function(){
        const result=after.apply(this,arguments);
        page=0;
        open=false;
        setTimeout(render,0);
        return result;
      };
      wrapped.__bbDesktopProductPickerWrapped=true;
      window.clearAllAfterSuccessfulSave=wrapped;
    }

    const clear=window.clearAll;
    if(typeof clear==='function'&&!clear.__bbDesktopProductPickerWrapped){
      const wrapped=function(){
        const result=clear.apply(this,arguments);
        page=0;
        open=false;
        setTimeout(render,0);
        return result;
      };
      wrapped.__bbDesktopProductPickerWrapped=true;
      window.clearAll=wrapped;
    }
  }

  function boot(){
    installStyles();

    if(!installUi()){
      setTimeout(boot,100);
      return;
    }

    useGroups=readGroupPreference();
    wrapBatchChange();
    wrapClearFunctions();
    render();

    /*
     * Product + Batch data arrive asynchronously.
     * This observer keeps the new picker synced without changing any
     * mobile or accounting behavior.
     */
    let tries=0;
    const timer=setInterval(()=>{
      tries+=1;
      wrapBatchChange();
      wrapClearFunctions();
      render();

      if(tries>=80){
        clearInterval(timer);
      }
    },250);

    window.BB_INVOICE_GENERATOR_BUILD=BUILD;
    window.BBInvoiceDesktopProductPickerV1={
      build:BUILD,
      render,
      refreshBatch:refreshBatchBeforeOpen
    };
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',boot,{once:true});
  }else{
    boot();
  }
})();
