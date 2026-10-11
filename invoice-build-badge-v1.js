(function(){'use strict';
const BUILD='INV 2026.10.11.3';
function install(){
 const header=document.querySelector('.header-main');
 if(!header)return;
 let badge=document.getElementById('bbInvoiceBuildLabel');
 if(badge)return;
 badge=document.createElement('span');
 badge.id='bbInvoiceBuildLabel';
 badge.textContent='Version '+BUILD;
 badge.title='BIG BROTHER Invoice Generator live build';
 badge.style.cssText='position:absolute;top:-15px;right:0;z-index:5;font:700 11px Arial,sans-serif;color:#315a83;background:#e8f1fc;border:1px solid #c2d4ea;border-radius:6px;padding:3px 7px;white-space:nowrap';
 header.style.position='relative';
 header.style.marginTop='22px';
 header.appendChild(badge);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
else install();
})();