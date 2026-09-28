import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const securityHeaders = {
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    "img-src 'self' data:",
    "connect-src 'self' http://localhost:5000 ws://localhost:5000",
    "object-src 'none'",
    "frame-ancestors 'none'",
  ].join("; "),
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
};

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
});