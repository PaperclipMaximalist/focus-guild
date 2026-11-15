import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * The demo build only (`--mode ios-demo`): ship /demo-route.json, the file
 * that steers it (src/demo/driver.ts). Emitted here rather than kept in
 * public/, so neither the website nor the real app ever carries it.
 * n = 0 means nothing has been asked yet: the app stays where it opened.
 */
function demoRouteFile(): Plugin {
  return {
    name: 'focus-guild-demo-route',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'demo-route.json',
        source: JSON.stringify({ n: 0, path: '/', line: 'night' }),
      })
    },
  }
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), ...(mode === 'ios-demo' ? [demoRouteFile()] : [])],
  server: {
    host: '127.0.0.1',
  },
}))
