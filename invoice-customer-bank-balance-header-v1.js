/* BIG BROTHER V3.5 — display-only customer bank balance. */
(function(){
'use strict';
let customerId='',sequence=0,lastCheck=0,pending=false;
const el=id=>document.getElementById(id);
const fmt=(n,d)=>Number(n||0).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d});
function installLayout(){
 if(el('bbCustomerBalanceLayoutV344'))return;
 const style=document.createElement('style');style.id='bbCustomerBalanceLayoutV344';
 style.textContent=`@media(min-width:901px){
 .header-main:has(#bbCustomerBalanceHeader){
  grid-template-columns:minmax(0,1.65fr) minmax(220px,1fr) auto!important;
  gap:12px!important;align-items:end!important;
 }
 .header-main:has(#bbCustomerBalanceHeader)>h1{display:none!important}
 .header-main:has(#bbCustomerBalanceHeader) #bbInvoiceRangeDetector{min-width:0;width:100%}
 .header-main:has(#bbCustomerBalanceHeader) #bbCustomerBalanceHeader{min-width:0;width:70%;max-width:70%}
 .header-main #bbCustomerBalanceHeader{background:transparent!important;border:0!important;box-shadow:none!important}
 .header-main #bbCustomerBalanceValue{color:#174a91!important;background:#fff!important;display:flex!important;align-items:center!important;justify-content:center!important;text-align:center!important}
 .header-main #bbCustomerBalanceValue{display:block!important;text-align:left!important}
 .header-main #bbCustomerBalanceInnerText{display:inline-block!important;position:relative!important;left:50%!important;transform:translateX(-50%)!important}
 .header-main #bbCustomerBalanceHint{display:block!important;position:static!important;width:100%!important;max-width:100%!important;text-align:left!important}
 .header-main #bbCustomerBalanceHintText{display:inline-block!important;position:relative!important;left:50%!important;transform:translateX(-50%)!important}
 }
 @media(max-width:900px){
 .header-main #bbCustomerBalanceHeader{min-width:0;width:100%;max-width:none}
 }`;
 document.head.appendChild(style);
}
function createPanel(){
 if(el('bbCustomerBalanceHeader'))return true;
 const range=el('bbInvoiceRangeDetector');
 if(!range||!range.parentElement)return false;
 const panel=document.createElement('div');panel.id='bbCustomerBalanceHeader';
 panel.className='no-print';
 panel.style.cssText='min-width:0;width:70%;max-width:70%;align-self:end;box-sizing:border-box;background:transparent!important;border:0!important;box-shadow:none!important';
 const label=document.createElement('label');label.textContent='Customer Bank Balance';
 label.style.cssText='display:block;font:800 10px Arial,sans-serif;color:#31516f;margin:0 0 3px;line-height:1;white-space:nowrap';
 const amount=document.createElement('div');amount.id='bbCustomerBalanceValue';
 amount.style.cssText='display:flex;align-items:center;justify-content:center;text-align:center;box-sizing:border-box;width:100%;height:34px;min-height:34px;padding:5px 9px;border:1px solid #c5d3e2;border-radius:8px;background:#fff;font:800 15px Arial,sans-serif;white-space:nowrap';
 const amountText=document.createElement('span');amountText.id='bbCustomerBalanceInnerText';
 amountText.style.cssText='display:inline-block!important;position:relative!important;left:50%!important;transform:translateX(-50%)!important;width:max-content!important;white-space:nowrap';
 amount.appendChild(amountText);
 amount.style.setProperty('display','block','important');
 amount.style.setProperty('line-height','22px','important');
 const hint=document.createElement('div');hint.id='bbCustomerBalanceHint';
 hint.style.cssText='display:flex!important;justify-content:center!important;align-items:center!important;position:static!important;transform:none!important;left:auto!important;right:auto!important;bottom:auto!important;box-sizing:border-box;width:100%!important;max-width:100%!important;font:10px Arial,sans-serif;color:#718096;margin:3px 0 0;white-space:nowrap;text-align:center!important';
 const hintText=document.createElement('span');hintText.id='bbCustomerBalanceHintText';
 hintText.style.cssText='display:inline-block!important;position:relative!important;left:50%!important;transform:translateX(-50%)!important;width:max-content!important;white-space:nowrap';
 hint.appendChild(hintText);
 hint.style.setProperty('display','block','important');
 hint.style.setProperty('text-align','left','important');
 panel.append(label,amount,hint);
 range.insertAdjacentElement('afterend',panel);
 installLayout();
 return true;
}
function show(value,hint,active){
 if(!createPanel())return;
 const panel=el('bbCustomerBalanceHeader'),amount=el('bbCustomerBalanceValue'),sub=el('bbCustomerBalanceHint');
 if(!panel||!amount||!sub)return;
 const inner=el('bbCustomerBalanceInnerText');
 if(inner)inner.textContent=value;else amount.textContent=value;
 amount.style.setProperty('display','block','important');
 amount.style.setProperty('text-align','left','important');
 const hintText=el('bbCustomerBalanceHintText');
 if(hintText)hintText.textContent=hint;else sub.textContent=hint;
 panel.style.setProperty('background','transparent','important');
 panel.style.setProperty('border','0','important');
 panel.style.setProperty('box-shadow','none','important');
 amount.style.background='#fff';
 amount.style.borderColor='#c5d3e2';
 amount.style.setProperty('color','#174a91','important');
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