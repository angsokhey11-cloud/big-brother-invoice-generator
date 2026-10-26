#!/usr/bin/env python3
"""Run the ACTUAL desktop Complete Invoice handler with mocked dependencies.
No Supabase access; validates handoff to the wallet-driven invoice save.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[2]
SOURCE=(ROOT/"desktop-source-v20260924-invoiceseq1.html").read_text()
START=SOURCE.index("async function completeInvoice(event) {")
END=SOURCE.index("function shouldCreatePaymentRecord(payload)",START)
REAL_HANDLER=SOURCE[START:END]
assert "hasMultiBank" in REAL_HANDLER

SETUP=r"""
window.calls=[];
window.alert=(message)=>window.calls.push(['alert',String(message)]);
window.bbInvoiceSaving=false;
window.invoiceDraft=()=>{
  return {invoiceId:'MOCK-1',invoiceNo:'MOCK-1',invoiceDate:'2026-10-27',
    locationCode:'TK-01',customer:'Demo',customerId:'C1',currency:'USD',
    salesperson:'Salesperson',paymentMethod:'Partially Paid in Bank',
    amountPaid:55,grandTotal:100,paymentBank:'',transactionId:'',
    items:[{productCode:'P1',qty:1,unitPrice:100}]};
};
window.buildSalesInvoicePayload=()=>window.invoiceDraft();
window.bbInvoiceMultiSelection={
 customer_id:'C1',currency:'USD',selected_total:'55.00',settlement_sources:[
  {kind:'BANK_REGISTER',source_id:'TX-A',source_amount:'20.00'},
  {kind:'BANK_REGISTER',source_id:'TX-B',source_amount:'35.00'}]
};
window.BBInvoiceMultiSourceSelection=()=>window.bbInvoiceMultiSelection;
window.bbConfirmInvoiceCompletion=async()=>true;
window.checkInvoiceNumberAvailable=async()=>({exists:false});
window.checkPaymentTransactionIdAvailable=async(id)=>{
 window.calls.push(['legacy-unique-tx-check',id]);return {exists:false,pending:false};
};
window.shouldCreatePaymentRecord=()=>true;
window.buildPaymentPayload=(draft)=>({paymentMethod:'Bank',amount:draft.amountPaid});
window.postSalesInvoiceBundle=async(draft,payment)=>{
 window.calls.push(['submitted',draft,payment]);return {success:true};
};
window.consumeSelectedBatchLocally=()=>({});
window.bbShowInvoiceSuccess=()=>window.calls.push(['success']);
window.clearAllAfterSuccessfulSave=()=>window.calls.push(['cleared']);
window.bbShowInvoiceSaveError=(error)=>window.calls.push(['saveError',String(error)]);
window.BB_MULTI_BANK_SAVE_ENABLED=false;
window.bbNextInvoiceCustomerFocusTimer=0;
"""

def main():
  with sync_playwright() as playwright:
    browser=playwright.chromium.launch(headless=True,args=["--no-sandbox"])
    page=browser.new_page()
    page.set_content("""<button class="complete-btn">Complete</button>
    <input id="customerName"><div id="customerOptions"></div>""")
    page.add_script_tag(content=SETUP)
    page.add_script_tag(content=REAL_HANDLER)
    async_call="""async()=>{await window.completeInvoice({preventDefault(){},
       stopPropagation(){},currentTarget:document.querySelector('.complete-btn')});
       return window.calls}"""
    before=page.evaluate(async_call)
    assert any(x[0]=="alert" and "not enabled" in x[1] for x in before),before
    assert not any(x[0]=="submitted" for x in before),before
    print("PASS Desktop Complete: disabled wallet cannot save")

    page.evaluate("window.calls=[];window.BB_MULTI_BANK_SAVE_ENABLED=true")
    result=page.evaluate(async_call)
    assert any(x[0]=="submitted" for x in result),result
    assert not any(x[0]=="legacy-unique-tx-check" for x in result),result
    assert any(x[0]=="success" for x in result),result
    print("PASS Desktop Complete: two-bank wallet skips obsolete single-transaction requirements")

    page.evaluate("window.calls=[];window.bbInvoiceMultiSelection.selected_total='54.00'")
    mismatch=page.evaluate(async_call)
    assert any(x[0]=="alert" and "Amount Paid" in x[1] for x in mismatch),mismatch
    assert not any(x[0]=="submitted" for x in mismatch),mismatch
    print("PASS Desktop Complete: mismatched wallet amount blocks save")

    page.evaluate("""() => {
      window.calls=[];window.bbInvoiceMultiSelection=null;
    }""")
    original=page.evaluate(async_call)
    assert any(x[0]=="alert" and "Payment Bank" in x[1] for x in original),original
    print("PASS Desktop Complete: old single-bank validation remains")
    browser.close()

if __name__=="__main__":
  main()
