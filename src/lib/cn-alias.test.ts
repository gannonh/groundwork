import * as NodePath from 'node:path'
import { createServer } from 'vite'
import { expect, it } from 'vitest'

const root = NodePath.join(import.meta.dirname, '../..')

// The dev server's SSR transform keeps a bare `cn` import unless vite.config.ts aliases it, and Vite then loads the npm package's cn, which does not know the type scale.
it("vite.config.ts's resolve.alias sends the shadcn components' `cn` import to src/lib/utils.ts", async () => {
  const server = await createServer({
    root,
    configFile: NodePath.join(root, 'vite.config.ts'),
    appType: 'custom',
    logLevel: 'silent',
    server: { middlewareMode: true, hmr: false, watch: null },
    optimizeDeps: { noDiscovery: true },
  })
  try {
    const result = await server.environments.ssr.fetchModule('/src/components/ui/button.tsx')
    if (!('code' in result)) throw new Error('fetchModule returned no code for button.tsx')
    const imports = [...result.code.matchAll(/__vite_ssr_import__\("([^"]+)"/g)].map((m) => m[1])
    expect(
      imports,
      'vite.config.ts is missing its resolve.alias for `cn`, so the dev server loads the npm package instead of src/lib/utils.ts',
    ).toContain('/src/lib/utils.ts')
  } finally {
    await server.close()
  }
})
