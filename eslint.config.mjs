import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FlatCompat } from '@eslint/eslintrc'

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) })

export default [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  { ignores: ['.next/**', 'node_modules/**', 'prisma/migrations/**', 'src/generated/**', 'dist-desktop/**', 'vendor/**'] },
  {
    rules: {
      // Les variables prefixees par _ sont volontairement ignorees
      // (destructuration avec omission de champs).
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // Le processus principal Electron et les scripts d'outillage sont du Node
    // CommonJS : `require()` y est la forme attendue, pas une infraction.
    files: ['electron/**/*.js', 'electron/**/*.cjs', 'scripts/**/*.js', 'scripts/**/*.cjs', 'prisma/**/*.cjs'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-var-requires': 'off',
    },
  },
]
