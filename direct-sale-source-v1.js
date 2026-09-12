/* ============================================================
   BIG BROTHER ACCOUNTING SYSTEM

   DIRECT SALE STOCK SOURCE UI V1

   DIRECT SALE:
   Accountant explicitly selects:
   - PURCHASED
   - ZERO_COST
   - MIXED

   BATCH SALE:
   Unchanged
   → ZERO-COST FIRST automatically

   Backend remains authoritative.
   ============================================================ */

(function () {

  'use strict';


  const SUPABASE_URL =
    'https://sjfhlaclgmkwwofzstok.supabase.co';


  const SUPABASE_KEY =
    'sb_publishable_w762jR65CWwlO30fKQsYOw_6L9grx8S';


  const SESSION_KEY =
    'BB_SUPABASE_DEV_SESSION_V1';


  const EPS =
    0.000001;


  let session =
    null;


  let balanceLoaded =
    false;


  let balanceError =
    '';


  let balancePromise =
    null;


  let currentPromptProduct =
    null;


  const balanceMap =
    new Map();



  /* ============================================================
     HELPERS
     ============================================================ */

  function num(value) {

    const n =
      Number(value);


    return Number.isFinite(n)
      ? n
      : 0;

  }



  function clean(value) {

    return String(
      value == null
        ? ''
        : value
    )
    .trim();

  }



  function formatQty(value) {

    return num(value)
      .toLocaleString(
        'en-US',
        {
          maximumFractionDigits: 3
        }
      );

  }



  function isDirectSale() {

    const batch =
      document.getElementById(
        'batchNumber'
      );


    return !clean(
      batch?.value
    );

  }



  function safeCalculate() {

    try {

      if (
        typeof window.calculate
        ===
        'function'
      ) {

        window.calculate();

      }

    } catch (_) {}

  }



  function productRows() {

    return [
      ...document.querySelectorAll(
        '#productList .product'
      )
    ];

  }



  function rowProductCode(row) {

    return clean(
      row?.dataset?.productCode
    );

  }



  function rowProductName(row) {

    return (
      clean(
        row?.dataset?.product
      )
      ||
      clean(
        row
          ?.querySelector(
            '.product-name'
          )
          ?.textContent
      )
      ||
      rowProductCode(row)
    );

  }



  function rowIsExact(row) {

    return (
      clean(
        row?.dataset?.entryType
        ||
        'EXACT'
      )
      .toUpperCase()
      ===
      'EXACT'
    );

  }



  function rowQtyInput(row) {

    return row?.querySelector(
      '.product-qty-input'
    )
    ||
    null;

  }



  function getBalance(code) {

    const found =
      balanceMap.get(
        clean(code)
      );


    if (found) {

      return found;

    }


    return {

      productCode:
        clean(code),

      purchasedAvailable:
        0,

      zeroCostAvailable:
        0,

      totalAvailable:
        0

    };

  }



  /* ============================================================
     SUPABASE SESSION
     ============================================================ */

  function readSession() {

    try {

      return JSON.parse(
        localStorage.getItem(
          SESSION_KEY
        )
        ||
        'null'
      );

    } catch (_) {

      return null;

    }

  }



  function saveSession(value) {

    session =
      value
      ||
      null;


    try {

      if (!value) {

        localStorage.removeItem(
          SESSION_KEY
        );

        return;

      }


      if (
        !value.expires_at
        &&
        value.expires_in
      ) {

        value.expires_at =

          Math.floor(
            Date.now() / 1000
          )

          +

          Number(
            value.expires_in
          );

      }


      localStorage.setItem(
        SESSION_KEY,
        JSON.stringify(
          value
        )
      );

    } catch (_) {}

  }



  async function parseResponse(
    response
  ) {

    const text =
      await response.text();


    let data =
      {};


    try {

      data =
        text
          ?
          JSON.parse(text)
          :
          {};

    } catch (_) {

      data = {
        message: text
      };

    }


    if (!response.ok) {

      throw new Error(

        data.message
        ||
        data.error_description
        ||
        data.error
        ||
        (
          'Database request failed ('
          +
          response.status
          +
          ')'
        )

      );

    }


    return data;

  }



  async function refreshSession() {

    const current =
      readSession();


    if (
      !current?.refresh_token
    ) {

      throw new Error(
        'Please sign in to BIG BROTHER first.'
      );

    }


    const response =
      await fetch(

        SUPABASE_URL
        +
        '/auth/v1/token?grant_type=refresh_token',

        {

          method:
            'POST',

          headers: {

            apikey:
              SUPABASE_KEY,

            'Content-Type':
              'application/json'

          },

          body:
            JSON.stringify({

              refresh_token:
                current.refresh_token

            }),

          cache:
            'no-store'

        }

      );


    const next =
      await parseResponse(
        response
      );


    saveSession(
      next
    );


    return next;

  }



  async function ensureSession() {

    session =
      readSession();


    if (
      !session?.access_token
    ) {

      throw new Error(
        'Please sign in to BIG BROTHER first.'
      );

    }


    const now =
      Math.floor(
        Date.now() / 1000
      );


    if (
      session.expires_at
      &&
      Number(
        session.expires_at
      )
      <
      now + 30
    ) {

      await refreshSession();

    }


    return session;

  }



  async function rpc(
    functionName,
    args = {}
  ) {

    await ensureSession();


    async function request() {

      return fetch(

        SUPABASE_URL
        +
        '/rest/v1/rpc/'
        +
        functionName,

        {

          method:
            'POST',

          headers: {

            apikey:
              SUPABASE_KEY,

            Authorization:
              'Bearer '
              +
              session.access_token,

            'Content-Type':
              'application/json'

          },

          body:
            JSON.stringify(
              args
              ||
              {}
            ),

          cache:
            'no-store'

        }

      );

    }


    let response =
      await request();


    if (
      response.status
      ===
      401
    ) {

      await refreshSession();

      response =
        await request();

    }


    return parseResponse(
      response
    );

  }



  /* ============================================================
     LOAD LIVE WAREHOUSE STOCK
     ============================================================ */

  async function loadBalances() {

    if (balancePromise) {

      return balancePromise;

    }


    balancePromise =
      (async function () {


        balanceError =
          '';


        try {


          const data =
            await rpc(
              'bb_sales_direct_stock_balances'
            );


          if (
            !data?.success
          ) {

            throw new Error(
              'Could not load Direct Sale warehouse stock.'
            );

          }


          balanceMap.clear();


          const rows =
            Array.isArray(
              data.balances
            )
              ?
              data.balances
              :
              [];


          rows.forEach(
            item => {


              const code =
                clean(
                  item.productCode
                );


              if (!code) {

                return;

              }


              balanceMap.set(

                code,

                {

                  productCode:
                    code,

                  productName:
                    clean(
                      item.productName
                    ),

                  unit:
                    clean(
                      item.unit
                    ),

                  purchasedAvailable:
                    num(
                      item.purchasedAvailable
                    ),

                  zeroCostAvailable:
                    num(
                      item.zeroCostAvailable
                    ),

                  totalAvailable:
                    num(
                      item.totalAvailable
                    )

                }

              );


            }
          );


          balanceLoaded =
            true;


          refreshAllRows();


          refreshQtyPromptMessage();


          return data;


        } catch (error) {


          balanceLoaded =
            false;


          balanceError =

            error?.message
            ||
            String(error);


          refreshAllRows();


          refreshQtyPromptMessage();


          throw error;


        }


      })();


    try {

      return await balancePromise;

    } finally {

      balancePromise =
        null;

    }

  }



  /* ============================================================
     STYLES
     ============================================================ */

  function installStyles() {

    if (
      document.getElementById(
        'bbDirectSaleSourceStyle'
      )
    ) {

      return;

    }


    const style =
      document.createElement(
        'style'
      );


    style.id =
      'bbDirectSaleSourceStyle';


    style.textContent = `

      .bb-direct-source-panel{

        grid-column:1 / -1;

        margin-top:5px;

        padding:9px 10px;

        border:1px solid #d8e5f3;

        border-radius:8px;

        background:#f7fbff;

      }


      .bb-ds-title-row{

        display:flex;

        align-items:center;

        justify-content:space-between;

        gap:8px;

        margin-bottom:7px;

      }


      .bb-ds-title{

        color:#174a91;

        font-size:10px;

        font-weight:900;

        text-transform:uppercase;

        letter-spacing:.2px;

      }


      .bb-ds-refresh{

        border:1px solid #c7d9ec;

        border-radius:6px;

        background:#fff;

        color:#174a91;

        min-width:30px;

        min-height:26px;

        padding:2px 7px;

        cursor:pointer;

        font-weight:900;

      }


      .bb-ds-refresh:disabled{

        opacity:.55;

        cursor:wait;

      }


      .bb-ds-balances{

        display:grid;

        grid-template-columns:
          repeat(3,minmax(0,1fr));

        gap:6px;

        margin-bottom:8px;

      }


      .bb-ds-balance{

        border:1px solid #e1e9f2;

        border-radius:7px;

        background:#fff;

        padding:6px 8px;

      }


      .bb-ds-balance span{

        display:block;

        color:#718096;

        font-size:8px;

        font-weight:800;

        text-transform:uppercase;

      }


      .bb-ds-balance strong{

        display:block;

        margin-top:2px;

        color:#173b70;

        font-size:13px;

        font-weight:900;

      }


      .bb-ds-balance.zero strong{

        color:#7546ad;

      }


      .bb-ds-balance.total strong{

        color:#168158;

      }


      .bb-ds-controls{

        display:grid;

        grid-template-columns:
          minmax(150px,1.3fr)
          minmax(90px,.8fr)
          minmax(90px,.8fr);

        gap:7px;

        align-items:end;

      }


      .bb-ds-field label{

        display:block;

        margin:0 0 3px;

        color:#60758b;

        font-size:8px;

        font-weight:900;

        text-transform:uppercase;

      }


      .bb-ds-field select,
      .bb-ds-field input{

        width:100% !important;

        min-width:0 !important;

        height:32px;

        min-height:32px;

        padding:5px 7px !important;

        border:1px solid #c9d8e8 !important;

        border-radius:7px !important;

        background:#fff;

        color:#17324f;

        font-size:11px !important;

      }


      .bb-ds-field input[readonly]{

        background:#edf3f8;

        color:#5c7085;

      }


      .bb-ds-message{

        min-height:14px;

        margin-top:6px;

        color:#587089;

        font-size:9px;

        font-weight:700;

      }


      .bb-ds-message.ok{

        color:#168158;

      }


      .bb-ds-message.warn{

        color:#a15c00;

      }


      .bb-ds-message.error{

        color:#b42318;

      }


      .bb-ds-mixed-note{

        display:none;

        margin-top:5px;

        color:#6c4aa1;

        font-size:8px;

        font-weight:700;

      }


      .bb-direct-source-panel.is-mixed
      .bb-ds-mixed-note{

        display:block;

      }


      @media(max-width:760px){

        .bb-ds-controls{

          grid-template-columns:
            1fr 1fr;

        }


        .bb-ds-controls
        .bb-ds-source-field{

          grid-column:1 / -1;

        }

      }


      @media(max-width:480px){

        .bb-ds-balances{

          grid-template-columns:
            repeat(3,minmax(0,1fr));

        }


        .bb-ds-controls{

          grid-template-columns:
            1fr 1fr;

        }

      }


      @media print{

        .bb-direct-source-panel{

          display:none !important;

        }

      }

    `;


    document.head.appendChild(
      style
    );

  }



  /* ============================================================
     CREATE / UPDATE SOURCE PANEL
     ============================================================ */

  function ensurePanel(row) {

    if (
      !row
      ||
      !rowIsExact(row)
    ) {

      return null;

    }


    let panel =
      row.querySelector(
        '.bb-direct-source-panel'
      );


    if (!panel) {


      panel =
        document.createElement(
          'div'
        );


      panel.className =
        'bb-direct-source-panel no-print';


      panel.innerHTML = `

        <div class="bb-ds-title-row">

          <div class="bb-ds-title">
            Warehouse Stock Source
          </div>

          <button
            type="button"
            class="bb-ds-refresh"
            title="Refresh live warehouse stock"
          >
            ↻
          </button>

        </div>


        <div class="bb-ds-balances">

          <div class="bb-ds-balance">

            <span>
              Purchased
            </span>

            <strong class="bb-ds-purchased-available">
              -
            </strong>

          </div>


          <div class="bb-ds-balance zero">

            <span>
              Zero-Cost
            </span>

            <strong class="bb-ds-zero-available">
              -
            </strong>

          </div>


          <div class="bb-ds-balance total">

            <span>
              Total
            </span>

            <strong class="bb-ds-total-available">
              -
            </strong>

          </div>

        </div>


        <div class="bb-ds-controls">


          <div class="bb-ds-field bb-ds-source-field">

            <label>
              Stock Source
            </label>

            <select class="bb-ds-source">

              <option value="PURCHASED">
                Purchased
              </option>

              <option value="ZERO_COST">
                Zero-Cost
              </option>

              <option value="MIXED">
                Mixed
              </option>

            </select>

          </div>


          <div class="bb-ds-field">

            <label>
              Purchased Qty
            </label>

            <input
              class="bb-ds-purchased-qty"
              type="number"
              min="0"
              step="any"
              value="0"
              inputmode="decimal"
            >

          </div>


          <div class="bb-ds-field">

            <label>
              Zero-Cost Qty
            </label>

            <input
              class="bb-ds-zero-qty"
              type="number"
              min="0"
              step="any"
              value="0"
              inputmode="decimal"
            >

          </div>


        </div>


        <div class="bb-ds-mixed-note">
          Mixed: enter the Purchased Qty and Zero-Cost Qty separately. Invoice Qty = both sources combined.
        </div>


        <div class="bb-ds-message">
          Loading live warehouse stock...
        </div>

      `;


      row.appendChild(
        panel
      );


      installPanelEvents(
        row,
        panel
      );


      const qtyInput =
        rowQtyInput(
          row
        );


      if (qtyInput) {

        qtyInput.addEventListener(

          'input',

          function () {

            syncSourceControls(
              row,
              false
            );

          }

        );

      }


    }


    renderPanel(
      row
    );


    return panel;

  }



  function installPanelEvents(
    row,
    panel
  ) {

    const source =
      panel.querySelector(
        '.bb-ds-source'
      );


    const purchasedQty =
      panel.querySelector(
        '.bb-ds-purchased-qty'
      );


    const zeroQty =
      panel.querySelector(
        '.bb-ds-zero-qty'
      );


    const refreshButton =
      panel.querySelector(
        '.bb-ds-refresh'
      );



    source?.addEventListener(

      'change',

      function () {


        const oldSource =
          panel.dataset.source
          ||
          'PURCHASED';


        const newSource =
          clean(
            source.value
          )
          .toUpperCase();


        const invoiceQty =
          num(
            rowQtyInput(row)?.value
          );


        panel.dataset.userSelected =
          '1';


        if (
          newSource
          ===
          'MIXED'
        ) {


          if (
            oldSource
            ===
            'ZERO_COST'
          ) {

            purchasedQty.value =
              '0';

            zeroQty.value =
              String(
                invoiceQty
              );

          } else {

            purchasedQty.value =
              String(
                invoiceQty
              );

            zeroQty.value =
              '0';

          }

        }


        panel.dataset.source =
          newSource;


        syncSourceControls(
          row,
          false
        );


        safeCalculate();

      }

    );



    function handleMixedInput() {

      if (
        clean(
          source?.value
        )
        !==
        'MIXED'
      ) {

        return;

      }


      const p =
        Math.max(
          0,
          num(
            purchasedQty?.value
          )
        );


      const z =
        Math.max(
          0,
          num(
            zeroQty?.value
          )
        );


      const qtyInput =
        rowQtyInput(
          row
        );


      if (qtyInput) {

        qtyInput.value =
          String(
            p + z
          );

      }


      updateRowMessage(
        row
      );


      safeCalculate();

    }



    purchasedQty?.addEventListener(
      'input',
      handleMixedInput
    );


    zeroQty?.addEventListener(
      'input',
      handleMixedInput
    );



    refreshButton?.addEventListener(

      'click',

      async function () {


        refreshButton.disabled =
          true;


        try {

          await loadBalances();

        } catch (_) {

          /* UI already shows error */

        } finally {

          refreshButton.disabled =
            false;

        }

      }

    );

  }



  function renderPanel(row) {

    const panel =
      row.querySelector(
        '.bb-direct-source-panel'
      );


    if (!panel) {

      return;

    }


    if (
      !isDirectSale()
    ) {

      panel.style.display =
        'none';


      const qtyInput =
        rowQtyInput(
          row
        );


      if (qtyInput) {

        qtyInput.readOnly =
          false;

      }


      return;

    }


    panel.style.display =
      '';


    const code =
      rowProductCode(
        row
      );


    const balance =
      getBalance(
        code
      );


    panel
      .querySelector(
        '.bb-ds-purchased-available'
      )
      .textContent =

        balanceLoaded
          ?
          formatQty(
            balance.purchasedAvailable
          )
          :
          '-';


    panel
      .querySelector(
        '.bb-ds-zero-available'
      )
      .textContent =

        balanceLoaded
          ?
          formatQty(
            balance.zeroCostAvailable
          )
          :
          '-';


    panel
      .querySelector(
        '.bb-ds-total-available'
      )
      .textContent =

        balanceLoaded
          ?
          formatQty(
            balance.totalAvailable
          )
          :
          '-';



    const source =
      panel.querySelector(
        '.bb-ds-source'
      );


    const purchasedOption =
      source?.querySelector(
        'option[value="PURCHASED"]'
      );


    const zeroOption =
      source?.querySelector(
        'option[value="ZERO_COST"]'
      );


    const mixedOption =
      source?.querySelector(
        'option[value="MIXED"]'
      );


    if (purchasedOption) {

      purchasedOption.textContent =

        'Purchased — '
        +
        (
          balanceLoaded
            ?
            formatQty(
              balance.purchasedAvailable
            )
            :
            '...'
        )
        +
        ' available';

    }


    if (zeroOption) {

      zeroOption.textContent =

        'Zero-Cost — '
        +
        (
          balanceLoaded
            ?
            formatQty(
              balance.zeroCostAvailable
            )
            :
            '...'
        )
        +
        ' available';

    }


    if (mixedOption) {

      mixedOption.textContent =
        'Mixed — use both sources';

    }



    if (
      !panel.dataset.source
    ) {


      let defaultSource =
        'PURCHASED';


      if (
        balanceLoaded
        &&
        balance.purchasedAvailable
        <=
        EPS
        &&
        balance.zeroCostAvailable
        >
        EPS
      ) {

        defaultSource =
          'ZERO_COST';

      }


      panel.dataset.source =
        defaultSource;


      if (source) {

        source.value =
          defaultSource;

      }

    }



    if (
      balanceLoaded
      &&
      panel.dataset.userSelected
      !==
      '1'
    ) {


      if (
        balance.purchasedAvailable
        <=
        EPS
        &&
        balance.zeroCostAvailable
        >
        EPS
      ) {

        panel.dataset.source =
          'ZERO_COST';


        if (source) {

          source.value =
            'ZERO_COST';

        }

      }

    }



    syncSourceControls(
      row,
      false
    );

  }



  function syncSourceControls(
    row,
    initializeMixed
  ) {

    const panel =
      row.querySelector(
        '.bb-direct-source-panel'
      );


    if (!panel) {

      return;

    }


    const source =
      panel.querySelector(
        '.bb-ds-source'
      );


    const pInput =
      panel.querySelector(
        '.bb-ds-purchased-qty'
      );


    const zInput =
      panel.querySelector(
        '.bb-ds-zero-qty'
      );


    const qtyInput =
      rowQtyInput(
        row
      );


    if (
      !source
      ||
      !pInput
      ||
      !zInput
      ||
      !qtyInput
    ) {

      return;

    }


    const selectedSource =
      clean(
        source.value
      )
      .toUpperCase()
      ||
      'PURCHASED';


    panel.dataset.source =
      selectedSource;


    const invoiceQty =
      Math.max(
        0,
        num(
          qtyInput.value
        )
      );



    panel.classList.toggle(

      'is-mixed',

      selectedSource
      ===
      'MIXED'

    );



    if (
      selectedSource
      ===
      'PURCHASED'
    ) {


      qtyInput.readOnly =
        false;


      pInput.readOnly =
        true;


      zInput.readOnly =
        true;


      pInput.value =
        String(
          invoiceQty
        );


      zInput.value =
        '0';



    } else if (
      selectedSource
      ===
      'ZERO_COST'
    ) {


      qtyInput.readOnly =
        false;


      pInput.readOnly =
        true;


      zInput.readOnly =
        true;


      pInput.value =
        '0';


      zInput.value =
        String(
          invoiceQty
        );



    } else {


      qtyInput.readOnly =
        true;


      pInput.readOnly =
        false;


      zInput.readOnly =
        false;


      if (
        initializeMixed
      ) {

        pInput.value =
          String(
            invoiceQty
          );


        zInput.value =
          '0';

      }


      qtyInput.value =
        String(

          Math.max(
            0,
            num(
              pInput.value
            )
          )

          +

          Math.max(
            0,
            num(
              zInput.value
            )
          )

        );


    }


    updateRowMessage(
      row
    );

  }



  /* ============================================================
     ROW MESSAGE / VALIDATION DISPLAY
     ============================================================ */

  function allocationsForRow(row) {

    const panel =
      row.querySelector(
        '.bb-direct-source-panel'
      );


    if (!panel) {

      return [];

    }


    const source =
      clean(
        panel
          .querySelector(
            '.bb-ds-source'
          )
          ?.value
      )
      .toUpperCase();


    const invoiceQty =
      Math.max(
        0,
        num(
          rowQtyInput(row)?.value
        )
      );


    if (
      source
      ===
      'PURCHASED'
    ) {

      return invoiceQty > EPS

        ? [
            {
              source:
                'PURCHASED',

              qty:
                invoiceQty
            }
          ]

        : [];

    }



    if (
      source
      ===
      'ZERO_COST'
    ) {

      return invoiceQty > EPS

        ? [
            {
              source:
                'ZERO_COST',

              qty:
                invoiceQty
            }
          ]

        : [];

    }



    const purchasedQty =
      Math.max(
        0,
        num(
          panel
            .querySelector(
              '.bb-ds-purchased-qty'
            )
            ?.value
        )
      );


    const zeroQty =
      Math.max(
        0,
        num(
          panel
            .querySelector(
              '.bb-ds-zero-qty'
            )
            ?.value
        )
      );


    const allocations =
      [];


    if (
      purchasedQty
      >
      EPS
    ) {

      allocations.push({

        source:
          'PURCHASED',

        qty:
          purchasedQty

      });

    }


    if (
      zeroQty
      >
      EPS
    ) {

      allocations.push({

        source:
          'ZERO_COST',

        qty:
          zeroQty

      });

    }


    return allocations;

  }



  function updateRowMessage(row) {

    const panel =
      row.querySelector(
        '.bb-direct-source-panel'
      );


    if (!panel) {

      return;

    }


    const message =
      panel.querySelector(
        '.bb-ds-message'
      );


    if (!message) {

      return;

    }


    message.className =
      'bb-ds-message';


    if (
      balanceError
    ) {

      message.textContent =

        'Could not load live stock: '
        +
        balanceError;


      message.classList.add(
        'error'
      );


      return;

    }


    if (
      !balanceLoaded
    ) {

      message.textContent =
        'Loading live warehouse stock...';


      return;

    }


    const code =
      rowProductCode(
        row
      );


    const balance =
      getBalance(
        code
      );


    const panelSource =
      clean(
        panel
          .querySelector(
            '.bb-ds-source'
          )
          ?.value
      )
      .toUpperCase();


    const allocations =
      allocationsForRow(
        row
      );


    const purchasedQty =
      allocations

        .filter(
          item =>
            item.source
            ===
            'PURCHASED'
        )

        .reduce(
          (
            total,
            item
          ) =>
            total
            +
            num(
              item.qty
            ),
          0
        );


    const zeroQty =
      allocations

        .filter(
          item =>
            item.source
            ===
            'ZERO_COST'
        )

        .reduce(
          (
            total,
            item
          ) =>
            total
            +
            num(
              item.qty
            ),
          0
        );



    if (
      panelSource
      ===
      'MIXED'
      &&
      (
        purchasedQty
        <=
        EPS
        ||
        zeroQty
        <=
        EPS
      )
    ) {

      message.textContent =
        'Mixed requires both Purchased Qty and Zero-Cost Qty.';


      message.classList.add(
        'warn'
      );


      return;

    }



    if (
      purchasedQty
      >
      balance.purchasedAvailable
      +
      EPS
    ) {

      message.textContent =

        'Purchased Qty exceeds live Purchased stock.';


      message.classList.add(
        'error'
      );


      return;

    }



    if (
      zeroQty
      >
      balance.zeroCostAvailable
      +
      EPS
    ) {

      message.textContent =

        'Zero-Cost Qty exceeds live Zero-Cost stock.';


      message.classList.add(
        'error'
      );


      return;

    }



    const pieces =
      [];


    if (
      purchasedQty
      >
      EPS
    ) {

      pieces.push(

        'Purchased after sale: '
        +
        formatQty(

          Math.max(

            0,

            balance.purchasedAvailable
            -
            purchasedQty

          )

        )

      );

    }


    if (
      zeroQty
      >
      EPS
    ) {

      pieces.push(

        'Zero-Cost after sale: '
        +
        formatQty(

          Math.max(

            0,

            balance.zeroCostAvailable
            -
            zeroQty

          )

        )

      );

    }


    if (
      !pieces.length
    ) {

      message.textContent =
        'Enter invoice quantity.';


      return;

    }


    message.textContent =
      pieces.join(
        ' · '
      );


    message.classList.add(
      'ok'
    );

  }



  /* ============================================================
     REFRESH ALL PRODUCT ROWS
     ============================================================ */

  function refreshAllRows() {

    productRows()
      .forEach(
        row => {


          if (
            !rowIsExact(
              row
            )
          ) {

            return;

          }


          if (
            isDirectSale()
          ) {

            ensurePanel(
              row
            );

          } else {


            const panel =
              row.querySelector(
                '.bb-direct-source-panel'
              );


            if (panel) {

              panel.style.display =
                'none';

            }


            const qtyInput =
              rowQtyInput(
                row
              );


            if (qtyInput) {

              qtyInput.readOnly =
                false;

            }

          }


        }
      );

  }



  /* ============================================================
     QUANTITY MODAL
     Show warehouse source availability before item is added.
     ============================================================ */

  function refreshQtyPromptMessage() {

    if (
      !currentPromptProduct
      ||
      !isDirectSale()
    ) {

      return;

    }


    const message =
      document.getElementById(
        'invoiceQtyMessage'
      );


    if (!message) {

      return;

    }


    if (
      balanceError
    ) {

      message.textContent =

        'Could not load warehouse stock: '
        +
        balanceError;


      message.style.color =
        '#b42318';


      return;

    }


    if (
      !balanceLoaded
    ) {

      message.textContent =
        'Loading Purchased / Zero-Cost warehouse stock...';


      message.style.color =
        '#718096';


      return;

    }


    const balance =
      getBalance(
        currentPromptProduct.code
      );


    message.textContent =

      'Warehouse: Purchased '
      +
      formatQty(
        balance.purchasedAvailable
      )

      +
      ' · Zero-Cost '
      +
      formatQty(
        balance.zeroCostAvailable
      )

      +
      ' · Total '
      +
      formatQty(
        balance.totalAvailable
      )

      +
      '. Choose Stock Source after adding the item.';


    message.style.color =

      balance.totalAvailable
      >
      EPS

        ?
        '#2f855a'

        :
        '#b42318';

  }



  /* ============================================================
     PAYLOAD
     ============================================================ */

  function findRowByLineId(
    lineId
  ) {

    const wanted =
      clean(
        lineId
      );


    return productRows()
      .find(
        row =>
          clean(
            row.dataset.lineId
          )
          ===
          wanted
      )
      ||
      null;

  }



  function applySourceAllocations(
    payload
  ) {

    if (
      !payload
      ||
      !isDirectSale()
      ||
      !Array.isArray(
        payload.items
      )
    ) {

      return payload;

    }


    payload.items.forEach(
      item => {


        if (
          clean(
            item.entryType
            ||
            'EXACT'
          )
          .toUpperCase()
          !==
          'EXACT'
        ) {

          return;

        }


        const row =
          findRowByLineId(
            item.lineId
          );


        if (!row) {

          return;

        }


        const panel =
          row.querySelector(
            '.bb-direct-source-panel'
          );


        if (!panel) {

          return;

        }


        item.stockAllocations =

          allocationsForRow(
            row
          );

      }
    );


    return payload;

  }



  /* ============================================================
     FINAL CLIENT-SIDE VALIDATION

     Backend will validate again with live stock inside
     the atomic invoice transaction.
     ============================================================ */

  function validateDirectSale() {

    if (
      !isDirectSale()
    ) {

      return {
        ok: true
      };

    }


    if (
      !balanceLoaded
    ) {

      return {

        ok:
          false,

        message:

          balanceError
            ?
            (
              'Could not load live Direct Sale stock.\n\n'
              +
              balanceError
            )
            :
            'Direct Sale stock is still loading. Please try again.'

      };

    }


    const requested =
      new Map();


    const names =
      new Map();



    for (
      const row
      of productRows()
    ) {


      if (
        !rowIsExact(
          row
        )
      ) {

        continue;

      }


      const invoiceQty =
        Math.max(
          0,
          num(
            rowQtyInput(row)?.value
          )
        );


      if (
        invoiceQty
        <=
        EPS
      ) {

        continue;

      }


      const code =
        rowProductCode(
          row
        );


      if (!code) {

        return {

          ok:
            false,

          row,

          message:
            'A Direct Sale product has no Product Code.'

        };

      }


      const panel =
        row.querySelector(
          '.bb-direct-source-panel'
        );


      if (!panel) {

        return {

          ok:
            false,

          row,

          message:

            'Stock Source selector is not ready for '
            +
            rowProductName(row)
            +
            '. Please refresh the Invoice Generator.'

        };

      }


      const source =
        clean(
          panel
            .querySelector(
              '.bb-ds-source'
            )
            ?.value
        )
        .toUpperCase();


      const allocations =
        allocationsForRow(
          row
        );


      const allocationTotal =
        allocations.reduce(
          (
            total,
            item
          ) =>
            total
            +
            num(
              item.qty
            ),
          0
        );


      if (
        source
        ===
        'MIXED'
      ) {


        const purchasedQty =
          allocations
            .filter(
              x =>
                x.source
                ===
                'PURCHASED'
            )
            .reduce(
              (
                t,
                x
              ) =>
                t
                +
                num(
                  x.qty
                ),
              0
            );


        const zeroQty =
          allocations
            .filter(
              x =>
                x.source
                ===
                'ZERO_COST'
            )
            .reduce(
              (
                t,
                x
              ) =>
                t
                +
                num(
                  x.qty
                ),
              0
            );


        if (
          purchasedQty
          <=
          EPS
          ||
          zeroQty
          <=
          EPS
        ) {

          return {

            ok:
              false,

            row,

            message:

              rowProductName(row)
              +
              ': Mixed Source requires both Purchased Qty and Zero-Cost Qty.'

          };

        }

      }



      if (
        Math.abs(
          allocationTotal
          -
          invoiceQty
        )
        >
        EPS
      ) {

        return {

          ok:
            false,

          row,

          message:

            rowProductName(row)
            +
            ': Stock Source Qty does not match Invoice Qty.'

        };

      }



      if (
        !requested.has(
          code
        )
      ) {

        requested.set(

          code,

          {

            purchased:
              0,

            zero:
              0

          }

        );


        names.set(
          code,
          rowProductName(row)
        );

      }


      const total =
        requested.get(
          code
        );


      allocations.forEach(
        item => {


          if (
            item.source
            ===
            'PURCHASED'
          ) {

            total.purchased +=
              num(
                item.qty
              );

          }


          if (
            item.source
            ===
            'ZERO_COST'
          ) {

            total.zero +=
              num(
                item.qty
              );

          }


        }
      );


    }



    for (
      const [
        code,
        qty
      ]
      of requested
    ) {


      const available =
        getBalance(
          code
        );


      if (
        qty.purchased
        >
        available.purchasedAvailable
        +
        EPS
      ) {

        return {

          ok:
            false,

          message:

            names.get(code)
            +
            ': Purchased Qty '
            +
            formatQty(
              qty.purchased
            )
            +
            ' exceeds Purchased Warehouse Stock '
            +
            formatQty(
              available.purchasedAvailable
            )
            +
            '.'

        };

      }


      if (
        qty.zero
        >
        available.zeroCostAvailable
        +
        EPS
      ) {

        return {

          ok:
            false,

          message:

            names.get(code)
            +
            ': Zero-Cost Qty '
            +
            formatQty(
              qty.zero
            )
            +
            ' exceeds Zero-Cost Warehouse Stock '
            +
            formatQty(
              available.zeroCostAvailable
            )
            +
            '.'

        };

      }


    }


    return {
      ok: true
    };

  }



  /* ============================================================
     INSTALL FUNCTION WRAPPERS
     ============================================================ */

  function installFunctionPatches() {


    /* ----------------------------------------------------------
       PRODUCT CREATION
       ---------------------------------------------------------- */

    const oldCreateProduct =
      window.createProduct;


    if (
      typeof oldCreateProduct
      ===
      'function'
    ) {


      window.createProduct =
        function () {


          const result =
            oldCreateProduct.apply(
              this,
              arguments
            );


          const lineId =
            clean(
              arguments[2]
            );


          let row =
            lineId
              ?
              findRowByLineId(
                lineId
              )
              :
              null;


          if (!row) {

            row =
              document.querySelector(
                '#productList .product:last-child'
              );

          }


          if (
            row
            &&
            isDirectSale()
          ) {

            ensurePanel(
              row
            );

          }


          return result;

        };

    }



    /* ----------------------------------------------------------
       QUANTITY PROMPT
       ---------------------------------------------------------- */

    const oldOpenQty =
      window.openInvoiceQtyPrompt;


    if (
      typeof oldOpenQty
      ===
      'function'
    ) {


      window.openInvoiceQtyPrompt =
        function (
          product,
          effectiveUsdPrice
        ) {


          currentPromptProduct =
            product
            ||
            null;


          const result =
            oldOpenQty.apply(
              this,
              arguments
            );


          setTimeout(
            refreshQtyPromptMessage,
            0
          );


          return result;

        };

    }



    /* ----------------------------------------------------------
       BATCH CHANGE
       ---------------------------------------------------------- */

    const oldBatchChange =
      window.handleSimpleBatchChange;


    if (
      typeof oldBatchChange
      ===
      'function'
    ) {


      window.handleSimpleBatchChange =
        function () {


          const result =
            oldBatchChange.apply(
              this,
              arguments
            );


          setTimeout(
            refreshAllRows,
            0
          );


          return result;

        };

    }



    /* ----------------------------------------------------------
       PAYLOAD
       Adapter already wrapped this before this file loads.
       ---------------------------------------------------------- */

    const oldBuildPayload =
      window.buildSalesInvoicePayload;


    if (
      typeof oldBuildPayload
      ===
      'function'
    ) {


      window.buildSalesInvoicePayload =
        function () {


          const payload =
            oldBuildPayload.apply(
              this,
              arguments
            );


          return applySourceAllocations(
            payload
          );

        };

    }



    /* ----------------------------------------------------------
       COMPLETE INVOICE

       Refresh stock immediately before validation.
       Supabase trigger validates again inside save transaction.
       ---------------------------------------------------------- */

    const oldComplete =
      window.completeInvoice;


    if (
      typeof oldComplete
      ===
      'function'
    ) {


      window.completeInvoice =
        async function (
          event
        ) {


          if (
            !isDirectSale()
          ) {

            return oldComplete.apply(
              this,
              arguments
            );

          }


          if (event) {

            event.preventDefault();

            event.stopPropagation();

          }


          if (
            window.bbInvoiceSaving
          ) {

            return;

          }


          try {

            await loadBalances();

          } catch (error) {

            alert(

              'Could not load live Direct Sale stock.\n\n'
              +
              (
                error?.message
                ||
                String(error)
              )

            );

            return;

          }


          refreshAllRows();


          const validation =
            validateDirectSale();


          if (
            !validation.ok
          ) {

            alert(
              validation.message
            );


            if (
              validation.row
            ) {

              validation.row
                .scrollIntoView({

                  behavior:
                    'smooth',

                  block:
                    'center'

                });

            }


            return;

          }


          /*
           * Pass null because event.currentTarget may be unavailable
           * after awaiting the live stock refresh.
           *
           * Original Complete Invoice already finds .complete-btn.
           */

          return oldComplete.call(
            this,
            null
          );

        };

    }



    /* ----------------------------------------------------------
       CLEAR AFTER SUCCESS
       Refresh Warehouse balances for next Invoice.
       ---------------------------------------------------------- */

    const oldClear =
      window.clearAllAfterSuccessfulSave;


    if (
      typeof oldClear
      ===
      'function'
    ) {


      window.clearAllAfterSuccessfulSave =
        function () {


          const result =
            oldClear.apply(
              this,
              arguments
            );


          setTimeout(

            function () {

              loadBalances()
                .catch(
                  () => {}
                );

            },

            100

          );


          return result;

        };

    }


  }



  /* ============================================================
     QTY MODAL PRE-CHECK

     Direct Sale Qty cannot exceed combined Warehouse stock.
     Source-specific validation happens after item is added.
     ============================================================ */

  function installQtyFormGuard() {

    const form =
      document.getElementById(
        'invoiceQtyForm'
      );


    if (!form) {

      return;

    }


    form.addEventListener(

      'submit',

      function (
        event
      ) {


        if (
          !isDirectSale()
        ) {

          return;

        }


        const message =
          document.getElementById(
            'invoiceQtyMessage'
          );


        const qty =
          num(
            document
              .getElementById(
                'invoiceQtyInput'
              )
              ?.value
          );


        if (
          !balanceLoaded
        ) {

          event.preventDefault();

          event.stopImmediatePropagation();


          if (message) {

            message.textContent =

              balanceError
                ?
                (
                  'Could not load warehouse stock: '
                  +
                  balanceError
                )
                :
                'Warehouse stock is still loading...';


            message.style.color =
              '#b42318';

          }


          loadBalances()
            .catch(
              () => {}
            );


          return;

        }


        const code =
          clean(
            currentPromptProduct?.code
          );


        const balance =
          getBalance(
            code
          );


        if (
          qty
          >
          balance.totalAvailable
          +
          EPS
        ) {

          event.preventDefault();

          event.stopImmediatePropagation();


          if (message) {

            message.textContent =

              'Only '
              +
              formatQty(
                balance.totalAvailable
              )
              +
              ' total Warehouse stock available'
              +
              ' (Purchased '
              +
              formatQty(
                balance.purchasedAvailable
              )
              +
              ' + Zero-Cost '
              +
              formatQty(
                balance.zeroCostAvailable
              )
              +
              ').';


            message.style.color =
              '#b42318';

          }


          return;

        }


      },

      true

    );

  }



  /* ============================================================
     MUTATION OBSERVER
     Backup protection if another patch creates product rows.
     ============================================================ */

  function installProductObserver() {

    const list =
      document.getElementById(
        'productList'
      );


    if (!list) {

      return;

    }


    const observer =
      new MutationObserver(

        function () {

          refreshAllRows();

        }

      );


    observer.observe(

      list,

      {
        childList:
          true
      }

    );

  }



  /* ============================================================
     START
     ============================================================ */

  function start() {

    installStyles();

    installFunctionPatches();

    installQtyFormGuard();

    installProductObserver();

    refreshAllRows();


    loadBalances()
      .catch(
        error => {

          console.error(
            'BIG BROTHER Direct Sale Source:',
            error
          );

        }
      );

  }



  window.BBDirectSaleSourceV1 = {

    refresh:
      loadBalances,

    balances:
      () =>
        Array.from(
          balanceMap.values()
        ),

    validate:
      validateDirectSale

  };



  if (
    document.readyState
    ===
    'loading'
  ) {

    document.addEventListener(
      'DOMContentLoaded',
      start,
      {
        once: true
      }
    );

  } else {

    start();

  }


})();
