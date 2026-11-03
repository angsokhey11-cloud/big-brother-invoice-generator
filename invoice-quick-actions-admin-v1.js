/* BIG BROTHER Invoice Generator — More Function / Admin Option V1.
   Existing action handlers are moved, not replaced. Admin writes reuse secure RPCs. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const text=v=>String(v==null?'':v).trim();
let admin=false,busy=false,bankRows=[],bankLoaded=false,kind='',restoreFocus=null;
const paths={
 eye:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/>',
 menu:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9h10M7 13h10M7 17h7"/>',
 shield:'<path d="M12 2 20 5v6c0 5-3.5 8-8 11-4.5-3-8-6-8-11V5l8-3Z"/><path d="m9 12 2 2 4-4"/>',
 done:'<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
 print:'<path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v7H6z"/>',
 share:'<path d="m22 2-7 20-4-9-9-4L22 2Z"/><path d="M11 13 22 2"/>',
 phone:'<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M11 18h2"/>',
 drive:'<path d="M20 18a4 4 0 0 0-1-7.9A7 7 0 0 0 5.6 12 3 3 0 0 0 6 18h14Z"/><path d="M12 10v8m-3-3 3 3 3-3"/>',
 user:'<circle cx="11" cy="8" r="4"/><path d="M4 21v-2a7 7 0 0 1 14 0v2M20 7v6m-3-3h6"/>',
 bank:'<path d="m2 9 10-6 10 6M3 9h18M5 10v8m5-8v8m4-8v8m5-8v8M2 21h20"/>',
 chevron:'<path d="m6 9 6 6 6-6"/>',
 x:'<path d="M5 5 19 19M19 5 5 19"/>'
};
const icon=n=>'<svg class="bbqa-svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+paths[n]+'</svg>';
function setLabel(b,n,label){b.innerHTML=icon(n)+'<span>'+label+'</span>';b.setAttribute('aria-label',label)}
function button(id,n,label){const b=document.createElement('button');b.type='button';b.id=id;setLabel(b,n,label);return b}
function addCss(){
 if($('bbInvoiceQuickActionsCss'))return;
 const s=document.createElement('style');s.id='bbInvoiceQuickActionsCss';
 s.textContent=[
 '#bbInvoiceQuickStack{display:grid!important;grid-template-columns:minmax(0,1fr)!important;gap:7px!important;margin-top:7px!important}',
 '.bb-action-card #bbInvoiceQuickStack button{min-height:40px!important;width:100%!important;margin:0!important;padding:9px 12px!important;border-radius:9px!important;box-sizing:border-box!important;font:800 12px Arial,sans-serif!important;display:flex!important;align-items:center!important;justify-content:center!important;gap:8px!important;cursor:pointer!important}',
 '#bbInvoiceQuickStack .bbqa-svg{width:17px!important;height:17px!important;flex:0 0 17px!important}',
 '.bb-action-card #bbInvoiceQuickPreview{background:#f2f6fe!important;color:#1b559d!important;border:1px solid #b4c9e4!important}',
 '.bb-action-card #bbInvoiceMore{background:#ebf2ff!important;color:#174f91!important;border:1px solid #b1c6e7!important}',
 '.bb-action-card #bbInvoiceAdmin{background:#ecf6f1!important;color:#176447!important;border:1px solid #abd4c0!important}',
 '.bb-action-card #bbInvoiceQuickComplete{background:#0953b9!important;color:#fff!important;border:1px solid #0953b9!important}',
 '#bbInvoiceQuickStack [hidden],#bbInvoiceAdminModal[hidden]{display:none!important}',
 '#bbInvoiceQuickStack .bbqa-panel{border:1px solid #d9e4f3;border-radius:9px;padding:8px!important;background:#f8fbff}',
 '#bbInvoiceQuickStack #bbInvoiceMorePanel .actions{display:grid!important;grid-template-columns:minmax(0,1fr)!important;gap:7px!important;margin:0!important;padding:0!important}',
 '.bb-action-card #bbInvoiceMorePanel .print-btn{background:#163451!important;color:#fff!important;border:0!important}',
 '.bb-action-card #bbInvoiceMorePanel .share-btn{background:#159450!important;color:#fff!important;border:0!important}',
 '.bb-action-card #bbInvoiceMorePanel .save-btn{background:#2865c7!important;color:#fff!important;border:0!important}',
 '#bbInvoiceAdminPanel{display:grid;gap:7px!important}',
 '.bb-action-card #bbInvoiceAdminPanel button{background:white!important;color:#224a78!important;border:1px solid #cbdbea!important;justify-content:flex-start!important}',
 '#bbInvoiceAdminModal{position:fixed!important;inset:0!important;z-index:1100000!important;background:rgba(10,26,48,.68)!important;display:flex!important;align-items:center!important;justify-content:center!important;box-sizing:border-box!important;padding:15px!important;overflow:auto}',
 '#bbInvoiceAdminModal .bbqa-card{box-sizing:border-box;width:min(515px,100%);max-height:calc(100vh - 30px);overflow:auto;border:1px solid #d5e0ef;border-radius:15px;background:#fff;box-shadow:0 25px 70px #0005;padding:18px;font:13px Arial,sans-serif;color:#253c58}',
 '#bbInvoiceAdminModal .bbqa-head{display:flex;align-items:center;gap:9px;margin-bottom:7px}',
 '#bbInvoiceAdminModal h2{margin:0;flex:1;font:bold 17px Arial,sans-serif;color:#16457c}',
 '#bbInvoiceAdminModal .bbqa-close{width:33px;height:33px;display:grid;place-items:center;border:0;border-radius:8px;background:#edf2f8;color:#3f5b7d;cursor:pointer}',
 '#bbInvoiceAdminModal .bbqa-help{font-size:11px;color:#657c95;line-height:1.5;margin:0 0 13px}',
 '#bbInvoiceAdminModal form{display:grid;gap:11px}',
 '#bbInvoiceAdminModal .bbqa-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}',
 '#bbInvoiceAdminModal label{display:grid;gap:5px;font:bold 11px Arial,sans-serif;color:#355b7b}',
 '#bbInvoiceAdminModal input,#bbInvoiceAdminModal select{box-sizing:border-box;width:100%;min-height:39px;border:1px solid #c9d7e8;border-radius:8px;padding:9px;font:13px Arial,sans-serif;background:#fff;color:#263e55}',
 '#bbInvoiceAdminModal .bbqa-footer{display:flex;gap:9px;justify-content:flex-end;margin-top:2px}',
 '#bbInvoiceAdminModal .bbqa-footer button{width:auto;padding:10px 14px;border-radius:8px;border:1px solid #c1d1e5;font:bold 12px Arial,sans-serif;cursor:pointer}',
 '#bbInvoiceAdminModal .bbqa-submit{background:#0b5bb5;color:#fff;border-color:#0b5bb5!important}',
 '#bbInvoiceAdminModal .bbqa-cancel{background:#f4f7fb;color:#385776}',
 '#bbInvoiceAdminModal #bbInvoiceAdminNotice:not([data-state]){display:none}',
 '#bbInvoiceAdminModal #bbInvoiceAdminNotice{padding:10px;border-radius:8px;margin:0 0 11px;font-size:12px;line-height:1.5}',
 '#bbInvoiceAdminModal #bbInvoiceAdminNotice[data-state=error]{background:#fff0ed;color:#932e25;border:1px solid #f1c4bb}',
 '#bbInvoiceAdminModal #bbInvoiceAdminNotice[data-state=success]{background:#edfdf3;color:#11663d;border:1px solid #b6e4c8}',
 '#bbInvoiceAdminModal #bbInvoiceAdminNotice[data-state=info]{background:#eef5ff;color:#315f91;border:1px solid #c9d9ee}',
 '@media(max-width:520px){#bbInvoiceAdminModal .bbqa-grid{grid-template-columns:1fr}#bbInvoiceAdminModal .bbqa-card{padding:13px}}',
 '@media print{#bbInvoiceQuickStack,#bbInvoiceAdminModal{display:none!important}}'
 ].join('\n');
 document.head.appendChild(s);
}
function showPanel(name,on){
 const el=$(name+'Panel'),btn=$(name);if(!el||!btn)return;
 el.hidden=!on;btn.setAttribute('aria-expanded',String(on));
}
async function rpc(fn,args){
 if(typeof window.BBInvoiceBankRpc!=='function')throw Error('Invoice database is not ready. Please sign in.');
 return window.BBInvoiceBankRpc(fn,args||{});
}
function setup(){
 if($('bbInvoiceQuickStack'))return;
 const card=document.querySelector('.bb-action-card.no-print');
 const actions=card?.querySelector('.actions.no-print');
 const old=card?.querySelector('.bottom-action-row');
 const preview=old?.querySelector('.preview-btn');
 const complete=old?.querySelector('.complete-btn');
 if(!card||!actions||!preview||!complete||actions.querySelectorAll('button').length!==4)return;
 addCss();
 const title=card.querySelector('.bb-action-title');if(title)title.textContent='Quick Actions';
 const items=[...actions.querySelectorAll('button')],names=[
 ['print','Print / Save PDF'],['share','Share to Telegram'],
 ['phone','Save to Phone'],['drive','Save to Drive']
 ];
 items.forEach((b,i)=>setLabel(b,names[i][0],names[i][1]));
 preview.id='bbInvoiceQuickPreview';setLabel(preview,'eye','Invoice Preview');
 complete.id='bbInvoiceQuickComplete';setLabel(complete,'done','Complete');
 const more=button('bbInvoiceMore','menu','More Function'),adminBtn=button('bbInvoiceAdmin','shield','Admin Option');
 const morePanel=document.createElement('div');morePanel.id='bbInvoiceMorePanel';morePanel.className='bbqa-panel';morePanel.hidden=true;morePanel.appendChild(actions);
 const adminPanel=document.createElement('div');adminPanel.id='bbInvoiceAdminPanel';adminPanel.className='bbqa-panel';adminPanel.hidden=true;
 adminBtn.hidden=true;
 adminPanel.append(button('bbInvoiceNewCustomer','user','Quick Add New Customer'),button('bbInvoiceBankDirectory','bank','Quick Add Customer Bank Directory'));
 const stack=document.createElement('div');stack.id='bbInvoiceQuickStack';
 stack.append(preview,more,morePanel,adminBtn,adminPanel,complete);
 if(title)title.insertAdjacentElement('afterend',stack);else card.prepend(stack);
 if(!old.children.length)old.remove();
 more.setAttribute('aria-controls','bbInvoiceMorePanel');more.setAttribute('aria-expanded','false');
 adminBtn.setAttribute('aria-controls','bbInvoiceAdminPanel');adminBtn.setAttribute('aria-expanded','false');
 more.addEventListener('click',()=>{const open=morePanel.hidden;showPanel('bbInvoiceMore',open);if(open)showPanel('bbInvoiceAdmin',false)});
 adminBtn.addEventListener('click',()=>{if(!admin)return;const open=adminPanel.hidden;showPanel('bbInvoiceAdmin',open);if(open)showPanel('bbInvoiceMore',false)});
 actions.addEventListener('click',e=>{if(e.target.closest('button'))showPanel('bbInvoiceMore',false)});
 $('bbInvoiceNewCustomer').addEventListener('click',()=>openForm('customer'));
 $('bbInvoiceBankDirectory').addEventListener('click',()=>openForm('bank'));
 rpc('bb_is_admin').then(value=>{
    admin=value===true;adminBtn.hidden=!admin;
 }).catch(()=>{admin=false;adminBtn.hidden=true;showPanel('bbInvoiceAdmin',false)});
}
function ensureModal(){
 if($('bbInvoiceAdminModal'))return;
 const panel=document.createElement('div');panel.id='bbInvoiceAdminModal';panel.className='no-print';panel.hidden=true;panel.setAttribute('aria-hidden','true');
 panel.innerHTML='<section class="bbqa-card" role="dialog" aria-modal="true" aria-labelledby="bbqaTitle">'+
 '<div class="bbqa-head"><span id="bbqaHeadIcon"></span><h2 id="bbqaTitle"></h2><button type="button" id="bbqaClose" class="bbqa-close" aria-label="Close">'+icon('x')+'</button></div>'+
 '<p class="bbqa-help" id="bbqaHelp"></p><div role="status" aria-live="polite" id="bbInvoiceAdminNotice"></div><div id="bbqaBody"></div></section>';
 document.body.appendChild(panel);
 $('bbqaClose').addEventListener('click',closeForm);
 panel.addEventListener('click',e=>{if(e.target===panel)closeForm()});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!panel.hidden){e.preventDefault();closeForm()}});
}
function notice(v,state){$('bbInvoiceAdminNotice').textContent=v;$('bbInvoiceAdminNotice').dataset.state=state||'info'}
function closeForm(){
 if(busy)return;
 const modal=$('bbInvoiceAdminModal');if(!modal)return;
 modal.hidden=true;modal.setAttribute('aria-hidden','true');kind='';
 restoreFocus?.focus?.();restoreFocus=null;
}
function formCustomer(){
 return '<form id="bbqaCustomerForm" autocomplete="off">'+
 '<label>Customer Name *<input name="name" maxlength="160" required placeholder="New customer name"></label>'+
 '<div class="bbqa-grid"><label>Main Location *<select id="bbqaLocation" name="locationCode" required></select></label>'+
 '<label>Phone<input name="phone" type="tel" maxlength="80" placeholder="Optional"></label></div>'+
 '<label>Address<input name="address" maxlength="500" placeholder="Customer address"></label>'+
 '<div class="bbqa-grid"><label>Credit Term<select id="bbqaTerm" name="creditTermType">'+
 '<option value="DAYS">Days</option><option value="HALF_MONTH">Half Month</option><option value="MONTHS">Months</option></select></label>'+
 '<label id="bbqaTermWrap">Credit Term Value<input name="creditTermValue" id="bbqaTermValue" type="number" min="0" max="365" step="1" value="4"></label></div>'+
 '<div class="bbqa-footer"><button type="button" class="bbqa-cancel">Cancel</button>'+
 '<button class="bbqa-submit" id="bbqaSaveCustomer" type="submit">Save New Customer</button></div></form>';
}
function formBank(){
 return '<form id="bbqaBankForm" autocomplete="off">'+
 '<label>Customer *<input id="bbqaBankCustomer" list="bbqaCustomerOptions" required placeholder="Search customer name or ID">'+
 '<datalist id="bbqaCustomerOptions"></datalist></label>'+
 '<div class="bbqa-grid"><label>Sending / Customer Bank *<input name="bank" required maxlength="100" placeholder="ABA, ACLEDA..."></label>'+
 '<label>Actual Sender Account Holder *<input name="holder" required maxlength="160" placeholder="Exact bank transfer name"></label></div>'+
 '<label>Sender Account Number<input name="account" placeholder="Optional"></label>'+
 '<label>Alternative Sender Names<input name="aliases" placeholder="Comma-separated optional aliases"></label>'+
 '<div class="bbqa-footer"><button type="button" class="bbqa-cancel">Cancel</button>'+
 '<button class="bbqa-submit" id="bbqaSaveBank" type="submit">Save Bank Identity</button></div></form>';
}
function bankLabel(c){return text(c.customer_name)+' ['+text(c.customer_id)+'] · '+text(c.location_code)}
async function openForm(which){
 if(!admin)return;
 ensureModal();kind=which;restoreFocus=document.activeElement;
 const modal=$('bbInvoiceAdminModal');modal.hidden=false;modal.setAttribute('aria-hidden','false');
 $('bbInvoiceAdminNotice').removeAttribute('data-state');$('bbInvoiceAdminNotice').textContent='';
 $('bbqaTitle').textContent=which==='customer'?'Quick Add New Customer':'Quick Add Customer Bank Directory';
 $('bbqaHeadIcon').innerHTML=icon(which==='customer'?'user':'bank');
 $('bbqaHelp').textContent=which==='customer'
 ?'Creates a permanent Customer ID with default product prices. No invoice data will be lost.'
 :'Use the same bank-identity registration as Bank Register. Does not create a bank payment or customer balance.';
 $('bbqaBody').innerHTML=which==='customer'?formCustomer():formBank();
 modal.querySelector('.bbqa-cancel').addEventListener('click',closeForm);
 if(which==='customer'){
    const sel=$('bbqaLocation'),base=$('mainLocation');
    sel.replaceChildren(new Option('Select location',''));
    if(base)[...base.options].filter(o=>text(o.value)).forEach(o=>sel.add(new Option(text(o.textContent),text(o.value))));
    sel.value=text(base?.value)||'';
    $('bbqaTerm').addEventListener('change',()=>{
      const t=$('bbqaTerm').value,el=$('bbqaTermValue');
      $('bbqaTermWrap').hidden=t==='HALF_MONTH';
      el.min=t==='MONTHS'?'1':'0';el.max=t==='MONTHS'?'24':'365';el.value=t==='MONTHS'?'1':'4';
    });
    $('bbqaCustomerForm').addEventListener('submit',saveCustomer);
    $('bbqaCustomerForm').querySelector('[name=name]').focus();
 }else{
    $('bbqaBankForm').addEventListener('submit',saveBank);
    notice('Loading authorized customer directory…','info');
    try{
      if(!bankLoaded){
        const data=await rpc('bb_bank_register_customers');
        if(!Array.isArray(data))throw Error('Unable to load the bank customer directory');
        bankRows=data;bankLoaded=true;
      }
      if(kind!=='bank'||modal.hidden)return;
      const list=$('bbqaCustomerOptions');
      list.replaceChildren(...bankRows.map(c=>new Option(bankLabel(c))));
      const selected=window.bbGetSelectedCustomerForBank?.();
      const match=bankRows.find(c=>text(c.customer_id)===text(selected?.customerId));
      if(match)$('bbqaBankCustomer').value=bankLabel(match);
      $('bbInvoiceAdminNotice').removeAttribute('data-state');$('bbInvoiceAdminNotice').textContent='';
      $('bbqaBankCustomer').focus();
    }catch(e){notice(text(e?.message||e),'error');$('bbqaSaveBank').disabled=true}
 }
}
async function saveCustomer(event){
 event.preventDefault();if(!admin||busy)return;
 const data=new FormData(event.currentTarget);
 const name=text(data.get('name')),locationCode=text(data.get('locationCode'));
 const creditTermType=text(data.get('creditTermType')),creditTermValue=creditTermType==='HALF_MONTH'?0:Number(data.get('creditTermValue'));
 if(!name||!locationCode)return notice('Customer Name and Main Location are required.','error');
 if(!Number.isInteger(creditTermValue)||creditTermValue<0||
   (creditTermType==='DAYS'&&creditTermValue>365)||
   (creditTermType==='MONTHS'&&(creditTermValue<1||creditTermValue>24)))
   return notice('Check your credit term value.','error');
 busy=true;const btn=$('bbqaSaveCustomer');btn.disabled=true;notice('Saving in Customer Master…','info');
 try{
   const res=await rpc('bb_customer_editor_save_customer',{p_payload:{
      name,locationCode,phone:text(data.get('phone')),address:text(data.get('address')),
      creditTermType,creditTermValue,active:true
   }});
   if(!res?.success||!res?.customer?.customerId)throw Error('Save result not confirmed. Verify Customer Master before retrying.');
   const c=res.customer;bankLoaded=false;
   if(text($('mainLocation')?.value)===locationCode){
      try{
        await window.loadCustomersByLocation?.(locationCode);
        window.selectCustomer?.(c);
        notice('Customer '+c.customerId+' created and selected for this invoice.','success');
      }catch(_){notice('Customer '+c.customerId+' saved. Select it from Customer Name to continue.','success');}
   }else{notice('Customer '+c.customerId+' saved for '+locationCode+'. Current invoice location was not changed.','success')}
   btn.textContent='Saved';
 }catch(e){notice('Save not confirmed: '+text(e?.message||e)+'. Check Customers Editor before retrying.','error');btn.disabled=false}
 finally{busy=false}
}
async function saveBank(event){
 event.preventDefault();if(!admin||busy)return;
 const data=new FormData(event.currentTarget);
 const match=bankRows.find(c=>bankLabel(c)===text($('bbqaBankCustomer')?.value));
 if(!match)return notice('Select an exact registered customer.','error');
 const bank=text(data.get('bank')),holder=text(data.get('holder'));
 if(bank.length<2||holder.length<2)return notice('Bank and actual sender name are required.','error');
 busy=true;const btn=$('bbqaSaveBank');btn.disabled=true;notice('Saving sender identity in Bank Directory…','info');
 try{
    const id=await rpc('bb_customer_bank_identity_save',{
      p_customer_id:match.customer_id,p_bank_name:bank,p_holder_name:holder,
      p_account_number:text(data.get('account'))||null,
      p_alternative_names:text(data.get('aliases')).split(',').map(text).filter(Boolean),p_identity_id:null
    });
    if(!id)throw Error('Bank identity save was not confirmed.');
    notice('Bank Identity #'+id+' saved for '+text(match.customer_name)+'. No payment was created.','success');
    btn.textContent='Saved';
 }catch(e){notice('Save not confirmed: '+text(e?.message||e)+'. Check Bank Directory before retrying.','error');btn.disabled=false}
 finally{busy=false}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup,{once:true});else setup();
})();
