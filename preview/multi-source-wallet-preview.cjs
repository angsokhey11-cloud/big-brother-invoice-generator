/* BIG BROTHER multi-source payment selector — feature-branch preview only.
 * Deliberately NOT connected to invoice save. The existing backend accepts a
 * single registered transaction ID and cannot safely persist multiple sources.
 * The preview reads existing synchronized bank balances from the event payload.
 * Credit rows are supplied only by a future authorized API.
 */
(function(root){
 'use strict';
 const state={customerId:'',currency:'USD',sources:[],selected:new Map()};
 function roundUnits(value,currency){
  const precision=currency==='KHR'?0:2;
  if(currency!=='KHR'&&currency!=='USD')throw Error('Unsupported currency');
  const raw=String(value).trim(),m=raw.match(/^(\d+)(?:\.(\d+))?$/);
  if(!m)throw Error('Invalid amount');
  if((m[2]||'').slice(precision).replace(/0/g,''))throw Error('Excess precision');
  const power=10**precision,amount=Number(m[1])*power+Number(((m[2]||'').slice(0,precision)).padEnd(precision,'0')||0);
  if(!Number.isSafeInteger(amount)||amount<0)throw Error('Amount exceeds supported range');
  return amount;
 }
 function fmt(units,currency){const n=currency==='KHR'?0:2;return (units/10**n).toFixed(n)}
 function reset(customerId,currency){
  state.customerId=String(customerId||'');
  state.currency=currency==='KHR'?'KHR':'USD';
  state.sources=[];state.selected.clear();
 }
 function loadBankRows({customerId,rows,currency}){
  if(String(customerId||'')!==state.customerId || (currency && currency!==state.currency))reset(customerId,currency||state.currency);
  const old=new Map(state.selected),ids=new Set();
  state.sources=(Array.isArray(rows)?rows:[]).filter(row=>{
    return String(row.customer_id||'')===state.customerId&&Number(row.remaining_amount)>0;
  }).map(row=>({
    kind:'BANK_REGISTER',id:String(row.transaction_id),currency:String(row.currency||'').toUpperCase(),
    available:String(row.remaining_amount),date:String(row.received_date||'')
  })).filter(row=>{const key=row.kind+':'+row.id;if(ids.has(key))return false;ids.add(key);return true;});
  state.selected.clear();
  for(const row of state.sources){const key=row.kind+':'+row.id;const previous=old.get(key);if(previous!==undefined){try{if(row.currency===state.currency&&roundUnits(previous,row.currency)<=roundUnits(row.available,row.currency))state.selected.set(key,previous)}catch(_){}}}
  return snapshot();
 }
 function choose(kind,id,amount){
  const row=state.sources.find(r=>r.kind===kind&&r.id===String(id));
  if(!row)throw Error('Balance not found');
  if(row.currency!==state.currency)throw Error('Currency conversion requires approved FX allocation');
  const units=roundUnits(amount,row.currency);
  if(!units||units>roundUnits(row.available,row.currency))throw Error('Amount exceeds available balance');
  state.selected.set(kind+':'+id,fmt(units,row.currency));
  return snapshot();
 }
 function unchoose(kind,id){state.selected.delete(kind+':'+id);return snapshot()}
 function snapshot(){
  let total=0;for(const row of state.sources){const a=state.selected.get(row.kind+':'+row.id);if(a!==undefined)total+=roundUnits(a,row.currency)}
  return {customerId:state.customerId,currency:state.currency,selected:state.sources.filter(r=>state.selected.has(r.kind+':'+r.id)).map(r=>({...r,useAmount:state.selected.get(r.kind+':'+r.id)})),total:fmt(total,state.currency),saveEnabled:false};
 }
 const api=Object.freeze({reset,loadBankRows,choose,unchoose,snapshot});
 if(typeof module==='object'&&module.exports)module.exports=api;
 else {
  root.BBMultiSourceWalletPreview=api;
  document.addEventListener('bb:bank-cache-updated',e=>{
   const d=e.detail||{};api.loadBankRows({customerId:d.customerId,rows:d.balances||[],currency:root.document.getElementById('currency')?.value||'USD'});
   document.dispatchEvent(new CustomEvent('bb:multi-source-wallet-preview',{detail:api.snapshot()}));
  });
 }
})(typeof window!=='undefined'?window:globalThis);
