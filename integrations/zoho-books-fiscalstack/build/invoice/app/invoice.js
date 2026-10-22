(function () {
  "use strict";

  var FS = window.FiscalStack;
  var state = {
    org: null,
    invoice: null,
    config: FS.getConfig(),
    receipt: null,
    checking: false
  };

  var els = {
    subtitle: document.getElementById("invoice-subtitle"),
    statusPill: document.getElementById("status-pill"),
    invoiceNumber: document.getElementById("invoice-number"),
    invoiceCustomer: document.getElementById("invoice-customer"),
    invoiceDate: document.getElementById("invoice-date"),
    invoiceTotal: document.getElementById("invoice-total"),
    invoiceItems: document.getElementById("invoice-items"),
    notConfigured: document.getElementById("not-configured"),
    openSetup: document.getElementById("open-setup"),
    setupPanel: document.getElementById("setup-panel"),
    setupBaseUrl: document.getElementById("setup-base-url"),
    setupApiKey: document.getElementById("setup-api-key"),
    setupTest: document.getElementById("setup-test"),
    setupSave: document.getElementById("setup-save"),
    setupCancel: document.getElementById("setup-cancel"),
    setupResult: document.getElementById("setup-result"),
    fiscaliseCard: document.getElementById("fiscalise-card"),
    currency: document.getElementById("currency"),
    paymentMethod: document.getElementById("payment-method"),
    taxType: document.getElementById("tax-type"),
    taxInclusive: document.getElementById("tax-inclusive"),
    validation: document.getElementById("validation"),
    fiscaliseBtn: document.getElementById("fiscalise-btn"),
    refreshInvoice: document.getElementById("refresh-invoice"),
    receiptCard: document.getElementById("receipt-card"),
    receiptQr: document.getElementById("receipt-qr"),
    receiptNumber: document.getElementById("receipt-number"),
    receiptFiscalDay: document.getElementById("receipt-fiscal-day"),
    receiptCounter: document.getElementById("receipt-counter"),
    receiptFiscalCode: document.getElementById("receipt-fiscal-code"),
    receiptStatus: document.getElementById("receipt-status"),
    printBtn: document.getElementById("print-btn"),
    copyQr: document.getElementById("copy-qr"),
    refreshReceipt: document.getElementById("refresh-receipt"),
    footerNote: document.getElementById("footer-note")
  };

  function setStatus(text, kind) {
    els.statusPill.textContent = text;
    els.statusPill.className = "fs-pill" + (kind ? " fs-pill-" + kind : "");
  }

  function setFooter(text) {
    els.footerNote.textContent = text || "";
  }

  function setBusy(button, busy, label) {
    if (!button) return;
    if (busy) {
      button.dataset.label = button.textContent;
      button.disabled = true;
      button.innerHTML = '<span class="fs-spinner"></span>' + (label || "Working...");
    } else {
      button.disabled = false;
      button.textContent = label || button.dataset.label || button.textContent;
    }
  }

  function setValidation(html, kind) {
    if (!html) {
      els.validation.hidden = true;
      els.validation.innerHTML = "";
      els.validation.className = "fs-note";
      return;
    }
    els.validation.hidden = false;
    els.validation.className = "fs-note" + (kind ? " fs-note-" + kind : "");
    els.validation.innerHTML = html;
  }

  function showSetup(show) {
    els.setupPanel.hidden = !show;
    if (show) {
      els.setupBaseUrl.value = state.config.baseUrl || FS.DEFAULT_BASE_URL;
      els.setupApiKey.value = state.config.apiKey || "";
      els.setupResult.hidden = true;
      els.setupResult.innerHTML = "";
      FS.resize(860);
    }
  }

  function setupResult(html, kind) {
    els.setupResult.hidden = false;
    els.setupResult.className = "fs-result" + (kind ? " fs-result-" + kind : "");
    els.setupResult.innerHTML = html;
  }

  function errorHtml(error) {
    var parts = ['<strong>' + FS.escapeHtml(error.message || "Request failed") + "</strong>"];
    if (error.data && Array.isArray(error.data.details)) {
      parts.push(
        "<ul>" +
          error.data.details
            .map(function (detail) {
              return "<li>" + FS.escapeHtml(detail.field || detail.path || "") + ": " + FS.escapeHtml(detail.message || "") + "</li>";
            })
            .join("") +
          "</ul>"
      );
    }
    return parts.join("");
  }

  function invoiceNumber() {
    return (state.invoice && (state.invoice.invoice_number || state.invoice.invoiceNumber)) || "";
  }

  function invoiceCurrency() {
    return String(
      (state.invoice && (state.invoice.currency_code || state.invoice.currency)) || "USD"
    ).toUpperCase();
  }

  function renderInvoice() {
    var invoice = state.invoice;
    if (!invoice) {
      els.invoiceNumber.textContent = "Unavailable";
      els.invoiceCustomer.textContent = "-";
      els.invoiceDate.textContent = "-";
      els.invoiceTotal.textContent = "-";
      els.invoiceItems.textContent = "-";
      els.subtitle.textContent = "Open this widget from an invoice in Zoho Books.";
      setStatus("Unavailable", "error");
      return;
    }

    var items = FS.invoiceItems(invoice);
    var currency = invoiceCurrency();
    els.invoiceNumber.textContent = invoice.invoice_number || invoice.invoiceNumber || "-";
    els.invoiceCustomer.textContent = invoice.customer_name || "-";
    els.invoiceDate.textContent = invoice.date_formatted || FS.formatDate(invoice.date);
    els.invoiceTotal.textContent = invoice.total_formatted || FS.formatMoney(invoice.total, currency);
    els.invoiceItems.textContent = String(items.length);
    els.subtitle.textContent =
      (state.org && state.org.name ? state.org.name + " · " : "") +
      (invoice.invoice_number || invoice.invoiceNumber || "Invoice");

    if (currency === "USD" || currency === "ZWG") {
      els.currency.value = currency;
    } else {
      els.currency.value = "USD";
      setValidation(
        "Zoho Books invoice currency " +
          FS.escapeHtml(currency) +
          " is not supported by the fiscalise API. USD will be used. Check the amounts before submitting.",
        ""
      );
    }

    var blocked = String(invoice.status || "").toLowerCase() === "void" ||
      String(invoice.status || "").toLowerCase() === "cancelled";
    if (blocked) {
      els.fiscaliseBtn.disabled = true;
      setValidation("This invoice is " + FS.escapeHtml(invoice.status) + " in Zoho Books and cannot be fiscalised.", "error");
    } else if (String(invoice.status || "").toLowerCase() === "draft") {
      setValidation("This invoice is still a draft in Zoho Books. Fiscalising it will create a fiscal receipt immediately.", "");
    }
  }

  function currentQrText(receipt) {
    return receipt && (receipt.qrCode || receipt.qrCodeData) ? receipt.qrCode || receipt.qrCodeData : "";
  }

  function renderReceipt(receipt) {
    if (!receipt) return;
    state.receipt = receipt;
    var body = receipt.receipt || {};

    els.receiptCard.hidden = false;
    els.fiscaliseCard.hidden = true;
    els.notConfigured.hidden = true;
    els.setupPanel.hidden = true;

    els.receiptNumber.textContent = receipt.receiptNumber || body.receiptGlobalNo || "-";
    els.receiptFiscalDay.textContent = body.fiscalDayNo != null ? body.fiscalDayNo : "-";
    els.receiptCounter.textContent = body.receiptCounter != null ? body.receiptCounter : "-";
    els.receiptFiscalCode.textContent = receipt.fiscalCode || "-";
    els.receiptStatus.textContent = receipt.status || "Fiscalised";

    FS.renderQr(els.receiptQr, currentQrText(receipt));
    setStatus("Fiscalised", "ok");
    setValidation("");
    FS.resize(760);
  }

  function showFiscalise() {
    state.receipt = null;
    els.receiptCard.hidden = true;
    els.notConfigured.hidden = FS.hasApiKey(state.config);
    els.fiscaliseCard.hidden = !FS.hasApiKey(state.config);
    if (!FS.hasApiKey(state.config)) {
      setStatus("Not connected", "warn");
    } else {
      setStatus("Ready", "");
    }
  }

  function checkExisting() {
    if (!state.invoice || !FS.hasApiKey(state.config)) {
      showFiscalise();
      return Promise.resolve();
    }

    var orgId = (state.org && state.org.id) || state.config.zohoOrgId || "";
    var number = invoiceNumber();
    var cached = FS.getReceipt(orgId, number);
    if (cached && FS.isFiscalised(cached)) {
      renderReceipt(cached);
      return Promise.resolve();
    }

    state.checking = true;
    setStatus("Checking", "");
    return FS.findInvoiceByNumber(number, state.config)
      .then(function (invoice) {
        if (invoice && (invoice.fiscalCode || invoice.qrCodeData || invoice.receiptGlobalNo)) {
          var receipt = FS.saveReceipt(orgId, number, FS.receiptFromInvoice(invoice));
          renderReceipt(receipt);
        } else {
          showFiscalise();
        }
      })
      .catch(function (error) {
        showFiscalise();
        setFooter("Could not check FiscalStack status: " + (error.message || "request failed"));
      })
      .finally(function () {
        state.checking = false;
      });
  }

  function fiscalise() {
    if (!state.invoice) return;
    if (!FS.hasApiKey(state.config)) {
      showSetup(true);
      return;
    }

    var items = FS.invoiceItems(state.invoice);
    if (!items.length) {
      setValidation("This invoice has no line items to fiscalise.", "error");
      return;
    }

    var payload = FS.buildFiscalizePayload(state.invoice, {
      currency: els.currency.value,
      paymentMethod: els.paymentMethod.value,
      taxType: els.taxType.value,
      taxInclusive: els.taxInclusive.checked
    });

    var confirmed = window.confirm(
      "Fiscalise " +
        (state.invoice.invoice_number || "this invoice") +
        " for " +
        (state.invoice.total_formatted || FS.formatMoney(state.invoice.total, invoiceCurrency())) +
        "?\n\n" +
        items.length +
        " line item(s) will be submitted to ZIMRA through FiscalStack. This cannot be undone."
    );
    if (!confirmed) return;

    setBusy(els.fiscaliseBtn, true, "Fiscalising...");
    setValidation("");
    setStatus("Submitting", "");

    FS.fiscalize(payload, state.config)
      .then(function (result) {
        var orgId = (state.org && state.org.id) || state.config.zohoOrgId || "";
        var receipt = FS.saveReceipt(orgId, invoiceNumber(), result);
        renderReceipt(receipt);
        setFooter("Fiscalised at " + new Date().toLocaleString() + ".");
      })
      .catch(function (error) {
        var duplicate =
          error.status === 409 ||
          (error.data && (error.data.error === "DUPLICATE_INVOICE" || error.data.error === "DUPLICATE"));
        if (duplicate) {
          setValidation("This invoice number already exists in FiscalStack. Loading its fiscal receipt...", "");
          FS.findInvoiceByNumber(invoiceNumber(), state.config)
            .then(function (invoice) {
              if (invoice && (invoice.fiscalCode || invoice.qrCodeData || invoice.receiptGlobalNo)) {
                var orgId = (state.org && state.org.id) || state.config.zohoOrgId || "";
                renderReceipt(FS.saveReceipt(orgId, invoiceNumber(), FS.receiptFromInvoice(invoice)));
                setFooter("Loaded the existing fiscal receipt.");
              } else {
                setStatus("Duplicate", "warn");
                setValidation("FiscalStack reports this invoice number as already used, but the receipt could not be loaded.", "error");
              }
            })
            .catch(function (lookupError) {
              setStatus("Failed", "error");
              setValidation(errorHtml(lookupError), "error");
            });
        } else {
          setStatus("Failed", "error");
          setValidation(errorHtml(error), "error");
        }
      })
      .finally(function () {
        setBusy(els.fiscaliseBtn, false, "Fiscalise invoice");
      });
  }

  function refreshReceipt() {
    if (!state.invoice) return;
    setBusy(els.refreshReceipt, true, "Refreshing...");
    FS.findInvoiceByNumber(invoiceNumber(), state.config)
      .then(function (invoice) {
        if (invoice && (invoice.fiscalCode || invoice.qrCodeData || invoice.receiptGlobalNo)) {
          var orgId = (state.org && state.org.id) || state.config.zohoOrgId || "";
          renderReceipt(FS.saveReceipt(orgId, invoiceNumber(), FS.receiptFromInvoice(invoice)));
          setFooter("Fiscal receipt refreshed.");
        } else {
          setFooter("FiscalStack has not returned a receipt for this invoice yet.");
        }
      })
      .catch(function (error) {
        setFooter("Refresh failed: " + (error.message || "request failed"));
      })
      .finally(function () {
        setBusy(els.refreshReceipt, false, "Refresh");
      });
  }

  function saveSetup() {
    var credentials = {
      baseUrl: FS.normaliseBaseUrl(els.setupBaseUrl.value),
      apiKey: els.setupApiKey.value.trim()
    };

    if (!credentials.apiKey) {
      setupResult("Enter the FiscalStack API key.", "error");
      return;
    }

    setBusy(els.setupSave, true, "Saving...");
    FS.saveConfigWithZoho(
      Object.assign({}, credentials, {
        zohoOrgId: state.org ? state.org.id : "",
        zohoOrgName: state.org ? state.org.name : ""
      })
    )
      .then(function (result) {
        state.config = result.config;
        showSetup(false);
        setFooter(
          result.synced
            ? "Connection saved and synced to the Zoho Books global field."
            : "Connection saved in this browser."
        );
        showFiscalise();
        return checkExisting();
      })
      .catch(function (error) {
        setupResult(errorHtml(error), "error");
      })
      .finally(function () {
        setBusy(els.setupSave, false, "Save");
      });
  }

  function testSetup() {
    var credentials = {
      baseUrl: FS.normaliseBaseUrl(els.setupBaseUrl.value),
      apiKey: els.setupApiKey.value.trim()
    };

    if (!credentials.apiKey) {
      setupResult("Enter the FiscalStack API key.", "error");
      return;
    }

    setBusy(els.setupTest, true, "Testing...");
    FS.testConnection(credentials)
      .then(function (result) {
        var company = FS.companyFromDetails(result.company);
        var device = FS.deviceSummary(result.device);
        setupResult(
          '<div class="fs-row"><span>API key</span><strong>Accepted</strong></div>' +
            '<div class="fs-row"><span>Company</span><strong>' +
            FS.escapeHtml(company.name || "Registered company") +
            "</strong></div>" +
            '<div class="fs-row"><span>Device</span><strong>' +
            FS.escapeHtml(device.deviceId || company.deviceId || "Not registered") +
            "</strong></div>" +
            '<div class="fs-row"><span>Status</span><strong>' +
            FS.escapeHtml(device.status || "unknown") +
            "</strong></div>",
          "ok"
        );
      })
      .catch(function (error) {
        setupResult(errorHtml(error), "error");
      })
      .finally(function () {
        setBusy(els.setupTest, false, "Test");
      });
  }

  els.openSetup.addEventListener("click", function () {
    showSetup(true);
  });

  els.setupCancel.addEventListener("click", function () {
    showSetup(false);
  });

  els.setupTest.addEventListener("click", testSetup);
  els.setupSave.addEventListener("click", saveSetup);
  els.fiscaliseBtn.addEventListener("click", fiscalise);
  els.refreshInvoice.addEventListener("click", checkExisting);
  els.refreshReceipt.addEventListener("click", refreshReceipt);

  els.printBtn.addEventListener("click", function () {
    try {
      FS.printReceipt(state.receipt, {
        invoice: state.invoice,
        config: state.config,
        org: state.org
      });
    } catch (error) {
      setFooter(error.message || "Could not open the print window.");
    }
  });

  els.copyQr.addEventListener("click", function () {
    var text = currentQrText(state.receipt);
    if (!text) {
      setFooter("No QR data is available for this receipt.");
      return;
    }
    FS.copyText(text)
      .then(function () {
        setFooter("QR data copied.");
      })
      .catch(function (error) {
        setFooter(error.message || "Could not copy QR data.");
      });
  });

  FS.initZoho()
    .then(function () {
      return Promise.all([FS.getZohoOrg(), FS.getZohoInvoice()]);
    })
    .then(function (results) {
      state.org = results[0] || {};
      state.invoice = results[1] || null;
      state.config = FS.saveConfig({
        zohoOrgId: state.org.id || state.config.zohoOrgId,
        zohoOrgName: state.org.name || state.config.zohoOrgName
      });
      renderInvoice();
      return FS.loadConfigWithZoho();
    })
    .then(function (loaded) {
      state.config = loaded.config;
      if (loaded.source === "zoho") setFooter("Settings loaded from the Zoho Books global field.");
      showFiscalise();
      return checkExisting();
    })
    .catch(function (error) {
      setStatus("Unavailable", "error");
      setFooter(error.message || "Could not initialise the Zoho Books invoice context.");
      showFiscalise();
    })
    .finally(function () {
      FS.resize(760);
    });
})();
