/* BIG BROTHER — Invoice Generator Dual Currency Patch V1
 * Text-patches the preserved legacy UI BEFORE it is executed.
 * Supabase remains the source of truth for Default USD/KHR and Customer USD/KHR.
 */
(function(){
  'use strict';

  function replaceBetween(text,startMarker,endMarker,replacement,label){
    const start=text.indexOf(startMarker);
    if(start<0)throw new Error('Dual currency patch missing '+label+' start marker.');
    const end=text.indexOf(endMarker,start+startMarker.length);
    if(end<0)throw new Error('Dual currency patch missing '+label+' end marker.');
    return text.slice(0,start)+replacement+'\n\n'+text.slice(end);
  }

  function patchLegacy(html){
    let out=String(html||'');

    /* Keep the KHR master price returned by Supabase. */
    const productUsdLine='        usdPrice:Number(row.priceUSD ?? row.usdPrice)||0,';
    if(!out.includes(productUsdLine))throw new Error('Invoice product USD mapping marker was not found.');
    out=out.replaceAll(
      productUsdLine,
      productUsdLine+'\n        khrPrice:Number(row.priceKHR ?? row.khrPrice)||0,'
    );

    const helpers=`function bbInvoiceDualRow(code) {
  const map = window.BB_INVOICE_DUAL_PRICES || {};
  return map[String(code || "").trim()] || null;
}

function bbInvoiceSingleDisplayPrice(product, currency) {
  if(!product) return 0;

  const row = bbInvoiceDualRow(product.code);
  const usd = Number(row?.priceUSD ?? product.usdPrice) || 0;
  let khr = Number(row?.priceKHR ?? product.khrPrice) || 0;

  /* If KHR has not been configured yet, preserve the old usable fallback. */
  if(currency === "KHR" && !(khr > 0)) {
    khr = usdToSelected(usd, "KHR");
  }

  return currency === "KHR" ? khr : usd;
}

function bbInvoiceDisplayPrice(product, currency) {
  if(!product) return 0;

  if(String(product.entryType || "").toUpperCase() === "GROUP") {
    const members = Array.isArray(product.members) ? product.members : [];
    const values = members.map(member => {
      const master = products.find(p => p.code === String(member.productCode || "").trim());
      return master ? bbInvoiceSingleDisplayPrice(master, currency) : null;
    }).filter(value => value !== null);

    if(!values.length) return 0;
    const first = Number(values[0]) || 0;
    return values.every(value => Math.abs((Number(value)||0)-first) < 0.000001)
      ? first
      : 0;
  }

  return bbInvoiceSingleDisplayPrice(product, currency);
}

function bbInvoiceCanonicalPrice(product) {
  const currency = getCurrency();
  const display = bbInvoiceDisplayPrice(product, currency);
  return currency === "KHR" ? selectedToUsd(display, "KHR") : display;
}

function bbInvoiceSingleIsCustom(product, currency) {
  const row = bbInvoiceDualRow(product?.code);
  if(!row) return false;
  return currency === "KHR" ? row.isCustomPriceKHR === true : row.isCustomPriceUSD === true;
}

function getPriceForProduct(product) {
  return bbInvoiceCanonicalPrice(product);
}`;

    out=replaceBetween(
      out,
      'function getPriceForProduct(product) {',
      'function applyCustomerPricesToProducts() {',
      helpers,
      'getPriceForProduct'
    );

    const applyPrices=`function applyCustomerPricesToProducts() {
  const rows = document.querySelectorAll("#productList .product");
  const currency = getCurrency();

  rows.forEach(row => {
    const code = row.dataset.productCode || "";
    const name = row.dataset.product || "";
    const lineId = row.dataset.lineId || "";
    const item = selectedProducts.find(p => p.id === lineId);
    const product = getInvoiceSearchPool().find(p => p.code === code || p.name === name);

    if(!item || !product || item.manualPrice) return;

    const canonical = getPriceForProduct(product);
    item.usdPrice = canonical;
    row.dataset.usdPrice = canonical;

    const priceInput = row.querySelector(".product-price-input");
    if(priceInput) {
      priceInput.value = usdToSelected(canonical, currency);
      priceInput.step = currency === "KHR" ? "1" : "0.01";
    }
  });

  calculate();
}`;

    out=replaceBetween(
      out,
      'function applyCustomerPricesToProducts() {',
      '/* ==========================================\n   COMPACT CUSTOMER SEARCH DROPDOWN',
      applyPrices,
      'applyCustomerPricesToProducts'
    );

    const special=`function hasSpecialCustomerPrice(product) {
  if(!product) return false;
  const currency = getCurrency();

  if(String(product.entryType || "").toUpperCase() === "GROUP") {
    const members = Array.isArray(product.members) ? product.members : [];
    if(!members.length) return false;

    const prices=[];
    for(const member of members) {
      const master = products.find(p => p.code === String(member.productCode || "").trim());
      if(!master || !bbInvoiceSingleIsCustom(master, currency)) return false;
      prices.push(bbInvoiceSingleDisplayPrice(master, currency));
    }

    const first = Number(prices[0]) || 0;
    return prices.length>0 && prices.every(value => Math.abs((Number(value)||0)-first) < 0.000001);
  }

  return bbInvoiceSingleIsCustom(product, currency);
}`;

    out=replaceBetween(
      out,
      'function hasSpecialCustomerPrice(product) {',
      'function finalizeInvoiceProductAdd(',
      special,
      'hasSpecialCustomerPrice'
    );

    const currencyChange=`function changeCurrency() {
  const currency = getCurrency();
  const rate = getExchangeRate();

  if(currency === "KHR" && rate <= 0) {
    alert("Please enter a valid exchange rate.");
    document.getElementById("currency").value = "USD";
    return;
  }

  document.querySelectorAll("#productList .product").forEach(row => {
    const lineId = row.dataset.lineId || "";
    const item = selectedProducts.find(p => p.id === lineId);
    const product = getInvoiceSearchPool().find(
      p => p.code === (row.dataset.productCode || "") || p.name === (row.dataset.product || "")
    );

    if(item && product && !item.manualPrice) {
      const canonical = getPriceForProduct(product);
      item.usdPrice = canonical;
      row.dataset.usdPrice = canonical;
    }

    const priceInput = row.querySelector(".product-price-input");
    if(priceInput) {
      const canonical = Number(row.dataset.usdPrice) || 0;
      priceInput.value = usdToSelected(canonical, currency);
      priceInput.step = currency === "KHR" ? "1" : "0.01";
    }
  });

  calculate();
}`;

    out=replaceBetween(
      out,
      'function changeCurrency() {',
      'function calculateExchange(finalTotal, currency) {',
      currencyChange,
      'changeCurrency'
    );

    return out;
  }

  function patchAdapter(js){
    let out=String(js||'');

    const clearMarker='    customerPrices = {};\n    customerPriceCustomer = name;';
    if(!out.includes(clearMarker))throw new Error('Invoice adapter customer-price reset marker was not found.');
    out=out.replace(
      clearMarker,
      '    customerPrices = {};\n    window.BB_INVOICE_DUAL_PRICES = {};\n    customerPriceCustomer = name;'
    );

    const mapping=`        const price = Number(row.priceUSD);
        if (code && Number.isFinite(price)) customerPrices[code] = price;`;
    if(!out.includes(mapping))throw new Error('Invoice adapter customer-price mapping marker was not found.');
    out=out.replace(
      mapping,
      `        const price = Number(row.priceUSD);
        const priceKHR = Number(row.priceKHR);
        if (code && Number.isFinite(price)) customerPrices[code] = price;
        if (code) {
          window.BB_INVOICE_DUAL_PRICES = window.BB_INVOICE_DUAL_PRICES || {};
          window.BB_INVOICE_DUAL_PRICES[code] = {
            priceUSD:Number.isFinite(price) ? price : 0,
            priceKHR:Number.isFinite(priceKHR) ? priceKHR : 0,
            defaultPriceUSD:Number(row.defaultPriceUSD) || 0,
            defaultPriceKHR:Number(row.defaultPriceKHR) || 0,
            isCustomPriceUSD:row.isCustomPriceUSD === true,
            isCustomPriceKHR:row.isCustomPriceKHR === true,
            isCustomPrice:row.isCustomPrice === true
          };
        }`
    );

    const countMarker=`        const count = Object.keys(customerPrices).length;
        status.textContent = count
          ? 'Customer selected • ' + count + ' special price' + (count === 1 ? '' : 's') + ' loaded'
          : 'Customer selected • using standard product prices';`;
    if(out.includes(countMarker)) {
      out=out.replace(
        countMarker,
        `        const rows = Object.values(window.BB_INVOICE_DUAL_PRICES || {});
        const currency = typeof getCurrency === 'function' ? getCurrency() : 'USD';
        const count = rows.filter(row => currency === 'KHR' ? row.isCustomPriceKHR : row.isCustomPriceUSD).length;
        status.textContent = count
          ? 'Customer selected • ' + count + ' custom ' + currency + ' price' + (count === 1 ? '' : 's') + ' loaded'
          : 'Customer selected • using default ' + currency + ' product prices';`
      );
    }

    return out;
  }

  window.BBInvoiceDualCurrencyPatch={patchLegacy,patchAdapter};
})();