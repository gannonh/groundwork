import js from '@eslint/js'
import { defineConfig } from 'eslint/config'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'
import eslintComments from '@eslint-community/eslint-plugin-eslint-comments'
import { ONE_OFF_SCALE_VALUE } from './scripts/tailwind-scale.ts'

export default defineConfig(
  { ignores: ['.output', '.nitro', '.tanstack', 'playwright-report', 'test-results', '.claude', '.verify'] },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  reactHooks.configs.flat.recommended,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      // TanStack Router redirects by throwing redirect().
      '@typescript-eslint/only-throw-error': [
        'error',
        { allow: [{ from: 'package', package: '@tanstack/router-core', name: 'Redirect' }] },
      ],
    },
  },
  {
    // src/ingest runs in the browser for the upload preview, and the seed imports it under plain Node.
    files: ['src/ingest/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [{ regex: '^(node:|@/)', message: 'src/ingest uses relative .ts imports and no node: modules.' }] },
      ],
    },
  },
  {
    // Font sizes and spacing come from the scales in src/styles/app.css. An exception needs a reason after `--`.
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/components/ui/**', 'src/routeTree.gen.ts'],
    plugins: { '@eslint-community/eslint-comments': eslintComments },
    rules: {
      'no-restricted-syntax': [
        'error',
        ...['Literal', 'TemplateElement'].map((node) => ({
          selector: `${node}[${node === 'Literal' ? 'value' : 'value.raw'}=/${ONE_OFF_SCALE_VALUE.source}/]`,
          message:
            'One-off font size or spacing. Use a type step such as text-meta or a spacing step such as pt-5.5 from src/styles/app.css; `node scripts/tailwind-scale.ts` rewrites it.',
        })),
      ],
      '@eslint-community/eslint-comments/require-description': 'error',
    },
  },
  { files: ['**/*.js'], extends: [tseslint.configs.disableTypeChecked] },
)
