import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'node:fs'
import path from 'node:path'

const httpsKeyPath = process.env.VITE_HTTPS_KEY
const httpsCertPath = process.env.VITE_HTTPS_CERT
const https =
  httpsKeyPath && httpsCertPath
    ? {
        key: fs.readFileSync(path.resolve(httpsKeyPath)),
        cert: fs.readFileSync(path.resolve(httpsCertPath)),
      }
    : undefined

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',
    https,
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET ?? 'http://127.0.0.1:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
