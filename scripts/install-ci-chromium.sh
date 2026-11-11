#!/usr/bin/env bash
set -euo pipefail

check_chromium() {
  node --input-type=module -e "import { chromium } from 'playwright-core'; const browser = await chromium.launch(); await browser.close();"
}

npx --no-install playwright-core install chromium
if ! check_chromium; then
  npx --no-install playwright-core install-deps chromium
  check_chromium
fi
