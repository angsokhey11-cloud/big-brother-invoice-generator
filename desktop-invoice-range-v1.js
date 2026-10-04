/* BIG BROTHER — Desktop Invoice Range Detector V1
   Desktop only. Injected by desktop index.html, never mobile.
   Start | End | Skip | Invoice Range
*/
(function(){
'use strict';

const BUILD='20261004-invoice-range1';
const STORAGE_KEY='BB_DESKTOP_INVOICE_RANGE_V1';
const $=id=>document.getElementById(id);

function cleanDigits(v){return String(v??'').replace(/\D/g,'')}

function read(){
  try{
    const v=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');
    return v&&typeof v==='object'?v:{start:'',end:'',skip:''};
  }catch(_){return {start:'',end:'',skip:''}}
}
function save(){
  try{
    localStorage.setItem(STORAGE_KEY,JSON.stringify({
      start:$('bbInvoiceRangeStart')?.value||'',
      end:$('bbInvoiceRangeEnd')?.value||'',
      skip:$('bbInvoiceRangeSkip')?.value||''
    }));
  }catch(_){}
}

function bounds(){
  const start=Number(cleanDigits($('bbInvoiceRangeStart')?.value));
  const end=Number(cleanDigits($('bbInvoiceRangeEnd')?.value));
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<=0||end<start)return null;
  return {start,end};
}

function resolveSkipToken(raw,b){
  const text=cleanDigits(raw);
  if(!text)return null;
  const n=Number(text);
  if(!Number.isSafeInteger(n)||n<0)return null;

  if(n>=b.start&&n<=b.end)return n;

  // Shorthand: 5,10,15,30 inside 4001-4050 => 4005,4010,4015,4030.
  const power=Math.max(100,10**Math.max(2,text.length));
  let candidate=Math.floor(b.start/power)*power+n;
  while(candidate<b.start)candidate+=power;
  return candidate<=b.end?candidate:null;
}

function skippedSet(b){
  const set=new Set();
  String($('bbInvoiceRangeSkip')?.value||'')
    .split(/[\s,;]+/)
    .map(v=>v.trim())
    .filter(Boolean)
    .forEach(token=>{
      const n=resolveSkipToken(token,b);
      if(n!=null)set.add(n);
    });
  return set;
}

function updateSummary(){
  const out=$('bbInvoiceRangeResult');
  if(!out)return;
  const b=bounds();
  if(!b){
    out.value='Set range';
    out.title='Enter Start Invoice and End Invoice';
    save();
    return;
  }
  const skips=skippedSet(b);
  const total=b.end-b.start+1;
  const usable=Math.max(0,total-skips.size);
  out.value=total+' total · '+skips.size+' skip · '+usable+' usable';
  out.title=b.start+'–'+b.end+' · '+usable+' usable invoice'+(usable===1?'':'s');
  save();
}

function numericPart(invoiceNo){
  const text=String(invoiceNo||'').trim();
  const m=text.match(/^(.*?)(\d+)$/);
  if(!m)return null;
  return {prefix:m[1],digits:m[2],number:Number(m[2])};
}

function nextAllowed(invoiceNo){
  const p=numericPart(invoiceNo);
  const b=bounds();
  if(!p||!b)return null;

  const skips=skippedSet(b);
  let n=p.number+1;

  // Only take over numbering when current invoice belongs to this paper range.
  if(p.number<b.start||p.number>b.end)return null;

  while(n<=b.end&&skips.has(n))n++;
  if(n>b.end)return {done:true};

  return {
    done:false,
    value:p.prefix+String(n).padStart(p.digits.length,'0')
  };
}

function warnCurrent(){
  const input=$('invoiceNumber');
  const b=bounds();
  if(!input||!b)return;
  const p=numericPart(input.value);
  if(!p)return;

  const skips=skippedSet(b);
  input.classList.toggle('bb-invoice-number-skipped',skips.has(p.number));
  input.title=skips.has(p.number)
    ? 'This invoice number is marked as skipped in the active invoice range.'
    : '';
}

function installIncrementGuard(){
  const original=window.incrementInvoiceNumber;
  if(typeof original!=='function'||original.__bbInvoiceRangeWrapped)return;

  const wrapped=function bbInvoiceRangeIncrement(invoiceNo){
    const next=nextAllowed(invoiceNo);
    if(next?.done){
      const input=$('invoiceNumber');
      if(input)input.dataset.bbInvoiceRangeComplete='1';
      return '';
    }
    if(next?.value)return next.value;
    return original.apply(this,arguments);
  };
  wrapped.__bbInvoiceRangeWrapped=true;
  window.incrementInvoiceNumber=wrapped;
}

function installSetGuard(){
  const original=window.setInvoiceNumber;
  if(typeof original!=='function'||original.__bbInvoiceRangeWrapped)return;

  const wrapped=function bbInvoiceRangeSet(number){
    const result=original.apply(this,arguments);
    setTimeout(warnCurrent,0);
    return result;
  };
  wrapped.__bbInvoiceRangeWrapped=true;
  window.setInvoiceNumber=wrapped;
}

function installUi(){
  const header=document.querySelector('.header-main');
  const title=header?.querySelector('h1');
  const currency=header?.querySelector('.header-currency');
  if(!header||!title||!currency||$('bbInvoiceRangeDetector'))return !!$('bbInvoiceRangeDetector');

  const saved=read();
  const box=document.createElement('div');
  box.id='bbInvoiceRangeDetector';
  box.className='no-print';
  box.innerHTML=
    '<div class="bb-range-field"><label for="bbInvoiceRangeStart">Start</label><input id="bbInvoiceRangeStart" inputmode="numeric" placeholder="4001" value="'+escapeHtml(saved.start)+'"></div>'+
    '<div class="bb-range-field"><label for="bbInvoiceRangeEnd">End</label><input id="bbInvoiceRangeEnd" inputmode="numeric" placeholder="4050" value="'+escapeHtml(saved.end)+'"></div>'+
    '<div class="bb-range-field bb-range-skip"><label for="bbInvoiceRangeSkip">Skip</label><input id="bbInvoiceRangeSkip" inputmode="numeric" placeholder="5,10,15,30" value="'+escapeHtml(saved.skip)+'"></div>'+
    '<div class="bb-range-field bb-range-result"><label for="bbInvoiceRangeResult">Invoice Range</label><input id="bbInvoiceRangeResult" readonly value="Set range"></div>';

  header.insertBefore(box,currency);

  ['bbInvoiceRangeStart','bbInvoiceRangeEnd','bbInvoiceRangeSkip'].forEach(id=>{
    $(id)?.addEventListener('input',()=>{
      updateSummary();
      warnCurrent();
    });
    $(id)?.addEventListener('change',()=>{
      updateSummary();
      warnCurrent();
    });
  });

  $('invoiceNumber')?.addEventListener('input',warnCurrent);
  updateSummary();
  warnCurrent();
  return true;
}

function escapeHtml(v){
  return String(v??'').replace(/[&<>"']/g,ch=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
  }[ch]));
}

function installStyle(){
  if($('bbInvoiceRangeDetectorStyle'))return;
  const style=document.createElement('style');
  style.id='bbInvoiceRangeDetectorStyle';
  style.textContent=`
    @media (min-width:901px){
      .header-main{
        display:grid!important;
        grid-template-columns:minmax(190px,auto) minmax(500px,1fr) auto!important;
        gap:14px!important;
        align-items:end!important;
      }
      .header-main h1{min-width:190px!important;align-self:center!important}
      #bbInvoiceRangeDetector{
        display:grid;
        grid-template-columns:minmax(86px,.75fr) minmax(86px,.75fr) minmax(150px,1.25fr) minmax(210px,1.6fr);
        gap:7px;
        align-items:end;
        min-width:0;
      }
      #bbInvoiceRangeDetector .bb-range-field{min-width:0}
      #bbInvoiceRangeDetector label{
        margin:0 0 3px!important;
        color:#31516f!important;
        font-size:10px!important;
        font-weight:800!important;
        line-height:1!important;
        white-space:nowrap;
      }
      #bbInvoiceRangeDetector input{
        width:100%!important;
        min-width:0!important;
        height:34px!important;
        min-height:34px!important;
        padding:5px 8px!important;
        border:1px solid #c5d3e2!important;
        border-radius:8px!important;
        font-size:11.5px!important;
        font-weight:700!important;
        box-shadow:none!important;
      }
      #bbInvoiceRangeResult{
        background:#f4f8fd!important;
        color:#174a91!important;
        cursor:default!important;
      }
      #invoiceNumber.bb-invoice-number-skipped{
        border-color:#d97706!important;
        box-shadow:0 0 0 2px rgba(217,119,6,.12)!important;
        background:#fff8eb!important;
      }
    }
  `;
  document.head.appendChild(style);
}

function boot(){
  installStyle();
  installIncrementGuard();
  installSetGuard();
  if(!installUi()){
    setTimeout(boot,100);
    return;
  }

  let tries=0;
  const timer=setInterval(()=>{
    tries++;
    installIncrementGuard();
    installSetGuard();
    warnCurrent();
    if(tries>=40)clearInterval(timer);
  },250);

  window.BB_INVOICE_RANGE_DETECTOR_BUILD=BUILD;
  window.BBInvoiceRangeDetectorV1={update:updateSummary,nextAllowed};
}

if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded',boot,{once:true});
}else{
  boot();
}
})();