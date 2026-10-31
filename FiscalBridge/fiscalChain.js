/**
 * fiscalChain.js — local ZIMRA receipt sequence for offline signing.
 *
 * The till keeps the same four pieces of state FDMS expects:
 *   fiscalDayNo + dayOpen, daily receiptCounter, global receipt number and the
 *   previous receipt hash. A receipt number is claimed and persisted BEFORE the
 *   queue entry is written and before anything is printed, so a crash can only
 *   leave a gap (never a duplicate). A pending-claim marker lets the next start
 *   roll back a claim whose queue entry never landed.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const secureKey = require('./secureKey');
const { generateOfflineFiscalData, formatZimraDate } = require('./offlineSign');
const enterpriseQueue = require('./enterpriseQueue');

const STATE_VERSION = 1;
const VALID_CURRENCIES = new Set(['USD', 'ZWG']);
const TAX_TYPES = ['STANDARD', 'ZERO_RATED', 'EXEMPT'];

let statePath = null;

function init(userDataPath) {
  statePath = path.join(userDataPath, 'offline-fiscal-state.json');
  return recoverPendingClaim();
}

function ensurePath() {
  if (!statePath) throw new Error('fiscalChain not initialised');
  return statePath;
}

function defaultState() {
  return {
    version: STATE_VERSION,
    endpoint: null,
    bootstrappedAt: null,
    config: null,
    chain: null,
    pendingClaim: null,
  };
}

function load() {
  try {
    const file = ensurePath();
    if (!fs.existsSync(file)) return defaultState();
    return { ...defaultState(), ...JSON.parse(fs.readFileSync(file, 'utf8')) };
  } catch {
    return defaultState();
  }
}

function save(state) {
  const file = ensurePath();
  const tmp = `${file}.${process.pid}.tmp`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, file);
  try { fs.chmodSync(file, 0o600); } catch { /* best effort on Windows */ }
}

function encryptPem(pem) {
  const value = secureKey.encryptValue(pem);
  if (Buffer.isBuffer(value)) return `os:${value.toString('base64')}`;
  return `b64:${value}`;
}

function decryptPem(stored) {
  if (typeof stored !== 'string') return null;
  if (stored.startsWith('os:')) {
    if (!secureKey.isSecure()) return null;
    return secureKey.decryptValue(Buffer.from(stored.slice(3), 'base64'));
  }
  if (stored.startsWith('b64:')) return Buffer.from(stored.slice(4), 'base64').toString('utf8');
  return null;
}

function normalizeTaxBucket(bucket) {
  if (!bucket) return null;
  const taxID = Number(bucket.taxID);
  const taxPercent = Number(bucket.taxPercent);
  const taxCode = String(bucket.taxCode || '').toUpperCase();
  if (!Number.isInteger(taxID) || taxID <= 0) return null;
  if (!Number.isFinite(taxPercent) || taxPercent < 0) return null;
  if (!/^[A-Z]$/.test(taxCode)) return null;
  return { taxID, taxPercent, taxCode };
}

function normalizeTaxMap(taxes) {
  const out = {};
  for (const type of TAX_TYPES) {
    out[type] = normalizeTaxBucket(taxes && taxes[type]);
  }
  return out;
}

function parseZimraLocalDate(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
  if (!match) return null;
  const [, y, mo, d, h, mi, s] = match;
  // ZIMRA receipt dates carry no timezone; they are Africa/Harare (UTC+2).
  return Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h) - 2, Number(mi), Number(s));
}

function latestReceiptDate(dayOpenedAt, lastReceiptAt) {
  let now = Date.now();
  for (const candidate of [dayOpenedAt, lastReceiptAt]) {
    const ms = parseZimraLocalDate(candidate);
    if (ms !== null && now <= ms + 1000) now = ms + 2000;
  }
  return formatZimraDate(new Date(now));
}

function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function mul2(a, b) {
  return Math.round((Number(a) * Number(b) + Number.EPSILON) * 100) / 100;
}

function sanitizeBuyer(buyer) {
  if (!buyer || typeof buyer !== 'object') return undefined;
  const out = {};
  if (buyer.name) out.name = String(buyer.name).slice(0, 200);
  // The pass-through schema rejects non-ZIMRA identifiers outright; a queue
  // entry that can never sync is worse than omitting the identifier.
  if (/^\d{9}$/.test(String(buyer.vatNumber || ''))) out.vatNumber = String(buyer.vatNumber);
  if (/^\d{10}$/.test(String(buyer.tin || ''))) out.tin = String(buyer.tin);
  if (buyer.email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(buyer.email))) out.email = String(buyer.email).slice(0, 100);
  if (buyer.phone) out.phone = String(buyer.phone).slice(0, 20);
  return Object.keys(out).length ? out : undefined;
}

function buildReceipt(invoice, state) {
  const { config, chain } = state;
  const taxMap = config.taxes;
  const currency = String(invoice.currency || 'USD').toUpperCase();
  if (!VALID_CURRENCIES.has(currency)) {
    throw Object.assign(new Error(`Offline signing supports USD and ZWG only (got ${currency})`), { code: 'UNSUPPORTED_CURRENCY' });
  }

  const transactionType = ['CreditNote', 'DebitNote'].includes(invoice.transactionType)
    ? invoice.transactionType
    : 'FiscalInvoice';
  const receiptType = transactionType;
  const priceSign = receiptType === 'CreditNote' ? -1 : 1;
  const items = Array.isArray(invoice.items) ? invoice.items : [];
  if (items.length === 0) throw Object.assign(new Error('Refusing to sign an empty invoice'), { code: 'EMPTY_INVOICE' });

  const buckets = new Map();

  for (const item of items) {
    const tax = taxMap[item.taxType] || taxMap.STANDARD;
    if (!tax) {
      throw Object.assign(new Error(`No ZIMRA tax configured for ${item.taxType || 'STANDARD'}`), { code: 'TAX_MAPPING_MISSING' });
    }
    const quantity = Number(item.quantity);
    const unitPrice = Number(item.unitPrice);
    if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitPrice) || unitPrice < 0) {
      throw Object.assign(new Error(`Invalid line for ${item.name || 'item'}`), { code: 'INVALID_LINE' });
    }

    let unitPriceExcl = Math.abs(unitPrice);
    if (item.taxInclusive && tax.taxPercent > 0) {
      unitPriceExcl = unitPriceExcl / (1 + tax.taxPercent / 100);
    }

    const sentQty = round2(quantity);
    const sentPrice = round2(unitPriceExcl);
    let lineTotal = mul2(sentPrice, sentQty);
    if (Number(item.discount) > 0) {
      lineTotal = round2(lineTotal - Number(item.discount));
    }

    // ZIMRA receives totals net of VAT; credit notes carry negative values.
    const lineCents = Math.round(lineTotal * 100) * priceSign;
    const key = `${tax.taxID}-${tax.taxPercent}-${tax.taxCode}`;
    const bucket = buckets.get(key) || {
      taxID: tax.taxID,
      taxCode: tax.taxCode,
      taxPercent: tax.taxID === 1 ? undefined : tax.taxPercent,
      netCents: 0,
    };
    bucket.netCents += lineCents;
    buckets.set(key, bucket);
  }

  const receiptTaxes = Array.from(buckets.values()).map((bucket) => {
    const netCents = Math.round(bucket.netCents);
    const taxCents = bucket.taxPercent ? Math.round((netCents * bucket.taxPercent) / 100) : 0;
    return {
      taxID: bucket.taxID,
      taxCode: bucket.taxCode,
      taxPercent: bucket.taxPercent,
      taxAmount: taxCents / 100,
      salesAmountWithTax: (netCents + taxCents) / 100,
    };
  });

  const totalCents = receiptTaxes.reduce(
    (sum, tax) => sum + Math.round(tax.salesAmountWithTax * 100),
    0,
  );

  return {
    receiptType: receiptType.toUpperCase(),
    receiptCurrency: currency,
    receiptGlobalNo: chain.receiptGlobalNo + 1,
    receiptCounter: chain.receiptCounter + 1,
    receiptDate: latestReceiptDate(chain.dayOpenedAt, chain.lastReceiptAt),
    receiptTotal: totalCents / 100,
    receiptTaxes,
    transactionType,
  };
}

function buildQueuePayload(invoice, receipt, signature, state) {
  return {
    items: (invoice.items || []).map((item) => ({
      name: item.name || item.description || 'Item',
      quantity: Number(item.quantity) || 1,
      unitPrice: Number(item.unitPrice) || 0,
      taxType: item.taxType || 'STANDARD',
      taxInclusive: !!item.taxInclusive,
      ...(item.hsCode ? { hsCode: String(item.hsCode).slice(0, 8) } : {}),
      ...(item.sku ? { sku: String(item.sku) } : {}),
      ...(Number(item.discount) > 0 ? { discount: Number(item.discount) } : {}),
      ...(Array.isArray(item.additionalTaxes) && item.additionalTaxes.length
        ? { additionalTaxes: item.additionalTaxes }
        : {}),
    })),
    invoiceNumber: invoice.invoiceNumber,
    currency: receipt.receiptCurrency,
    transactionType: receipt.transactionType,
    ...(invoice.paymentMethod ? { paymentMethod: invoice.paymentMethod } : {}),
    ...(Array.isArray(invoice.splitPayments) && invoice.splitPayments.length
      ? { splitPayments: invoice.splitPayments }
      : {}),
    ...(sanitizeBuyer(invoice.buyer) ? { buyer: sanitizeBuyer(invoice.buyer) } : {}),
    offlineSignature: signature.signature,
    offlineReceiptCounter: receipt.receiptCounter,
    offlineGlobalReceiptCounter: receipt.receiptGlobalNo,
    offlinePreviousHash: null,
    offlineFiscalDay: state.chain.fiscalDayNo,
    offlineDate: receipt.receiptDate,
  };
}

function readiness(state) {
  if (!state || !state.config) return { ready: false, reason: 'Offline signing is not bootstrapped. Connect once while a fiscal day is open.' };
  if (!decryptPem(state.config.privateKey)) return { ready: false, reason: 'Device signing key is unavailable on this till.' };
  if (!state.config.deviceId) return { ready: false, reason: 'Device ID is missing from the offline context.' };
  if (!state.config.taxes || TAX_TYPES.some((t) => !state.config.taxes[t])) {
    return { ready: false, reason: 'ZIMRA tax mapping is incomplete for offline signing.' };
  }
  if (!state.chain) return { ready: false, reason: 'Fiscal counters are not bootstrapped.' };
  if (!state.chain.dayOpen) return { ready: false, reason: 'Fiscal day is closed. Open the day while online before signing offline.' };
  if (!state.chain.fiscalDayNo) return { ready: false, reason: 'Fiscal day number is missing.' };
  if (!Number.isFinite(Number(state.chain.receiptCounter)) || !Number.isFinite(Number(state.chain.receiptGlobalNo))) {
    return { ready: false, reason: 'Fiscal counters are invalid.' };
  }
  return { ready: true };
}

function publicState(state) {
  const ready = readiness(state);
  const chain = state.chain || {};
  return {
    ...ready,
    bootstrappedAt: state.bootstrappedAt,
    endpoint: state.endpoint,
    deviceId: state.config?.deviceId || null,
    deviceSerialNo: state.config?.deviceSerialNo || null,
    environment: state.config?.environment || null,
    taxes: state.config?.taxes || null,
    fiscalDayNo: chain.fiscalDayNo ?? null,
    dayOpen: !!chain.dayOpen,
    receiptCounter: chain.receiptCounter ?? null,
    receiptGlobalNo: chain.receiptGlobalNo ?? null,
    lastReceiptAt: chain.lastReceiptAt || null,
    pending: enterpriseQueue.getQueueLength(),
  };
}

async function bootstrap({ apiEndpoint, apiKey, pendingCount } = {}) {
  const base = String(apiEndpoint || '').replace(/\/+$/, '');
  if (!base || !apiKey) throw Object.assign(new Error('API endpoint and key are required'), { code: 'NOT_CONFIGURED' });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  let response;
  try {
    response = await fetch(`${base}/api/zimra/offline-state`, {
      headers: { 'x-api-key': apiKey, Accept: 'application/json' },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw Object.assign(new Error(`Offline state request failed (HTTP ${response.status})`), { code: 'BOOTSTRAP_HTTP', status: response.status });
  }
  const data = await response.json();
  if (!data.deviceId || !/-----BEGIN [^-]*PRIVATE KEY-----/.test(String(data.zimraPrivateKey || ''))) {
    throw Object.assign(new Error('Offline state is missing the device key'), { code: 'BOOTSTRAP_INCOMPLETE' });
  }

  const taxes = normalizeTaxMap(data.taxes);
  const state = load();
  state.endpoint = base;
  state.bootstrappedAt = new Date().toISOString();
  state.config = {
    deviceId: String(data.deviceId),
    deviceSerialNo: data.deviceSerialNo || '',
    environment: data.zimraEnvironment === 'production' ? 'production' : 'test',
    privateKey: encryptPem(data.zimraPrivateKey),
    taxes,
  };

  const pending = Number.isFinite(Number(pendingCount))
    ? Number(pendingCount)
    : enterpriseQueue.getQueueLength();

  if (pending === 0) {
    state.chain = {
      fiscalDayNo: Number(data.currentFiscalDayNo) || 0,
      dayOpen: !!data.fiscalDayOpen,
      dayOpenedAt: data.fiscalDayOpenedAt || null,
      receiptCounter: Number(data.dailyReceiptCount) || 0,
      receiptGlobalNo: Number(data.lastReceiptGlobalNo) || 0,
      lastFiscalHash: data.lastFiscalHash || null,
      lastReceiptAt: data.lastReceiptAt || null,
    };
  } else if (!state.chain) {
    // Pending receipts without a local chain means the state file was lost.
    // Fail closed instead of signing on top of an unknown sequence.
    state.chain = null;
  }

  save(state);
  return publicState(state);
}

function recoverPendingClaim() {
  const state = load();
  if (!state.pendingClaim) return publicState(state);
  const { queueId, before } = state.pendingClaim;
  if (enterpriseQueue.hasItem(queueId)) {
    state.pendingClaim = null;
  } else {
    state.chain = before || state.chain;
    state.pendingClaim = null;
  }
  save(state);
  return publicState(state);
}

let claimChain = Promise.resolve();

/**
 * Sign, claim counters and enqueue one receipt. Serialized so two file events
 * can never observe the same counters.
 */
function signAndQueue(invoice, options = {}) {
  const run = async () => {
    const state = load();
    const ready = readiness(state);
    if (!ready.ready) {
      throw Object.assign(new Error(ready.reason), { code: 'NOT_READY' });
    }

    const privateKeyPem = decryptPem(state.config.privateKey);
    const receipt = buildReceipt(invoice, state);
    const previousReceiptHash = receipt.receiptCounter === 1 ? null : (state.chain.lastFiscalHash || null);
    const signed = generateOfflineFiscalData({
      receiptData: receipt,
      previousReceiptHash,
      deviceId: state.config.deviceId,
      privateKeyPem,
      environment: state.config.environment,
    });

    const queueId = options.queueId || `fb-${options.docId || 'doc'}-${receipt.receiptGlobalNo}-${crypto.randomBytes(4).toString('hex')}`;
    const payload = buildQueuePayload(invoice, receipt, signed, state);
    payload.offlinePreviousHash = previousReceiptHash;

    const before = JSON.parse(JSON.stringify(state.chain));
    state.chain = {
      ...state.chain,
      receiptCounter: receipt.receiptCounter,
      receiptGlobalNo: receipt.receiptGlobalNo,
      lastFiscalHash: signed.hash,
      lastReceiptAt: receipt.receiptDate,
    };
    state.pendingClaim = { queueId, before };
    save(state);

    let queueLength;
    try {
      queueLength = enterpriseQueue.enqueue({ idempotencyKey: queueId, payload });
    } catch (error) {
      state.chain = before;
      state.pendingClaim = null;
      save(state);
      throw error;
    }

    state.pendingClaim = null;
    save(state);

    return {
      success: true,
      queueId,
      queueLength,
      fiscal: {
        fiscalCode: signed.hash,
        qrCode: signed.qrCode,
        verificationCode: signed.verificationCode,
        receiptGlobalNo: receipt.receiptGlobalNo,
        receiptCounter: receipt.receiptCounter,
        fiscalDayNo: state.chain.fiscalDayNo,
        offline: true,
        signedAt: receipt.receiptDate,
      },
    };
  };

  const result = claimChain.then(run, run);
  claimChain = result.catch(() => {});
  return result;
}

function getState() {
  return publicState(load());
}

module.exports = {
  init,
  bootstrap,
  signAndQueue,
  getState,
  recoverPendingClaim,
  // exported for tests
  _buildReceipt: buildReceipt,
  _latestReceiptDate: latestReceiptDate,
  _statePath: () => statePath,
};
