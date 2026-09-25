/* BIG BROTHER — Invoice Generator Supabase Backend Adapter V1 */
(function () {
  'use strict';

  const BB_SUPABASE_URL = 'https://sjfhlaclgmkwwofzstok.supabase.co';
  const BB_SUPABASE_KEY = 'sb_publishable_w762jR65CWwlO30fKQsYOw_6L9grx8S';
  const BB_SESSION_KEY = 'BB_SUPABASE_DEV_SESSION_V1';

  let bbSession = null;
  let bbSelectedCustomerId = '';
  let bbSelectedCustomerLocationCode = '';
  let bbBootstrapPromise = null;
  let bbLocationCustomers = [];
  let bbGlobalCustomers = [];
  let bbCustomerSearchTimer = 0;
  let bbCustomerSearchToken = 0;

  function bbReadSession() {
    try {
      return JSON.parse(localStorage.getItem(BB_SESSION_KEY) || 'null');
    } catch (_) {
      return null;
    }
  }

  function bbSaveSession(session) {
    bbSession = session || null;
    try {
      if (!session) {
        localStorage.removeItem(BB_SESSION_KEY);
        return;
      }
      if (!session.expires_at && session.expires_in) {
        session.expires_at = Math.floor(Date.now() / 1000) + Number(session.expires_in);
      }
      localStorage.setItem(BB_SESSION_KEY, JSON.stringify(session));
    } catch (_) {}
  }

  async function bbParseResponse(response) {
    const text = await response.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch (_) {
      data = { message: text };
    }
    if (!response.ok) {
      throw new Error(
        data.message || data.error_description || data.error ||
        ('Database request failed (' + response.status + ')')
      );
    }
    return data;
  }

  async function bbRefreshSession() {
    const current = bbReadSession();
    if (!current?.refresh_token) {
      throw new Error('Please sign in to BIG BROTHER first from the Clients Editor.');
    }

    const response = await fetch(
      BB_SUPABASE_URL + '/auth/v1/token?grant_type=refresh_token',
      {
        method: 'POST',
        headers: {
          apikey: BB_SUPABASE_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ refresh_token: current.refresh_token })
      }
    );

    const next = await bbParseResponse(response);
    bbSaveSession(next);
    return next;
  }

  async function bbEnsureSession() {
    bbSession = bbReadSession();
    if (!bbSession?.access_token) {
      throw new Error('Please sign in to BIG BROTHER first from the Clients Editor.');
    }

    if (
      bbSession.expires_at &&
      Number(bbSession.expires_at) < Math.floor(Date.now() / 1000) + 30
    ) {
      await bbRefreshSession();
    }

    return bbSession;
  }

  async function bbRpc(functionName, args = {}) {
    await bbEnsureSession();

    const response = await fetch(
      BB_SUPABASE_URL + '/rest/v1/rpc/' + functionName,
      {
        method: 'POST',
        headers: {
          apikey: BB_SUPABASE_KEY,
          Authorization: 'Bearer ' + bbSession.access_token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(args || {}),
        cache: 'no-store'
      }
    );

    return bbParseResponse(response);
  }

  function bbShowDatabaseError(error) {
    console.error('BIG BROTHER Supabase:', error);
    const status = document.getElementById('customerStatus');
    if (status) {
      status.textContent = error?.message || 'Could not connect to BIG BROTHER Database.';
      status.style.color = '#b42318';
    }
  }

  function bbNormalizeCustomer(row, fallbackLocationCode = '') {
    const locationCode = String(row?.locationCode || fallbackLocationCode || '').trim();
    const location = locations.find(item => item.locationCode === locationCode);

    return {
      customerId: String(row?.customerId || '').trim(),
      name: String(row?.name || '').trim(),
      phone: String(row?.phone || '').trim(),
      address: String(row?.address || '').trim(),
      locationCode,
      locationName: String(row?.locationName || location?.locationName || locationCode || '').trim(),
      googleMapsLink: String(row?.googleMapsLink || '').trim(),
      latitude: row?.latitude ?? null,
      longitude: row?.longitude ?? null,
      deliveryLocationNote: String(row?.deliveryLocationNote || '').trim()
    };
  }

  function bbMergeCustomerIntoPool(customer) {
    if (!customer?.customerId) return;
    const index = customers.findIndex(item => item.customerId === customer.customerId);
    if (index >= 0) customers[index] = customer;
    else customers.push(customer);
  }

  function bbCurrentBatchLocationCode() {
    return String(
      currentLocationCode ||
      document.getElementById('mainLocation')?.value ||
      ''
    ).trim();
  }

  function bbCustomerLocationMismatch(customer) {
    const batchLocation = bbCurrentBatchLocationCode();
    const customerLocation = String(customer?.locationCode || '').trim();

    if (!batchLocation || !customerLocation || batchLocation === customerLocation) return '';

    const customerLabel =
      String(customer?.locationName || customerLocation).trim() ||
      customerLocation;

    return ' • Customer location: ' + customerLabel + ' (' + customerLocation + ')' +
      ' • Batch location: ' + batchLocation;
  }

  let bbLastCustomerLocationAlertKey = '';
  let bbLastCustomerLocationAlertAt = 0;

  function bbLocationLabel(code, fallbackName = '') {
    const wanted = String(code || '').trim();
    const match = locations.find(item =>
      String(item?.locationCode || '').trim() === wanted
    );
    const name = String(
      fallbackName ||
      match?.locationName ||
      wanted
    ).trim();

    if (!wanted) return name || 'Unknown location';
    if (!name || name === wanted) return wanted;
    return name + ' [' + wanted + ']';
  }

  function bbEnsureCustomerLocationAlert() {
    let overlay = document.getElementById('bbCustomerLocationAlert');
    if (overlay) return overlay;

    const style = document.createElement('style');
    style.id = 'bbCustomerLocationAlertStyle';
    style.textContent = `
      #bbCustomerLocationAlert{
        position:fixed;inset:0;z-index:1000000;display:flex;align-items:center;justify-content:center;
        padding:18px;background:rgba(13,31,52,.48);backdrop-filter:blur(2px);
      }
      #bbCustomerLocationAlert[hidden]{display:none!important}
      #bbCustomerLocationAlert .bb-location-alert-card{
        width:min(430px,100%);background:#fff;border:1px solid #f0c36b;border-radius:16px;
        box-shadow:0 22px 60px rgba(16,42,72,.24);overflow:hidden;
        font-family:Arial,Helvetica,sans-serif;color:#17324d;
      }
      #bbCustomerLocationAlert .bb-location-alert-head{
        display:flex;align-items:center;gap:10px;padding:14px 16px;background:#fff7e8;
        border-bottom:1px solid #f3d7a0;
      }
      #bbCustomerLocationAlert .bb-location-alert-icon{font-size:24px;line-height:1}
      #bbCustomerLocationAlert .bb-location-alert-head strong{font-size:14px;color:#9a5a00}
      #bbCustomerLocationAlert .bb-location-alert-body{padding:14px 16px}
      #bbCustomerLocationAlert .bb-location-alert-note{
        margin:0 0 12px;font-size:11px;line-height:1.45;color:#6a7280;font-weight:700;
      }
      #bbCustomerLocationAlert .bb-location-alert-row{
        display:grid;grid-template-columns:112px minmax(0,1fr);gap:8px;padding:7px 0;
        border-bottom:1px solid #edf1f5;font-size:11px;
      }
      #bbCustomerLocationAlert .bb-location-alert-row:last-child{border-bottom:0}
      #bbCustomerLocationAlert .bb-location-alert-row span{color:#7a8796;font-weight:800}
      #bbCustomerLocationAlert .bb-location-alert-row b{color:#173f77;min-width:0;overflow-wrap:anywhere}
      #bbCustomerLocationAlert .bb-location-alert-actions{
        display:flex;justify-content:flex-end;padding:0 16px 15px;
      }
      #bbCustomerLocationAlert .bb-location-alert-ok{
        min-height:39px;border:0;border-radius:10px;padding:0 16px;background:#17457a;color:#fff;
        font-size:11px;font-weight:900;cursor:pointer;
      }
      @media(max-width:640px){
        #bbCustomerLocationAlert{padding:12px;align-items:flex-end}
        #bbCustomerLocationAlert .bb-location-alert-card{border-radius:16px 16px 12px 12px}
        #bbCustomerLocationAlert .bb-location-alert-row{grid-template-columns:96px minmax(0,1fr);font-size:10px}
        #bbCustomerLocationAlert .bb-location-alert-ok{width:100%;min-height:43px}
      }
    `;
    document.head.appendChild(style);

    overlay = document.createElement('div');
    overlay.id = 'bbCustomerLocationAlert';
    overlay.hidden = true;
    overlay.innerHTML =
      '<div class="bb-location-alert-card" role="alertdialog" aria-modal="true" aria-labelledby="bbLocationAlertTitle">' +
        '<div class="bb-location-alert-head">' +
          '<div class="bb-location-alert-icon">⚠️</div>' +
          '<strong id="bbLocationAlertTitle">Customer location is different from this batch</strong>' +
        '</div>' +
        '<div class="bb-location-alert-body">' +
          '<p class="bb-location-alert-note">Please confirm you selected the correct customer before continuing this invoice.</p>' +
          '<div class="bb-location-alert-row"><span>Customer</span><b id="bbLocationAlertCustomer">—</b></div>' +
          '<div class="bb-location-alert-row"><span>Customer location</span><b id="bbLocationAlertCustomerLocation">—</b></div>' +
          '<div class="bb-location-alert-row"><span>Batch</span><b id="bbLocationAlertBatch">—</b></div>' +
          '<div class="bb-location-alert-row"><span>Batch location</span><b id="bbLocationAlertBatchLocation">—</b></div>' +
        '</div>' +
        '<div class="bb-location-alert-actions">' +
          '<button type="button" class="bb-location-alert-ok" id="bbLocationAlertOk">OK, Continue</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);

    const close = () => {
      overlay.hidden = true;
      setTimeout(() => {
        try {
          document.getElementById('productSearch')?.focus({ preventScroll: true });
        } catch (_) {
          document.getElementById('productSearch')?.focus();
        }
      }, 40);
    };

    document.getElementById('bbLocationAlertOk')?.addEventListener('click', close);
    overlay.addEventListener('click', event => {
      if (event.target === overlay) close();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !overlay.hidden) close();
    });

    return overlay;
  }

  function bbShowCustomerLocationAlert(customer) {
    const batchLocationCode = bbCurrentBatchLocationCode();
    const customerLocationCode = String(customer?.locationCode || '').trim();
    const batchId = String(document.getElementById('batchNumber')?.value || '').trim();

    if (
      !batchId ||
      !batchLocationCode ||
      !customerLocationCode ||
      batchLocationCode === customerLocationCode
    ) {
      return false;
    }

    const key = [
      batchId,
      String(customer?.customerId || customer?.name || '').trim(),
      customerLocationCode,
      batchLocationCode
    ].join('|');

    const now = Date.now();
    if (
      key === bbLastCustomerLocationAlertKey &&
      now - bbLastCustomerLocationAlertAt < 1200
    ) {
      return true;
    }

    bbLastCustomerLocationAlertKey = key;
    bbLastCustomerLocationAlertAt = now;

    const overlay = bbEnsureCustomerLocationAlert();
    document.getElementById('bbLocationAlertCustomer').textContent =
      String(customer?.name || 'Selected customer').trim();
    document.getElementById('bbLocationAlertCustomerLocation').textContent =
      bbLocationLabel(customerLocationCode, customer?.locationName);
    document.getElementById('bbLocationAlertBatch').textContent =
      batchId || '—';
    document.getElementById('bbLocationAlertBatchLocation').textContent =
      bbLocationLabel(batchLocationCode);

    overlay.hidden = false;
    setTimeout(() => {
      document.getElementById('bbLocationAlertOk')?.focus();
    }, 30);
    return true;
  }

  function bbFindSelectedCustomer() {
    const typed = String(document.getElementById('customerName')?.value || '').trim();
    if (!typed) return null;

    if (bbSelectedCustomerId) {
      const selected = customers.find(c => c.customerId === bbSelectedCustomerId);
      if (selected && selected.name.toLowerCase() === typed.toLowerCase()) return selected;
    }

    const matches = customers.filter(
      c => String(c.name || '').trim().toLowerCase() === typed.toLowerCase()
    );
    return matches.length === 1 ? matches[0] : null;
  }

  function bbSalespersonStaffId() {
    const code = String(
      currentLocationCode || document.getElementById('mainLocation')?.value || ''
    ).trim();
    const typed = String(document.getElementById('salesName')?.value || '').trim();
    const location = locations.find(l => l.locationCode === code);

    if (
      location &&
      location.salespersonStaffId &&
      typed &&
      typed.toLowerCase() === String(location.salespersonName || '').trim().toLowerCase()
    ) {
      return location.salespersonStaffId;
    }
    return '';
  }

  /* -----------------------------
     Invoice number sequence
     - Automatic mode: Supabase supplies only the first number for the page.
       After that, the current number increments locally (+1).
     - Manual mode: once the user edits Invoice No., that sequence is saved
       for this signed-in account and continues +1 across future invoices.
     - Duplicate display Invoice Nos. are allowed; invoice_id stays unique.
  ----------------------------- */
  const BB_INVOICE_SEQUENCE_PREFIX = 'BB_INVOICE_SEQUENCE_V1_';

  function bbInvoiceSequenceKey() {
    const session = bbReadSession();
    const account = String(
      session?.user?.id ||
      session?.user?.email ||
      'shared'
    ).trim();
    return BB_INVOICE_SEQUENCE_PREFIX + account;
  }

  function bbReadInvoiceSequence() {
    try {
      const value = JSON.parse(
        localStorage.getItem(bbInvoiceSequenceKey()) || 'null'
      );
      if (
        value &&
        value.mode === 'manual' &&
        String(value.invoiceNo || '').trim()
      ) {
        return {
          mode: 'manual',
          invoiceNo: String(value.invoiceNo || '').trim()
        };
      }
    } catch (_) {}
    return null;
  }

  function bbWriteManualInvoiceSequence(invoiceNo) {
    const value = String(invoiceNo || '').trim();
    if (
      !value ||
      value === 'Loading...' ||
      value === 'Unavailable'
    ) return;

    try {
      localStorage.setItem(
        bbInvoiceSequenceKey(),
        JSON.stringify({
          mode: 'manual',
          invoiceNo: value
        })
      );
    } catch (_) {}
  }

  function bbManualInvoiceSequenceNo() {
    return bbReadInvoiceSequence()?.invoiceNo || '';
  }

  function bbTrackManualInvoiceNumber() {
    const input = document.getElementById('invoiceNumber');
    if (!input || input.dataset.bbInvoiceSequenceBound === '1') return;

    input.dataset.bbInvoiceSequenceBound = '1';

    input.addEventListener('input', function () {
      const value = String(input.value || '').trim();
      if (
        value &&
        value !== 'Loading...' &&
        value !== 'Unavailable'
      ) {
        bbWriteManualInvoiceSequence(value);
      }
    });
  }

  /* -----------------------------
     Invoice number
  ----------------------------- */
  window.loadNextInvoiceNumber = async function loadNextInvoiceNumberSupabase() {
    const input = document.getElementById('invoiceNumber');
    const manualInvoiceNo = bbManualInvoiceSequenceNo();

    if (manualInvoiceNo) {
      setInvoiceNumber(manualInvoiceNo);
      return manualInvoiceNo;
    }

    if (input) input.value = 'Loading...';

    try {
      const data = await bbRpc('bb_sales_next_invoice_no');
      if (!data?.success || !data.invoiceNo) throw new Error('Could not get the next Invoice No.');
      setInvoiceNumber(data.invoiceNo);
      return data.invoiceNo;
    } catch (error) {
      if (input) input.value = 'Unavailable';
      bbShowDatabaseError(error);
      throw error;
    }
  };

  /* -----------------------------
     Master bootstrap
  ----------------------------- */
  window.loadInvoiceBootstrapFast = async function loadInvoiceBootstrapFastSupabase() {
    if (bbBootstrapPromise) return bbBootstrapPromise;

    const searchInput = document.getElementById('productSearch');
    const noteSelect = document.getElementById('noteTemplate');
    const bankSelect = document.getElementById('bankingDetails');

    if (searchInput) {
      searchInput.disabled = true;
      searchInput.placeholder = 'Loading invoice data...';
    }
    if (noteSelect) {
      noteSelect.disabled = true;
      noteSelect.innerHTML = '<option value="">Loading notes...</option>';
    }
    if (bankSelect) {
      bankSelect.disabled = true;
      bankSelect.innerHTML = '<option value="">Loading banking details...</option>';
    }

    bbBootstrapPromise = (async () => {
      try {
        const data = await bbRpc('bb_sales_invoice_bootstrap');
        if (!data?.success) throw new Error('Invoice database bootstrap failed.');

        const rawLocationMap = new Map(
          (Array.isArray(data.locations) ? data.locations : []).map(row => [
            String(row.locationCode || '').trim(),
            String(row.salespersonStaffId || '').trim()
          ])
        );

        if (!applyInvoiceBootstrapFast(data)) {
          throw new Error('Could not apply invoice database data.');
        }

        locations.forEach(location => {
          location.salespersonStaffId = rawLocationMap.get(location.locationCode) || '';
        });

        const manualInvoiceNo = bbManualInvoiceSequenceNo();
        if (manualInvoiceNo) {
          setInvoiceNumber(manualInvoiceNo);
        } else if (data.invoiceNo) {
          setInvoiceNumber(data.invoiceNo);
        }

        const status = document.getElementById('customerStatus');
        if (status && !currentLocationCode) {
          status.textContent = 'Supabase ready • select a Main Location.';
          status.style.color = '#2f855a';
        }

        return data;
      } catch (error) {
        if (searchInput) {
          searchInput.disabled = true;
          searchInput.placeholder = 'Database unavailable';
        }
        bbShowDatabaseError(error);
        throw error;
      } finally {
        bbBootstrapPromise = null;
      }
    })();

    return bbBootstrapPromise;
  };

  /* Legacy fallback names now point to the same Supabase bootstrap. */
  window.loadLocations = function () { return loadInvoiceBootstrapFast(); };
  window.loadNoteTemplates = function () { return loadInvoiceBootstrapFast(); };
  window.loadBankingDetails = function () { return loadInvoiceBootstrapFast(); };
  window.loadProducts = function () { return loadInvoiceBootstrapFast(); };

  /* -----------------------------
     Customers by Location + Global Search Fallback
  ----------------------------- */
  function bbCustomerMatchesQuery(customer, query) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return true;

    return [
      customer?.name,
      customer?.customerId,
      customer?.phone,
      customer?.address
    ].some(value => String(value || '').toLowerCase().includes(q));
  }

  function bbRenderCustomerMatches(query) {
    const list = document.getElementById('customerOptions');
    if (!list) return;

    const q = String(query || '').trim().toLowerCase();

    const localMatches = bbLocationCustomers
      .filter(customer => bbCustomerMatchesQuery(customer, q));

    const localIds = new Set(localMatches.map(customer => customer.customerId));

    const globalMatches = bbGlobalCustomers
      .filter(customer =>
        !localIds.has(customer.customerId) &&
        bbCustomerMatchesQuery(customer, q)
      );

    const matches = (q ? [...localMatches, ...globalMatches] : localMatches).slice(0, 12);

    list.innerHTML = '';

    matches.forEach(customer => {
      const option = document.createElement('div');
      option.className = 'customer-option';

      const name = document.createElement('div');
      name.className = 'customer-option-name';
      name.textContent = customer.name;

      const details = document.createElement('div');
      details.className = 'customer-option-details';

      const locationText = customer.locationCode
        ? ((customer.locationName || customer.locationCode) + ' [' + customer.locationCode + ']')
        : '';

      details.textContent = [
        customer.customerId,
        customer.phone,
        locationText,
        customer.address
      ].filter(Boolean).join(' • ') || 'No customer details';

      option.appendChild(name);
      option.appendChild(details);

      option.addEventListener('mousedown', event => {
        event.preventDefault();
        window.selectCustomer(customer);
      });

      list.appendChild(option);
    });

    list.style.display = matches.length ? 'block' : 'none';
  }

  async function bbSearchCustomersGlobally(query, token) {
    try {
      const data = await bbRpc('bb_sales_search_customers', {
        p_query: query,
        p_limit: 12
      });

      if (token !== bbCustomerSearchToken) return;

      const inputValue = String(document.getElementById('customerName')?.value || '').trim();
      if (inputValue.toLowerCase() !== String(query || '').trim().toLowerCase()) return;

      bbGlobalCustomers = (Array.isArray(data?.customers) ? data.customers : [])
        .map(row => bbNormalizeCustomer(row))
        .filter(row => row.customerId && row.name);

      bbGlobalCustomers.forEach(bbMergeCustomerIntoPool);
      bbRenderCustomerMatches(query);
    } catch (error) {
      if (token !== bbCustomerSearchToken) return;
      console.warn('BIG BROTHER customer global search:', error);
    }
  }

  window.showCustomerOptions = function showCustomerOptionsSupabase() {
    const input = document.getElementById('customerName');
    const list = document.getElementById('customerOptions');
    if (!input || !list) return;

    const query = String(input.value || '').trim();
    bbRenderCustomerMatches(query);

    clearTimeout(bbCustomerSearchTimer);

    if (query.length < 2) {
      bbCustomerSearchToken++;
      bbGlobalCustomers = [];
      return;
    }

    const token = ++bbCustomerSearchToken;
    bbCustomerSearchTimer = setTimeout(() => {
      bbSearchCustomersGlobally(query, token);
    }, 300);
  };

  window.loadCustomersByLocation = async function loadCustomersByLocationSupabase(locationCode) {
    const status = document.getElementById('customerStatus');
    const list = document.getElementById('customerOptions');
    const code = String(locationCode || '').trim();
    const token = ++locationRequestToken;

    if (!code) return;

    bbSelectedCustomerId = '';
    bbSelectedCustomerLocationCode = '';
    bbGlobalCustomers = [];
    bbCustomerSearchToken++;
    clearTimeout(bbCustomerSearchTimer);

    if (status) {
      status.textContent = 'Loading customers...';
      status.style.color = '#718096';
    }
    if (list) {
      list.innerHTML = '';
      list.style.display = 'none';
    }

    try {
      const data = await bbRpc('bb_sales_customers_by_location', {
        p_location_code: code
      });

      if (token !== locationRequestToken) return;

      bbLocationCustomers = (Array.isArray(data?.customers) ? data.customers : [])
        .map(row => bbNormalizeCustomer(row, code))
        .filter(row => row.customerId && row.name);

      customers = bbLocationCustomers.slice();

      locationCustomersLoaded = true;
      cacheSet(CUSTOMER_CACHE_PREFIX + encodeURIComponent(code), bbLocationCustomers);
      renderCustomerOptionsBase();

      if (status) {
        status.textContent = bbLocationCustomers.length
          ? bbLocationCustomers.length + ' customers loaded for ' + code +
            ' • Type 2+ characters to search all customer locations.'
          : 'No customers found for this location • Type 2+ characters to search all customer locations.';
        status.style.color = bbLocationCustomers.length ? '#2f855a' : '#b7791f';
      }
    } catch (error) {
      if (token !== locationRequestToken) return;
      locationCustomersLoaded = false;
      bbShowDatabaseError(error);
    }
  };

  window.fillCustomerInformation = function fillCustomerInformationSupabase() {
    const input = document.getElementById('customerName');
    const typed = String(input?.value || '').trim();

    if (!typed) {
      bbSelectedCustomerId = '';
      bbSelectedCustomerLocationCode = '';
      return;
    }

    const matches = customers.filter(
      item => String(item.name || '').toLowerCase() === typed.toLowerCase()
    );

    const customer = matches.length === 1
      ? matches[0]
      : (bbSelectedCustomerId
          ? customers.find(item =>
              item.customerId === bbSelectedCustomerId &&
              item.name.toLowerCase() === typed.toLowerCase()
            )
          : null);

    if (!customer) {
      bbSelectedCustomerId = '';
      bbSelectedCustomerLocationCode = '';
      return;
    }

    bbSelectedCustomerId = customer.customerId;
    bbSelectedCustomerLocationCode = customer.locationCode || '';
    document.getElementById('customerPhone').value = customer.phone || '';
    document.getElementById('customerAddress').value = customer.address || '';
    bbShowCustomerLocationAlert(customer);
    loadCustomerPrices(customer.name);
  };

  window.selectCustomer = function selectCustomerSupabase(customer) {
    if (!customer) return;

    const normalized = bbNormalizeCustomer(customer);
    bbMergeCustomerIntoPool(normalized);

    bbSelectedCustomerId = normalized.customerId;
    bbSelectedCustomerLocationCode = normalized.locationCode || '';

    document.getElementById('customerName').value = normalized.name || '';
    document.getElementById('customerPhone').value = normalized.phone || '';
    document.getElementById('customerAddress').value = normalized.address || '';
    document.getElementById('customerOptions').style.display = 'none';

    const status = document.getElementById('customerStatus');
    const mismatch = bbCustomerLocationMismatch(normalized);

    if (status && mismatch) {
      status.textContent = 'Existing customer selected' + mismatch;
      status.style.color = '#b7791f';
    }

    const locationAlertShown = bbShowCustomerLocationAlert(normalized);
    loadCustomerPrices(normalized.name);

    if (!locationAlertShown) {
      setTimeout(() => {
        document.getElementById('productSearch')?.focus();
      }, 40);
    }
  };

  window.loadCustomerPrices = async function loadCustomerPricesSupabase(customerName) {
    const name = String(customerName || '').trim();
    const status = document.getElementById('customerStatus');
    const token = ++customerPriceRequestToken;

    customerPrices = {};
    customerPriceCustomer = name;
    customerPriceLoaded = false;

    if (!name) {
      bbSelectedCustomerId = '';
      applyCustomerPricesToProducts();
      return;
    }

    const customer = bbFindSelectedCustomer();
    if (!customer?.customerId) {
      if (status) {
        status.textContent = 'Select the customer from the list to load its prices.';
        status.style.color = '#b7791f';
      }
      applyCustomerPricesToProducts();
      return;
    }

    bbSelectedCustomerId = customer.customerId;
    if (status) {
      status.textContent = 'Loading customer prices...';
      status.style.color = '#718096';
    }

    try {
      const data = await bbRpc('bb_sales_customer_prices', {
        p_customer_id: customer.customerId
      });

      if (token !== customerPriceRequestToken) return;

      const prices = data?.prices && typeof data.prices === 'object'
        ? data.prices
        : {};

      Object.keys(prices).forEach(codeKey => {
        const row = prices[codeKey] || {};
        const code = String(row.productCode || codeKey || '').trim();
        const price = Number(row.priceUSD);
        if (code && Number.isFinite(price)) customerPrices[code] = price;
      });

      customerPriceLoaded = true;

      if (status) {
        const count = Object.keys(customerPrices).length;
        const mismatch = bbCustomerLocationMismatch(customer);
        status.textContent = (
          count
            ? 'Customer selected • ' + count + ' special price' + (count === 1 ? '' : 's') + ' loaded'
            : 'Customer selected • using standard product prices'
        ) + mismatch;
        status.style.color = mismatch ? '#b7791f' : '#2f855a';
      }

      applyCustomerPricesToProducts();
    } catch (error) {
      if (token !== customerPriceRequestToken) return;
      bbShowDatabaseError(error);
    }
  };

  /* -----------------------------
     Batch picker
  ----------------------------- */
  window.requestSimpleBatchList = async function requestSimpleBatchListSupabase() {
    return bbRpc('bb_sales_open_batches');
  };

  /* -----------------------------
     Duplicate checks
  ----------------------------- */
  window.checkInvoiceNumberAvailable = async function checkInvoiceNumberAvailableSupabase(invoiceNo) {
    const requested = String(invoiceNo || '').trim();
    if (!requested || requested === 'Loading...' || requested === 'Unavailable') {
      throw new Error('Invoice number is not ready yet.');
    }
    return bbRpc('bb_sales_check_invoice_no', { p_invoice_no: requested });
  };

  window.checkPaymentTransactionIdAvailable = async function checkPaymentTransactionIdAvailableSupabase(transactionId) {
    const requested = String(transactionId || '').trim();
    if (!requested) throw new Error('Transaction ID is required for Bank payment.');
    return bbRpc('bb_sales_check_transaction_id', { p_transaction_id: requested });
  };

  /* -----------------------------
     Payload augmentation
  ----------------------------- */
  const bbOriginalBuildSalesInvoicePayload = window.buildSalesInvoicePayload;
  window.buildSalesInvoicePayload = function buildSalesInvoicePayloadSupabase() {
    const payload = bbOriginalBuildSalesInvoicePayload();
    const customer = bbFindSelectedCustomer();
    payload.customerId = customer?.customerId || bbSelectedCustomerId || '';
    payload.salespersonStaffId = bbSalespersonStaffId();
    return payload;
  };

  /* -----------------------------
     Atomic writes
  ----------------------------- */
  window.postSalesInvoiceBundle = async function postSalesInvoiceBundleSupabase(invoicePayload, paymentPayload) {
    const splitPayment =
      String(invoicePayload?.paymentMethod || '').trim() === 'Cash + Bank';

    return bbRpc(
      splitPayment
        ? 'bb_sales_save_invoice_split_payment'
        : 'bb_sales_save_invoice_bundle',
      {
        p_invoice: invoicePayload,
        p_payment: paymentPayload || null
      }
    );
  };

  window.postSalesInvoice = async function postSalesInvoiceSupabase(payload) {
    return bbRpc('bb_sales_save_invoice', { p_invoice: payload });
  };

  window.postSalesPayment = async function postSalesPaymentSupabase(payload) {
    return bbRpc('bb_sales_save_payment', { p_payment: payload });
  };

  /* -----------------------------
     Keep invoice number authoritative after clear/save
  ----------------------------- */
  const bbOriginalClearAfterSave = window.clearAllAfterSuccessfulSave;
  window.clearAllAfterSuccessfulSave = function clearAllAfterSuccessfulSaveSupabase() {
    const manualSequence = bbReadInvoiceSequence();

    bbSelectedCustomerId = '';
    bbSelectedCustomerLocationCode = '';
    bbGlobalCustomers = [];

    /*
     * The legacy clear already increments the number currently on screen.
     * Do NOT query the database again here.
     *
     * Example:
     *   user enters 1000 -> completes -> next stays 1001
     *   automatic INV-3462 -> completes -> next stays INV-3463
     */
    bbOriginalClearAfterSave();

    if (manualSequence?.mode === 'manual') {
      bbWriteManualInvoiceSequence(
        document.getElementById('invoiceNumber')?.value || ''
      );
    }
  };

  const bbOriginalClearAll = window.clearAll;
  window.clearAll = function clearAllSupabase() {
    const manualSequence = bbReadInvoiceSequence();

    bbOriginalClearAll();
    bbSelectedCustomerId = '';
    bbSelectedCustomerLocationCode = '';
    bbGlobalCustomers = [];

    if (manualSequence?.mode === 'manual') {
      bbWriteManualInvoiceSequence(
        document.getElementById('invoiceNumber')?.value || ''
      );
    }
  };

  /* Fix GROUP keyboard selection: use the full exact+group search pool. */
  const productSearchInput = document.getElementById('productSearch');
  if (productSearchInput) {
    productSearchInput.addEventListener('keydown', function (event) {
      if (event.key !== 'Enter') return;
      const firstOption = document.querySelector('#productSearchOptions .bb-product-option');
      if (!firstOption) return;
      const code = String(firstOption.dataset.productCode || '').trim();
      const product = findInvoiceSearchProductByCode(code);
      if (!product || String(product.entryType || '').toUpperCase() !== 'GROUP') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      selectInvoiceProduct(product);
    }, true);
  }

  /* Prevent a stale Google-era Batch cache from appearing before live Supabase data. */
  try {
    localStorage.removeItem(SIMPLE_BATCH_LIST_CACHE_KEY);
  } catch (_) {}

  /* -----------------------------
     Boot real page from Supabase
  ----------------------------- */
  async function bbStartSupabaseInvoice() {
    try {
      await bbEnsureSession();
      await Promise.all([
        loadInvoiceBootstrapFast(),
        loadSimpleBatchPicker()
      ]);

      if (
        document.getElementById('invoiceNumber')?.value === 'Loading...' ||
        document.getElementById('invoiceNumber')?.value === 'Unavailable'
      ) {
        await loadNextInvoiceNumber();
      }
    } catch (error) {
      bbShowDatabaseError(error);
      const button = document.querySelector('.complete-btn');
      if (button) {
        button.disabled = true;
        button.title = error?.message || 'Sign in required';
      }
    }
  }

  bbTrackManualInvoiceNumber();
  bbStartSupabaseInvoice();
})();
