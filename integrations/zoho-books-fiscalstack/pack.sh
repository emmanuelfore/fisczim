#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

rm -rf build dist
mkdir -p build/settings build/invoice dist

cp -R src/app build/settings/app
cp src/manifest.settings.json build/settings/plugin-manifest.json

cp -R src/app build/invoice/app
cp src/manifest.invoice.json build/invoice/plugin-manifest.json

(
  cd build/settings
  zip -qr "$SCRIPT_DIR/dist/FiscalStackSettings.zip" plugin-manifest.json app
)

(
  cd build/invoice
  zip -qr "$SCRIPT_DIR/dist/FiscalStackInvoice.zip" plugin-manifest.json app
)

echo "Built:"
echo "  dist/FiscalStackSettings.zip"
echo "  dist/FiscalStackInvoice.zip"
