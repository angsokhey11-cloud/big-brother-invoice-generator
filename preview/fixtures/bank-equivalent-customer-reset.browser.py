#!/usr/bin/env python3
"""Reproduce stale bank-equivalent payment template after changing customers.
Actual production scripts, mocked DOM and verified bank RPC; no live API/writes.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[2]

def main():
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True,args=["--no-sandbox"])
  page=browser.new_page()
  # Give mocked browser storage a proper origin; about:blank cannot persist the
  # same localStorage cache used by our actual Sync Bank implementation.
  page.route("http://bb-bank-reset-fixture.test/**",
      lambda route: route.fulfill(status=200,content_type="text/html",
                                  body="<!doctype html><html><body></body></html>"))
  page.goto("http://bb-bank-reset-fixture.test/")
  page.set_content("""<!doctype html><html><body>
   <select id="currency"><option value="USD">USD</option><option value="KHR">KHR</option></select>
   <input id="customerName" value="Customer One">
   <select id="paymentMethod"><option value="">Select Payment Method</option><option value="Bank" selected>Bank</option><option value="Cash + Bank">Cash + Bank</option><option value="Partially Paid in Bank">Partially Paid in Bank</option></select>
   <div id="grandTotal">$171.60</div><input id="amountPaid" value="171.60">
   <div class="transaction-details"><div class="grid-2">
    <div id="paymentBankRow"><select id="paymentBank"><option value="">Select Bank</option><option value="ABA">ABA</option></select></div>
    <div id="transactionIdRow"><input id="transactionId"></div>
   </div></div>
   </body></html>""")
  page.evaluate("""() => {
   window.fixtureCustomerId='C1';
   window.bbGetSelectedCustomerForBank=()=>window.fixtureCustomerId?{customerId:window.fixtureCustomerId}:null;
   window.BBInvoiceBankAuthToken=()=>'x.'+btoa(JSON.stringify({sub:'local-browser-fixture-user'}))+'.y';
   window.BBInvoiceBankRpc=async name=>{
     if(name==='bb_is_admin')return true;
     if(name==='bb_invoice_bank_bulk_sync')return [{
      customer_id:'C1',transaction_id:'TX-284-OLD',currency:'USD',
      invoice_currency:'USD',amount:284.40,remaining_amount:284.40,
      original_amount:284.60,approved_exchange_rate:4060,bank_name:'ABA'
     }];
     throw Error('Unexpected RPC: '+name);
   };
   window.clearAllAfterSuccessfulSave=()=>{
    window.fixtureCustomerId='';
    document.getElementById('customerName').value='';
    document.getElementById('paymentMethod').value='';
   };
   window.clearAll=()=>{document.getElementById('customerName').value='';window.fixtureCustomerId='';};
  }""")
  page.add_script_tag(path=str(ROOT/"bank-payment-protection-v2.js"))
  page.add_script_tag(path=str(ROOT/"invoice-bank-currency-equivalent-v1.js"))
  page.evaluate("document.dispatchEvent(new CustomEvent('bb:bank-sync-request'))")
  page.locator('[data-bb-bank-use="TX-284-OLD"]').wait_for()
  page.locator('[data-bb-bank-use="TX-284-OLD"]').click()
  assert page.locator('#transactionId').input_value()=='TX-284-OLD'
  assert page.locator('#paymentBank').input_value()=='ABA'
  assert 'Registered available: $284.40' in page.locator('#bbBankEquivalentAvailable').inner_text()
  assert 'Remaining after saving: $112.80' in page.locator('#bbBankEquivalentAvailable').inner_text()
  print('PASS prior customer shows verified bank balance and correct equivalent computation')

  page.evaluate("window.fixtureCustomerId='C2'")
  page.locator('#customerName').fill('Customer Two')
  assert page.locator('#transactionId').input_value()=='', 'Old registered transaction ID leaked into next customer'
  assert page.locator('#bbActualBankAmount').input_value()=='', 'Old transfer amount leaked into next customer'
  assert page.locator('#paymentBank').input_value()=='', 'Old receiving bank leaked into next customer'
  assert 'Registered available' not in page.locator('#bbBankEquivalentAvailable').inner_text()
  assert '$284.40' not in page.locator('#bbInvoiceBankEquivalentV1').inner_text()
  assert '$112.80' not in page.locator('#bbInvoiceBankEquivalentV1').inner_text()
  assert 'No available registered bank payment' in page.locator('#bbRegisteredPayments').inner_text()
  print('PASS customer switch clears transaction, bank amount, receiving bank, registered balance and prior remaining estimate')

  page.select_option('#paymentMethod','')
  assert not page.locator('#bbInvoiceBankEquivalentV1').is_visible()
  page.select_option('#paymentMethod','Bank')
  assert 'Registered available' not in page.locator('#bbInvoiceBankEquivalentV1').inner_text()
  print('PASS no payment method hides equivalent; switching back does not resurrect last customer')

  page.evaluate("window.fixtureCustomerId='C1'")
  page.locator('#customerName').fill('Customer One')
  page.locator('[data-bb-bank-use="TX-284-OLD"]').wait_for()
  page.locator('[data-bb-bank-use="TX-284-OLD"]').click()
  assert 'Registered available' in page.locator('#bbBankEquivalentAvailable').inner_text()
  page.locator('[data-bb-bank-use="TX-284-OLD"]').click()
  assert page.locator('#transactionId').input_value()==''
  assert page.locator('#bbActualBankAmount').input_value()==''
  assert 'Registered available' not in page.locator('#bbBankEquivalentAvailable').inner_text()
  print('PASS same-customer Undo removes equivalent metadata')

  page.locator('[data-bb-bank-use="TX-284-OLD"]').click()
  assert 'Registered available' in page.locator('#bbBankEquivalentAvailable').inner_text()
  page.evaluate('window.clearAllAfterSuccessfulSave()')
  assert page.locator('#transactionId').input_value()==''
  assert page.locator('#bbActualBankAmount').input_value()==''
  assert 'Registered available' not in page.locator('#bbInvoiceBankEquivalentV1').inner_text()
  assert not page.locator('#bbInvoiceBankEquivalentV1').is_visible()
  print('PASS new-invoice reset clears bank data and hidden equivalent')

  browser.close()

if __name__=='__main__':main()
