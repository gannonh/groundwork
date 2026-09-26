import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'

export default defineConfig({
  server: { port: 3000 },
  resolve: {
    tsconfigPaths: true,
    // tsconfig.json's `cn` path, which Vite skips for an installed package name.
    alias: [{ find: /^cn$/, replacement: fileURLToPath(new URL('./src/lib/utils.ts', import.meta.url)) }],
  },
  plugins: [
    nitro(),
    tailwindcss(),
    tanstackStart({
      router: { routeFileIgnorePattern: '\\.test\\.ts$' },
    }),
    viteReact(),
  ],
})
