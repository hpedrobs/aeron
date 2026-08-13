import js from '@eslint/js'
import tseslint from '@typescript-eslint/eslint-plugin'
import tsparser from '@typescript-eslint/parser'

export default [
    js.configs.recommended,
    {
        files: ['**/*.ts', '**/*.js'],
        ignores: [
            'node_modules/',
            'dist/',
            'build/',
            'coverage/',
            '.env',
            '*.min.js',
            '*.d.ts'
        ],
        languageOptions: {
            parser: tsparser,
            parserOptions: {
                ecmaVersion: 'latest',
                sourceType: 'module'
            },
            globals: {
                // Node.js globals
                process: true,
                __dirname: true,
                // Browser globals (for files that use them)
                document: true,
                HTMLInputElement: true,
                HTMLButtonElement: true,
                // Universal globals
                console: true,
                setTimeout: true
            }
        },
        plugins: {
            '@typescript-eslint': tseslint
        },
        rules: {
            indent: ['error', 4],
            semi: ['error', 'never'],
            'no-unused-vars': [
                'warn',
                { argsIgnorePattern: '^_' },
            ],
        }
    }
]