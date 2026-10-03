/* BIG BROTHER — Original paper invoice: generator attachment */
(()=>{
'use strict';
const HOST='https://sjfhlaclgmkwwofzstok.supabase.co';
const API_KEY='sb_publishable_w762jR65CWwlO30fKQsYOw_6L9grx8S';
const SESSION='BB_SUPABASE_DEV_SESSION_V1';
let selected=null,previewUrl='',uploading=false,retryId='',scanResult=null,scanCounter=0,overrideAllowed=false,verifiedNumber='',retryNumber='',scanCrop=null,selectingArea=false;
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
 scanCounter++;scanResult=null;verifiedNumber='';scanCrop=null;selectingArea=false;
 if($('bbOriginalCropPanel'))$('bbOriginalCropPanel').hidden=true;
 if($('bbOriginalOCRCropPreview'))$('bbOriginalOCRCropPreview').replaceChildren();
 if($('bbOriginalSelectArea'))$('bbOriginalSelectArea').hidden=!file||!file.type.startsWith('image/');
 if($('bbOriginalScanWhole'))$('bbOriginalScanWhole').hidden=true;
 if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl='';selected=null;
 const preview=$('bbOriginalPreview');if(preview)preview.replaceChildren();
 if($('bbOriginalRemove'))$('bbOriginalRemove').hidden=!file;
 if(!file){setMessage('Optional — attach the original paper invoice.');return}
 if(!['image/jpeg','image/png','image/webp','application/pdf'].includes(file.type)){setMessage('Choose JPG, PNG, WebP or PDF.',true);return}
 if(file.size>12*1024*1024){setMessage('The original must be 12 MB or smaller.',true);return}
 selected=file;setMessage('Scanning invoice number…');void checkNumber();
 if(file.type.startsWith('image/')&&preview){previewUrl=URL.createObjectURL(file);const img=document.createElement('img');img.src=previewUrl;img.alt='Original invoice preview';img.style.cssText='max-width:100%;max-height:120px;object-fit:contain;border-radius:7px';preview.append(img)}
}
async function verifyOverridePermission(){
 try{
  const result=await post('/rest/v1/rpc/bb_real_invoice_override_allowed','{}',{'Content-Type':'application/json'});
  overrideAllowed=result===true;
  if($('bbOriginalOverride'))$('bbOriginalOverride').hidden=!overrideAllowed||scanResult?.status==='match';
 }catch(error){overrideAllowed=false}
}
async function checkNumber(expected){
 const file=selected,sequence=++scanCounter,number=String(expected||(retryId?retryNumber:'')||$('invoiceNumber')?.value||'').trim();
 if(!file)return null;
 if(!number||number==='Loading...'){
  scanResult=null;setMessage('Set the system Invoice Number first, then verify the paper invoice.',true);return null;
 }
 verifiedNumber=number;
 const status=$('bbOriginalVerification');
 if(status){status.hidden=false;status.textContent='Scanning paper invoice number against '+number+'…';status.style.color='#805d17'}
 const check=await (window.BBInvoiceOCR?.verify(scanCrop||file,number,scanCrop?{numberOnly:true}:{})||Promise.resolve({status:'unclear',message:'OCR scanner did not load.'}));
 if(sequence!==scanCounter||file!==selected)return null;
 scanResult=check;
 if($('bbOriginalOverride'))$('bbOriginalOverride').hidden=!overrideAllowed||check.status==='match';
 if(status){
  status.textContent=check.message;
  status.style.color=check.status==='match'?'#166e3f':check.status==='mismatch'?'#b52b27':'#875915';
 }
 setMessage(check.status==='match'?'✓ Original invoice number verified.':check.message,check.status!=='match');
 return check;
}
// Select a crop for OCR only. Never replace the full-resolution original upload.
async function openAreaSelector(){
 if(!selected||!selected.type.startsWith('image/')||uploading)return;
 const panel=$('bbOriginalCropPanel'),canvas=$('bbOriginalCropCanvas');
 if(!panel||!canvas)return;
 const file=selected;
 const bitmap=await createImageBitmap(file);
 if(file!==selected){bitmap.close();return}
 const maxWidth=750,scale=Math.min(1,maxWidth/bitmap.width);
 canvas.width=Math.max(1,Math.round(bitmap.width*scale));
 canvas.height=Math.max(1,Math.round(bitmap.height*scale));
 const ctx=canvas.getContext('2d');
 ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
 bitmap.close();
 const source=ctx.getImageData(0,0,canvas.width,canvas.height);
 panel.hidden=false;selectingArea=true;
 if($('bbOriginalAreaInfo'))$('bbOriginalAreaInfo').textContent='The default box targets the printed number. Drag a new box if your photo is positioned differently.';
 let origin=null,rect={
  x:canvas.width*.70,y:canvas.height*.095,
  w:canvas.width*.25,h:canvas.height*.065
 };
 const draw=()=>{
  ctx.putImageData(source,0,0);
  if(!rect)return;
  ctx.fillStyle='rgba(22,99,190,.15)';ctx.fillRect(rect.x,rect.y,rect.w,rect.h);
  ctx.strokeStyle='#1766c0';ctx.lineWidth=2;ctx.strokeRect(rect.x,rect.y,rect.w,rect.h);
 };
 const point=e=>{
  const bounds=canvas.getBoundingClientRect();
  return {x:Math.max(0,Math.min(canvas.width,(e.clientX-bounds.left)*canvas.width/bounds.width)),
   y:Math.max(0,Math.min(canvas.height,(e.clientY-bounds.top)*canvas.height/bounds.height))};
 };
 canvas.onpointerdown=e=>{
  e.preventDefault();origin=point(e);rect=null;canvas.setPointerCapture(e.pointerId);
 };
 canvas.onpointermove=e=>{
  if(!origin)return;
  const p=point(e);rect={x:Math.min(origin.x,p.x),y:Math.min(origin.y,p.y),
   w:Math.abs(origin.x-p.x),h:Math.abs(origin.y-p.y)};draw();
 };
 canvas.onpointerup=e=>{
  if(!origin)return;canvas.onpointermove(e);origin=null;
  if(rect?.w<12||rect?.h<8){rect=null;draw()}
 };
 canvas.onpointercancel=()=>{origin=null};
 const apply=$('bbOriginalAreaApply'),cancel=$('bbOriginalAreaCancel');
 apply.onclick=async()=>{
  if(!rect){$('bbOriginalAreaInfo').textContent='Select a clear box around the number first.';return}
  const crop=document.createElement('canvas');
  // Upscale the displayed selection for OCR. Pixel dimensions are preserved from the photo
  // when possible; do not modify the original selected file.
  const original=await createImageBitmap(file);
  if(file!==selected){original.close();return}
  const sx=original.width/canvas.width,sy=original.height/canvas.height;
  // Use EXACTLY the 2x high-resolution crop prepared by Real Invoice Scanner.
  crop.width=Math.max(1,Math.round(rect.w*sx*2));
  crop.height=Math.max(1,Math.round(rect.h*sy*2));
  const cropContext=crop.getContext('2d');
  cropContext.imageSmoothingEnabled=true;
  cropContext.imageSmoothingQuality='high';
  cropContext.drawImage(original,rect.x*sx,rect.y*sy,
   rect.w*sx,rect.h*sy,0,0,crop.width,crop.height);
  original.close();
  const blob=await new Promise(resolve=>crop.toBlob(resolve,'image/png'));
  if(!blob){$('bbOriginalAreaInfo').textContent='Could not prepare selected area. Please retry.';return}
  // Match Real Invoice Scanner exactly: send a named PNG File, not the raw
  // Blob. Display the actual OCR input so a bad crop is easy to diagnose.
  scanCrop=new File([blob],'invoice-number-area.png',{type:'image/png'});
  const preview=$('bbOriginalOCRCropPreview');
  if(preview){
   preview.replaceChildren();
   const image=document.createElement('img');
   image.src=crop.toDataURL('image/png');
   image.alt='Exact number crop sent to OCR';
   image.style.cssText='display:block;max-width:100%;max-height:90px;object-fit:contain;border:1px solid #c4d2df;border-radius:5px;margin-top:5px;background:white';
   preview.append(image);
  }
  panel.hidden=true;selectingArea=false;
  if($('bbOriginalScanWhole'))$('bbOriginalScanWhole').hidden=false;
  setMessage('Scanning selected number area…');
  await checkNumber();
 };
 cancel.onclick=()=>{panel.hidden=true;selectingArea=false;};
 draw();
}
function restoreFullImageScan(){
 scanCrop=null;scanCounter++;
 if($('bbOriginalScanWhole'))$('bbOriginalScanWhole').hidden=true;
 if($('bbOriginalCropPanel'))$('bbOriginalCropPanel').hidden=true;
 if(selected){setMessage('Scanning full original again…');void checkNumber()}
}
function removeSelection(){
 if(uploading)return setMessage('Wait until the current upload finishes.',true);
 choose(null);
 retryId='';retryNumber='';
 if($('bbOriginalFile'))$('bbOriginalFile').value='';
 if($('bbOriginalPasteFallback'))$('bbOriginalPasteFallback').hidden=true;
 if($('bbOriginalPasteArea'))$('bbOriginalPasteArea').textContent='Paste your invoice image here';
 if($('bbOriginalRetry'))$('bbOriginalRetry').hidden=true;
 if($('bbOriginalVerification'))$('bbOriginalVerification').hidden=true;
 if($('bbOriginalOverrideReason'))$('bbOriginalOverrideReason').value='';
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
 '<div id="bbOriginalPreview" style="margin-top:7px"></div><div id="bbOriginalOCRCropPreview" aria-label="OCR scan crop preview"></div>'+
 '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px"><button id="bbOriginalSelectArea" type="button" hidden style="padding:8px 10px;border-radius:8px;border:1px solid #95b9de;background:#e5f0ff;color:#205887;font-size:12px;font-weight:800">▣ Select Invoice Number Area</button><button id="bbOriginalScanWhole" type="button" hidden style="padding:8px 10px;border-radius:8px;border:1px solid #b4c6d6;background:white;color:#315776;font-size:12px">Scan Full Image Instead</button></div>'+
 '<div id="bbOriginalCropPanel" hidden style="margin-top:8px;padding:8px;border:1px solid #a9c5df;border-radius:8px;background:white"><div id="bbOriginalAreaInfo" style="font-size:12px;margin-bottom:7px">Drag around only the printed invoice number.</div><canvas id="bbOriginalCropCanvas" style="max-width:100%;width:100%;height:auto;touch-action:none;border:1px solid #b5c9df;border-radius:5px;display:block"></canvas><div style="display:flex;gap:8px;margin-top:8px"><button type="button" id="bbOriginalAreaApply" style="border:0;border-radius:7px;background:#135fb0;color:white;padding:8px 12px;font-weight:bold">Scan Selected Area</button><button type="button" id="bbOriginalAreaCancel" style="border:1px solid #a5bcd2;border-radius:7px;background:white;padding:8px 12px">Cancel</button></div></div>'+
 '<div id="bbOriginalVerification" role="status" hidden style="font-size:12px;font-weight:800;line-height:1.45;margin-top:7px;padding:8px;background:#fff;border:1px solid #d4dfec;border-radius:8px"></div><div id="bbOriginalOverride" hidden style="margin-top:8px"><label for="bbOriginalOverrideReason" style="display:block;font-weight:800;font-size:12px">Administrator review reason (required only for unclear or mismatched scans)</label><textarea id="bbOriginalOverrideReason" style="width:100%;min-height:60px;resize:vertical;border:1px solid #b2c8e2;border-radius:8px;padding:8px;font:12px Arial" placeholder="I inspected the actual paper invoice, its customer and invoice number because…"></textarea></div><button id="bbOriginalRemove" type="button" hidden style="margin:7px 0;padding:7px 12px;background:#fff0f0;border:1px solid #e3a5a5;border-radius:8px;color:#a52b2b;font-weight:800;cursor:pointer">✕ Remove wrong image</button><button id="bbOriginalRetry" type="button" hidden style="margin:6px 0;padding:7px 12px;background:#1f659b;border:0;border-radius:8px;color:white;font-weight:bold">Retry original upload</button><div id="bbOriginalStatus" role="status" style="font-size:12px;overflow-wrap:anywhere;margin-top:6px">Optional — attach the original paper invoice.</div>';
 anchor.parentNode.insertBefore(box,anchor);
 $('bbOriginalFile').addEventListener('change',e=>choose(e.target.files?.[0]));
 $('bbOriginalRemove').addEventListener('click',removeSelection);
 $('bbOriginalPaste').addEventListener('click',pasteButton);
 $('bbOriginalSelectArea').addEventListener('click',()=>{void openAreaSelector().catch(e=>setMessage('Could not open area selector: '+e.message,true))});
 $('bbOriginalScanWhole').addEventListener('click',restoreFullImageScan);
 void verifyOverridePermission();
 $('invoiceNumber')?.addEventListener('input',()=>{if(selected)void checkNumber()});
 $('bbOriginalRetry').addEventListener('click',async()=>{
  if(!retryId||!selected||uploading)return;
  const savedId=retryId,savedNumber=retryNumber,wasPending=!!window.BBOriginalInvoiceUploadPending;
  try{
   const result=await afterComplete({invoiceId:savedId,invoiceNo:savedNumber},{invoiceId:savedId});
   if(result?.success&&wasPending){
    window.BBOriginalInvoiceUploadPending=false;
    // The invoice was previously saved. This clears the completed form only;
    // it never submits another invoice or repeats stock deductions.
    if(typeof window.clearAllAfterSuccessfulSave==='function')window.clearAllAfterSuccessfulSave();
   }
  }catch(e){setMessage('Retry failed: '+e.message,true)}
 });
 document.addEventListener('paste',e=>{
  const area=$('bbOriginalPasteArea');
  const insideFallback=area&&(e.target===area||area.contains(e.target));
  if(!insideFallback&&e.target?.closest?.('input,textarea,[contenteditable="true"]'))return;
  const file=pastedImage(e.clipboardData);
  if(file){e.preventDefault();chooseClipboard(file);return}
  if(insideFallback){e.preventDefault();setMessage('Copy an invoice image or screenshot first, then paste.',true)}
 });
}
// Use the same authenticated request convention as Real Invoice Scanner.
// Include the exact failing stage and server message instead of hiding errors.
async function post(path,body,headers={},stage='attachment request'){
 const t=await bearer();
 let r;
 try{
  r=await fetch(HOST+path,{method:'POST',headers:{apikey:API_KEY,Authorization:'Bearer '+t,...headers},body,cache:'no-store'});
 }catch(error){throw Error(stage+' could not connect: '+(error?.message||error))}
 const raw=await r.text(),data=raw?(()=>{try{return JSON.parse(raw)}catch{return {message:raw.slice(0,180)}}})():null;
 if(!r.ok)throw Error(stage+' failed ('+r.status+'): '+(data?.message||data?.error_description||data?.error||'Server rejected request'));
 return data;
}
function reportUploadError(message){
 const text='INVOICE ALREADY SAVED — PAPER PHOTO NOT REGISTERED. '+message+
  ' Keep this page open. Use Retry original upload below; do NOT click Complete again.';
 window.BBOriginalInvoiceUploadPending=true;
 setMessage(text,true);
 if($('bbOriginalRetry'))$('bbOriginalRetry').hidden=false;
 return text;
}
async function beforeComplete(payload){
 window.BBOriginalExpectedAttachment=!!selected;
 if(!selected)return {ready:true};
 if(uploading)throw Error('Original image upload is still processing. Wait before completing another invoice.');
 const expected=String(payload?.invoiceNo||$('invoiceNumber')?.value||'').trim();
 if(!expected||expected==='Loading...'||expected==='Unavailable'){
  throw Error('Set the system invoice number before verifying the attached paper image.');
 }
 if(verifiedNumber!==expected||!scanResult)await checkNumber(expected);
 const reason=String($('bbOriginalOverrideReason')?.value||'').trim();
 if(scanResult?.status==='match')return {ready:true,method:'ocr'};
 if(overrideAllowed&&reason.length>=8)return {ready:true,method:'admin-review'};
 if($('bbOriginalSelectArea')&&!$('bbOriginalSelectArea').hidden){
  $('bbOriginalSelectArea').scrollIntoView({behavior:'smooth',block:'center'});
 }
 const status=scanResult?.message||'The scanner could not verify the selected paper image.';
 const explanation='Invoice NOT SAVED. The attached paper photo is unverified. '+
  'Select Invoice Number Area and scan only the printed number. '+
  'If OCR still misreads a correct number, request authorized administrator review. '+
  'Alternatively remove the photo to save the invoice without an attachment and upload it later from Pending Scan.';
 setMessage(explanation,true);
 throw Error(explanation+'\n\nScanner: '+status);
}
async function afterComplete(payload,serverResult){
 if(!selected){
  if(window.BBOriginalExpectedAttachment)throw Error('The original image selection was lost after invoice save. Invoice WAS SAVED; attach the photo through Pending Scan, not another invoice submission.');
  return {skipped:true};
 }
 if(uploading)throw Error('Original image upload is already running. Do not submit another invoice.');
 const id=String(serverResult?.invoiceId||serverResult?.invoice_id||payload?.invoiceId||'').trim();
 if(!id)throw Error('Invoice saved, but its internal invoice ID was unavailable for attachment.');
 const expected=String(payload?.invoiceNo||retryNumber||$('invoiceNumber')?.value||'').trim();
 // Verify again at save time; the system invoice number may have changed
 // after the photo was pasted or selected.
 if(verifiedNumber!==expected||!scanResult)await checkNumber(expected);
 const result=scanResult,reason=String($('bbOriginalOverrideReason')?.value||'').trim();
 if(!result||result.status!=='match'){
  if(!overrideAllowed||reason.length<8){
   retryId=id;retryNumber=expected;
   if($('bbOriginalRetry'))$('bbOriginalRetry').hidden=false;
   throw Error('Paper original was not uploaded: invoice-number verification failed. Replace the picture, or request administrator inspection with a reason.');
  }
 }
 const file=selected;retryId=id;retryNumber=expected;uploading=true;
 window.BBOriginalInvoiceUploadPending=true;
 setMessage('Invoice '+expected+' saved. Checking photo upload permission…');
 if($('bbOriginalRetry'))$('bbOriginalRetry').hidden=true;
 const ext={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','application/pdf':'pdf'}[file.type];
 const path=id+'/'+crypto.randomUUID()+'.'+ext;
 try{
  // Verify that this signed-in account has permission for the newly saved
  // invoice BEFORE writing anything to Storage.
  const allowed=await post('/rest/v1/rpc/bb_real_invoice_can_upload',
   JSON.stringify({p_id:id}),{'Content-Type':'application/json'},'Photo upload permission check');
  if(allowed!==true)throw Error('Photo upload permission denied for saved invoice '+expected+'. Check the account/location permissions.');
  setMessage('Permission confirmed. Uploading full original photo…');
  const storagePath='/storage/v1/object/bb-real-invoices/'+encodeURIComponent(path).replace('%2F','/');
  await post(storagePath,file,{'Content-Type':file.type,'x-upsert':'false'},'Original photo storage upload');
  setMessage('Photo sent. Registering the attachment against saved invoice '+expected+'…');
  try{
   await post('/rest/v1/rpc/bb_real_invoice_register_verified',JSON.stringify({p_invoice_id:id,p_storage_path:path,p_mime:file.type,p_source:'generator',p_scanned_number:result.scanned||'',p_verification_status:result.status,p_override_reason:result.status==='match'?null:reason}),{'Content-Type':'application/json'},'Original photo registration');
   setMessage('Attachment registered. Checking Uploaded History record…');
   const registered=await post('/rest/v1/rpc/bb_real_invoice_existing',JSON.stringify({p_id:id}),{'Content-Type':'application/json'},'Uploaded attachment verification');
   if(registered?.path!==path)throw Error('Attachment registration could not be confirmed.');
  }catch(e){
   const t=await bearer();
   // Cleanup policy does not delete successfully registered images. If the
   // confirmation read failed after registration, preserve server evidence.
   await fetch(HOST+'/storage/v1/object/bb-real-invoices/'+path,{method:'DELETE',headers:{apikey:API_KEY,Authorization:'Bearer '+t}}).catch(()=>{});
   throw e;
  }
  choose(null);retryId='';retryNumber='';if($('bbOriginalRetry'))$('bbOriginalRetry').hidden=true;
  if($('bbOriginalFile'))$('bbOriginalFile').value='';
  window.BBOriginalInvoiceUploadPending=false;
  window.BBOriginalExpectedAttachment=false;
  setMessage('✓ Original photo uploaded AND verified in the database. This invoice will not appear in Pending Scan.');
  return {success:true};
 }catch(e){reportUploadError(e?.message||String(e));throw e;}finally{uploading=false}
}
window.BBOriginalInvoice={beforeComplete,afterComplete,init};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();