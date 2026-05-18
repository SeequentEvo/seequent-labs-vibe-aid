import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

/**
 * Walk one or more flat-config entries and collect every rule whose severity
 * is `warn` (or numeric 1). Returns a `rules` object that overrides each one
 * to `error` (or 2), preserving the original options.
 *
 * Why: this repo enforces zero tolerance for warnings. Promoting warn-level
 * rules to error keeps IDE squiggles aligned with the policy (red, not yellow)
 * and ensures any future plugin update that adds a new warn-level rule is
 * automatically promoted too.
 */
function promoteWarnsToErrors(...configs) {
  const promoted = {}
  const visit = (entry) => {
    if (Array.isArray(entry)) {
      entry.forEach(visit)
      return
    }
    if (!entry || typeof entry !== 'object' || !entry.rules) return
    for (const [rule, value] of Object.entries(entry.rules)) {
      const severity = Array.isArray(value) ? value[0] : value
      if (severity === 'warn' || severity === 1) {
        const opts = Array.isArray(value) ? value.slice(1) : []
        promoted[rule] = ['error', ...opts]
      }
    }
  }
  configs.forEach(visit)
  return promoted
}

const baseExtends = [
  js.configs.recommended,
  tseslint.configs.recommended,
  reactHooks.configs.flat.recommended,
  reactRefresh.configs.vite,
]

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: baseExtends,
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        // Enable type-aware linting (auto-discovers nearest tsconfig).
        // Required for @typescript-eslint/no-deprecated.
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['../*'],
          message: 'Use @/ path alias for cross-folder imports (e.g. @/types/ids).',
        }],
      }],
      // Surface @deprecated symbol use. The TypeScript CLI does not emit
      // these — only the IDE language service does — so without this rule
      // an agent running headless tooling is blind to deprecations.
      '@typescript-eslint/no-deprecated': 'error',
      // Final overlay: promote any remaining warn-level rules from the
      // extended presets to errors.
      ...promoteWarnsToErrors(baseExtends),
    },
  },
])
