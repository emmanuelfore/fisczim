const { parseMemp, parseGeneric } = require('../a4InvoiceParser');

const templates = {
  mempA: parseMemp,
  mempB: parseMemp,
  generic: parseGeneric,
};

function getTemplate(name) {
  return templates[name] || parseGeneric;
}

module.exports = { templates, getTemplate };
