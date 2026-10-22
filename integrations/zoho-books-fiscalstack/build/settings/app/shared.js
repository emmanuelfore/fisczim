(function (global) {
  "use strict";

  var CONFIG_KEY = "fiscalstack.zoho.config.v1";
  var RECEIPTS_KEY = "fiscalstack.zoho.receipts.v1";
  var DEFAULT_BASE_URL = "https://fiscalstack.co.zw";
  var MAX_RECEIPTS = 100;

  var DEFAULTS = {
    baseUrl: DEFAULT_BASE_URL,
    apiKey: "",
    companyName: "",
    companyTin: "",
    companyVat: "",
    deviceId: "",
    deviceSerial: "",
    environment: "",
    zohoOrgId: "",
    zohoOrgName: "",
    savedAt: null,
    lastTestAt: null
  };

  function parseJson(value, fallback) {
    if (!value) return fallback;
    try {
      return JSON.parse(value);
    } catch (error) {
      return fallback;
    }
  }

  function clone(value) {
    return parseJson(JSON.stringify(value), {});
  }

  function storageGet(key) {
    try {
      return global.localStorage.getItem(key);
    } catch (error) {
      return null;
    }
  }

  function storageSet(key, value) {
    try {
      global.localStorage.setItem(key, value);
      return true;
    } catch (error) {
      return false;
    }
  }

  function storageRemove(key) {
    try {
      global.localStorage.removeItem(key);
    } catch (error) {
      return false;
    }
    return true;
  }

  function normaliseBaseUrl(value) {
    var url = String(value || DEFAULT_BASE_URL).trim();
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;
    return url.replace(/\/+$/, "");
  }

  function getConfig() {
    var stored = parseJson(storageGet(CONFIG_KEY), {});
    return Object.assign({}, DEFAULTS, stored || {});
  }

  function saveConfig(patch) {
    var config = Object.assign({}, getConfig(), patch || {});
    config.baseUrl = normaliseBaseUrl(config.baseUrl);
    config.savedAt = new Date().toISOString();
    storageSet(CONFIG_KEY, JSON.stringify(config));
    return config;
  }

  function clearConfig() {
    storageRemove(CONFIG_KEY);
    storageRemove(RECEIPTS_KEY);
  }

  function hasApiKey(config) {
    config = config || getConfig();
    return Boolean(config.apiKey && String(config.apiKey).trim());
  }

  function apiRequest(path, options, credentials) {
    options = options || {};
    credentials = credentials || getConfig();
    if (!hasApiKey(credentials)) {
      return Promise.reject(new Error("FiscalStack API key is not configured."));
    }

    var url = normaliseBaseUrl(credentials.baseUrl) + path;
    var headers = {
      Accept: "application/json",
      "x-api-key": String(credentials.apiKey).trim()
    };

    if (options.body) headers["Content-Type"] = "application/json";
    if (options.headers) {
      Object.keys(options.headers).forEach(function (key) {
        headers[key] = options.headers[key];
      });
    }

    var init = {
      method: options.method || "GET",
      headers: headers,
      mode: "cors",
      cache: "no-store"
    };

    if (options.body) init.body = JSON.stringify(options.body);

    return global.fetch(url, init).then(function (response) {
      return response.text().then(function (text) {
        var data = null;
        if (text) {
          try {
            data = JSON.parse(text);
          } catch (error) {
            data = { raw: text };
          }
        }

        if (!response.ok) {
          var message = (data && (data.message || data.error)) || "FiscalStack request failed (" + response.status + ")";
          var requestError = new Error(message);
          requestError.status = response.status;
          requestError.data = data;
          throw requestError;
        }

        return data;
      });
    });
  }

  function testConnection(credentials) {
    credentials = credentials || getConfig();
    var result = { device: null, company: null, companyError: null };

    return apiRequest("/api/v1/fiscal/device", {}, credentials).then(function (device) {
      result.device = device;
      return apiRequest("/api/zimra/device-details", {}, credentials)
        .then(function (details) {
          result.company = details;
        })
        .catch(function (error) {
          result.companyError = error;
          if (error.status === 401 || error.status === 403) throw error;
        })
        .then(function () {
          return result;
        });
    });
  }

  function getDeviceStatus(credentials) {
    return apiRequest("/api/v1/fiscal/device", {}, credentials);
  }

  function getDeviceDetails(credentials) {
    return apiRequest("/api/zimra/device-details", {}, credentials);
  }

  function listInvoices(limit, page, credentials) {
    limit = limit || 20;
    page = page || 1;
    return apiRequest(
      "/api/v1/invoices?limit=" + encodeURIComponent(limit) + "&page=" + encodeURIComponent(page),
      {},
      credentials
    );
  }

  function findInvoiceByNumber(invoiceNumber, credentials) {
    var target = String(invoiceNumber || "").trim();
    if (!target) return Promise.resolve(null);

    var page = 1;

    function next() {
      return listInvoices(100, page, credentials).then(function (result) {
        var rows = (result && result.data) || [];
        for (var index = 0; index < rows.length; index += 1) {
          if (String(rows[index].invoiceNumber) === target) return rows[index];
        }
        var pages = Number(result && result.pages) || 1;
        if (page >= pages || page >= 5) return null;
        page += 1;
        return next();
      });
    }

    return next();
  }

  function fiscalize(payload, credentials) {
    return apiRequest("/api/v1/fiscalize", { method: "POST", body: payload }, credentials);
  }

  function companyFromDetails(details) {
    var data = (details && (details.Data || details.data)) || {};
    return {
      name: data.COMPANYNAME || data.companyName || data.CompanyName || "",
      tin: data.TIN || data.tin || "",
      vat: data.VAT || data.vat || "",
      bpNumber: data.BPN || data.bpn || "",
      address: data.ADDRESS || data.address || "",
      deviceId: (details && (details.DeviceID || details.deviceId)) || data.REGISTRATIONNUMBER || "",
      serial: (details && (details.DeviceSerialNumber || details.serialNumber)) || data.SERIALNUMBER || "",
      fiscalDay: (details && (details.FiscalDay || details.fiscalDay)) || ""
    };
  }

  function deviceSummary(device) {
    device = device || {};
    return {
      status: device.status || "unknown",
      deviceId: device.deviceId || "",
      serial: device.serialNumber || "",
      environment: device.environment || "",
      currentDayNo: device.currentDayNo != null ? device.currentDayNo : "",
      lastPingTime: device.lastPingTime || null
    };
  }

  function receiptKey(orgId, invoiceNumber) {
    return String(orgId || "org") + "::" + String(invoiceNumber || "");
  }

  function getReceipts() {
    return parseJson(storageGet(RECEIPTS_KEY), {});
  }

  function getReceipt(orgId, invoiceNumber) {
    var receipts = getReceipts();
    return receipts[receiptKey(orgId, invoiceNumber)] || null;
  }

  function saveReceipt(orgId, invoiceNumber, payload) {
    var receipts = getReceipts();
    var key = receiptKey(orgId, invoiceNumber);
    var record = Object.assign(
      {
        savedAt: new Date().toISOString(),
        orgId: orgId || "",
        invoiceNumber: invoiceNumber || ""
      },
      payload || {}
    );
    receipts[key] = record;

    var keys = Object.keys(receipts);
    if (keys.length > MAX_RECEIPTS) {
      keys.sort(function (left, right) {
        return String(receipts[left].savedAt).localeCompare(String(receipts[right].savedAt));
      });
      keys.slice(0, keys.length - MAX_RECEIPTS).forEach(function (oldKey) {
        delete receipts[oldKey];
      });
    }

    storageSet(RECEIPTS_KEY, JSON.stringify(receipts));
    return record;
  }

  function receiptFromInvoice(invoice) {
    if (!invoice) return null;
    return {
      fiscalCode: invoice.fiscalCode || null,
      qrCode: invoice.qrCodeData || null,
      receiptNumber: invoice.receiptGlobalNo || null,
      status: invoice.status || null,
      receipt: {
        receiptCounter: invoice.receiptCounter != null ? invoice.receiptCounter : null,
        receiptGlobalNo: invoice.receiptGlobalNo != null ? invoice.receiptGlobalNo : null,
        fiscalDayNo: invoice.fiscalDayNo != null ? invoice.fiscalDayNo : null
      }
    };
  }

  function isFiscalised(receipt) {
    if (!receipt) return false;
    return Boolean(
      receipt.fiscalCode ||
        receipt.qrCode ||
        receipt.qrCodeData ||
        (receipt.receipt && receipt.receipt.receiptGlobalNo)
    );
  }

  function invoiceItems(invoice) {
    var items = (invoice && (invoice.line_items || invoice.lineItems)) || [];
    return items.map(function (item) {
      var quantity = Number(item.quantity != null ? item.quantity : item.qty);
      var rate = Number(
        item.rate != null ? item.rate : item.unit_price != null ? item.unit_price : item.price
      );
      return {
        name: item.name || item.description || item.item_name || "Item",
        description: item.description || item.name || "",
        quantity: isFinite(quantity) && quantity > 0 ? quantity : 1,
        unitPrice: isFinite(rate) ? rate : 0,
        taxName: item.tax_name || item.tax_type || "",
        taxPercentage:
          item.tax_percentage != null
            ? Number(item.tax_percentage)
            : item.tax_rate != null
            ? Number(item.tax_rate)
            : null,
        itemTotal: item.item_total != null ? Number(item.item_total) : null
      };
    });
  }

  function inferTaxType(item) {
    var label = String(item.taxName || "").toLowerCase();
    if (label.indexOf("exempt") !== -1) return "EXEMPT";
    if (label.indexOf("zero") !== -1) return "ZERO_RATED";
    if (item.taxPercentage === 0) return "ZERO_RATED";
    return "STANDARD";
  }

  function buildFiscalizePayload(invoice, options) {
    options = options || {};
    var items = invoiceItems(invoice);
    var taxOverride = options.taxType && options.taxType !== "auto" ? options.taxType : null;
    var currency = String(options.currency || invoice.currency_code || invoice.currency || "USD").toUpperCase();
    if (currency !== "USD" && currency !== "ZWG") currency = "USD";

    return {
      items: items.map(function (item) {
        return {
          name: item.name,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          taxType: taxOverride || inferTaxType(item),
          taxInclusive: Boolean(options.taxInclusive)
        };
      }),
      invoiceNumber: invoice.invoice_number || invoice.invoiceNumber || null,
      date: invoice.date || null,
      currency: currency,
      paymentMethod: options.paymentMethod || "CASH",
      transactionType: "FiscalInvoice",
      buyer: invoice.customer_name ? { name: invoice.customer_name } : undefined
    };
  }

  function zohoConfig() {
    var config = global.FISCALSTACK_ZOHO || {};
    return {
      connectionLinkName: String(config.connectionLinkName || "").trim(),
      globalFieldPlaceholder: String(config.globalFieldPlaceholder || "").trim(),
      apiBaseUrl: normaliseBaseUrl(config.apiBaseUrl || DEFAULT_BASE_URL)
    };
  }

  function zohoGlobalFieldAvailable() {
    var config = zohoConfig();
    return Boolean(config.connectionLinkName && config.globalFieldPlaceholder);
  }

  function initZoho() {
    if (!global.ZFAPPS) return Promise.resolve(null);
    return global.ZFAPPS.extension
      .init()
      .then(function () {
        return global.ZFAPPS;
      })
      .catch(function () {
        return global.ZFAPPS;
      });
  }

  function zohoGet(key) {
    if (!global.ZFAPPS) return Promise.resolve(null);
    return global.ZFAPPS
      .get(key)
      .then(function (data) {
        return data;
      })
      .catch(function () {
        return null;
      });
  }

  function getZohoOrg() {
    return zohoGet("organization").then(function (data) {
      var org = (data && data.organization) || data || {};
      return {
        id: org.organization_id || "",
        name: org.org_name || "",
        email: org.org_email || "",
        apiRoot: org.api_root_endpoint || ""
      };
    });
  }

  function getZohoInvoice() {
    return zohoGet("invoice").then(function (data) {
      return (data && data.invoice) || data || null;
    });
  }

  function resize(height) {
    if (!global.ZFAPPS) return;
    try {
      global.ZFAPPS.invoke("RESIZE", { height: height + "px", width: "100%" });
    } catch (error) {
      return;
    }
  }

  function requestZohoOrgVariable(method, payload) {
    var config = zohoConfig();
    if (!zohoGlobalFieldAvailable()) {
      return Promise.reject(new Error("Zoho global field sync is not configured."));
    }

    return getZohoOrg().then(function (org) {
      if (!org.apiRoot || !org.id) {
        throw new Error("Zoho organisation context is unavailable.");
      }

      var options = {
        url: org.apiRoot + "/settings/orgvariables/" + encodeURIComponent(config.globalFieldPlaceholder),
        method: method,
        url_query: [{ key: "organization_id", value: org.id }],
        connection_link_name: config.connectionLinkName
      };

      if (payload) {
        options.body = {
          mode: "formdata",
          formdata: [{ key: "JSONString", value: JSON.stringify(payload) }]
        };
      }

      return global.ZFAPPS.request(options);
    });
  }

  function readZohoConfig() {
    return requestZohoOrgVariable("GET").then(function (response) {
      var body = response && response.data && response.data.body;
      var parsed = parseJson(body, body);
      if (typeof parsed === "string") parsed = parseJson(parsed, {});
      var raw =
        parsed && parsed.orgvariable
          ? parsed.orgvariable.value
          : parsed && parsed.value !== undefined
          ? parsed.value
          : parsed;
      if (typeof raw === "string") raw = parseJson(raw, {});
      return raw && typeof raw === "object" ? raw : null;
    });
  }

  function writeZohoConfig(config) {
    return requestZohoOrgVariable("PUT", { value: config }).then(function () {
      return true;
    });
  }

  function loadConfigWithZoho() {
    var local = getConfig();
    if (!zohoGlobalFieldAvailable()) {
      return Promise.resolve({ config: local, source: "local" });
    }

    return readZohoConfig()
      .then(function (remote) {
        if (!remote) return { config: local, source: "local" };
        var merged = Object.assign({}, local, remote);
        merged.baseUrl = normaliseBaseUrl(merged.baseUrl);
        saveConfig(merged);
        return { config: merged, source: "zoho" };
      })
      .catch(function () {
        return { config: local, source: "local" };
      });
  }

  function saveConfigWithZoho(patch) {
    var config = saveConfig(patch);
    if (!zohoGlobalFieldAvailable()) {
      return Promise.resolve({ config: config, synced: false });
    }

    return writeZohoConfig(config)
      .then(function () {
        return { config: config, synced: true };
      })
      .catch(function () {
        return { config: config, synced: false };
      });
  }

  function clearConfigWithZoho() {
    return writeZohoConfig(DEFAULTS)
      .catch(function () {
        return null;
      })
      .then(function () {
        clearConfig();
      });
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatMoney(amount, currency) {
    var value = Number(amount);
    if (!isFinite(value)) return String(amount == null ? "—" : amount);
    try {
      return new Intl.NumberFormat("en-ZW", {
        style: "currency",
        currency: currency || "USD"
      }).format(value);
    } catch (error) {
      return (currency || "USD") + " " + value.toFixed(2);
    }
  }

  function formatDate(value) {
    if (!value) return "—";
    var date = new Date(value);
    if (isNaN(date.getTime())) return String(value);
    try {
      return new Intl.DateTimeFormat("en-ZW", {
        year: "numeric",
        month: "short",
        day: "2-digit"
      }).format(date);
    } catch (error) {
      return date.toISOString().slice(0, 10);
    }
  }

  function renderQr(container, text) {
    if (!container) return;
    container.innerHTML = "";
    if (!text) {
      container.innerHTML = '<div class="fs-qr-empty">QR data not returned</div>';
      return;
    }

    if (global.qrcode) {
      try {
        var qr = global.qrcode(0, "M");
        qr.addData(String(text));
        qr.make();
        container.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 4, scalable: true });
        return;
      } catch (error) {
        container.innerHTML = "";
      }
    }

    container.innerHTML = '<code class="fs-qr-data">' + escapeHtml(text) + "</code>";
  }

  function copyText(text) {
    if (!text) return Promise.reject(new Error("Nothing to copy."));
    if (global.navigator && global.navigator.clipboard && global.navigator.clipboard.writeText) {
      return global.navigator.clipboard.writeText(String(text));
    }
    var input = global.document.createElement("textarea");
    input.value = String(text);
    input.setAttribute("readonly", "readonly");
    input.style.position = "fixed";
    input.style.opacity = "0";
    global.document.body.appendChild(input);
    input.select();
    var ok = false;
    try {
      ok = global.document.execCommand("copy");
    } catch (error) {
      ok = false;
    }
    global.document.body.removeChild(input);
    return ok ? Promise.resolve() : Promise.reject(new Error("Copy is not supported in this browser."));
  }

  function printReceipt(receipt, context) {
    context = context || {};
    var invoice = context.invoice || {};
    var config = context.config || getConfig();
    var items = invoiceItems(invoice);
    var currency = invoice.currency_code || invoice.currency || config.currency || "USD";
    var receiptBody = receipt && receipt.receipt ? receipt.receipt : {};
    var qrText = receipt && (receipt.qrCode || receipt.qrCodeData) ? receipt.qrCode || receipt.qrCodeData : "";
    var qrHtml = "";

    if (qrText && global.qrcode) {
      try {
        var qr = global.qrcode(0, "M");
        qr.addData(String(qrText));
        qr.make();
        qrHtml = qr.createSvgTag({ cellSize: 4, margin: 4, scalable: true });
      } catch (error) {
        qrHtml = "";
      }
    }

    var rows = items
      .map(function (item) {
        return (
          "<tr><td>" +
          escapeHtml(item.name) +
          "</td><td class=\"num\">" +
          escapeHtml(item.quantity) +
          "</td><td class=\"num\">" +
          escapeHtml(formatMoney(item.unitPrice, currency)) +
          "</td><td class=\"num\">" +
          escapeHtml(formatMoney((item.itemTotal != null ? item.itemTotal : item.quantity * item.unitPrice), currency)) +
          "</td></tr>"
        );
      })
      .join("");

    var html =
      "<!DOCTYPE html><html><head><meta charset=\"utf-8\"><title>Fiscal Receipt " +
      escapeHtml(invoice.invoice_number || "") +
      "</title><style>" +
      "body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:0;padding:24px;}" +
      ".receipt{max-width:620px;margin:0 auto;border:1px solid #d7dce5;border-radius:12px;padding:24px;}" +
      "h1{font-size:18px;margin:0 0 4px;}h2{font-size:14px;margin:24px 0 8px;}" +
      ".muted{color:#5b6472;font-size:12px;}" +
      ".grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 24px;margin-top:16px;font-size:13px;}" +
      ".row{display:flex;justify-content:space-between;gap:16px;border-bottom:1px solid #eef1f5;padding:6px 0;}" +
      ".row span{color:#5b6472;}.row strong,.row code{text-align:right;word-break:break-all;}" +
      "table{width:100%;border-collapse:collapse;font-size:13px;margin-top:8px;}" +
      "th,td{text-align:left;padding:8px 6px;border-bottom:1px solid #eef1f5;}" +
      "th{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#5b6472;}" +
      ".num{text-align:right;}" +
      ".qr{display:flex;gap:16px;align-items:flex-start;margin-top:18px;}" +
      ".qr svg{width:150px;height:150px;border:1px solid #d7dce5;padding:6px;border-radius:8px;background:#fff;}" +
      ".qr-data{font-size:10px;color:#5b6472;word-break:break-all;}" +
      ".total{display:flex;justify-content:space-between;font-size:16px;font-weight:700;margin-top:12px;}" +
      ".foot{margin-top:24px;font-size:11px;color:#5b6472;text-align:center;}" +
      "@media print{body{padding:0}.receipt{border:0;padding:0}}" +
      "</style></head><body><div class=\"receipt\">" +
      "<h1>Fiscal Receipt</h1><div class=\"muted\">" +
      escapeHtml(config.companyName || context.companyName || "FiscalStack registered company") +
      "</div>" +
      "<div class=\"grid\">" +
      "<div class=\"row\"><span>Invoice</span><strong>" +
      escapeHtml(invoice.invoice_number || "—") +
      "</strong></div>" +
      "<div class=\"row\"><span>Invoice date</span><strong>" +
      escapeHtml(formatDate(invoice.date || invoice.date_formatted)) +
      "</strong></div>" +
      "<div class=\"row\"><span>Customer</span><strong>" +
      escapeHtml(invoice.customer_name || "—") +
      "</strong></div>" +
      "<div class=\"row\"><span>Currency</span><strong>" +
      escapeHtml(currency) +
      "</strong></div>" +
      "<div class=\"row\"><span>Receipt number</span><strong>" +
      escapeHtml(receipt.receiptNumber || receiptBody.receiptGlobalNo || "—") +
      "</strong></div>" +
      "<div class=\"row\"><span>Fiscal day</span><strong>" +
      escapeHtml(receiptBody.fiscalDayNo != null ? receiptBody.fiscalDayNo : "—") +
      "</strong></div>" +
      "<div class=\"row\"><span>Receipt counter</span><strong>" +
      escapeHtml(receiptBody.receiptCounter != null ? receiptBody.receiptCounter : "—") +
      "</strong></div>" +
      "<div class=\"row\"><span>Status</span><strong>" +
      escapeHtml(receipt.status || "Fiscalised") +
      "</strong></div>" +
      "</div>" +
      "<h2>Fiscal verification</h2>" +
      "<div class=\"row\"><span>Fiscal code</span><code>" +
      escapeHtml(receipt.fiscalCode || "—") +
      "</code></div>" +
      (qrHtml
        ? "<div class=\"qr\">" + qrHtml + "<div><strong>Scan to verify</strong><div class=\"qr-data\">" + escapeHtml(qrText) + "</div></div></div>"
        : "") +
      (rows
        ? "<h2>Items</h2><table><thead><tr><th>Description</th><th class=\"num\">Qty</th><th class=\"num\">Unit price</th><th class=\"num\">Line total</th></tr></thead><tbody>" +
          rows +
          "</tbody></table>"
        : "") +
      "<div class=\"total\"><span>Total</span><span>" +
      escapeHtml(invoice.total_formatted || formatMoney(invoice.total, currency)) +
      "</span></div>" +
      "<div class=\"foot\">Fiscalised through FiscalStack for ZIMRA. Keep this receipt with the invoice.</div>" +
      "</div></body></html>";

    var printWindow = global.open("", "_blank");
    if (!printWindow) {
      throw new Error("Allow pop-ups for Zoho Books to print the fiscal receipt.");
    }
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    global.setTimeout(function () {
      try {
        printWindow.focus();
        printWindow.print();
      } catch (error) {
        return;
      }
    }, 300);
  }

  var api = {
    DEFAULT_BASE_URL: DEFAULT_BASE_URL,
    normaliseBaseUrl: normaliseBaseUrl,
    getConfig: getConfig,
    saveConfig: saveConfig,
    clearConfig: clearConfig,
    hasApiKey: hasApiKey,
    apiRequest: apiRequest,
    testConnection: testConnection,
    getDeviceStatus: getDeviceStatus,
    getDeviceDetails: getDeviceDetails,
    listInvoices: listInvoices,
    findInvoiceByNumber: findInvoiceByNumber,
    fiscalize: fiscalize,
    companyFromDetails: companyFromDetails,
    deviceSummary: deviceSummary,
    getReceipt: getReceipt,
    saveReceipt: saveReceipt,
    receiptFromInvoice: receiptFromInvoice,
    isFiscalised: isFiscalised,
    invoiceItems: invoiceItems,
    inferTaxType: inferTaxType,
    buildFiscalizePayload: buildFiscalizePayload,
    zohoGlobalFieldAvailable: zohoGlobalFieldAvailable,
    initZoho: initZoho,
    getZohoOrg: getZohoOrg,
    getZohoInvoice: getZohoInvoice,
    resize: resize,
    readZohoConfig: readZohoConfig,
    writeZohoConfig: writeZohoConfig,
    loadConfigWithZoho: loadConfigWithZoho,
    saveConfigWithZoho: saveConfigWithZoho,
    clearConfigWithZoho: clearConfigWithZoho,
    escapeHtml: escapeHtml,
    formatMoney: formatMoney,
    formatDate: formatDate,
    renderQr: renderQr,
    copyText: copyText,
    printReceipt: printReceipt,
    clone: clone
  };

  global.FiscalStack = api;
})(window);
