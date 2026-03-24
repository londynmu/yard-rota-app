/**
 * Runs Lighthouse in default navigation mode (not timespan) for baseline FCP/LCP/INP/TBT/CLS.
 *
 * Usage:
 *   npm run lighthouse:nav
 *   LIGHTHOUSE_BASE_URL=http://localhost:5173 npm run lighthouse:nav
 *
 * Notes:
 * - Protected routes (/admin, /calendar when logged in) will reflect redirect/login unless you use a logged-in profile (not configured here).
 * - Outputs a small summary JSON for CI/history and optional full LHR when LIGHTHOUSE_FULL_JSON=1.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import lighthouse from 'lighthouse';
import { launch as launchChrome } from 'chrome-launcher';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const outDir = path.join(root, 'lighthouse-reports');

const baseUrl = (process.env.LIGHTHOUSE_BASE_URL || 'https://shunters.net').replace(/\/$/, '');
const paths = (process.env.LIGHTHOUSE_PATHS || '/calendar,/admin').split(',').map((p) => p.trim()).filter(Boolean);
const writeFull = process.env.LIGHTHOUSE_FULL_JSON === '1';

function pickMetrics(lhr) {
  const a = lhr.audits || {};
  const num = (id) => (a[id]?.numericValue != null ? a[id].numericValue : null);
  return {
    performanceCategoryScore: lhr.categories?.performance?.score ?? null,
    firstContentfulPaintMs: num('first-contentful-paint'),
    largestContentfulPaintMs: num('largest-contentful-paint'),
    totalBlockingTimeMs: num('total-blocking-time'),
    cumulativeLayoutShift: num('cumulative-layout-shift'),
    interactionToNextPaintMs: num('interaction-to-next-paint'),
    speedIndex: num('speed-index'),
    timeToInteractiveMs: num('interactive'),
    maxPotentialFidMs: num('max-potential-fid'),
    networkServerLatencyMs: num('network-server-latency'),
  };
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

  const chrome = await launchChrome({
    chromeFlags: ['--headless', '--no-sandbox', '--disable-gpu'],
  });

  const summary = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    gatherMode: 'navigation',
    pages: [],
  };

  try {
    for (const p of paths) {
      const url = `${baseUrl}${p.startsWith('/') ? p : `/${p}`}`;
      const flags = {
        port: chrome.port,
        logLevel: 'error',
        onlyCategories: ['performance'],
      };

      const result = await lighthouse(url, flags);
      const lhr = result?.lhr;
      if (!lhr) {
        console.error('No LHR for', url);
        continue;
      }

      const pageEntry = {
        path: p,
        requestedUrl: lhr.requestedUrl,
        finalDisplayedUrl: lhr.finalDisplayedUrl,
        metrics: pickMetrics(lhr),
      };
      summary.pages.push(pageEntry);

      if (writeFull) {
        const safe = p.replace(/\//g, '_') || 'root';
        const fullPath = path.join(outDir, `nav-detail-${safe}-${stamp}.json`);
        fs.writeFileSync(fullPath, JSON.stringify(lhr, null, 2), 'utf8');
        console.log('Wrote', fullPath);
      }
    }
  } finally {
    await chrome.kill();
  }

  const summaryPath = path.join(outDir, 'navigation-baseline-summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf8');
  console.log('Baseline summary:', summaryPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
