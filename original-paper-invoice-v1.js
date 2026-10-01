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
 if($('bbOriginalRemove'))$('bbOriginalRemove').hidden=!file;
 if(!file){setMessage('Optional — attach the original paper invoice.');return}
 if(!['image/jpeg','image/png','image/webp','application/pdf'].includes(file.type)){setMessage('Choose JPG, PNG, WebP or PDF.',true);return}
 if(file.size>12*1024*1024){setMessage('The original must be 12 MB or smaller.',true);return}
 selected=file;setMessage('Ready: '+file.name);
 if(file.type.startsWith('image/')&&preview){previewUrl=URL.createObjectURL(file);const img=document.createElement('img');img.src=previewUrl;img.alt='Original invoice preview';img.style.cssText='max-width:100%;max-height:120px;object-fit:contain;border-radius:7px';preview.append(img)}
}
function removeSelection(){
 if(uploading)return setMessage('Wait until the current upload finishes.',true);
 choose(null);
 retryId='';
 if($('bbOriginalFile'))$('bbOriginalFile').value='';
 if($('bbOriginalPasteFallback'))$('bbOriginalPasteFallback').hidden=true;
 if($('bbOriginalPasteArea'))$('bbOriginalPasteArea').textContent='Paste your invoice image here';
 if($('bbOriginalRetry'))$('bbOriginalRetry').hidden=true;
 setMessage('Original removed. Paste or choose the correct invoice.');
}
function pastedImage(data){
 const files=[...(data?.files||[])];
 if(data?.items)for(const item of data.items){
  if(item.kind==='file'){const file=item.getAsFile?.();if(file)files.push(file)}
 }
 return files.find(file=>['image/jpeg','image/png','image/webp'].includes(file.type))||null;
}
function chooseClipboard(file){
 const ext={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[file.type];
 if(!ext)return setMessage('Clipboard does not contain a supported image.',true);
 choose(new File([file],'clipboard-invoice.'+ext,{type:file.type}));
 if($('bbOriginalPasteFallback'))$('bbOriginalPasteFallback').hidden=true;
 if($('bbOriginalPasteArea'))$('bbOriginalPasteArea').textContent='Paste your invoice image here';
}
async function pasteButton(){
 const button=$('bbOriginalPaste');
 button.disabled=true;
 try{
  if(!navigator.clipboard?.read)throw Error('Clipboard read is unavailable.');
  const items=await navigator.clipboard.read();
  for(const item of items){
   const type=['image/png','image/jpeg','image/webp'].find(t=>item.types.includes(t));
   if(type){chooseClipboard(await item.getType(type));return}
  }
  setMessage('No copied photo found. Copy an invoice image or screenshot first.',true);
 }catch(error){
  $('bbOriginalPasteFallback').hidden=false;
  setMessage('Browser clipboard access is unavailable or blocked. Tap the paste area and press Ctrl+V / ⌘V.',true);
  $('bbOriginalPasteArea').focus();
 }finally{button.disabled=false}
}
function init(){
 if($('bbOriginalInvoice'))return;
 const anchor=document.querySelector('.bottom-action-row');
 if(!anchor){setTimeout(init,250);return}
 const box=document.createElement('section');box.id='bbOriginalInvoice';box.className='no-print';
 box.style.cssText='margin:14px 0;padding:12px;border:1px solid #bdd6ec;background:#f5faff;border-radius:12px;color:#214d72;max-width:100%;min-width:0';
 box.innerHTML='<strong style="font-size:14px">📎 Original Paper Invoice (Optional)</strong>'+
 '<p style="font-size:12px;margin:5px 0 10px">Select a file or paste a copied invoice image. The original uploads only after the invoice saves.</p>'+
 '<input id="bbOriginalFile" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" style="display:block;max-width:100%;width:100%;font-size:13px">'+
 '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:10px">'+
 '<button id="bbOriginalPaste" type="button" style="padding:9px 13px;background:#e2eefb;border:1px solid #b9d3ed;border-radius:9px;color:#195a92;font-weight:800;cursor:pointer">📋 Paste from Clipboard</button>'+
 '<span style="font-size:12px;color:#557391">Or press Ctrl+V / ⌘V</span></div>'+
 '<div id="bbOriginalPasteFallback" hidden style="margin-top:9px">'+
 '<label for="bbOriginalPasteArea" style="display:block;font-size:12px;margin-bottom:5px">Tap this area and press Ctrl+V / ⌘V</label>'+
 '<div id="bbOriginalPasteArea" contenteditable="true" role="textbox" aria-label="Paste original invoice photo" style="min-height:55px;padding:10px;background:white;border:1px dashed #86a9ca;border-radius:9px;font-size:12px;color:#526c82">Paste your invoice image here</div></div>'+
 '<div id="bbOriginalPreview" style="margin-top:7px"></div><button id="bbOriginalRemove" type="button" hidden style="margin:7px 0;padding:7px 12px;background:#fff0f0;border:1px solid #e3a5a5;border-radius:8px;color:#a52b2b;font-weight:800;cursor:pointer">✕ Remove wrong image</button><button id="bbOriginalRetry" type="button" hidden style="margin:6px 0;padding:7px 12px;background:#1f659b;border:0;border-radius:8px;color:white;font-weight:bold">Retry original upload</button><div id="bbOriginalStatus" role="status" style="font-size:12px;overflow-wrap:anywhere;margin-top:6px">Optional — attach the original paper invoice.</div>';
 anchor.parentNode.insertBefore(box,anchor);
 $('bbOriginalFile').addEventListener('change',e=>choose(e.target.files?.[0]));
 $('bbOriginalRemove').addEventListener('click',removeSelection);
 $('bbOriginalPaste').addEventListener('click',pasteButton);
 $('bbOriginalRetry').addEventListener('click',async()=>{if(!retryId||!selected)return;try{await afterComplete({invoiceId:retryId},{invoiceId:retryId});}catch(e){setMessage('Retry failed: '+e.message,true)}});
 document.addEventListener('paste',e=>{
  const area=$('bbOriginalPasteArea');
  const insideFallback=area&&(e.target===area||area.contains(e.target));
  if(!insideFallback&&e.target?.closest?.('input,textarea,[contenteditable="true"]'))return;
  const file=pastedImage(e.clipboardData);
  if(file){e.preventDefault();chooseClipboard(file);return}
  if(insideFallback){e.preventDefault();setMessage('Copy an invoice image or screenshot first, then paste.',true)}
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