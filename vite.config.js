import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// `npm run dev` serves the UI on :5173 and proxies the API to the kodo server
// (start it with `npm run dev:server`).
const server = process.env.KODO_SERVER || 'http://127.0.0.1:4173'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': server,
      '/oauth': server,
    },
  },
})
