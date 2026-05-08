import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [react(), basicSsl()],
  resolve: {
    alias: {
      // jsPDF optionally imports these for SVG/HTML rendering — stub them out
      // since we don't use those features and the packages are not installed.
      canvg: fileURLToPath(new URL('./src/stubs/canvg.js', import.meta.url)),
      html2canvas: fileURLToPath(new URL('./src/stubs/html2canvas.js', import.meta.url)),
      dompurify: fileURLToPath(new URL('./src/stubs/dompurify.js', import.meta.url)),
    }
  },
  server: {
    host: '0.0.0.0',
    https: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path
      }
    }
  }
})
