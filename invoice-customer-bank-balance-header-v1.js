/* BIG BROTHER V3.4.2 — display-only customer bank balance. */
(function(){
'use strict';
let customerId='',sequence=0,lastCheck=0,pending=false;
const el=id=>document.getElementById(id);
const fmt=(n,d)=>Number(n||0).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d});
function createPanel(){
 if(el('bbCustomerBalanceHeader'))return true;
 const range=el('bbInvoiceRangeDetector');
 if(!range||!range.parentElement)return false;
 const panel=document.createElement('div');panel.id='bbCustomerBalanceHeader';
 panel.className='no-print';
 panel.style.cssText='flex:0 1 315px;min-width:265px;max-width:370px;align-self:center;box-sizing:border-box';
 const label=document.createElement('label');label.textContent='Customer Bank Balance';
 label.style.cssText='display:block;font:700 12px Arial,sans-serif;color:#345475;margin-bottom:5px';
 const amount=document.createElement('div');amount.id='bbCustomerBalanceValue';
 amount.style.cssText='padding:10px 13px;border:1px solid #cbd7e5;border-radius:9px;background:#f8fafc;font:800 18px Arial,sans-serif;min-height:23px';
 const hint=document.createElement('div');hint.id='bbCustomerBalanceHint';
 hint.style.cssText='font:11px Arial,sans-serif;color:#718096;margin-top:4px';
 panel.append(label,amount,hint);
 range.insertAdjacentElement('afterend',panel);
 return true;
}
function show(value,hint,active){
 if(!createPanel())return;
 const panel=el('bbCustomerBalanceHeader'),amount=el('bbCustomerBalanceValue'),sub=el('bbCustomerBalanceHint');
 if(!panel||!amount||!sub)return;
 amount.textContent=value;sub.textContent=hint;
 panel.style.background=active?'#effaf3':'#f4f8fc';
 panel.style.borderColor=active?'#86cba1':'#d3e0ed';
 amount.style.color=active?'#166b3b':'#506780';
}
async function check(id){
 const token=++sequence;pending=true;lastCheck=Date.now();
 show('Checking balance…','Reading verified remaining balance',false);
 try{
  const list=await window.BBInvoiceBankRpc('bb_customer_bank_balance_list_v2',{p_customer_id:id});
  if(token!==sequence)return;
  const rows=(Array.isArray(list)?list:[]).filter(x=>Number(x.remaining_amount)>0);
  const usd=rows.filter(x=>x.currency==='USD').reduce((s,x)=>s+Number(x.remaining_amount),0);
  const khr=rows.filter(x=>x.currency==='KHR').reduce((s,x)=>s+Number(x.remaining_amount),0);
  show(rows.length?'$'+fmt(usd,2)+' | '+fmt(khr,0)+'៛':'No available balance',
       rows.length?rows.length+' registered transaction(s) · Select Bank to use':'No unused registered bank transfers',rows.length>0);
 }catch(err){
  if(token===sequence)show('Balance unavailable','Please check connection or access',false);
 }finally{if(token===sequence)pending=false;}
}
function tick(){
 createPanel();
 if(typeof window.bbGetSelectedCustomerForBank!=='function'||typeof window.BBInvoiceBankRpc!=='function')return;
 const selected=window.bbGetSelectedCustomerForBank();
 const id=String(selected?.customerId||'').trim();
 if(id!==customerId){
  customerId=id;sequence++;pending=false;lastCheck=0;
  if(!id){show('Select customer','Verified remaining balance',false);return;}
 }
 if(id&&!pending&&(lastCheck===0||Date.now()-lastCheck>20000))check(id);
}
function initialize(){
 if(!createPanel())setTimeout(createPanel,150);
 show('Select customer','Verified remaining balance',false);
 tick();
 setInterval(tick,700);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialize,{once:true});else initialize();
})();