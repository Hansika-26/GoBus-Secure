import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    headers: {
      // Vulnerability 2 fix: Content Security Policy header
      'Content-Security-Policy': [
        "default-src 'self'",
        // 'unsafe-inline' + 'unsafe-eval' required by Vite HMR and @vitejs/plugin-react preamble (dev only)
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com",
        "img-src 'self' data:",
        "connect-src 'self' http://localhost:5000 ws://localhost:5000",
        "object-src 'none'",
        "frame-ancestors 'none'",
      ].join('; '),
      // Vulnerability 3 fix: X-Frame-Options for legacy browser compatibility
      // frame-ancestors 'none' (above) covers modern browsers; this covers pre-CSP2 browsers
      'X-Frame-Options': 'DENY',
    },
  },
})
