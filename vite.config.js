import fs from 'node:fs'
import path from 'node:path'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { visualizer } from 'rollup-plugin-visualizer'

const buildTimestamp = new Date().toISOString()

const REQUIRED_VITE_ENV = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'VITE_SITE_URL']

function assertRequiredViteEnv(env, { command, mode }) {
  if (mode === 'test') return
  if (command !== 'build' && mode !== 'production') return
  const missing = REQUIRED_VITE_ENV.filter((key) => !String(env[key] || '').trim())
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}. Set them in Vercel (or .env.local) before building.`
    )
  }
}

/** Public site base URL (no trailing slash). Used for canonical, Open Graph, sitemap. */
function siteUrlFromEnv(env) {
  const raw = String(env.VITE_SITE_URL || '').trim()
  if (!raw) {
    throw new Error('VITE_SITE_URL is required (no trailing slash), e.g. https://dhl.shunters.net')
  }
  const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
  return withProto.replace(/\/$/, '')
}

const SEO_PAGE_TITLE = 'Yard Rota | Shunter availability, rota and yard induction'
const SEO_DESCRIPTION =
  'Built for shunter drivers: record your availability so yard managers can plan fair rotas. View your shifts, track moves and trailer shunts, see when breaks fall, and follow full yard induction materials with practical guidance for on-shift situations.'

/** Crawlers read the built index.html; inject absolute URLs for social previews and canonical. */
function seoPlugins(siteUrl) {
  const ogImage = `${siteUrl}/android-chrome-512x512.png`
  return [
    {
      name: 'seo-inject-head',
      transformIndexHtml(html) {
        const jsonLd = JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'WebApplication',
          name: 'Yard Rota',
          description: SEO_DESCRIPTION,
          url: `${siteUrl}/`,
          applicationCategory: 'BusinessApplication',
          operatingSystem: 'Any',
          image: ogImage,
        })
        const block = `
    <link rel="canonical" href="${siteUrl}/" />
    <meta name="robots" content="index, follow, max-image-preview:large" />
    <meta property="og:locale" content="en_GB" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${siteUrl}/" />
    <meta property="og:site_name" content="Yard Rota" />
    <meta property="og:title" content="${SEO_PAGE_TITLE}" />
    <meta property="og:description" content="${SEO_DESCRIPTION}" />
    <meta property="og:image" content="${ogImage}" />
    <meta property="og:image:width" content="512" />
    <meta property="og:image:height" content="512" />
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="${SEO_PAGE_TITLE}" />
    <meta name="twitter:description" content="${SEO_DESCRIPTION}" />
    <meta name="twitter:image" content="${ogImage}" />
    <script type="application/ld+json">${jsonLd}</script>`
        return html.replace(/<\/head>/i, `${block}\n  </head>`)
      },
    },
    {
      name: 'seo-write-robots-sitemap',
      closeBundle() {
        const distDir = path.resolve(process.cwd(), 'dist')
        if (!fs.existsSync(distDir)) return
        fs.writeFileSync(
          path.join(distDir, 'robots.txt'),
          `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}/sitemap.xml\n`,
          'utf8'
        )
        fs.writeFileSync(
          path.join(distDir, 'sitemap.xml'),
          `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${siteUrl}/</loc><changefreq>weekly</changefreq><priority>1</priority></url>
  <url><loc>${siteUrl}/privacy-policy.html</loc><changefreq>yearly</changefreq><priority>0.3</priority></url>
</urlset>
`,
          'utf8'
        )
      },
    },
  ]
}

// Replace oklab/oklch in CSS everywhere (dev + build) so html2canvas never sees them
function replaceOklabInCss() {
  return {
    name: 'replace-oklab-in-css',
    enforce: 'post',
    transform(code, id) {
      if (id.endsWith('.css') && typeof code === 'string') {
        const out = code
          .replace(/oklab\([^)]*\)/g, '#374151')
          .replace(/oklch\([^)]*\)/g, '#374151')
        return out !== code ? { code: out, map: null } : null
      }
      return null
    },
    generateBundle(_, bundle) {
      for (const [fileName, chunk] of Object.entries(bundle)) {
        if (chunk.type === 'asset' && fileName.endsWith('.css') && typeof chunk.source === 'string') {
          chunk.source = chunk.source
            .replace(/oklab\([^)]*\)/g, '#374151')
            .replace(/oklch\([^)]*\)/g, '#374151')
        }
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  const analyze = mode === 'analyze'
  const env = loadEnv(mode, process.cwd(), '')
  assertRequiredViteEnv(env, { command, mode })
  const siteUrl = command === 'build' || mode === 'production' ? siteUrlFromEnv(env) : siteUrlFromEnv({
    VITE_SITE_URL: env.VITE_SITE_URL || 'http://localhost:5173',
  })
  return {
  define: {
    __BUILD_TIMESTAMP__: JSON.stringify(buildTimestamp),
    __PRECHECK_SCHEMA_VERSION__: JSON.stringify('3'),
  },
  plugins: [
    replaceOklabInCss(),
    react(),
    ...seoPlugins(siteUrl),
    // Generate version.json for runtime version checking
    {
      name: 'generate-version-json',
      apply: 'build',
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'version.json',
          source: JSON.stringify({ version: buildTimestamp }),
        })
      },
    },
    ...(analyze
      ? [
          visualizer({
            filename: 'dist/bundle-stats.html',
            gzipSize: true,
            brotliSize: true,
            open: false,
            template: 'treemap',
          }),
        ]
      : []),
    VitePWA({
      // Manual registerSW in main.jsx after load — avoids render-blocking /registerSW.js in <head> (LCP)
      injectRegister: null,
      registerType: 'autoUpdate',
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'service-worker.js',
      includeAssets: ['android-chrome-512x512.png', 'vite.svg'],
      manifest: {
        name: 'Yard Rota',
        short_name: 'Yard Rota',
        description:
          'For shunter drivers: share availability for rota planning, track moves and trailer shunts, check breaks, and use full yard induction guidance.',
        lang: 'en-GB',
        theme_color: '#f8fafc',
        background_color: '#f8fafc',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: 'android-chrome-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      injectManifest: {
        // Exclude index.html from precache so document requests use NetworkFirst and users always get fresh entry (new JS hashes)
        globPatterns: ['**/*.{js,css,ico,png,svg,woff,woff2}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024, // 4 MB limit
      },
      devOptions: {
        enabled: false
      }
    })
  ],
  base: '/',
  build: {
    // Do not preload vendor-charts on first paint — charts load only on /performance etc.
    modulePreload: {
      resolveDependencies: (filename, deps) =>
        deps.filter((dep) => !dep.includes('vendor-charts')),
    },
    rollupOptions: {
      output: {
        manualChunks: {
          // Vendor chunks - biblioteki zewnętrzne
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-supabase': ['@supabase/supabase-js'],
          'vendor-charts': ['recharts', 'echarts', 'echarts-for-react'],
          'vendor-calendar': ['react-big-calendar', 'react-datepicker'],
          'vendor-pdf': ['jspdf', 'jspdf-autotable'],
          'vendor-utils': ['date-fns', 'framer-motion'],
        }
      }
    }
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: [],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/test/',
        '**/*.test.js',
        '**/*.config.js'
      ]
    }
  }
  }
})
