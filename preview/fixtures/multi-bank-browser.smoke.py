#!/usr/bin/env python3
"""Chromium smoke test for the actual multi-bank picker scripts.
The page and bank cache are mocked; no Supabase credentials or writes.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "preview" / "multi-source-wallet-preview.js"
PANEL = ROOT / "preview" / "multi-source-wallet-panel.js"

def broadcast(page, *, customer="C1", first=100, second=200, currency="USD"):
    rows = [
        {"customer_id":customer,"transaction_id":"TX-A","currency":currency,"remaining_amount":first},
        {"customer_id":customer,"transaction_id":"TX-B","currency":currency,"remaining_amount":second}
    ]
    page.evaluate("""data => document.dispatchEvent(new CustomEvent('bb:bank-cache-updated', {
      detail: {customerId: data.customer, balances: data.rows}
    }))""", {"customer":customer,"rows":rows})

def select_two(page,a,b):
    page.locator('input[data-wallet-amount="TX-A"]').fill(str(a))
    page.locator('input[data-wallet-id="TX-A"]').check()
    page.locator('input[data-wallet-amount="TX-B"]').fill(str(b))
    page.locator('input[data-wallet-id="TX-B"]').check()

def selection(page):
    return page.evaluate("window.BBInvoiceMultiSourceSelection()")

def main():
    assert SOURCE.is_file(), f"Missing browser wallet: {SOURCE}"
    assert PANEL.is_file(), f"Missing browser wallet panel: {PANEL}"
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=["--no-sandbox"])
        page = browser.new_page()
        page.set_content("""<!doctype html><html><body>
        <select id="currency"><option value="USD">USD</option><option value="KHR">KHR</option></select>
        <select id="paymentMethod"><option value="Bank">Bank</option><option value="Partially Paid in Bank">Partially Paid in Bank</option><option value="Cash + Bank">Cash + Bank</option><option value="Cash">Cash</option></select>
        <div id="transactionIdRow"><input id="transactionId" placeholder="Transaction ID"></div>
        <div id="bbRegisteredPayments"></div></body></html>""")
        page.evaluate("window.selectedCustomer='C1';window.bbGetSelectedCustomerForBank=()=>({customerId:window.selectedCustomer})")
        page.add_script_tag(path=str(SOURCE))
        page.evaluate("window.BB_MULTI_BANK_SAVE_ENABLED=true")
        page.add_script_tag(path=str(PANEL))
        broadcast(page)
        assert page.locator("#bbMultiWalletPreview").count()==1, "Wallet panel never mounted"
        select_two(page,20,35)
        got=selection(page)
        assert got["selected_total"]=="55.00",got
        assert [x["source_id"] for x in got["settlement_sources"]]==["TX-A","TX-B"],got
        assert not page.locator("#transactionIdRow").is_visible(), "Old manual Transaction ID still shown for two-bank wallet"
        assert page.locator("#bbMultiWalletReferencesNotice").is_visible()
        # Regression for Cash + Bank: the normal bank portion requires a
        # manual Admin Transaction ID even when the multi-bank pilot is loaded.
        page.select_option("#paymentMethod","Cash + Bank")
        assert page.locator("#transactionIdRow").is_visible(), "Cash + Bank lost its Transaction ID field"
        assert not page.locator("#bbMultiWalletPreview").is_visible(), "Multi-bank-only picker should be hidden for Cash + Bank"
        assert not page.locator("#bbMultiWalletReferencesNotice").is_visible(), "Multi-bank skip-ID note leaked into split payments"
        assert selection(page) is None, "Multi-bank allocations leaked into unsupported Cash + Bank"
        page.select_option("#paymentMethod","Bank")
        assert page.locator("#transactionIdRow").is_visible(), "Manual Transaction ID did not return after leaving Cash + Bank"
        assert page.locator("#bbMultiWalletPreview").is_visible(), "Multi-bank picker did not return after switching back to Bank"
        select_two(page,20,35)
        assert not page.locator("#transactionIdRow").is_visible(), "Two-bank option no longer hides manual ID"
        page.select_option("#paymentMethod","Partially Paid in Bank")
        assert not page.locator("#transactionIdRow").is_visible(), "Partially Paid in Bank should hide ID with two selections"
        page.select_option("#paymentMethod","Cash")
        assert not page.locator("#transactionIdRow").is_visible(), "Cash-only payment should not display Transaction ID"
        assert selection(page) is None
        page.select_option("#paymentMethod","Bank")
        select_two(page,20,35)
        print("PASS Chromium: Cash + Bank restores manual Admin ID; unsupported multi-bank selection clears, Bank and Partial unchanged")
        print("PASS Chromium: two-bank wallet hides obsolete Transaction ID entry")
        print("PASS Chromium: panel, checkbox allocations and save payload")

        broadcast(page)
        assert selection(page)["selected_total"]=="55.00","Sync Bank lost valid allocations"
        print("PASS Chromium: Sync Bank preserves valid selections")

        broadcast(page,first=10)
        assert not page.locator('input[data-wallet-id="TX-A"]').is_checked(),"Overdrawn balance still selected"
        assert page.locator('input[data-wallet-id="TX-B"]').is_checked(),"Good balance lost"
        try:
            selection(page)
        except Exception as e:
            assert "at least two" in str(e),e
        else:
            raise AssertionError("Single remaining source allowed")
        assert page.locator("#transactionIdRow").is_visible(), "Single-bank Transaction ID should return"
        print("PASS Chromium: reduced balance removed; single allocation blocked")

        page.evaluate("window.selectedCustomer='C2'")
        try:
            selection(page)
        except Exception as e:
            assert "customer" in str(e).lower(),e
        else:
            raise AssertionError("Stale customer selection accepted")
        page.evaluate("window.selectedCustomer='C1'")
        print("PASS Chromium: wrong-customer selection rejected")

        page.locator('input[data-wallet-amount="TX-A"]').fill("5")
        page.locator('input[data-wallet-id="TX-A"]').check()
        page.select_option("#currency","KHR")
        assert selection(page) is None, "USD selection retained after currency change"
        assert page.locator('input[data-wallet-id="TX-A"]').is_disabled(),"USD source enabled for KHR"
        broadcast(page,first=5000,second=2000,currency="KHR")
        select_two(page,1000,1500)
        got=selection(page)
        assert got["selected_total"]=="2500",got
        assert got["currency"]=="KHR",got
        print("PASS Chromium: USD to KHR resets allocations; KHR selection works")
        browser.close()

if __name__=="__main__":
    main()
