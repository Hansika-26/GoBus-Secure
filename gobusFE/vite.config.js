import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const securityHeaders = {
  // Vulnerability 2 fix: Content Security Policy header
  'Content-Security-Policy': [
    "default-src 'self'",
    // 'unsafe-inline' + 'unsafe-eval' required by Vite dev/preview server
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    "img-src 'self' data:",
    "connect-src 'self' http://localhost:5000 ws://localhost:5000",
    "object-src 'none'",
    "frame-ancestors 'none'",
  ].join('; '),
  // Vulnerability 3 fix: X-Frame-Options for legacy browser compatibility
  'X-Frame-Options': 'DENY',
  // Vulnerability 4 fix: prevent MIME-type sniffing
  'X-Content-Type-Options': 'nosniff',
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    cors: false,
    headers: securityHeaders,
  },
  preview: {
    cors: false,
    headers: securityHeaders,
  },
})
