/* BIG BROTHER — Invoice Complete Fast Path V1
   Removes redundant preflight RPCs. The atomic Supabase save already validates
   duplicate Invoice No. and Bank Transaction ID before commit. */
(function(){
  'use strict';

  window.completeInvoice = async function completeInvoiceFast(event){
    if(event){event.preventDefault();event.stopPropagation();}

    const button=event?.currentTarget||document.querySelector('.complete-btn');
    if(window.bbInvoiceSaving)return;

    const payload=buildSalesInvoicePayload();

    if(!payload.locationCode){alert('Please select a Main Location before completing the invoice.');return;}
    if(!payload.customer){alert('Please select or enter a customer before completing the invoice.');return;}
    if(!payload.salesperson){alert('Please enter a Sale Person before completing the invoice.');return;}
    if(!payload.paymentMethod){alert('Please select a Payment Method before completing the invoice.');return;}

    const invoiceNeedsBank=payload.paymentMethod==='Bank'||payload.paymentMethod==='Partially Paid in Bank';
    if(invoiceNeedsBank&&!payload.paymentBank){alert('Please select a Payment Bank before completing the invoice.');return;}
    if(invoiceNeedsBank&&!payload.transactionId){alert('Transaction ID is required for Bank payment.');document.getElementById('transactionId')?.focus();return;}
    if(!payload.invoiceNo||payload.invoiceNo==='Loading...'||payload.invoiceNo==='Unavailable'){alert('Invoice No. is not ready yet.');return;}
    if(!payload.items.length){alert('Please add at least one product before completing the invoice.');return;}
    if(!payload.items.some(item=>Number(item.qty)>0)){alert('Please enter quantity for at least one product.');return;}

    const confirmed=confirm(
      'Complete this invoice?\n\n'+
      'Invoice No.: '+payload.invoiceNo+
      (payload.batchNumber?'\nBatch: '+payload.batchNumber:'')+
      '\nThis will save the invoice to the BIG BROTHER Database.'
    );
    if(!confirmed)return;

    window.bbInvoiceSaving=true;
    const oldText=button?button.innerHTML:'';
    if(button){button.disabled=true;button.innerHTML='⚡ Completing...';}

    try{
      /* One authoritative round trip only. The Supabase bundle function itself
         rejects duplicate invoice numbers and duplicate bank transaction IDs. */
      const paymentPayload=shouldCreatePaymentRecord(payload)?buildPaymentPayload(payload):null;
      await postSalesInvoiceBundle(payload,paymentPayload);

      const batchLocalResult=consumeSelectedBatchLocally(payload.items);

      alert(
        'Invoice completed successfully.\n\n'+
        'Invoice No.: '+payload.invoiceNo+
        (payload.batchNumber?'\nBatch: '+payload.batchNumber:'')+
        (paymentPayload?'\nInvoice + payment saved together.':'\nCredit invoice saved without a payment record.')+
        (batchLocalResult.removed?'\n\n✓ '+batchLocalResult.batchId+' reached 0 remaining and was removed from the Batch picker.':'')
      );

      clearAllAfterSuccessfulSave();
    }catch(error){
      console.error('Fast invoice complete failed:',error);
      const message=String(error?.message||'Please try again.');
      alert('Could not complete the invoice.\n\n'+message+'\n\nThe invoice was NOT cleared.');
    }finally{
      window.bbInvoiceSaving=false;
      if(button){button.disabled=false;button.innerHTML=oldText;}
    }
  };
})();
