import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const buildTimestamp = new Date().toISOString()

// https://vite.dev/config/
export default defineConfig({
  define: {
    __BUILD_TIMESTAMP__: JSON.stringify(buildTimestamp),
  },
  plugins: [
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
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
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
})
