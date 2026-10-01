/* BIG BROTHER — Original paper invoice: generator attachment */
(()=>{
'use strict';
const HOST='https://sjfhlaclgmkwwofzstok.supabase.co';
const API_KEY='sb_publishable_w762jR65CWwlO30fKQsYOw_6L9grx8S';
const SESSION='BB_SUPABASE_DEV_SESSION_V1';
let selected=null,previewUrl='',uploading=false,retryId='';
function session(){try{return JSON.parse(localStorage.getItem(SESSION)||'null')}catch{return null}}
async function bearer(){
 let s=session();if(!s?.access_token)throw Error('Sign in again before attaching an original.');
 if(s.expires_at&&s.expires_at<Date.now()/1000+45){
  const r=await fetch(HOST+'/auth/v1/token?grant_type=refresh_token',{method:'POST',headers:{apikey:API_KEY,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:s.refresh_token})});
  const v=await r.json();if(!r.ok)throw Error(v.message||'Session expired');
  v.expires_at=Math.floor(Date.now()/1000)+v.expires_in;localStorage.setItem(SESSION,JSON.stringify(v));s=v;
 }
 return s.access_token;
}
function $(id){return document.getElementById(id)}
function setMessage(msg,error=false){const el=$('bbOriginalStatus');if(el){el.textContent=msg;el.style.color=error?'#ad362a':'#245a87'}}
function choose(file){
 if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl='';selected=null;
 const preview=$('bbOriginalPreview');if(preview)preview.replaceChildren();
 if(!file){setMessage('Optional — attach the original paper invoice.');return}
 if(!['image/jpeg','image/png','image/webp','application/pdf'].includes(file.type)){setMessage('Choose JPG, PNG, WebP or PDF.',true);return}
 if(file.size>12*1024*1024){setMessage('The original must be 12 MB or smaller.',true);return}
 selected=file;setMessage('Ready: '+file.name);
 if(file.type.startsWith('image/')&&preview){previewUrl=URL.createObjectURL(file);const img=document.createElement('img');img.src=previewUrl;img.alt='Original invoice preview';img.style.cssText='max-width:100%;max-height:120px;object-fit:contain;border-radius:7px';preview.append(img)}
}
function init(){
 if($('bbOriginalInvoice'))return;
 const anchor=document.querySelector('.bottom-action-row');
 if(!anchor){setTimeout(init,250);return}
 const box=document.createElement('section');box.id='bbOriginalInvoice';box.className='no-print';
 box.style.cssText='margin:14px 0;padding:12px;border:1px solid #bdd6ec;background:#f5faff;border-radius:12px;color:#214d72;max-width:100%;min-width:0';
 box.innerHTML='<strong style="font-size:14px">📎 Original Paper Invoice (Optional)</strong>'+
 '<p style="font-size:12px;margin:5px 0 10px">Paste a copied image (Ctrl+V), select a file, or take a photo on mobile. The upload starts only after the invoice saves.</p>'+
 '<input id="bbOriginalFile" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" style="display:block;max-width:100%;width:100%;font-size:13px">'+
 '<div id="bbOriginalPreview" style="margin-top:7px"></div><button id="bbOriginalRetry" type="button" hidden style="margin:6px 0;padding:7px 12px;background:#1f659b;border:0;border-radius:8px;color:white;font-weight:bold">Retry original upload</button><div id="bbOriginalStatus" role="status" style="font-size:12px;overflow-wrap:anywhere;margin-top:6px">Optional — attach the original paper invoice.</div>';
 anchor.parentNode.insertBefore(box,anchor);
 $('bbOriginalFile').addEventListener('change',e=>choose(e.target.files?.[0]));
 $('bbOriginalRetry').addEventListener('click',async()=>{if(!retryId||!selected)return;try{await afterComplete({invoiceId:retryId},{invoiceId:retryId});}catch(e){setMessage('Retry failed: '+e.message,true)}});
 document.addEventListener('paste',e=>{
  if(e.target?.closest?.('input,textarea,[contenteditable="true"]'))return;
  const file=[...(e.clipboardData?.files||[])].find(f=>f.type.startsWith('image/'));
  if(file){e.preventDefault();choose(file)}
 });
}
async function post(path,body,headers={}){
 const t=await bearer(),r=await fetch(HOST+path,{method:'POST',headers:{apikey:API_KEY,Authorization:'Bearer '+t,...headers},body});
 if(!r.ok){const data=await r.json().catch(()=>({}));throw Error(data.message||data.error||'Attachment upload failed')}
 return r.json();
}
async function afterComplete(payload,serverResult){
 if(!selected||uploading)return {skipped:true};
 const id=String(serverResult?.invoiceId||serverResult?.invoice_id||payload?.invoiceId||'').trim();
 if(!id)throw Error('Invoice saved, but its internal invoice ID was unavailable for attachment.');
 const file=selected;retryId=id;uploading=true;setMessage('Saving original invoice securely…');
 if($('bbOriginalRetry'))$('bbOriginalRetry').hidden=true;
 const ext={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','application/pdf':'pdf'}[file.type];
 const path=id+'/'+crypto.randomUUID()+'.'+ext;
 try{
  await post('/storage/v1/object/bb-real-invoices/'+path,file,{'Content-Type':file.type,'x-upsert':'false'});
  try{
   await post('/rest/v1/rpc/bb_real_invoice_register',JSON.stringify({p_invoice_id:id,p_storage_path:path,p_mime:file.type,p_source:'generator'}),{'Content-Type':'application/json'});
  }catch(e){
   const t=await bearer();
   await fetch(HOST+'/storage/v1/object/bb-real-invoices/'+path,{method:'DELETE',headers:{apikey:API_KEY,Authorization:'Bearer '+t}}).catch(()=>{});
   throw e;
  }
  choose(null);retryId='';if($('bbOriginalRetry'))$('bbOriginalRetry').hidden=true;
  if($('bbOriginalFile'))$('bbOriginalFile').value='';
  setMessage('✓ Original uploaded. This invoice will not appear in Pending Scan.');
  return {success:true};
 }catch(e){setMessage('Invoice saved; original upload failed. '+e.message,true);if($('bbOriginalRetry'))$('bbOriginalRetry').hidden=false;throw e;}finally{uploading=false}
}
window.BBOriginalInvoice={afterComplete,init};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();