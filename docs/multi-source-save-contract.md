# BIG BROTHER — Multi-source settlement save contract (development, NOT ACTIVE)

## Existing entry points verified in BIG BROTHER DEV
- `bb_sales_save_invoice_bundle(p_invoice jsonb,p_payment jsonb)`
- `bb_sales_save_invoice_split_payment(p_invoice jsonb,p_payment jsonb)`
- `bb_ar_receive_payment_v2(p_payload jsonb)`
- `bb_ar_receive_batch_payment_v2(p_payload jsonb)`
- `bb_bank_balance_allocations` and `bb_bank_balance_snapshot` exist already.

## Proposed additive contract (backend must be upgraded BEFORE UI enables Save)
The caller supplies an array under `p_payment.settlement_sources`:
```json
{
  "settlement_request_id": "unique-per-save-uuid",
  "settlement_sources": [
    {"kind":"BANK_REGISTER","source_id":"BANK-1","source_currency":"USD","source_amount":"22.20","invoice_amount":"22.20"},
    {"kind":"BANK_REGISTER","source_id":"BANK-2","source_currency":"USD","source_amount":"100.00","invoice_amount":"100.00"},
    {"kind":"CUSTOMER_CREDIT","source_id":"credit-uuid","source_currency":"USD","source_amount":"80.00","invoice_amount":"80.00"}
  ]
}
```

Do NOT send new sources through the legacy single `transactionId` field; it cannot express allocations safely. The server must resolve source ownership, available amount, actual currency, current approved FX, status and customer relationship independently. It must not trust the cached `availableAmount` or browser totals.

### Transaction boundary
The *invoice creation*, payment record, allocations, customer-credit movement and bank-balance decrements must commit atomically in the SAME database transaction. Lock each source in deterministic (kind, ID) order to avoid deadlocks. Make `settlement_request_id` idempotent and reject its reuse with different payload. Save one allocation record per source with a unique request/source pair.

### Split/partial handling
Settlement sources pay a portion of the sale without reducing Sales Revenue or invoice total. Calculate:
- `settlement_applied` = sum of converted invoice amounts
- `cash_received` = actual cash only
- `new_bank_received` = actual new bank transfer only; reused registered transfers are not new receipts
- `outstanding` = invoice total minus all credited sources and actual receipts
No silent cash deduction. Remaining due stays in A/R for partially bank-paid invoices.

### FX
USD/KHR must use approved exchange rates, with original and invoice equivalents persisted per allocation. Reject multi-source FX until this is implemented. Avoid JS floating point as the accounting ledger's source of truth.

### Refunds
Reversal creates an entitlement once (subject to actual payment received), tied to reversal ID. Salesman refund must appear as a selectable negative item in Daily Cash Collection, with originating invoice, selected return batch, actual payer/salesman and approval. Warehouse cash refund is a Daily Cash outflow, separate from operating expenses. Settling refund and closing selected cash transactions must be atomic and idempotent.

### Migration / release gate
1. Reconcile INV-7492's subsequent discount before generating credit for that reversal.
2. Implement authorized, row-locked server RPC for credits and multiple registered-bank sources; test concurrent spending.
3. Update Invoice Generator save and A/R settlement paths.
4. Add reversible ledger audit and negative refund transaction to Daily Cash Collection.
5. Test USD/KHR, split, partial, retry, offline sync, and refunds on a nonproduction environment.
6. Only then enable `saveEnabled` and merge/deploy. No production payment writes from this branch yet.
