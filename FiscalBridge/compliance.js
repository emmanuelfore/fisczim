const fs = require('fs');
const path = require('path');

function secureDelete(file) {
  try {
    if (!fs.existsSync(file)) return false;
    const size = fs.statSync(file).size;
    const fd = fs.openSync(file, 'r+');
    const buf = Buffer.alloc(size, 0);
    fs.writeSync(fd, buf, 0, size, 0);
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fs.unlinkSync(file);
    return true;
  } catch (e) {
    return false;
  }
}

function applyRetentionPolicy(files, maxAgeDays) {
  const now = Date.now();
  const maxAgeMs = (maxAgeDays || 30) * 24 * 60 * 60 * 1000;
  let removed = 0;
  for (const f of files) {
    try {
      const stat = fs.statSync(f);
      if (now - stat.mtimeMs > maxAgeMs) {
        if (secureDelete(f)) removed++;
      }
    } catch (e) {}
  }
  return removed;
}

function multiTenantKey(companyId) {
  return `tenant_${companyId}`;
}

module.exports = { secureDelete, applyRetentionPolicy, multiTenantKey };