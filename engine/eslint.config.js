import stylistic from '@stylistic/eslint-plugin'
import parser from '@typescript-eslint/parser'
import { defineConfig, globalIgnores } from 'eslint/config'
import simpleImportSort from 'eslint-plugin-simple-import-sort'
import tsEslint from 'typescript-eslint'

export default defineConfig([
    globalIgnores(['dist']),
    {
        files: [
            './*.js',
            'src/**.ts'
        ]
    },
    {
        languageOptions: {
            parser,
            parserOptions: { project: './tsconfig.eslint.json' }
        }
    },
    ...tsEslint.configs.recommended,
    stylistic.configs.customize({
        indent: 4,
        quotes: 'single',
        semi: false,
        jsx: true,
        commaDangle: 'never'
    }),
    {
        rules: {
            '@stylistic/brace-style': ['error', '1tbs', { allowSingleLine: true }],
            '@stylistic/jsx-curly-brace-presence': ['error', 'always'],
            '@stylistic/max-statements-per-line': ['error', { max: 2 }]
        }
    },
    {
        plugins: {
            'simple-import-sort': simpleImportSort
        },
        rules: {
            'simple-import-sort/imports': 'error'
        }
    },
    {
        rules: {
            '@typescript-eslint/no-floating-promises': 'error',
            '@typescript-eslint/no-unused-vars': [
                'error',
                {
                    args: 'all',
                    argsIgnorePattern: '^_',
                    caughtErrors: 'all',
                    caughtErrorsIgnorePattern: '^_',
                    destructuredArrayIgnorePattern: '^_',
                    varsIgnorePattern: '^_',
                    ignoreRestSiblings: true
                }
            ],
            '@typescript-eslint/naming-convention': [
                'error',
                {
                    selector: 'variable',
                    modifiers: ['const', 'global'],
                    format: ['UPPER_CASE']
                }
            ]
        }
    }
])
