import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { visualizer } from 'rollup-plugin-visualizer'

const buildTimestamp = new Date().toISOString()

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
export default defineConfig(({ mode }) => {
  const analyze = mode === 'analyze'
  return {
  define: {
    __BUILD_TIMESTAMP__: JSON.stringify(buildTimestamp),
    __PRECHECK_SCHEMA_VERSION__: JSON.stringify('3'),
  },
  plugins: [
    replaceOklabInCss(),
    react(),
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
      registerType: 'autoUpdate',
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'service-worker.js',
      includeAssets: ['android-chrome-512x512.png', 'vite.svg'],
      manifest: {
        name: 'Yard Rota',
        short_name: 'Yard Rota',
        description: 'Aplikacja do zarządzania rotą w Yard',
        theme_color: '#ffffff',
        background_color: '#ffffff',
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
