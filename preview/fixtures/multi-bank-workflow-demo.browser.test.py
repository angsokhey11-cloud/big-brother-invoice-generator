#!/usr/bin/env python3
"""Verify the safe standalone workflow demo in real Chromium. No network or DB."""
from pathlib import Path
from playwright.sync_api import sync_playwright

root=Path(__file__).resolve().parents[2]
url=(root/"multi-bank-workflow-preview.html").resolve().as_uri()

with sync_playwright() as p:
  browser=p.chromium.launch(headless=True,args=["--no-sandbox"])
  page=browser.new_page()
  requests=[]
  page.on("request",lambda req: requests.append(req.url) if not req.url.startswith("file:") else None)
  page.goto(url)
  assert page.get_by_text("Multi-Bank Invoice Payment").count()==1
  assert "SIMULATED" not in page.locator("#feedback").inner_text()
  rows=page.locator(".transfer")
  assert rows.count()==2
  for row,value in zip([rows.nth(0),rows.nth(1)],["50","70"]):
    row.locator('input[type="number"]').fill(value)
    row.locator('input[type="checkbox"]').check()
  assert page.locator("#selected").inner_text()=="USD 120.00"
  page.get_by_role("button",name="Simulate Atomic Save").click()
  assert "SIMULATED SAVE COMPLETED" in page.locator("#feedback").inner_text()
  assert "USD 30.00" in page.locator("#outstandingText").inner_text()
  assert page.locator("#history tbody tr").count()==2
  assert "USD 50.00" in page.locator("#wallet").inner_text()
  print("PASS Live-preview workflow: two bank allocations, invoice, payment history, remaining balances, A/R")
  page.get_by_role("button",name="New Invoice").click()
  assert page.locator("#invoiceNo").input_value()=="DEMO-0002"
  assert page.locator("#wallet .transfer").count()==2
  page.get_by_role("button",name="Simulate Atomic Save").click()
  assert "Select at least two" in page.locator("#feedback").inner_text()
  print("PASS Live-preview workflow: next invoice and incomplete selections rejected")
  page.get_by_role("button",name="Reset Demo").click()
  page.locator("#method").select_option("Bank")
  rows=page.locator(".transfer")
  for row,value in zip([rows.nth(0),rows.nth(1)],["80","70"]):
    row.locator('input[type="number"]').fill(value)
    row.locator('input[type="checkbox"]').check()
  page.get_by_role("button",name="Simulate Atomic Save").click()
  assert "Paid" in page.locator("#receipt").inner_text()
  print("PASS Live-preview workflow: full bank payment")
  page.get_by_role("button",name="Reset Demo").click()
  page.locator("#currency").select_option("KHR")
  rows=page.locator(".transfer")
  for row,value in zip([rows.nth(0),rows.nth(1)],["100000","250000"]):
    row.locator('input[type="number"]').fill(value)
    row.locator('input[type="checkbox"]').check()
  page.get_by_role("button",name="Simulate Atomic Save").click()
  assert "KHR 150,000" in page.locator("#outstandingText").inner_text()
  print("PASS Live-preview workflow: KHR partially paid invoice")
  assert not requests,requests
  print("PASS Live-preview workflow: no network requests or real accounting changes")
  browser.close()
