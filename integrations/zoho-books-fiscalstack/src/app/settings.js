(function () {
  "use strict";

  var FS = window.FiscalStack;
  var state = {
    org: null,
    config: FS.getConfig(),
    recent: [],
    testResult: null
  };

  var els = {
    orgName: document.getElementById("org-name"),
    orgId: document.getElementById("org-id"),
    pill: document.getElementById("connection-pill"),
    form: document.getElementById("settings-form"),
    baseUrl: document.getElementById("base-url"),
    apiKey: document.getElementById("api-key"),
    testBtn: document.getElementById("test-btn"),
    saveBtn: document.getElementById("save-btn"),
    forgetBtn: document.getElementById("forget-btn"),
    result: document.getElementById("connection-result"),
    companyCard: document.getElementById("company-card"),
    refreshBtn: document.getElementById("refresh-btn"),
    recentList: document.getElementById("recent-list"),
    recentCount: document.getElementById("recent-count"),
    recentDetail: document.getElementById("recent-detail"),
    saveNote: document.getElementById("save-note")
  };

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

  function setPill(text, kind) {
    els.pill.textContent = text;
    els.pill.className = "fs-pill" + (kind ? " fs-pill-" + kind : "");
  }

  function setNote(text) {
    els.saveNote.textContent = text || "";
  }

  function showResult(html, kind) {
    els.result.hidden = false;
    els.result.className = "fs-result" + (kind ? " fs-result-" + kind : "");
    els.result.innerHTML = html;
  }

  function hideResult() {
    els.result.hidden = true;
    els.result.innerHTML = "";
  }

  function fillForm(config) {
    els.baseUrl.value = config.baseUrl || FS.DEFAULT_BASE_URL;
    els.apiKey.value = config.apiKey || "";
  }

  function formCredentials() {
    return {
      baseUrl: FS.normaliseBaseUrl(els.baseUrl.value),
      apiKey: els.apiKey.value.trim()
    };
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

  function renderTestResult(result) {
    var company = FS.companyFromDetails(result.company);
    var device = FS.deviceSummary(result.device);
    var rows = [];
    rows.push('<div class="fs-row"><span>API key</span><strong>Accepted</strong></div>');
    rows.push('<div class="fs-row"><span>Company</span><strong>' + FS.escapeHtml(company.name || "Registered company") + "</strong></div>");
    rows.push('<div class="fs-row"><span>Device</span><strong>' + FS.escapeHtml(device.deviceId || company.deviceId || "Not registered") + "</strong></div>");
    rows.push('<div class="fs-row"><span>Fiscal status</span><strong>' + FS.escapeHtml(device.status || "unknown") + "</strong></div>");
    if (result.companyError) {
      rows.push('<div class="fs-row"><span>Device details</span><strong>Unavailable</strong></div>');
    }
    return rows.join("");
  }

  function companyMarkup(device, details, deviceError) {
    var company = FS.companyFromDetails(details);
    var summary = FS.deviceSummary(device);
    var rows = [];

    rows.push('<div class="fs-row"><span>Company</span><strong>' + FS.escapeHtml(company.name || state.config.companyName || "Not resolved") + "</strong></div>");
    if (company.tin) rows.push('<div class="fs-row"><span>TIN</span><code>' + FS.escapeHtml(company.tin) + "</code></div>");
    if (company.vat) rows.push('<div class="fs-row"><span>VAT number</span><code>' + FS.escapeHtml(company.vat) + "</code></div>");
    rows.push('<div class="fs-row"><span>Device ID</span><code>' + FS.escapeHtml(company.deviceId || summary.deviceId || state.config.deviceId || "Not registered") + "</code></div>");
    rows.push('<div class="fs-row"><span>Device serial</span><code>' + FS.escapeHtml(company.serial || summary.serial || state.config.deviceSerial || "-") + "</code></div>");
    rows.push('<div class="fs-row"><span>Environment</span><strong>' + FS.escapeHtml(summary.environment || state.config.environment || "-") + "</strong></div>");
    rows.push('<div class="fs-row"><span>Fiscal day</span><strong>' + FS.escapeHtml(summary.currentDayNo !== "" ? summary.currentDayNo : company.fiscalDay || "-") + "</strong></div>");

    var status = summary.status || "unknown";
    var kind = status === "online" ? "ok" : status === "unregistered" ? "warn" : "warn";
    rows.push('<div class="fs-row"><span>Device status</span><span class="fs-pill fs-pill-' + kind + '">' + FS.escapeHtml(status) + "</span></div>");

    var note = "";
    if (deviceError || summary.status === "unregistered") {
      note = '<div class="fs-note">The API key is valid, but the fiscal device is not registered yet. Complete device registration in FiscalStack before fiscalising invoices.</div>';
    }

    if (company.name || company.deviceId) {
      FS.saveConfig({
        companyName: company.name || state.config.companyName,
        companyTin: company.tin || state.config.companyTin,
        companyVat: company.vat || state.config.companyVat,
        deviceId: company.deviceId || summary.deviceId || state.config.deviceId,
        deviceSerial: company.serial || summary.serial || state.config.deviceSerial,
        environment: summary.environment || state.config.environment
      });
      state.config = FS.getConfig();
    }

    return rows.join("") + note;
  }

  function renderRecent(result) {
    if (result && result.error) {
      els.recentList.innerHTML = '<div class="fs-empty">' + FS.escapeHtml(result.error.message) + "</div>";
      els.recentCount.textContent = "0";
      return;
    }

    var rows = (result && result.data) || [];
    state.recent = rows;
    els.recentCount.textContent = String(rows.length);
    els.recentDetail.hidden = true;
    els.recentDetail.innerHTML = "";

    if (!rows.length) {
      els.recentList.innerHTML = '<div class="fs-empty">No fiscalised invoices found for this company.</div>';
      return;
    }

    els.recentList.innerHTML = rows
      .map(function (invoice, index) {
        var status = invoice.status || "unknown";
        var kind = status === "fiscalized" || status === "issued" ? "ok" : status === "failed" ? "error" : "";
        return (
          '<button type="button" class="fs-list-row" data-index="' +
          index +
          '">' +
          '<span class="fs-list-main"><strong>' +
          FS.escapeHtml(invoice.invoiceNumber || "Invoice") +
          "</strong><span>" +
          FS.escapeHtml(FS.formatDate(invoice.issueDate)) +
          " · " +
          FS.escapeHtml(FS.formatMoney(invoice.total, invoice.currency)) +
          "</span></span>" +
          '<span class="fs-pill ' +
          (kind ? "fs-pill-" + kind : "") +
          '">' +
          FS.escapeHtml(status) +
          "</span>" +
          "</button>"
        );
      })
      .join("");
  }

  function openRecentDetail(index) {
    var invoice = state.recent[index];
    if (!invoice) return;
    var receipt = FS.receiptFromInvoice(invoice);
    var qr = "";

    els.recentDetail.hidden = false;
    els.recentDetail.className = "fs-card";
    els.recentDetail.style.marginTop = "10px";
    els.recentDetail.innerHTML =
      '<div class="fs-section-head"><h2>' +
      FS.escapeHtml(invoice.invoiceNumber || "Invoice") +
      '</h2><span class="fs-badge ' +
      (FS.isFiscalised(receipt) ? "fs-badge-ok" : "fs-badge-warn") +
      '">' +
      FS.escapeHtml(FS.isFiscalised(receipt) ? "Fiscalised" : "Pending") +
      "</span></div>" +
      '<div class="fs-receipt"><div class="fs-qr" id="detail-qr"></div><div class="fs-receipt-meta">' +
      '<div class="fs-row"><span>Receipt number</span><strong>' +
      FS.escapeHtml(receipt.receiptNumber || "—") +
      "</strong></div>" +
      '<div class="fs-row"><span>Fiscal day</span><strong>' +
      FS.escapeHtml(receipt.receipt && receipt.receipt.fiscalDayNo != null ? receipt.receipt.fiscalDayNo : "—") +
      "</strong></div>" +
      '<div class="fs-row"><span>Receipt counter</span><strong>' +
      FS.escapeHtml(receipt.receipt && receipt.receipt.receiptCounter != null ? receipt.receipt.receiptCounter : "—") +
      "</strong></div>" +
      '<div class="fs-row"><span>Fiscal code</span><code>' +
      FS.escapeHtml(receipt.fiscalCode || "—") +
      "</code></div>" +
      "</div></div>";

    FS.renderQr(document.getElementById("detail-qr"), receipt.qrCode || "");
    FS.resize(820);
  }

  function refreshCompany() {
    if (!FS.hasApiKey(state.config)) {
      els.companyCard.className = "fs-empty";
      els.companyCard.textContent = "Connect FiscalStack to load the registered company and fiscal device.";
      return;
    }

    els.companyCard.className = "";
    els.companyCard.innerHTML = '<div class="fs-empty"><span class="fs-spinner"></span>Loading company and device...</div>';

    Promise.all([
      FS.getDeviceStatus(state.config).catch(function (error) {
        return { __error: error };
      }),
      FS.getDeviceDetails(state.config).catch(function (error) {
        return { __error: error };
      })
    ]).then(function (results) {
      var device = results[0];
      var details = results[1];
      if (device && device.__error && details && details.__error) {
        els.companyCard.className = "fs-empty";
        els.companyCard.innerHTML = errorHtml(device.__error);
        return;
      }
      els.companyCard.className = "";
      els.companyCard.innerHTML = companyMarkup(
        device && !device.__error ? device : {},
        details && !details.__error ? details : {},
        details && details.__error
      );
    });
  }

  function refreshRecent() {
    if (!FS.hasApiKey(state.config)) {
      renderRecent({ error: { message: "Connect FiscalStack to load recent invoices." } });
      return;
    }

    els.recentList.innerHTML = '<div class="fs-empty"><span class="fs-spinner"></span>Loading recent invoices...</div>';
    FS.listInvoices(10, 1, state.config)
      .then(renderRecent)
      .catch(function (error) {
        renderRecent({ error: error });
      });
  }

  function refreshAll() {
    refreshCompany();
    refreshRecent();
  }

  els.form.addEventListener("submit", function (event) {
    event.preventDefault();
    var credentials = formCredentials();
    if (!credentials.apiKey) {
      showResult("Enter the FiscalStack API key.", "error");
      return;
    }

    setBusy(els.saveBtn, true, "Saving...");
    FS.saveConfigWithZoho(
      Object.assign({}, credentials, {
        zohoOrgId: state.org ? state.org.id : "",
        zohoOrgName: state.org ? state.org.name : ""
      })
    )
      .then(function (result) {
        state.config = result.config;
        setPill("Connected", "ok");
        setNote(
          result.synced
            ? "Saved and synced to the Zoho Books global field."
            : "Saved in this browser. Configure a Zoho global field to share it across users."
        );
        showResult("FiscalStack connection saved.", "ok");
        refreshAll();
      })
      .catch(function (error) {
        showResult(errorHtml(error), "error");
      })
      .finally(function () {
        setBusy(els.saveBtn, false, "Save connection");
      });
  });

  els.testBtn.addEventListener("click", function () {
    var credentials = formCredentials();
    if (!credentials.apiKey) {
      showResult("Enter the FiscalStack API key.", "error");
      return;
    }

    hideResult();
    setBusy(els.testBtn, true, "Testing...");
    FS.testConnection(credentials)
      .then(function (result) {
        state.testResult = result;
        showResult(renderTestResult(result), "ok");
        setPill("API key accepted", "ok");
        setNote("Connection successful. Save to keep these settings.");
      })
      .catch(function (error) {
        setPill("Connection failed", "error");
        showResult(errorHtml(error), "error");
      })
      .finally(function () {
        setBusy(els.testBtn, false, "Test connection");
      });
  });

  els.forgetBtn.addEventListener("click", function () {
    if (!window.confirm("Remove the saved FiscalStack connection from this widget?")) return;
    setBusy(els.forgetBtn, true, "Clearing...");
    FS.clearConfigWithZoho()
      .then(function () {
        state.config = FS.getConfig();
        state.testResult = null;
        fillForm(state.config);
        setPill("Not connected", "");
        setNote("Connection removed.");
        hideResult();
        els.companyCard.className = "fs-empty";
        els.companyCard.textContent = "Connect FiscalStack to load the registered company and fiscal device.";
        renderRecent({ error: { message: "No fiscalised invoices loaded yet." } });
      })
      .finally(function () {
        setBusy(els.forgetBtn, false, "Forget");
      });
  });

  els.refreshBtn.addEventListener("click", function () {
    setBusy(els.refreshBtn, true, "Refreshing...");
    refreshAll();
    window.setTimeout(function () {
      setBusy(els.refreshBtn, false, "Refresh");
    }, 900);
  });

  els.recentList.addEventListener("click", function (event) {
    var button = event.target.closest("[data-index]");
    if (!button) return;
    openRecentDetail(Number(button.getAttribute("data-index")));
  });

  FS.initZoho()
    .then(function () {
      return FS.getZohoOrg();
    })
    .then(function (org) {
      state.org = org || {};
      els.orgName.textContent = org && org.name ? org.name : "Not available";
      els.orgId.textContent = org && org.id ? org.id : "-";
      if (org && org.id) {
        state.config = FS.saveConfig({
          zohoOrgId: org.id,
          zohoOrgName: org.name || ""
        });
      }
      return FS.loadConfigWithZoho();
    })
    .then(function (loaded) {
      state.config = loaded.config;
      fillForm(state.config);
      if (FS.hasApiKey(state.config)) {
        setPill("Connected", "ok");
        setNote(loaded.source === "zoho" ? "Loaded settings from the Zoho Books global field." : "");
        refreshAll();
      } else {
        setPill("Not connected", "");
      }
      FS.resize(820);
    })
    .catch(function (error) {
      els.orgName.textContent = "Unavailable";
      els.orgId.textContent = "-";
      setNote(error.message || "Could not initialise the Zoho Books context.");
      fillForm(state.config);
      FS.resize(820);
    });
})();
