import fs from 'fs'
import path from 'path'

import react from '@vitejs/plugin-react-swc'
import { defineConfig } from 'vite'
import electron from 'vite-plugin-electron/simple'

// Read version from package.json
// Try multiple paths to support both local dev and Docker builds
function getAppVersion(): string {
  const possiblePaths = [
    '../../../package.json', // Local dev: project root is 3 levels up from frontend/apps/web
    '../../package.json', // Docker: frontend root is 2 levels up from apps/web
  ]

  for (const relativePath of possiblePaths) {
    try {
      const fullPath = path.resolve(__dirname, relativePath)
      const packageJson = JSON.parse(fs.readFileSync(fullPath, 'utf-8'))
      if (packageJson.version) {
        return packageJson.version
      }
    } catch {
      // Try next path
    }
  }

  console.warn('Could not read version from package.json, using "unknown"')
  return 'unknown'
}

const appVersion = getAppVersion()

export default defineConfig(({ mode }) => {
  const isElectron = mode === 'electron'
  const devApiTarget = process.env.VITE_DEV_API_TARGET || 'http://localhost:8000'

  return {
    define: {
      'import.meta.env.VITE_APP_VERSION': JSON.stringify(appVersion),
    },
    plugins: [
      react(),
      // Only enable electron plugin in electron mode
      ...(isElectron
        ? [
            electron({
              main: {
                // Main process entry file
                entry: 'electron/main.ts',
              },
              preload: {
                // Preload script entry
                input: 'electron/preload.ts',
              },
              // Optional: Use Node.js API in Renderer-process
              renderer: {},
            }),
          ]
        : []),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: 3000,
      proxy: {
        // Proxy API requests to backend server (for web mode)
        '/api': {
          target: devApiTarget,
          changeOrigin: true,
        },
      },
    },
    // Use relative path for Electron, absolute for web
    base: isElectron ? './' : '/',
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      cssCodeSplit: true,
      rollupOptions: {
        ...(isElectron ? { external: ['electron'] } : {}),
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return
            // Only split truly independent heavy libraries that don't depend on React.
            // Splitting React-dependent packages (zustand, react-query, i18next, etc.)
            // into separate chunks causes init-order errors: createContext is called
            // before vendor-react finishes executing.
            if (id.includes('lightgallery') || id.includes('highlight.js')) {
              return 'vendor-reader'
            }
          },
        },
      },
    },
  }
})
