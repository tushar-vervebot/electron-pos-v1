import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

// Workspace root is two levels up from frontend/frontend/
const root = resolve(__dirname, '../..')

export default defineConfig({
  main: {
    build: {
      lib: {
        entry: resolve(root, 'electron/main/index.js')
      }
    },
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    build: {
      lib: {
        entry: resolve(root, 'electron/preload/index.js')
      }
    },
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    root: resolve(root, 'src'),
    build: {
      rollupOptions: {
        input: resolve(root, 'src/index.html')
      }
    },
    resolve: {
      alias: {
        '@': resolve(root, 'src')
      }
    },
    plugins: [react()],
    css: {
      postcss: resolve(__dirname, 'postcss.config.js')
    }
  }
})
