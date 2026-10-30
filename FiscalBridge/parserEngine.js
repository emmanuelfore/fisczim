/**
 * parserEngine.js  –  Profile-driven invoice text parser.
 *
 * Pure functions only. No external dependencies.
 * All money uses JS number with Decimal-safe rounding via toFixed.
 *
 * Pipeline:
 *   parseWithProfile(text, profile) → OutputJSON
 *
 * Sub-steps:
 *   detect(text, profiles)      → best matching profile
 *   runFields(lines, profile)   → header fields
 *   runParties(lines, profile)  → supplier + customer blocks
 *   runItems(lines, profile)    → line items
 *   runTotals(lines, profile)   → totals object
 *   validate(output, profile)   → warnings[], confidence
 */

'use strict';

// ─── Money helpers ────────────────────────────────────────────────────────────
function parseMoney(str, locale = {}) {
  if (str == null || str === '') return null;
  const sym = (locale.currency_symbol || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let s = String(str).trim();
  // Strip currency symbol — handle both "M123.45" and "M 123.45" forms
  if (sym) s = s.replace(new RegExp(sym + '\\s*', 'g'), '');
  // Also strip common currency prefixes if no symbol configured
  s = s.replace(/^[A-Z$£€₦₱฿]\s*/, '');
  const thou = locale.thousands_sep || ',';
  const dec  = locale.decimal_sep   || '.';
  s = s.replace(new RegExp('\\' + thou, 'g'), '');
  if (dec !== '.') s = s.replace(dec, '.');
  // Negative formats: (123) or -123
  s = s.replace(/^\((.*)\)$/, '-$1');
  const v = parseFloat(s.replace(/[^0-9.\-]/g, ''));
  return isNaN(v) ? null : Math.round(v * 10000) / 10000;
}

const MONTHS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];

function _monthToNum(tok) {
  if (/^\d+$/.test(tok)) return parseInt(tok, 10);
  const i = MONTHS.indexOf(String(tok).slice(0, 3).toLowerCase());
  return i >= 0 ? i + 1 : NaN;
}

function parseDate(str, fmt = 'DD/MM/YYYY') {
  if (!str) return null;
  str = String(str).trim().replace(/,/g, ' ');
  const parts = str.split(/[\/\-\.\s]+/).filter(Boolean);
  if (parts.length < 3) return null;
  let d, m, y;
  // Month-name dates (e.g. "29 Oct 2026", "Oct 29 2026") are order-independent.
  const nameIdx = parts.slice(0, 3).findIndex(p => /^[a-z]{3,}$/i.test(p));
  if (nameIdx >= 0) {
    m = _monthToNum(parts[nameIdx]);
    const nums = parts.slice(0, 3).filter((_, i) => i !== nameIdx).map(n => parseInt(n, 10));
    if (nums[0] > 31) { y = nums[0]; d = nums[1]; } else { d = nums[0]; y = nums[1]; }
  } else {
    const fmtParts = fmt.split(/[^DMY]+/i).filter(Boolean);
    fmtParts.forEach((p, i) => {
      const v = parseInt(parts[i] || '0', 10);
      const k = p.toUpperCase()[0];
      if (k === 'D') d = v; else if (k === 'M') m = v; else y = v;
    });
  }
  if (y < 100) y += 2000;
  if (!d || !m || !y || m > 12 || d > 31) return null;
  // Validate without timezone conversion (toISOString would shift in UTC+ zones).
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function _escRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function round2(n) { return Math.round((n || 0) * 100) / 100; }

// ─── Text helpers ─────────────────────────────────────────────────────────────
function splitLines(text) {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
}

function matchLabel(line, labelCfg) {
  // labelCfg: { label?, label_regex?, skip_labels? }
  if (labelCfg.skip_labels) {
    for (const sl of labelCfg.skip_labels) {
      if (line.toUpperCase().includes(sl.toUpperCase())) return false;
    }
  }
  if (labelCfg.label_regex) {
    return new RegExp(labelCfg.label_regex, 'i').test(line);
  }
  if (labelCfg.label) {
    return line.toUpperCase().includes(labelCfg.label.toUpperCase());
  }
  return false;
}

function extractValue(line, labelCfg, terminator = 'eol') {
  let rest = line;
  if (labelCfg.label_regex) {
    rest = line.replace(new RegExp(labelCfg.label_regex, 'i'), '').trim();
  } else if (labelCfg.label) {
    const idx = line.toUpperCase().indexOf(labelCfg.label.toUpperCase());
    rest = idx >= 0 ? line.slice(idx + labelCfg.label.length).trim() : line.trim();
  }
  if (terminator === 'gap2') {
    // Take everything up to 2+ consecutive spaces
    const m = rest.match(/^(.+?)  +/);
    rest = m ? m[1].trim() : rest.split(/\s{2,}/)[0].trim();
  }
  return rest.replace(/^[\s:]+/, '').trim() || null;
}

// ─── 1. Detection ─────────────────────────────────────────────────────────────
/**
 * Rank profiles by fraction of fingerprints matched; `priority` only breaks ties
 * (then more fingerprints = more specific). Profiles below `min_detection`
 * (default 0.5) are rejected.
 */
function detect(text, profiles) {
  if (!profiles || !profiles.length) return { profile: null, confidence: 0 };
  let best = null, bestConf = 0, bestPri = -Infinity, bestN = 0;
  for (const profile of profiles) {
    const fps = profile.detection || [];
    if (!fps.length) continue;
    let matched = 0;
    for (const fp of fps) {
      let hit = false;
      if (fp.type === 'text_contains') {
        hit = text.includes(fp.value);
      } else if (fp.type === 'regex') {
        hit = new RegExp(fp.pattern || fp.value, 'i').test(text);
      } else if (fp.type === 'text_contains_ci') {
        hit = text.toLowerCase().includes((fp.value||'').toLowerCase());
      }
      if (hit) matched++;
    }
    const conf = matched / fps.length;
    if (conf < (profile.min_detection ?? 0.5)) continue;
    const pri = profile.priority || 0;
    const better = conf > bestConf ||
      (conf === bestConf && (pri > bestPri || (pri === bestPri && fps.length > bestN)));
    if (better) { best = profile; bestConf = conf; bestPri = pri; bestN = fps.length; }
  }
  return { profile: best, confidence: best ? bestConf : 0 };
}

// ─── 2. Header fields ─────────────────────────────────────────────────────────
function runFields(lines, profile) {
  const locale  = profile.locale  || {};
  const fields  = profile.header_fields || [];
  const result  = {};
  for (const fld of fields) {
    result[fld.name] = fld.default !== undefined ? fld.default : null;
  }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const fld of fields) {
      if (result[fld.name] !== null && result[fld.name] !== undefined &&
          result[fld.name] !== (fld.default !== undefined ? fld.default : null)) continue;
      if (!matchLabel(line, fld)) continue;
      let raw = extractValue(line, fld, fld.terminator || 'eol');
      // If value is empty, peek at next line
      if (!raw && fld.value_next_line) raw = lines[i + 1] ? lines[i + 1].trim() : null;
      if (!raw) { result[fld.name] = null; continue; }
      if (fld.type === 'date')    result[fld.name] = parseDate(raw, locale.date_format || 'DD/MM/YYYY');
      else if (fld.type === 'money')   result[fld.name] = parseMoney(raw, locale);
      else if (fld.type === 'percent') result[fld.name] = parseFloat(raw.replace('%','')) || null;
      else result[fld.name] = raw || null;
    }
  }
  return result;
}

// ─── 3. Parties ───────────────────────────────────────────────────────────────
function runParties(lines, profile) {
  const parties  = profile.parties || {};
  const supplier = _extractParty(lines, parties.supplier);
  const customer = _extractParty(lines, parties.customer);
  return { supplier, customer };
}

function _extractParty(lines, cfg) {
  if (!cfg) return null;
  const anchor = cfg.anchor || '';
  const numLines = cfg.lines || 4;

  // Try explicit top anchor first
  for (let i = 0; anchor && i < lines.length; i++) {
    if (lines[i].toUpperCase().includes(anchor.toUpperCase())) {
      const block = [];
      for (let j = i + 1; j < i + 1 + numLines && j < lines.length; j++) {
        const l = lines[j].trim();
        if (l) block.push(l);
      }
      return {
        name:    block[0] || null,
        vat_no:  _extractVAT(block),
        address: block.filter((l, idx) => idx > 0 && !_looksLikeVAT(l)).join(', ') || null,
        _raw:    block,
      };
    }
  }

  // Bottom anchor (e.g. "Customer VAT No:") → go up N lines
  if (cfg.anchor_bottom) {
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toUpperCase().includes(cfg.anchor_bottom.toUpperCase())) {
        const block = [];
        for (let j = Math.max(0, i - numLines); j < i; j++) {
          const l = lines[j].trim();
          if (l && !_looksLikeVAT(l)) block.push(l);
        }
        return {
          name:   block[block.length - 1] || null,
          vat_no: _extractVAT([lines[i]]),
          _raw:   block,
        };
      }
    }
  }

  // Fallback for supplier: scan for VAT No: and use the line ABOVE it as the company name.
  // This handles Sage/Memp layouts where the company name appears at the top without a "FROM" marker.
  if (cfg._vatFallback !== false && !cfg.anchor_bottom) {
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/VAT\s*No[.:]?\s*([\d]+)/i);
      if (m) {
        // Walk backward to find the company name (first non-empty, non-header line)
        for (let j = i - 1; j >= 0; j--) {
          const l = lines[j].trim();
          if (!l) continue;
          if (/^Tax Invoice|^COPY TAX INVOICE/i.test(l)) break;
          // Skip address-like lines (contain digits + street words) and email/phone lines
          if (/\d.*\d|@|www\.|Tel:|Fax:|Along|Road|Street|Avenue|P\.?O\.|Lesotho/i.test(l)) continue;
          return { name: l, vat_no: m[1], _raw: [l] };
        }
        return { name: null, vat_no: m[1], _raw: [] };
      }
    }
  }

  return null;
}

function _extractVAT(lines) {
  for (const l of lines) {
    const m = l.match(/VAT\s*(?:No\.?|Number)?[:\s]+([A-Z0-9]{4,})/i);
    if (m) return m[1].trim();
  }
  return null;
}
function _looksLikeVAT(line) { return /VAT\s*(No|Number)?[:\s]/i.test(line); }

// ─── 4. Banking details ───────────────────────────────────────────────────────
function runBank(lines, profile) {
  const bankCfg = profile.bank || {};
  const startMarker = bankCfg.start_marker || 'BANKING DETAILS';
  const fields = bankCfg.fields || [
    { name:'bank_name',      label:'Bank' },
    { name:'account_name',   label:'Account Name' },
    { name:'account_number', label:'Account' },
    { name:'branch_code',    label:'Branch Code' },
    { name:'swift',          label:'Swift Code' },
  ];
  let inBlock = false;
  const bank = {};
  for (const line of lines) {
    if (line.toUpperCase().includes(startMarker.toUpperCase())) { inBlock = true; continue; }
    if (!inBlock) continue;
    // Longest labels first so "Account Name" claims its line before "Account".
    const sorted = [...fields].sort((a, b) => b.label.length - a.label.length);
    let claimed = false;
    for (const fld of sorted) {
      if (claimed || bank[fld.name]) continue;
      // Label must be a whole phrase followed by ":" / whitespace / EOL, not a longer phrase
      // (e.g. "Account" must not match "Account Name").
      const re = new RegExp(`(?:^|\\s)${_escRe(fld.label)}\\s*(?::|\\s|$)\\s*(.*)$`, 'i');
      const m = line.match(re);
      if (!m) continue;
      const val = m[1].trim();
      if (fields.some(o => o !== fld && o.label.length > fld.label.length &&
          new RegExp(`(?:^|\\s)${_escRe(o.label)}(?::|\\s|$)`, 'i').test(line))) continue;
      if (val) { bank[fld.name] = val; claimed = true; }
    }
  }
  return Object.keys(bank).length ? bank : null;
}

// ─── 5. Line items ────────────────────────────────────────────────────────────
function runItems(lines, profile) {
  const cfg    = profile.line_items || {};
  const locale = profile.locale     || {};
  const colMap = cfg.column_map     || ['description','qty','unit_price_excl','disc_pct','vat_pct','total_excl','total_incl'];
  const dotN   = cfg.item_dot_counter !== undefined ? cfg.item_dot_counter : 2;
  const multi  = cfg.multiline_products || 'no';   // 'no'|'yes'|'auto'
  const skip   = (cfg.skip_patterns || []).map(p => new RegExp(p, 'i'));

  // Locate start and end boundaries
  let startIdx = 0, endIdx = lines.length;
  if (cfg.start_marker) {
    for (let i = 0; i < lines.length; i++) {
      if (new RegExp(cfg.start_marker, 'i').test(lines[i])) {
        startIdx = i + 1 + (cfg.start_line_offset || 0); break;
      }
    }
  }
  if (cfg.end_marker) {
    for (let i = startIdx; i < lines.length; i++) {
      if (new RegExp(cfg.end_marker, 'i').test(lines[i])) { endIdx = i; break; }
    }
  }

  const slice = lines.slice(startIdx, endIdx)
    .map(l => l.trim())
    .filter(l => l && !skip.some(r => r.test(l)));
  const items = [];
  let current = null;  // last parsed item row (receives continuation lines)
  let prefix  = [];    // description text seen before the next item row ('auto' mode)

  for (let i = 0; i < slice.length; i++) {
    const line = slice[i];
    if (_isItemRow(line, dotN, cfg.row_regex)) {
      if (current) items.push(current);
      current = _parseItemRow(line, colMap, locale, cfg);
      if (prefix.length) {
        // Combine prefix + description, then re-run code_split on the full string
        const combined = [...prefix, current.description || ''].join(' ').trim();
        if (!current.code && cfg.code_split && cfg.code_split.separator && combined.includes(cfg.code_split.separator)) {
          const sep = cfg.code_split.separator;
          const pos = cfg.code_split.position || 'first';
          const parts = combined.split(sep);
          const code = (pos === 'first' ? parts[0] : parts[parts.length - 1]).trim();
          if (code && !/\s/.test(code)) {
            if (pos === 'first') parts.shift(); else parts.pop();
            current.code = code;
            current.description = parts.join(sep).trim();
          } else {
            current.description = combined;
          }
        } else {
          current.description = combined;
        }
        prefix = [];
      }
    } else if (multi === 'auto') {
      // A text line directly followed by an item row is a prefix of that item;
      // otherwise it continues the previous item.
      const next = slice[i + 1];
      if (next && _isItemRow(next, dotN, cfg.row_regex)) prefix.push(line);
      else if (current) current.description = ((current.description || '') + ' ' + line).trim();
    } else if (multi !== 'no' && current) {
      current.description = ((current.description || '') + ' ' + line).trim();
    }
  }
  if (current) items.push(current);

  return items.map(item => _postProcessItem(item, profile));
}

function _isItemRow(line, dotN, rowRegex) {
  if (rowRegex) return new RegExp(rowRegex, 'i').test(line);
  // Count decimal tokens — strip leading currency symbols (M, $, R, £, €, etc.)
  // so "M46.95" is counted the same as "46.95"
  const stripped = line.replace(/[A-Z$£€₦₱฿](?=\d)/g, '');
  const tokens = (stripped.match(/\d+\.\d{2,}/g) || []);
  return tokens.length >= dotN;
}

function _parseItemRow(line, colMap, locale, cfg) {
  // Split on 2+ spaces (layout-mode column delimiter)
  const cols = line.split(/\s{2,}/).map(s => s.trim()).filter(Boolean);
  const item = {};

  // Detach item code from the description column when a separator is configured
  // (e.g. "WID001 - Widget"). Only splits when the first part looks like a code (no spaces).
  if (cols.length && cfg.code_split && cfg.code_split.separator) {
    const sep = cfg.code_split.separator;
    const pos = cfg.code_split.position || 'first';
    if (cols[0].includes(sep)) {
      const parts = cols[0].split(sep);
      const code = (pos === 'first' ? parts[0] : parts[parts.length - 1]).trim();
      if (code && !/\s/.test(code)) {
        if (pos === 'first') parts.shift(); else parts.pop();
        item.code = code;
        cols[0] = parts.join(sep).trim();
      }
    }
  }

  colMap.forEach((name, i) => {
    if (i >= cols.length) return;
    const raw = cols[i];
    if (!raw) return;
    if (name === 'hs_code') { item.hs_code = raw.replace(/[^0-9]/g, '') || null; return; }
    const money = ['unit_price_excl','unit_price_incl','total_excl','total_incl','disc_amount'].includes(name);
    const pct   = ['disc_pct','vat_pct'].includes(name);
    const num   = ['qty'].includes(name);
    if (money || num || pct) {
      item[name] = parseMoney(raw, locale);
    } else {
      item[name] = raw || null;
    }
  });

  return item;
}

function _postProcessItem(item, profile) {
  const tax    = profile.tax     || {};
  const locale = profile.locale  || {};
  const std    = tax.vat_standard_pct || 15;
  const exempt = tax.vat_exempt_pct   || 0;

  // Derive vat_class
  const vp = item.vat_pct;
  item.vat_class = (vp === 0 || vp === exempt) ? 'exempt' : (vp === std ? 'standard' : vp != null ? 'other' : null);

  // Optional ZIMRA tax mapping: tax.code_map = { "15": { tax_id: 1, tax_code: "A" }, "0": {...} }
  if (tax.code_map) {
    const key = String(vp != null ? vp : std);
    const map = tax.code_map[key] || tax.code_map[item.vat_class] || null;
    if (map) { item.tax_id = map.tax_id ?? null; item.tax_code = map.tax_code ?? null; }
  }

  // Derive missing totals
  const qty   = item.qty        || 1;
  const price = item.unit_price_excl;
  const disc  = (item.disc_pct || 0) / 100;
  const vatR  = (item.vat_pct  || std) / 100;

  if (price != null && item.total_excl == null) {
    item.total_excl = round2(qty * price * (1 - disc));
  }
  if (item.total_excl != null && item.total_incl == null) {
    item.total_incl = round2(item.total_excl * (1 + vatR));
  }

  // Post-processing rules
  for (const rule of (profile.post_processing || [])) {
    if (rule.field in item && item[rule.field] != null) {
      item[rule.field] = _applyPostProc(String(item[rule.field]), rule);
    }
  }

  // Remove internal flags
  delete item._prefixOnly;
  return item;
}

function _applyPostProc(val, rule) {
  if (rule.op === 'trim')           return val.trim();
  if (rule.op === 'collapse_spaces') return val.replace(/\s+/g, ' ').trim();
  if (rule.op === 'uppercase')      return val.toUpperCase();
  if (rule.op === 'lowercase')      return val.toLowerCase();
  if (rule.op === 'regex_replace')  return val.replace(new RegExp(rule.pattern, 'g'), rule.replacement || '');
  if (rule.op === 'lookup' && rule.map) return rule.map[val] || val;
  return val;
}

// ─── 6. Totals ────────────────────────────────────────────────────────────────
function runTotals(lines, profile) {
  const locale   = profile.locale || {};
  const labelMap = (profile.totals || {}).label_map || {};
  const totals   = {};

  // Build reverse map: normalized_label -> field_name (longest first to avoid prefix matches)
  const normEntries = Object.entries(labelMap)
    .map(([label, fieldName]) => [label.toUpperCase().trim(), fieldName])
    .sort((a, b) => b[0].length - a[0].length);

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim();
    const lUp = l.toUpperCase();

    for (const [normLabel, fieldName] of normEntries) {
      if (totals[fieldName] != null) continue;

      // Match label anywhere on the line but with word-boundary semantics:
      // The label must NOT be immediately followed by a letter (prevents "Total" matching "Total Discount").
      let found = false;
      const idx = lUp.indexOf(normLabel);
      if (idx >= 0) {
        const before = idx === 0 ? '' : lUp[idx - 1];
        const afterChar = lUp[idx + normLabel.length] || '';
        const okBefore = before === '' || /[\s:]/.test(before);
        // After the label, allow only colon, space followed by non-alpha, or end-of-string
        // "TOTAL:" → ok; "TOTAL " followed by "M1" → ok; "TOTAL DISCOUNT" → NOT ok
        const okAfter = afterChar === '' || afterChar === ':' || (afterChar === ' ' && !/[A-Z]/i.test(lUp[idx + normLabel.length + 1] || ''));
        found = okBefore && okAfter;
      }
      if (!found) continue;

      // Value: text after the label on the same line
      let raw = l.slice(lUp.indexOf(normLabel) + normLabel.length).replace(/^[\s:]+/, '').trim();

      // If value is empty or just whitespace, look at the next non-empty line
      if (!raw) {
        for (let j = i + 1; j < i + 3 && j < lines.length; j++) {
          const next = lines[j].trim();
          if (next) { raw = next; break; }
        }
      }

      // When the rest of the line has multiple money tokens (two-column layout),
      // grab the LAST one (right-hand value column).
      const moneyTokens = raw.match(/[A-Z]?\d[\d,]*\.\d{2}/gi) || [];
      if (moneyTokens.length > 1) raw = moneyTokens[moneyTokens.length - 1];

      const money = parseMoney(raw, locale);
      // Guard against zero being returned for empty/no-match lines
      if (money !== null && (money !== 0 || /[M$£€]?0\.00/.test(raw))) totals[fieldName] = money;
    }
  }
  return totals;
}

// ─── 7. Validation ────────────────────────────────────────────────────────────
function validate(output, profile) {
  const valCfg  = profile.validation  || {};
  const tol     = valCfg.tolerance    || 0.02;
  const checks  = valCfg.checks       || [];
  const reqd    = valCfg.required_fields || [];
  const warnings = [];

  function warn(id, msg, sev = 'warn') { warnings.push({ id, message: msg, severity: sev }); }
  function near(a, b) { return Math.abs((a||0) - (b||0)) <= tol; }

  const totals = output.totals || {};
  const items  = output.line_items || [];

  for (const chk of checks) {
    const sev = chk.severity || 'warn';
    if (chk.id === 'lines_excl_sum') {
      const sum = round2(items.reduce((s, i) => s + (i.total_excl || 0), 0));
      if (totals.total_excl != null && !near(sum, totals.total_excl)) {
        warn('lines_excl_sum', `Sum of line excl (${sum}) ≠ total_excl (${totals.total_excl})`, sev);
      }
    }
    if (chk.id === 'excl_plus_vat') {
      const calc = round2((totals.total_excl || 0) + (totals.vat || 0));
      const exp  = totals.sub_total || totals.grand_total;
      if (exp != null && !near(calc, exp)) {
        warn('excl_plus_vat', `excl+vat (${calc}) ≠ sub_total (${exp})`, sev);
      }
    }
    if (chk.id === 'lines_incl_sum') {
      const sum = round2(items.reduce((s, i) => s + (i.total_incl || 0), 0));
      const exp = totals.sub_total || totals.grand_total;
      if (exp != null && !near(sum, exp)) {
        warn('lines_incl_sum', `Sum of line incl (${sum}) ≠ sub_total (${exp})`, sev);
      }
    }
    if (chk.id === 'allowed_vat_rates' && chk.rates) {
      for (const item of items) {
        if (item.vat_pct != null && !chk.rates.includes(item.vat_pct)) {
          warn('allowed_vat_rates', `Unexpected VAT rate ${item.vat_pct}% on "${item.description}"`, sev);
        }
      }
    }
  }

  for (const fieldName of reqd) {
    const val = output[fieldName] ?? (output.totals || {})[fieldName];
    if (val == null || val === '') {
      warn('required_field', `Required field "${fieldName}" is missing`, 'fail');
    }
  }

  // Confidence: starts at 1, deducted per failure
  const failCount = warnings.filter(w => w.severity === 'fail').length;
  const warnCount = warnings.filter(w => w.severity === 'warn').length;
  const hasItems  = items.length > 0;
  const confidence = Math.max(0, 1 - failCount * 0.25 - warnCount * 0.05 - (hasItems ? 0 : 0.3));

  return { warnings, confidence: Math.round(confidence * 100) / 100 };
}

// ─── 8. Full pipeline ─────────────────────────────────────────────────────────
/**
 * Parse invoice text using a specific profile.
 * @param {string} text       Raw extracted text from PDF
 * @param {object} profile    Profile object
 * @param {string} sourceFile Optional filename for metadata
 * @returns {object}          Output JSON
 */
function parseWithProfile(text, profile, sourceFile = null) {
  const lines = splitLines(text);

  // 1. Header fields
  const fields  = runFields(lines, profile);

  // 2. Parties
  const parties = runParties(lines, profile);

  // 3. Banking
  const bank    = runBank(lines, profile);
  if (parties.supplier && bank) parties.supplier.bank = bank;

  // 4. Line items
  const lineItems = runItems(lines, profile);

  // 5. Totals
  const totals = runTotals(lines, profile);

  // 6. Build output
  const output = {
    source_file:            sourceFile,
    profile:                `${profile.id}@${profile.version || 1}`,
    document_type:          fields.document_type || profile.name || null,
    is_copy:                _isCopy(text, profile),
    invoice_number:         fields.invoice_number   || null,
    date:                   fields.date             || null,
    due_date:               fields.due_date         || null,
    reference:              fields.reference        || null,
    sales_rep:              fields.sales_rep        || null,
    overall_discount_pct:   fields.overall_discount_pct || null,
    currency:               (profile.locale || {}).currency_iso || null,
    supplier:               parties.supplier        || null,
    customer:               parties.customer        || null,
    line_items:             lineItems,
    totals,
  };

  // 7. Validate
  const { warnings, confidence } = validate(output, profile);
  output.validation_warnings = warnings;
  output.confidence = confidence;

  return output;
}

/**
 * Auto-detect best profile and parse.
 * @param {string} text     Extracted text
 * @param {object[]} profiles Array of all available profiles
 * @param {string} sourceFile
 */
function parseAutoDetect(text, profiles, sourceFile = null) {
  const { profile, confidence: detConf } = detect(text, profiles);
  if (!profile) {
    return {
      source_file: sourceFile, profile: null,
      status: 'needs_review', reason: 'No matching profile found',
      confidence: 0, validation_warnings: [],
    };
  }
  const result = parseWithProfile(text, profile, sourceFile);
  // Blend detection confidence
  result.confidence = Math.round(result.confidence * detConf * 100) / 100;
  if (result.confidence < 0.4 || result.validation_warnings.some(w => w.severity === 'fail')) {
    result.status = 'needs_review';
  } else {
    result.status = 'ok';
  }
  return result;
}

function _isCopy(text, profile) {
  // profile.copy_markers: all strings must be present (case-sensitive). Default keeps legacy behaviour.
  const markers = profile.copy_markers || ['COPY', 'TAX INVOICE'];
  return markers.length > 0 && markers.every(m => text.includes(m));
}

// ─── 9. Fiscal schema mapping ─────────────────────────────────────────────────
/**
 * Map parserEngine output → shape that /api/zimra/fiscalise (passThroughFiscalizeSchema) accepts.
 *
 * The API needs:
 *   items[].name, items[].quantity (number), items[].unitPrice (number excl VAT),
 *   items[].taxType ("STANDARD"|"ZERO_RATED"|"EXEMPT")
 *   buyer.name, buyer.vatNumber (9 digits), buyer.tin (10 digits)
 *   invoiceNumber, date (YYYY-MM-DD), currency
 */
function toFiscalInvoice(out) {
  if (!out || !out.profile) return null;
  const t = out.totals || {};
  const locale = out.currency || 'USD';

  // Map vat_pct → taxType string
  function taxType(vat_pct) {
    if (vat_pct == null || vat_pct > 0) return 'STANDARD';
    return 'EXEMPT';
  }

  // Sanitize buyer fields to meet ZIMRA validation rules
  const rawVat = (out.customer?.vat_no || '').replace(/\D/g, '');
  const rawTin = (out.customer?.tin    || '').replace(/\D/g, '');
  const buyer = {
    name: out.customer?.name || null,
    ...(rawVat.length === 9  ? { vatNumber: rawVat } : {}),
    ...(rawTin.length === 10 ? { tin: rawTin }       : {}),
    ...(out.customer?.email  ? { email: out.customer.email }  : {}),
    ...(out.customer?.phone  ? { phone: out.customer.phone }  : {}),
  };
  const hasBuyerData = buyer.name || buyer.vatNumber || buyer.tin || buyer.email || buyer.phone;

  const items = (out.line_items || []).map(it => {
    // The API computes totals server-side; we send unit price (excl VAT) + qty
    const qty    = it.qty != null ? it.qty : 1;
    const price  = it.unit_price_excl != null
      ? it.unit_price_excl
      : (it.total_excl != null ? it.total_excl / qty : 0);

    return {
      name:      (it.description || 'Item').slice(0, 100),
      quantity:  qty,
      unitPrice: parseFloat(price.toFixed(4)),
      taxType:   taxType(it.vat_pct),
      taxInclusive: false,
      ...(it.code ? { sku: it.code } : {}),
    };
  });

  return {
    items,
    invoiceNumber: out.invoice_number || undefined,
    date:          out.date           || undefined,   // already YYYY-MM-DD from parseDate
    currency:      locale === 'LSL' ? 'USD' : (locale || 'USD'), // FiscalStack uses USD/ZWG
    ...(hasBuyerData ? { buyer } : {}),
  };
}

module.exports = { detect, runFields, runParties, runBank, runItems, runTotals, validate, parseWithProfile, parseAutoDetect, toFiscalInvoice, parseDate, parseMoney };
