/* BIG BROTHER — Invoice Generator Supabase Backend Adapter V1 */
(function () {
  'use strict';

  const BB_SUPABASE_URL = 'https://sjfhlaclgmkwwofzstok.supabase.co';
  const BB_SUPABASE_KEY = 'sb_publishable_w762jR65CWwlO30fKQsYOw_6L9grx8S';
  const BB_SESSION_KEY = 'BB_SUPABASE_DEV_SESSION_V1';

  let bbSession = null;
  let bbSelectedCustomerId = '';
  let bbBootstrapPromise = null;

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
     Invoice number
  ----------------------------- */
  window.loadNextInvoiceNumber = async function loadNextInvoiceNumberSupabase() {
    const input = document.getElementById('invoiceNumber');
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

        if (data.invoiceNo) setInvoiceNumber(data.invoiceNo);

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
     Customers by Location
  ----------------------------- */
  window.loadCustomersByLocation = async function loadCustomersByLocationSupabase(locationCode) {
    const status = document.getElementById('customerStatus');
    const list = document.getElementById('customerOptions');
    const code = String(locationCode || '').trim();
    const token = ++locationRequestToken;

    if (!code) return;
    bbSelectedCustomerId = '';

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

      customers = (Array.isArray(data?.customers) ? data.customers : [])
        .map(row => ({
          customerId: String(row.customerId || '').trim(),
          name: String(row.name || '').trim(),
          phone: String(row.phone || '').trim(),
          address: String(row.address || '').trim(),
          locationCode: String(row.locationCode || code).trim(),
          googleMapsLink: String(row.googleMapsLink || '').trim(),
          deliveryLocationNote: String(row.deliveryLocationNote || '').trim()
        }))
        .filter(row => row.customerId && row.name);

      locationCustomersLoaded = true;
      cacheSet(CUSTOMER_CACHE_PREFIX + encodeURIComponent(code), customers);
      renderCustomerOptionsBase();

      if (status) {
        status.textContent = customers.length
          ? customers.length + ' customers loaded for ' + code
          : 'No customers found for this location.';
        status.style.color = customers.length ? '#2f855a' : '#b7791f';
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
      return;
    }

    const matches = customers.filter(
      item => String(item.name || '').toLowerCase() === typed.toLowerCase()
    );

    const customer = matches.length === 1
      ? matches[0]
      : (bbSelectedCustomerId
          ? customers.find(item => item.customerId === bbSelectedCustomerId && item.name.toLowerCase() === typed.toLowerCase())
          : null);

    if (!customer) {
      bbSelectedCustomerId = '';
      return;
    }

    bbSelectedCustomerId = customer.customerId;
    document.getElementById('customerPhone').value = customer.phone || '';
    document.getElementById('customerAddress').value = customer.address || '';
    loadCustomerPrices(customer.name);
  };

  window.selectCustomer = function selectCustomerSupabase(customer) {
    if (!customer) return;

    bbSelectedCustomerId = String(customer.customerId || '').trim();
    document.getElementById('customerName').value = customer.name || '';
    document.getElementById('customerPhone').value = customer.phone || '';
    document.getElementById('customerAddress').value = customer.address || '';
    document.getElementById('customerOptions').style.display = 'none';

    loadCustomerPrices(customer.name);

    setTimeout(() => {
      document.getElementById('productSearch')?.focus();
    }, 40);
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
        status.textContent = count
          ? 'Customer selected • ' + count + ' special price' + (count === 1 ? '' : 's') + ' loaded'
          : 'Customer selected • using standard product prices';
        status.style.color = '#2f855a';
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
    return bbRpc('bb_sales_save_invoice_bundle', {
      p_invoice: invoicePayload,
      p_payment: paymentPayload || null
    });
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
    bbSelectedCustomerId = '';
    bbOriginalClearAfterSave();
    setTimeout(() => {
      loadNextInvoiceNumber().catch(() => {});
    }, 0);
  };

  const bbOriginalClearAll = window.clearAll;
  window.clearAll = function clearAllSupabase() {
    bbOriginalClearAll();
    bbSelectedCustomerId = '';
    setTimeout(() => {
      loadNextInvoiceNumber().catch(() => {});
    }, 0);
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

  bbStartSupabaseInvoice();
})();
