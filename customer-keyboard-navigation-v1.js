/* BIG BROTHER Invoice Generator — customer autocomplete keyboard navigation.
   Reuses the legacy dropdown's mousedown selection handler so customer
   information, price loading and product-search focus remain unchanged. */
(function(){
  'use strict';
  const BUILD='20261010-portal-location5';
  function init(){
    const input=document.getElementById('customerName');
    const list=document.getElementById('customerOptions');
    if(!input||!list||input.dataset.bbCustomerKeys==='1')return;
    input.dataset.bbCustomerKeys='1';
    let active=-1;
    const options=()=>[...list.querySelectorAll('.customer-option')];
    const isOpen=()=>list.style.display!=='none'&&options().length>0;
    input.setAttribute('aria-autocomplete','list');
    input.setAttribute('aria-controls','customerOptions');
    input.setAttribute('aria-haspopup','listbox');
    list.setAttribute('role','listbox');
    /* Put suggestions in body to escape product-card stacking contexts entirely. */
    document.body.appendChild(list);
    list.classList.add('bb-customer-portal');
    function positionCustomerDropdown(){
      if(list.style.display==='none')return;
      const bounds=input.getBoundingClientRect();
      list.style.left=Math.round(bounds.left)+'px';
      list.style.width=Math.round(bounds.width)+'px';
      const below=window.innerHeight-bounds.bottom-10;
      const maxHeight=Math.min(260,Math.max(120,below));
      list.style.maxHeight=maxHeight+'px';
      list.style.top=Math.round(bounds.bottom+4)+'px';
    }
    const originalShow=window.showCustomerOptions;
    if(typeof originalShow==='function'&&!originalShow.__bbPortal){
      const show=function(){
        const result=originalShow.apply(this,arguments);
        positionCustomerDropdown();
        return result;
      };
      show.__bbPortal=true;
      window.showCustomerOptions=show;
    }
    input.addEventListener('focus',()=>requestAnimationFrame(positionCustomerDropdown));
    input.addEventListener('input',()=>requestAnimationFrame(positionCustomerDropdown));
    window.addEventListener('resize',positionCustomerDropdown,{passive:true});
    window.addEventListener('scroll',positionCustomerDropdown,{capture:true,passive:true});
    document.addEventListener('pointerdown',event=>{
      if(!list.contains(event.target)&&event.target!==input){
        list.style.display='none';
      }
    },true);
    function mark(index){
      const items=options();
      active=index>=0&&index<items.length?index:-1;
      items.forEach((item,i)=>{
        const selected=i===active;
        item.classList.toggle('bb-customer-key-active',selected);
        item.setAttribute('role','option');
        item.setAttribute('aria-selected',String(selected));
        if(!item.id)item.id='bb-customer-key-option-'+i;
      });
      if(active>=0){
        input.setAttribute('aria-activedescendant',items[active].id);
        items[active].scrollIntoView({block:'nearest'});
      }else{
        input.removeAttribute('aria-activedescendant');
      }
    }
    input.addEventListener('input',()=>mark(-1));
    input.addEventListener('keydown',event=>{
      if(event.isComposing||event.keyCode===229)return;
      const key=event.key;
      if(key==='ArrowDown'||key==='ArrowUp'){
        if(!isOpen()&&typeof window.showCustomerOptions==='function'){
          window.showCustomerOptions();
        }
        if(!isOpen())return;
        event.preventDefault();
        const count=options().length;
        mark(key==='ArrowDown'?(active+1)%count:(active<0?count-1:(active-1+count)%count));
        return;
      }
      if(key==='Escape'){
        if(!isOpen())return;
        event.preventDefault();
        list.style.display='none';
        mark(-1);
        return;
      }
      if(key==='Enter'&&isOpen()){
        const items=options();
        const selected=items[active>=0?active:0];
        if(!selected)return;
        event.preventDefault();
        event.stopPropagation();
        /* Existing mousedown listener is the single source of truth. */
        selected.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true}));
        mark(-1);
      }
    },true);
    list.addEventListener('mousemove',event=>{
      const option=event.target.closest?.('.customer-option');
      if(option&&list.contains(option))mark(options().indexOf(option));
    });
    /* Load real Khmer glyphs: naming a font in CSS does not install it. */
    if(!document.getElementById('bbInvoiceKhmerFont')){
      const font=document.createElement('link');
      font.id='bbInvoiceKhmerFont';
      font.rel='stylesheet';
      font.href='https://fonts.googleapis.com/css2?family=Noto+Sans+Khmer:wght@400;500;600;700&display=swap';
      document.head.appendChild(font);
    }
    const style=document.createElement('style');
    style.id='bbCustomerKeyboardStyle';
    style.textContent=`
      /* Lift the entire invoice card above the following product card.
         A z-index on the dropdown alone cannot escape sibling stacking contexts. */
      .bb-left-column .invoice-card{position:relative!important;z-index:30!important;overflow:visible!important;}
      .bb-left-column .invoice-card:focus-within{z-index:40!important;}
      .bb-left-column .invoice-card .customer-field,
      .bb-left-column .invoice-card .customer-autocomplete{position:relative;overflow:visible!important;}
      #customerOptions.bb-customer-portal{
        position:fixed!important;right:auto!important;bottom:auto!important;
        z-index:2147483000!important;box-sizing:border-box!important;
        background:#fff!important;border:1px solid #9bb7dc!important;
        border-radius:9px!important;overflow-y:auto!important;
        box-shadow:0 12px 32px rgba(23,59,112,.22)!important;
      }
      #mainLocation{font-weight:600!important;}
      #mainLocation option{font-weight:500!important;}
      /* Clear, readable Khmer customer names and address details on tablets. */
      #customerName, #mainLocation, #mainLocation option,
      #customerOptions, #customerOptions .customer-option,
      #customerOptions .customer-option-name, #customerOptions .customer-option-details{
        font-family:"Noto Sans Khmer","Khmer OS Battambang","Khmer OS Siemreap","Segoe UI",Arial,sans-serif!important;
        -webkit-font-smoothing:auto!important;
        text-rendering:optimizeLegibility;
      }
      #customerOptions .customer-option-name{
        font-size:14px!important;font-weight:700!important;line-height:1.55!important;
        color:#172f50!important;
      }
      #customerOptions .customer-option-details{
        font-size:13px!important;font-weight:600!important;line-height:1.7!important;
        color:#445a75!important;
      }
      .customer-options .customer-option.bb-customer-key-active{
        background:#e1eeff!important;color:#123d72!important;
        outline:2px solid #397bc5;outline-offset:-2px;
      }`;
    if(!document.getElementById(style.id))document.head.appendChild(style);
    /* Only successful invoice cleanup triggers this function.
       Do not steal focus during failed saves or confirmation prompts. */
    function installAfterSaveFocus(){
      const original=window.clearAllAfterSuccessfulSave;
      if(typeof original!=='function'||original.__bbCustomerAfterSaveFocus)return;
      const wrapped=function(){
        const result=original.apply(this,arguments);
        const target=document.getElementById('customerName');
        if(target){
          const menu=document.getElementById('customerOptions');
          if(menu)menu.style.display='none';
          try{target.focus({preventScroll:true})}catch(_){target.focus()}
        }
        return result;
      };
      wrapped.__bbCustomerAfterSaveFocus=true;
      window.clearAllAfterSuccessfulSave=wrapped;
    }
    installAfterSaveFocus();
    window.BB_INVOICE_CUSTOMER_KEYBOARD_BUILD=BUILD;
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
