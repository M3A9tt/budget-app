import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import ocrAssets from './scripts/ocr-assets.mjs'

export default defineConfig({
  plugins: [react(), ocrAssets()],
  build: {
    outDir: 'dist',
    sourcemap: false,
  }
})
