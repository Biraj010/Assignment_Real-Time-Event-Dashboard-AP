/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const root = fileURLToPath(new URL('.', import.meta.url)).replace(/^[a-z]:/, (drive) =>
  drive.toUpperCase(),
)
process.chdir(root)

export default defineConfig({
  root,
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': 'http://localhost:4000',
      '/ws': { target: 'ws://localhost:4000', ws: true },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: 'src/test/setup.ts',
    globals: true,
  },
})
