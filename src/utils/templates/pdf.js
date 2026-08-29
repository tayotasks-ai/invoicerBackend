const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

// @sparticuz/chromium ships its own brotli-compressed Chromium binary built
// for exactly this problem - a generic Linux host (Render, Railway, an EC2
// box, a Lambda) with no Chrome/Chromium already installed and no apt/sudo
// access to install one during the build. It self-extracts to /tmp on first
// use. Optional at the require() level (wrapped in try/catch) so nothing
// breaks if it's ever removed - resolveExecutablePath()'s other paths (an
// explicit PUPPETEER_EXECUTABLE_PATH, or a real system Chrome/Chromium)
// still take priority when present, since those are faster to launch than
// extracting a bundled binary on every cold start.
let sparticuzChromium = null;
try {
  sparticuzChromium = require('@sparticuz/chromium').default;
} catch (err) {
  // Not installed - fine, resolveExecutablePath() just won't have this
  // fallback available.
}

// puppeteer-core (not full `puppeteer`) is used deliberately: it ships
// without its own bundled Chromium download, which failed in this sandbox's
// restricted network environment. Instead we resolve a Chromium binary at
// runtime:
//   1. PUPPETEER_EXECUTABLE_PATH - set this in production (e.g. point it at
//      the Chromium installed by `apt-get install chromium` /
//      `npx puppeteer browsers install chrome` on your host, or the one
//      baked into your Docker image).
//   2. A handful of common system install locations.
//   3. Playwright's bundled Chromium, if present (this dev sandbox has one)
//      - convenience only, not something to rely on in production.
//   4. @sparticuz/chromium's bundled binary (see above) - the fallback that
//      actually makes PDF generation work out of the box on a host like
//      Render with no Chrome preinstalled and no way to apt-get one in.
// If none resolve, htmlToPdfBuffer() throws a clear error rather than
// silently failing, since a missing browser is a hosting/deploy issue the
// operator needs to fix, not something to fail invoice generation on forever.
// Async (unlike the rest of this resolution chain) because
// @sparticuz/chromium's executablePath() extracts its bundled binary to
// /tmp on first call, which is inherently an async filesystem operation -
// everything above it in the chain is a synchronous fs.existsSync check, so
// this only actually awaits anything on the fallback path.
//
// Returns `{ executablePath, args }` rather than a bare path - the launch
// args differ for the sparticuz fallback (it ships its own recommended set,
// tuned for constrained/containerized hosts) vs. a real system
// Chrome/Chromium (the generic `--no-sandbox` set below), so the two need
// to travel together rather than being decided separately in getBrowser().
async function resolveExecutablePath() {
  const genericArgs = ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'];

  if (process.env.PUPPETEER_EXECUTABLE_PATH && fs.existsSync(process.env.PUPPETEER_EXECUTABLE_PATH)) {
    return { executablePath: process.env.PUPPETEER_EXECUTABLE_PATH, args: genericArgs };
  }

  const commonPaths = [
    // Linux (production hosts / Docker images)
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/snap/bin/chromium',
    // macOS (local development)
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  ];
  for (const candidate of commonPaths) {
    if (fs.existsSync(candidate)) return { executablePath: candidate, args: genericArgs };
  }

  const pwRoot = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  if (fs.existsSync(pwRoot)) {
    const found = findChromiumUnder(pwRoot);
    if (found) return { executablePath: found, args: genericArgs };
  }

  // Last resort - the bundled binary that actually makes this work
  // out-of-the-box on a host with no Chrome preinstalled (see the
  // require() comment above).
  if (sparticuzChromium) {
    const executablePath = await sparticuzChromium.executablePath();
    return { executablePath, args: sparticuzChromium.args };
  }

  return null;
}

function findChromiumUnder(root) {
  try {
    const entries = fs.readdirSync(root).filter((name) => name.startsWith('chromium'));
    for (const entry of entries) {
      const candidate = path.join(root, entry, 'chrome-linux', 'chrome');
      if (fs.existsSync(candidate)) return candidate;
    }
  } catch (err) {
    // ignore - falls through to null
  }
  return null;
}

let browserPromise = null;

// A single shared browser instance is reused across renders (launching
// Chromium per-request is slow and wasteful); if it crashes or disconnects,
// the next call transparently launches a fresh one.
async function getBrowser() {
  if (browserPromise) {
    const existing = await browserPromise;
    // puppeteer-core exposes connection state as a `connected` property, not
    // an isConnected() method (that's the older puppeteer API surface).
    if (existing && existing.connected) return existing;
    browserPromise = null;
  }

  const resolved = await resolveExecutablePath();
  if (!resolved) {
    throw new Error(
      'No Chromium executable found for PDF generation. Set PUPPETEER_EXECUTABLE_PATH ' +
      'to a Chromium/Chrome binary on this host, or make sure @sparticuz/chromium is ' +
      'installed (see src/utils/templates/pdf.js).'
    );
  }

  browserPromise = puppeteer.launch({
    executablePath: resolved.executablePath,
    headless: true,
    args: resolved.args,
  });
  return browserPromise;
}

// Renders an HTML document to a PDF buffer. Nothing is written to disk -
// callers stream/email/upload the returned Buffer directly.
async function htmlToPdfBuffer(html) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const buffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: false,
    });
    return Buffer.from(buffer);
  } finally {
    await page.close();
  }
}

async function closeBrowser() {
  if (!browserPromise) return;
  const existing = await browserPromise.catch(() => null);
  browserPromise = null;
  if (existing) await existing.close().catch(() => {});
}

module.exports = { htmlToPdfBuffer, getBrowser, resolveExecutablePath, closeBrowser };
