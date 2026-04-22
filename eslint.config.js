import { defineConfig } from 'eslint/config'
import globals from 'globals'
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import pluginVue from 'eslint-plugin-vue'
import skipFormatting from '@vue/eslint-config-prettier/skip-formatting'

export default defineConfig([
  {
    name: 'app/files-to-lint',
    files: ['**/*.{ts,mts,tsx,vue}'],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
  },
  {
    name: 'app/files-to-ignore',
    ignores: ['**/dist/**', '**/dist-ssr/**', '**/coverage/**', '**/playwright-report/**', '**/pb_migrations/**', 'src/types/pocketbase-types.ts'],
  },
  {
    name: 'app/pb-hooks',
    files: ['pb_hooks/**/*.js'],
    languageOptions: {
      globals: {
        onRecordBeforeCreateRequest: 'readonly',
        onRecordBeforeUpdateRequest: 'readonly',
        onRecordAfterCreateRequest: 'readonly',
        onRecordAfterUpdateRequest: 'readonly',
        routerAdd: 'readonly',
        $app: 'readonly',
        $security: 'readonly',
      },
    },
    rules: {
      'no-console': 'off',
    },
  },
  {
    name: 'app/service-worker',
    files: ['public/sw.js'],
    languageOptions: {
      globals: {
        self: 'readonly',
        caches: 'readonly',
        clients: 'readonly',
        fetch: 'readonly',
        Response: 'readonly',
        URL: 'readonly',
      },
    },
  },
  {
    name: 'app/pm2-config',
    files: ['server/ecosystem.config.js'],
    languageOptions: {
      globals: {
        module: 'readonly',
      },
    },
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/essential'],
  {
    name: 'app/vue-typescript',
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
      },
    },
  },
  {
    name: 'app/rules',
    rules: {
      'vue/multi-word-component-names': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  skipFormatting,
])
