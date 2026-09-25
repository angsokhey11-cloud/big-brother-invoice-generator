
/* BIG BROTHER — Optional Product Selling Units for Batch Invoice V1
   Normal/base unit is always the default.
   Salesman only taps Box / Batch / Tray etc. when needed.
   Stock payload is converted back to the base unit before save. */
(function(){
'use strict';

const EPS=0.000001;
const clean=v=>String(v??'').trim();
const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0};

let current=null;
let pendingMeta=null;

function selectedBatch(){
  try{
    return typeof getSelectedSimpleBatch==='function'
      ? getSelectedSimpleBatch()
      : null;
  }catch(_){
    return null;
  }
}

function allUnits(){
  return Array.isArray(window.BB_INVOICE_SELLING_UNITS)
    ? window.BB_INVOICE_SELLING_UNITS
    : [];
}

function unitsFor(product){
  if(!product)return [];

  const entry=clean(product.entryType||'EXACT').toUpperCase();
  const targetType=entry==='GROUP'?'GROUP':'PRODUCT';
  const targetCode=entry==='GROUP'
    ? clean(product.groupCode||product.code)
    : clean(product.code);

  if(!targetCode)return [];

  return allUnits()
    .filter(u=>
      clean(u.targetType).toUpperCase()===targetType &&
      clean(u.targetCode)===targetCode &&
      num(u.baseQty)>1+EPS
    )
    .sort((a,b)=>
      num(a.sortOrder)-num(b.sortOrder) ||
      clean(a.sellingUnitName).localeCompare(clean(b.sellingUnitName))
    );
}

function baseUnitFor(product,unit){
  return clean(unit?.baseUnitName||product?.unit||'Unit')||'Unit';
}

function availableBaseQty(product){
  const batch=selectedBatch();
  if(batch){
    return num(product?.remainingQty ?? product?.pendingQty);
  }

  const code=clean(product?.code||product?.productCode);
  if(!code)return 0;

  try{
    const balances=window.BBDirectSaleSourceV1?.balances?.();
    const row=Array.isArray(balances)
      ? balances.find(item=>clean(item?.productCode)===code)
      : null;
    return num(row?.totalAvailable);
  }catch(_){
    return 0;
  }
}

function productForRow(row){
  if(!row)return null;
  const code=clean(row.dataset.productCode);
  const entry=clean(row.dataset.entryType||'EXACT').toUpperCase();
  const groupCode=clean(row.dataset.productGroupCode);

  try{
    if(typeof getInvoiceSearchPool==='function'){
      const pool=getInvoiceSearchPool();
      const found=(Array.isArray(pool)?pool:[]).find(item=>{
        const itemEntry=clean(item?.entryType||'EXACT').toUpperCase();
        if(entry==='GROUP'){
          return itemEntry==='GROUP' &&
            clean(item?.groupCode||item?.code)===groupCode;
        }
        return itemEntry!=='GROUP' && clean(item?.code)===code;
      });
      if(found)return found;
    }
  }catch(_){}

  return {
    code:entry==='GROUP'?groupCode:code,
    groupCode:entry==='GROUP'?groupCode:'',
    entryType:entry,
    unit:clean(row.dataset.bbBaseUnit||row.dataset.unit||'Unit'),
    name:clean(row.dataset.product)
  };
}

function ensureStyles(){
  if(document.getElementById('bbInvoiceSellingUnitStyle'))return;
  const s=document.createElement('style');
  s.id='bbInvoiceSellingUnitStyle';
  s.textContent=[
    '#bbInvoiceSellingUnitBox{display:none;margin:0 16px 12px;padding:10px;border:1px solid #d8e5f3;border-radius:10px;background:#f8fbff}',
    '#bbInvoiceSellingUnitBox.open{display:block}',
    '#bbInvoiceSellingUnitBox .bb-su-title{margin-bottom:7px;color:#60748a;font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.35px}',
    '#bbInvoiceSellingUnitBox .bb-su-options{display:flex;gap:6px;flex-wrap:wrap}',
    '#bbInvoiceSellingUnitBox .bb-su-chip{min-height:34px;border:1px solid #cad8e8;border-radius:9px;padding:6px 10px;background:#fff;color:#425c78;font-size:10px;font-weight:900;cursor:pointer}',
    '#bbInvoiceSellingUnitBox .bb-su-chip.active{border-color:#245fae;background:#245fae;color:#fff}',
    '#bbInvoiceSellingUnitBox .bb-su-chip small{display:block;margin-top:1px;font-size:8px;font-weight:800;opacity:.78}',
    '#bbInvoiceSellingUnitBox .bb-su-preview{display:none;margin-top:8px;padding:7px 9px;border-radius:8px;background:#eef7ff;color:#17457a;font-size:10px;font-weight:900;line-height:1.35}',
    '#bbInvoiceSellingUnitBox .bb-su-preview.open{display:block}',
    '#bbInvoiceDesktopPicker ~ .product-table-head{grid-template-columns:minmax(260px,1fr) 122px 110px 125px!important}',
    '#bbInvoiceDesktopPicker ~ .product-table-head + #productList .product{grid-template-columns:minmax(260px,1fr) 122px 110px 125px!important}',
    '.product-qty-unit-cell.bb-has-selling-units{display:grid!important;grid-template-columns:minmax(0,1fr)!important;gap:4px!important;align-items:center!important}',
    '.product-qty-unit-cell.bb-has-selling-units .product-qty-input{grid-row:2;width:100%!important;min-width:64px!important}',
    '.product-qty-unit-cell.bb-has-selling-units .product-unit-label{display:none!important}',
    '.bb-row-selling-units{grid-row:1;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px;width:100%;margin:0}',
    '.bb-row-selling-unit-btn{min-width:0;min-height:24px;border:1px solid #cad8e8;border-radius:7px;padding:3px 4px;background:#fff;color:#46617d;font-size:8px;font-weight:900;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.bb-row-selling-unit-btn.active{border-color:#245fae;background:#245fae;color:#fff}',
    '.bb-row-selling-unit-note{grid-column:1/-1;width:100%;margin-top:1px;color:#245fae;font-size:8px;font-weight:900;line-height:1.2;text-align:center}',
    '@media(max-width:600px){#bbInvoiceSellingUnitBox{margin:0 12px 10px;padding:9px}#bbInvoiceSellingUnitBox .bb-su-chip{flex:1;min-width:92px}}'
  ].join('');
  document.head.appendChild(s);
}

function ensureBox(){
  let box=document.getElementById('bbInvoiceSellingUnitBox');
  if(box)return box;

  const dialog=document.querySelector('#invoiceQtyModal .bb-qty-dialog');
  const stepper=document.querySelector('#invoiceQtyModal .bb-qty-stepper');
  if(!dialog||!stepper)return null;

  box=document.createElement('div');
  box.id='bbInvoiceSellingUnitBox';
  box.innerHTML=
    '<div class="bb-su-title">Selling Unit (optional)</div>'+
    '<div class="bb-su-options" id="bbInvoiceSellingUnitOptions"></div>'+
    '<div class="bb-su-preview" id="bbInvoiceSellingUnitPreview"></div>';

  stepper.insertAdjacentElement('beforebegin',box);
  return box;
}

function formatQty(v){
  const n=num(v);
  return Number.isInteger(n)
    ? String(n)
    : String(Number(n.toFixed(6)));
}

function renderOptions(){
  ensureStyles();
  const box=ensureBox();
  if(!box)return;

  const product=current?.product;
  const units=current?.units||[];

  if(!product || !units.length){
    box.classList.remove('open');
    box.style.display='none';
    return;
  }

  box.style.display='';
  box.classList.add('open');

  const baseUnit=baseUnitFor(product,units[0]);
  const options=document.getElementById('bbInvoiceSellingUnitOptions');
  if(!options)return;

  const active=current.activeUnit;
  options.innerHTML=
    '<button type="button" class="bb-su-chip '+(!active?'active':'')+'" data-su-index="-1">'+
      'Normal '+escapeHtml(baseUnit)+
      '<small>Default</small>'+
    '</button>'+
    units.map((u,index)=>
      '<button type="button" class="bb-su-chip '+(active===u?'active':'')+'" data-su-index="'+index+'">'+
        escapeHtml(clean(u.sellingUnitName))+
        '<small>1 = '+escapeHtml(formatQty(u.baseQty))+' '+escapeHtml(baseUnitFor(product,u))+'</small>'+
      '</button>'
    ).join('');

  options.querySelectorAll('[data-su-index]').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const index=Number(btn.dataset.suIndex);
      current.activeUnit=index<0?null:(current.units[index]||null);
      renderOptions();
      refreshPreview();
      focusQty();
    });
  });

  refreshPreview();
}

function escapeHtml(v){
  return String(v??'').replace(/[&<>"']/g,ch=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
  }[ch]));
}

function focusQty(){
  const input=document.getElementById('invoiceQtyInput');
  if(!input)return;
  setTimeout(()=>{
    try{input.focus({preventScroll:true})}catch(_){input.focus()}
    try{input.select()}catch(_){}
  },20);
}

function refreshPreview(){
  const preview=document.getElementById('bbInvoiceSellingUnitPreview');
  if(!preview||!current)return;

  const unit=current.activeUnit;
  if(!unit){
    preview.classList.remove('open');
    preview.textContent='';
    return;
  }

  const qty=num(document.getElementById('invoiceQtyInput')?.value);
  const factor=num(unit.baseQty);
  const baseQty=qty*factor;
  const selling=clean(unit.sellingUnitName)||'Selling Unit';
  const base=baseUnitFor(current.product,unit);

  const pricePerBase=num(current.effectiveUsdPrice);
  const pricePerSelling=pricePerBase*factor;
  const currency=typeof getCurrency==='function'?getCurrency():'USD';
  const displayPrice=typeof usdToSelected==='function'
    ? usdToSelected(pricePerSelling,currency)
    : pricePerSelling;

  let text='1 '+selling+' = '+formatQty(factor)+' '+base;
  if(qty>0){
    text+=' · '+formatQty(qty)+' '+selling+' = '+formatQty(baseQty)+' '+base;
  }
  if(typeof formatMoney==='function'){
    text+=' · '+formatMoney(displayPrice,currency)+' / '+selling;
  }

  const remaining=availableBaseQty(current.product);
  if(remaining>EPS){
    const full=Math.floor((remaining+EPS)/factor);
    text+=' · '+(selectedBatch()?'Batch':'Warehouse')+' can sell '+formatQty(full)+' '+selling;
    const remainder=Math.max(0,remaining-(full*factor));
    if(remainder>EPS)text+=' + '+formatQty(remainder)+' '+base;
  }

  preview.textContent=text;
  preview.classList.add('open');
}

function setupPrompt(product,effectiveUsdPrice){
  pendingMeta=null;
  current={
    product,
    effectiveUsdPrice:num(effectiveUsdPrice),
    units:unitsFor(product),
    activeUnit:null
  };
  renderOptions();
  refreshPreview();
}

function installOpenPromptPatch(){
  const oldOpen=window.openInvoiceQtyPrompt;
  if(typeof oldOpen!=='function'||oldOpen.__bbSellingUnitsWrapped)return;

  const wrapped=function(product,effectiveUsdPrice){
    const result=oldOpen.apply(this,arguments);
    setupPrompt(product,effectiveUsdPrice);
    return result;
  };
  wrapped.__bbSellingUnitsWrapped=true;
  window.openInvoiceQtyPrompt=wrapped;
}

function validateAltQty(qty,unit){
  if(!(qty>0))return 'Quantity must be greater than zero.';
  const factor=num(unit?.baseQty);
  if(!(factor>1))return 'Selling Unit conversion is invalid.';

  const baseQty=qty*factor;
  const remaining=availableBaseQty(current?.product);

  if(remaining>EPS && baseQty>remaining+EPS){
    return 'Only '+formatQty(remaining)+' '+baseUnitFor(current.product,unit)+
      ' remaining in '+(selectedBatch()?'this Batch':'Warehouse')+'. '+
      formatQty(qty)+' '+clean(unit.sellingUnitName)+
      ' needs '+formatQty(baseQty)+' '+baseUnitFor(current.product,unit)+'.';
  }

  return '';
}

function closeQtyModalForAlt(){
  const modal=document.getElementById('invoiceQtyModal');
  if(modal){
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden','true');
  }
  const message=document.getElementById('invoiceQtyMessage');
  if(message)message.textContent='';
}

function beginAltAdd(event){
  if(!current?.activeUnit)return false;

  const qtyInput=document.getElementById('invoiceQtyInput');
  const qty=num(qtyInput?.value);
  const unit=current.activeUnit;
  const error=validateAltQty(qty,unit);

  if(error){
    event?.preventDefault();
    event?.stopImmediatePropagation();
    const message=document.getElementById('invoiceQtyMessage');
    if(message){
      message.textContent=error;
      message.style.color='#c53030';
    }
    qtyInput?.focus();
    return true;
  }

  event?.preventDefault();
  event?.stopImmediatePropagation();

  const factor=num(unit.baseQty);
  const sellingUnit=clean(unit.sellingUnitName);
  const baseUnit=baseUnitFor(current.product,unit);
  const baseUsdPrice=num(current.effectiveUsdPrice);
  const sellingUsdPrice=baseUsdPrice*factor;
  const sellingQty=qty;
  const baseQty=sellingQty*factor;

  const product={
    ...current.product,
    unit:sellingUnit
  };

  pendingMeta={
    sellingUnit,
    sellingQty,
    factor,
    baseUnit,
    baseQty,
    baseUsdPrice,
    sellingUsdPrice,
    productCode:clean(current.product?.code),
    targetType:clean(unit.targetType).toUpperCase(),
    targetCode:clean(unit.targetCode)
  };

  closeQtyModalForAlt();

  try{
    pendingInvoiceProduct=null;
  }catch(_){}

  if(typeof hasSpecialCustomerPrice==='function' && !hasSpecialCustomerPrice(current.product)){
    openInvoicePricePrompt(product,sellingQty,sellingUsdPrice);
    return true;
  }

  finalizeInvoiceProductAdd(
    product,
    sellingUsdPrice,
    sellingQty,
    true
  );

  return true;
}

function installQtySubmit(){
  const form=document.getElementById('invoiceQtyForm');
  if(!form||form.dataset.bbSellingUnitsSubmit==='1')return;
  form.dataset.bbSellingUnitsSubmit='1';

  form.addEventListener('submit',event=>{
    beginAltAdd(event);
  },true);

  const input=document.getElementById('invoiceQtyInput');
  input?.addEventListener('input',refreshPreview);
  document.getElementById('invoiceQtyMinus')?.addEventListener('click',()=>setTimeout(refreshPreview,0));
  document.getElementById('invoiceQtyPlus')?.addEventListener('click',()=>setTimeout(refreshPreview,0));
}

function installFinalizePatch(){
  const oldFinalize=window.finalizeInvoiceProductAdd;
  if(typeof oldFinalize!=='function'||oldFinalize.__bbSellingUnitsWrapped)return;

  const wrapped=function(){
    const meta=pendingMeta?{...pendingMeta}:null;
    const result=oldFinalize.apply(this,arguments);

    if(meta){
      const row=document.querySelector('#productList .product:last-child');
      if(row){
        row.dataset.bbSellingUnitName=meta.sellingUnit;
        row.dataset.bbSellingQty=String(meta.sellingQty);
        row.dataset.bbSellingFactor=String(meta.factor);
        row.dataset.bbBaseUnit=meta.baseUnit;
        row.dataset.bbBaseQty=String(meta.baseQty);

        const nameCell=row.querySelector('.product-name-wrap');
        if(nameCell && !nameCell.querySelector('.bb-selling-unit-line')){
          const info=document.createElement('div');
          info.className='bb-selling-unit-line';
          info.style.cssText='margin-top:3px;color:#245fae;font-size:9px;font-weight:900';
          info.textContent=
            formatQty(meta.sellingQty)+' '+meta.sellingUnit+
            ' = '+formatQty(meta.baseQty)+' '+meta.baseUnit;
          nameCell.appendChild(info);
        }
      }

      try{
        const last=selectedProducts?.[selectedProducts.length-1];
        if(last){
          last.sellingQty=meta.sellingQty;
          last.sellingUnit=meta.sellingUnit;
          last.sellingUnitBaseQty=meta.factor;
          last.baseQty=meta.baseQty;
          last.baseUnit=meta.baseUnit;
          last.manualPrice=true;
        }
      }catch(_){}

      pendingMeta=null;
    }

    return result;
  };

  wrapped.__bbSellingUnitsWrapped=true;
  window.finalizeInvoiceProductAdd=wrapped;
}


function selectedItemForRow(row){
  try{
    const list=Array.isArray(window.selectedProducts)
      ? window.selectedProducts
      : (typeof selectedProducts!=='undefined'&&Array.isArray(selectedProducts)?selectedProducts:[]);
    return list.find(item=>clean(item?.id)===clean(row?.dataset?.lineId))||null;
  }catch(_){
    return null;
  }
}

function updateRowSellingUnitUi(row){
  const wrap=row?.querySelector('.bb-row-selling-units');
  if(!wrap)return;

  const factor=num(row.dataset.bbSellingFactor)||1;
  const activeName=clean(row.dataset.bbSellingUnitName);
  wrap.querySelectorAll('.bb-row-selling-unit-btn').forEach(btn=>{
    const name=clean(btn.dataset.unitName);
    btn.classList.toggle('active',
      (factor<=1 && !name) ||
      (factor>1 && name===activeName)
    );
  });

  const note=wrap.querySelector('.bb-row-selling-unit-note');
  if(note){
    note.textContent=factor>1
      ? '1 '+activeName+' = '+formatQty(factor)+' '+clean(row.dataset.bbBaseUnit||'Unit')
      : '';
  }

  const unitLabel=row.querySelector('.product-unit-label');
  if(unitLabel){
    unitLabel.textContent=factor>1
      ? activeName
      : clean(row.dataset.bbBaseUnit||row.dataset.unit||'Unit');
  }
}

function switchRowSellingUnit(row,unit){
  if(!row)return;

  const oldFactor=Math.max(1,num(row.dataset.bbSellingFactor)||1);
  const currentUsd=num(row.dataset.usdPrice);
  const baseUsd=oldFactor>0?currentUsd/oldFactor:currentUsd;

  const baseUnit=clean(
    row.dataset.bbBaseUnit ||
    unit?.baseUnitName ||
    row.dataset.unit ||
    'Unit'
  )||'Unit';

  const newFactor=unit?Math.max(1,num(unit.baseQty)):1;
  const newName=unit?clean(unit.sellingUnitName):'';
  const nextUsd=baseUsd*newFactor;

  row.dataset.bbBaseUnit=baseUnit;
  row.dataset.usdPrice=String(nextUsd);

  if(unit && newFactor>1){
    row.dataset.bbSellingUnitName=newName;
    row.dataset.bbSellingFactor=String(newFactor);
    row.dataset.unit=newName;
  }else{
    delete row.dataset.bbSellingUnitName;
    delete row.dataset.bbSellingFactor;
    delete row.dataset.bbSellingQty;
    delete row.dataset.bbBaseQty;
    row.dataset.unit=baseUnit;
  }

  const priceInput=row.querySelector('.product-price-input');
  if(priceInput){
    const currency=typeof getCurrency==='function'?getCurrency():'USD';
    const display=typeof usdToSelected==='function'
      ? usdToSelected(nextUsd,currency)
      : nextUsd;
    priceInput.value=currency==='KHR'
      ? String(Math.round(display))
      : String(Number(display.toFixed(2)));
    priceInput.step=currency==='KHR'?'1':'0.01';
  }

  const item=selectedItemForRow(row);
  if(item){
    item.usdPrice=nextUsd;
    if(unit && newFactor>1){
      item.sellingUnit=newName;
      item.sellingUnitBaseQty=newFactor;
      item.baseUnit=baseUnit;
    }else{
      delete item.sellingUnit;
      delete item.sellingUnitBaseQty;
      delete item.baseUnit;
      delete item.sellingQty;
      delete item.baseQty;
    }
  }

  updateRowSellingUnitUi(row);
  try{calculate()}catch(_){}
}

function ensureDesktopRowOptions(row,product){
  if(!row || !document.getElementById('bbInvoiceDesktopPicker'))return;

  const units=unitsFor(product||productForRow(row));
  if(!units.length)return;

  const cell=row.querySelector('.product-qty-unit-cell');
  if(!cell)return;

  cell.classList.add('bb-has-selling-units');

  let wrap=cell.querySelector('.bb-row-selling-units');
  if(!wrap){
    wrap=document.createElement('div');
    wrap.className='bb-row-selling-units';
    const qtyInput=cell.querySelector('.product-qty-input');
    if(qtyInput){
      cell.insertBefore(wrap,qtyInput);
    }else{
      cell.prepend(wrap);
    }
  }

  const baseUnit=baseUnitFor(product||productForRow(row),units[0]);
  row.dataset.bbBaseUnit=clean(row.dataset.bbBaseUnit||baseUnit)||'Unit';

  wrap.innerHTML=
    '<button type="button" class="bb-row-selling-unit-btn" data-unit-name="">'+
      escapeHtml(baseUnit)+
    '</button>'+
    units.map((unit,index)=>
      '<button type="button" class="bb-row-selling-unit-btn" data-unit-index="'+index+'" data-unit-name="'+escapeHtml(clean(unit.sellingUnitName))+'">'+
        escapeHtml(clean(unit.sellingUnitName))+
      '</button>'
    ).join('')+
    '<div class="bb-row-selling-unit-note"></div>';

  wrap.querySelector('[data-unit-name=""]')?.addEventListener('click',()=>{
    switchRowSellingUnit(row,null);
  });

  wrap.querySelectorAll('[data-unit-index]').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const unit=units[Number(btn.dataset.unitIndex)];
      if(unit)switchRowSellingUnit(row,unit);
    });
  });

  updateRowSellingUnitUi(row);
}

function refreshDesktopRows(){
  if(!document.getElementById('bbInvoiceDesktopPicker'))return;
  document.querySelectorAll('#productList .product').forEach(row=>{
    ensureDesktopRowOptions(row,productForRow(row));
  });
}

function installDesktopCreatePatch(){
  const oldCreate=window.createProduct;
  if(typeof oldCreate!=='function'||oldCreate.__bbSellingUnitsDesktopWrapped)return;

  const wrapped=function(){
    const product=arguments[4]||null;
    const result=oldCreate.apply(this,arguments);
    const lineId=clean(arguments[2]);
    const row=[...document.querySelectorAll('#productList .product')]
      .find(node=>clean(node.dataset.lineId)===lineId) ||
      document.querySelector('#productList .product:last-child');
    if(row)ensureDesktopRowOptions(row,product||productForRow(row));
    return result;
  };
  wrapped.__bbSellingUnitsDesktopWrapped=true;
  window.createProduct=wrapped;
}

function installCustomerPricePatch(){
  const oldApply=window.applyCustomerPricesToProducts;
  if(typeof oldApply!=='function'||oldApply.__bbSellingUnitsWrapped)return;

  const wrapped=function(){
    const active=[...document.querySelectorAll('#productList .product')]
      .filter(row=>(num(row.dataset.bbSellingFactor)||1)>1)
      .map(row=>({
        row,
        factor:num(row.dataset.bbSellingFactor)||1
      }));

    const result=oldApply.apply(this,arguments);

    active.forEach(({row,factor})=>{
      const item=selectedItemForRow(row);
      if(item?.manualPrice)return;

      const baseUsd=num(row.dataset.usdPrice);
      const nextUsd=baseUsd*factor;
      row.dataset.usdPrice=String(nextUsd);
      item.usdPrice=nextUsd;

      const input=row.querySelector('.product-price-input');
      if(input){
        const currency=typeof getCurrency==='function'?getCurrency():'USD';
        const display=typeof usdToSelected==='function'
          ? usdToSelected(nextUsd,currency)
          : nextUsd;
        input.value=currency==='KHR'
          ? String(Math.round(display))
          : String(Number(display.toFixed(2)));
      }
    });

    try{calculate()}catch(_){}
    return result;
  };

  wrapped.__bbSellingUnitsWrapped=true;
  window.applyCustomerPricesToProducts=wrapped;
}

function installDesktopObserver(){
  const list=document.getElementById('productList');
  if(!list||list.dataset.bbSellingUnitsObserved==='1')return;
  list.dataset.bbSellingUnitsObserved='1';
  new MutationObserver(()=>refreshDesktopRows())
    .observe(list,{childList:true,subtree:false});
}

function findRow(lineId){
  const wanted=clean(lineId);
  return [...document.querySelectorAll('#productList .product')]
    .find(row=>clean(row.dataset.lineId)===wanted)||null;
}

function transformPayload(payload){
  if(!payload||!Array.isArray(payload.items))return payload;

  payload.items.forEach(item=>{
    const row=findRow(item.lineId);
    if(!row)return;

    const factor=num(row.dataset.bbSellingFactor);
    const sellingUnit=clean(row.dataset.bbSellingUnitName);
    const baseUnit=clean(row.dataset.bbBaseUnit);
    if(!(factor>1)||!sellingUnit||!baseUnit)return;

    const sellingQty=num(item.qty);
    const sellingUnitPrice=num(item.unitPrice);
    const baseQty=sellingQty*factor;
    const baseUnitPrice=sellingUnitPrice/factor;

    item.sellingQty=sellingQty;
    item.sellingUnit=sellingUnit;
    item.sellingUnitBaseQty=factor;
    item.sellingUnitPrice=sellingUnitPrice;
    item.baseQty=baseQty;
    item.baseUnit=baseUnit;

    item.qty=baseQty;
    item.unit=baseUnit;
    item.unitPrice=baseUnitPrice;
    item.amount=baseQty*baseUnitPrice;

    if(Array.isArray(item.stockAllocations)){
      item.stockAllocations=item.stockAllocations.map(allocation=>({
        ...allocation,
        qty:num(allocation?.qty)*factor
      }));
    }
  });

  return payload;
}

function installPayloadPatch(){
  const oldBuild=window.buildSalesInvoicePayload;
  if(typeof oldBuild!=='function'||oldBuild.__bbSellingUnitsWrapped)return;

  const wrapped=function(){
    const payload=oldBuild.apply(this,arguments);
    return transformPayload(payload);
  };
  wrapped.__bbSellingUnitsWrapped=true;
  window.buildSalesInvoicePayload=wrapped;
}

function clearPending(){
  pendingMeta=null;
  current=null;
}

function validateBatchSellingUnitRows(){
  const batch=selectedBatch();
  if(!batch)return {ok:true};

  const requested=new Map();

  document.querySelectorAll('#productList .product').forEach(row=>{
    const factor=Math.max(1,num(row.dataset.bbSellingFactor)||1);
    if(factor<=1)return;

    const qty=num(row.querySelector('.product-qty-input')?.value);
    if(!(qty>0))return;

    const product=productForRow(row);
    if(!product)return;

    const entry=clean(product.entryType||row.dataset.entryType||'EXACT').toUpperCase();
    const code=entry==='GROUP'
      ? clean(product.groupCode||product.code||row.dataset.productGroupCode)
      : clean(product.code||row.dataset.productCode);

    if(!code)return;

    const key=entry+'|'+code;
    const baseQty=qty*factor;
    const available=num(product.remainingQty ?? product.pendingQty);

    const current=requested.get(key)||{
      row,
      name:clean(product.name||row.dataset.product||code),
      baseUnit:clean(row.dataset.bbBaseUnit||product.unit||'Unit'),
      requested:0,
      available
    };

    current.requested+=baseQty;
    current.available=available;
    requested.set(key,current);
  });

  for(const item of requested.values()){
    if(item.requested>item.available+EPS){
      return {
        ok:false,
        row:item.row,
        message:
          item.name+': '+formatQty(item.requested)+' '+item.baseUnit+
          ' requested, but only '+formatQty(item.available)+' '+item.baseUnit+
          ' remain in '+clean(batch.batchId)+'.'
      };
    }
  }

  return {ok:true};
}

function installCompleteGuard(){
  const oldComplete=window.completeInvoice;
  if(typeof oldComplete!=='function'||oldComplete.__bbSellingUnitsWrapped)return;

  const wrapped=function(event){
    const check=validateBatchSellingUnitRows();
    if(!check.ok){
      event?.preventDefault?.();
      event?.stopPropagation?.();
      alert(check.message);
      if(check.row){
        check.row.scrollIntoView({behavior:'smooth',block:'center'});
        setTimeout(()=>{
          const input=check.row.querySelector('.product-qty-input');
          try{input?.focus({preventScroll:true})}catch(_){input?.focus()}
        },120);
      }
      return;
    }
    return oldComplete.apply(this,arguments);
  };

  wrapped.__bbSellingUnitsWrapped=true;
  window.completeInvoice=wrapped;
}

function installCancelCleanup(){
  document.getElementById('invoiceQtyCancel')?.addEventListener('click',clearPending,true);
  document.getElementById('invoicePriceCancel')?.addEventListener('click',clearPending,true);
  document.getElementById('invoiceQtyModal')?.addEventListener('click',event=>{
    if(event.target===event.currentTarget)clearPending();
  },true);
  document.getElementById('invoicePriceModal')?.addEventListener('click',event=>{
    if(event.target===event.currentTarget)clearPending();
  },true);
}

function start(){
  ensureStyles();
  ensureBox();
  installOpenPromptPatch();
  installQtySubmit();
  installFinalizePatch();
  installPayloadPatch();
  installCompleteGuard();
  installCancelCleanup();
  installDesktopCreatePatch();
  installCustomerPricePatch();
  installDesktopObserver();
  refreshDesktopRows();

  window.BB_INVOICE_SELLING_UNITS_BUILD='20260925-optional-v3';
}

if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded',start,{once:true});
}else{
  start();
}
})();
