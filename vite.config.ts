import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Bridge process.env into import.meta.env for deployed builds.
// In development, defaults come from the .env file.
const define: Record<string, string> = {};
for (const [key, value] of Object.entries(process.env)) {
  if (key.startsWith("VITE_")) {
    define[`import.meta.env.${key}`] = JSON.stringify(value);
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  define,
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  preview: {
    port: 5173,
    open: true,
  },
  server: {
    port: 5173,
    open: true,
  }
})
