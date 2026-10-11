/* Customer bank balance reminder: display only, never consumes funds. */
(function(){
'use strict';
const field=()=>document.getElementById('customerName');
let seq=0,lastId='',timer=null;
function box(){
 let el=document.getElementById('bbCustomerBalanceHeader');
 if(el)return el;
 const header=document.querySelector('.header-main');
 if(!header)return null;
 el=document.createElement('div');el.id='bbCustomerBalanceHeader';
 el.setAttribute('role','status');el.setAttribute('aria-live','polite');
 el.style.cssText='display:block;flex:1 1 200px;max-width:360px;min-width:195px;align-self:center;border:1px solid #d2dce7;border-radius:10px;background:#f5f7fa;padding:7px 11px;box-sizing:border-box;line-height:1.3';
 const currency=header.querySelector('.header-currency');
 if(currency)header.insertBefore(el,currency);else header.appendChild(el);
 return el;
}
function render(title,amount,help,active){
 const el=box();if(!el)return;
 el.style.background=active?'#effaf3':'#f5f7fa';
 el.style.borderColor=active?'#8fcda5':'#d2dce7';
 el.replaceChildren();
 const l=document.createElement('div');l.textContent='💳 Customer Bank Balance';l.style.cssText='font:700 11px Arial,sans-serif;color:#365876';
 const a=document.createElement('div');a.textContent=amount;a.style.cssText='font:800 15px Arial,sans-serif;color:'+(active?'#16633c':'#50677c')+';margin-top:2px';
 const h=document.createElement('div');h.textContent=help;h.style.cssText='font:400 10px Arial,sans-serif;color:#6d7e8e;margin-top:2px';
 el.append(l,a,h);
}
function fmt(value,digits){return Number(value||0).toLocaleString('en-US',{minimumFractionDigits:digits,maximumFractionDigits:digits});}
async function update(){
 const selected=window.bbGetSelectedCustomerForBank?.();
 const customerId=String(selected?.customerId||'').trim();
 const current=++seq;
 if(!customerId){lastId='';render('','Select customer','Choose a customer to check available funds',false);return;}
 lastId=customerId;
 render('','Checking balance…','Retrieving verified remaining balance',false);
 try{
  const rows=await window.BBInvoiceBankRpc('bb_customer_bank_balance_list',{p_customer_id:customerId});
  if(current!==seq)return;
  const available=(Array.isArray(rows)?rows:[]).filter(r=>Number(r.remaining_amount)>0);
  const usd=available.filter(r=>r.currency==='USD').reduce((s,r)=>s+Number(r.remaining_amount),0);
  const khr=available.filter(r=>r.currency==='KHR').reduce((s,r)=>s+Number(r.remaining_amount),0);
  render('',available.length?'$'+fmt(usd,2)+'  |  '+fmt(khr,0)+'៛':'No available balance',
  available.length?available.length+' transaction(s) · Select Bank to use':'No verified balance for this customer',available.length>0);
 }catch(e){if(current===seq)render('','Balance unavailable','Check connection or permissions',false);}
}
function schedule(){clearTimeout(timer);timer=setTimeout(update,230);}
function init(){
 box();render('','Select customer','Balance appears after customer selection',false);
 field()?.addEventListener('input',schedule);
 field()?.addEventListener('change',schedule);
 document.getElementById('mainLocation')?.addEventListener('change',schedule);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
