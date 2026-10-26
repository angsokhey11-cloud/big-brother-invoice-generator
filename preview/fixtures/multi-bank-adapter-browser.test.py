#!/usr/bin/env python3
"""Exercise the REAL Invoice Generator adapter in Chromium.
All HTTP is intercepted; never connects to Supabase or production data.
"""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[2]
BASE="http://bb-invoice-fixture.test/"
SESSION_KEY="BB_SUPABASE_DEV_SESSION_V1"

class FakeDatabase:
    def __init__(self):
        self.calls=[]
        self.mode="success"
        self.saved=False
    def respond(self,route):
        req=route.request
        if req.url.split('?')[0]==BASE:
            route.fulfill(status=200,content_type="text/html",body="""<!doctype html>
              <select id="currency"><option value="USD">USD</option><option value="KHR">KHR</option></select>
              <input id="customerName" value="Test Customer">
              <input id="invoiceNumber" value="MOCK-1">
              <select id="paymentMethod"><option value="Partially Paid in Bank">Partially Paid in Bank</option><option value="Cash">Cash</option></select>
              <select id="paymentBank"><option value="ABA">ABA</option></select>
              <input id="transactionId" value="">
              <div id="bbRegisteredPayments"></div>""")
            return
        if "/rest/v1/rpc/" not in req.url:
            raise AssertionError("Unexpected external network call: "+req.url)
        rpc=req.url.rsplit("/",1)[-1]
        body=req.post_data_json
        self.calls.append({"rpc":rpc,"body":body})
        if rpc=="bb_sales_verify_invoice_save":
            data={"found":self.saved}
            status=200
        elif rpc=="bb_sales_save_invoice_multi_bank_v1":
            if self.mode=="rejected":
                data={"message":"Insufficient registered bank balance"}
                status=422
            elif self.mode=="network":
                # Simulate an uncertain response; database outcome is unknown.
                route.abort("failed")
                return
            else:
                self.saved=True
                data={"success":True,"invoiceId":body["p_invoice"]["invoiceId"],
                      "paymentIds":["PAY-1","PAY-2"],"multiSource":True}
                status=200
        else:
            raise AssertionError("Wrong RPC route: "+rpc)
        route.fulfill(status=status,content_type="application/json",body=json.dumps(data))

def draft(invoice_id):
    return {"invoiceId":invoice_id,"invoiceNo":"MOCK-1","invoiceDate":"2026-10-27",
            "locationCode":"TK-01","customerId":"C1","customer":"Test Customer",
            "salesperson":"Test Sales","currency":"USD","paymentMethod":"Partially Paid in Bank",
            "grandTotal":100,"amountPaid":55,
            "items":[{"entryType":"EXACT","productCode":"P1","qty":1,"unitPrice":100}]}

def attempt(page,invoice):
    return page.evaluate("""async invoice => {
      try { return {ok:true, result:await window.postSalesInvoiceBundle(invoice,{})}; }
      catch(e) {return {ok:false,error:String(e.message||e)};}
    }""",invoice)

def ids(db):
    return [c["body"]["p_payment"]["settlement_request_id"] for c in db.calls
            if c["rpc"]=="bb_sales_save_invoice_multi_bank_v1"]

def setup(browser,pilot=False):
    ctx=browser.new_context()
    db=FakeDatabase()
    ctx.route("**/*",db.respond)
    page=ctx.new_page()
    page.goto(BASE+('?bbMultiBankPilot=1' if pilot else ''))
    page.evaluate("""() => {
      window.customers=[{customerId:"C1",name:"Test Customer",locationCode:"TK-01"}];
      window.locations=[];window.currentLocationCode='';window.selectedProducts=[];
      window.clearAll=()=>{};window.clearAllAfterSuccessfulSave=()=>{};
      // Real historical form builder: the manual Transaction ID is empty.
      window.buildSalesInvoicePayload=()=>({...window.legacyDraft,
        customerId:undefined,transactionId:'',bankReference:''});
      window.legacyDraft={
        invoiceId:'MOCK-LEGACY',invoiceNo:'MOCK-LEGACY',customer:'Test Customer',
        currency:'USD',paymentMethod:'Partially Paid in Bank',paymentBank:'ABA',
        grandTotal:100,amountPaid:55,locationCode:'TK-01',salesperson:'Test Sales'
      };
    }""")
    page.add_script_tag(path=str(ROOT/"supabase-adapter.js"))
    page.evaluate("""key => localStorage.setItem(key,JSON.stringify({
      access_token:"FAKE_TEST_ONLY",expires_at:4102444800,user:{id:"00000000-0000-4000-8000-000000000099"}
    }))""",SESSION_KEY)
    page.add_script_tag(path=str(ROOT/"preview/multi-source-wallet-preview.js"))
    if not pilot:
        # In real operation the panel must remain absent unless admin opted in.
        assert page.locator("#bbMultiWalletPreview").count()==0
        page.evaluate("window.BB_MULTI_BANK_SAVE_ENABLED=true")
    page.add_script_tag(path=str(ROOT/"preview/multi-source-wallet-panel.js"))
    if not pilot:
        # Keep a test-only picker present while exercising the disabled Save gate.
        page.evaluate("window.BB_MULTI_BANK_SAVE_ENABLED=false")
    page.evaluate("""() => document.dispatchEvent(new CustomEvent("bb:bank-cache-updated",{
      detail:{customerId:"C1",balances:[
        {customer_id:"C1",transaction_id:"TX-A",currency:"USD",remaining_amount:100},
        {customer_id:"C1",transaction_id:"TX-B",currency:"USD",remaining_amount:200}
      ]}
    }))""")
    for tx,amount in (("TX-A","20"),("TX-B","35")):
        page.locator(f'[data-wallet-amount="{tx}"]').fill(amount)
        page.locator(f'[data-wallet-id="{tx}"]').check()
    return ctx,page,db

def main():
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,args=["--no-sandbox"])
        # The feature is never enabled by default.
        ctx,page,db=setup(browser)
        out=attempt(page,draft("MOCK-OFF"))
        assert not out["ok"] and "not enabled" in out["error"],out
        assert not db.calls,db.calls
        print("PASS Chromium adapter: disabled feature makes no bank RPC")
        ctx.close()

        # Admin pilot is opt-in by URL; server-side SQL independently checks admin rights.
        ctx,page,db=setup(browser,pilot=True)
        assert page.evaluate("window.BB_MULTI_BANK_SAVE_ENABLED") is True
        result=attempt(page,draft("MOCK-PILOT"))
        assert result["ok"] and [c["rpc"] for c in db.calls]==["bb_sales_save_invoice_multi_bank_v1"],(result,db.calls)
        print("PASS Chromium adapter: explicit admin-pilot URL enables guarded route")
        # Regression: older Complete handlers insist on a single transaction ID
        # and preflight uniqueness even though two wallet sources were chosen.
        # The adapter must bridge that old validation without a database call.
        legacy=page.evaluate("""async () => {
          const payload=window.buildSalesInvoicePayload();
          const check=payload.transactionId
            ? await window.checkPaymentTransactionIdAvailable(payload.transactionId)
            : null;
          return {payload,check};
        }""")
        assert legacy["payload"]["customerId"]=="C1",legacy
        assert legacy["payload"]["transactionId"]=="TX-A",legacy
        assert legacy["check"]["multiBankVerifiedByServer"] is True,legacy
        assert [x["rpc"] for x in db.calls]==["bb_sales_save_invoice_multi_bank_v1"],db.calls
        print("PASS Chromium adapter: old one-ID Complete preflight accepts selected wallet source without another RPC")

        ctx.close()

        ctx,page,db=setup(browser)
        page.evaluate("window.BB_MULTI_BANK_SAVE_ENABLED=true")
        out=attempt(page,draft("MOCK-SUCCESS"))
        assert out["ok"] and out["result"]["multiSource"],out
        assert [c["rpc"] for c in db.calls]==["bb_sales_save_invoice_multi_bank_v1"],db.calls
        payload=db.calls[0]["body"]["p_payment"]
        assert [s["source_amount"] for s in payload["settlement_sources"]]==["20.00","35.00"],payload
        assert payload["settlement_request_id"],payload
        again=attempt(page,draft("MOCK-SUCCESS"))
        assert not again["ok"] and "SAVED" in again["error"],again
        assert [c["rpc"] for c in db.calls].count("bb_sales_save_invoice_multi_bank_v1")==1
        print("PASS Chromium adapter: two-bank RPC, exact payload, duplicate save blocked")
        ctx.close()

        ctx,page,db=setup(browser)
        page.evaluate("window.BB_MULTI_BANK_SAVE_ENABLED=true")
        db.mode="rejected"
        first=attempt(page,draft("MOCK-RETRY"))
        assert not first["ok"] and "Insufficient" in first["error"],first
        first_id=ids(db)[0]
        db.mode="success"
        second=attempt(page,draft("MOCK-RETRY"))
        assert second["ok"],second
        second_id=ids(db)[1]
        assert first_id!=second_id,(first_id,second_id)
        print("PASS Chromium adapter: definitive 422 rejection permits corrected retry with fresh ID")
        ctx.close()

        ctx,page,db=setup(browser)
        page.evaluate("window.BB_MULTI_BANK_SAVE_ENABLED=true")
        db.mode="network"
        first=attempt(page,draft("MOCK-UNKNOWN"))
        assert not first["ok"] and "INVOICE VERIFICATION REQUIRED" in first["error"],first
        first_id=ids(db)[0]
        db.mode="success"
        again=attempt(page,draft("MOCK-UNKNOWN"))
        assert again["ok"],again
        assert ids(db)[1]==first_id,"Network retry regenerated idempotency UUID"
        print("PASS Chromium adapter: uncertain network retry keeps identical settlement UUID")
        ctx.close()
        browser.close()

if __name__=="__main__":
    main()
