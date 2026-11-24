import js from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';

export default [
  js.configs.recommended,
  eslintPluginPrettierRecommended,
  {
    ignores: ['node_modules/', 'dist/', '*.log', 'package-lock.json'],
  },
  {
    files: ['public/*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'script',
      globals: {
        // BOM/DOM
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        fetch: 'readonly',
        crypto: 'readonly',
        URL: 'readonly',
        Blob: 'readonly',
        FileReader: 'readonly',
        // Browser built-ins
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        confirm: 'readonly',
        console: 'readonly',
      },
    },
    rules: {
      // Отключены: функции вызываются из HTML onclick, eslint не видит эти связи
      'no-unused-vars': 'off',
      'no-redeclare': 'off',
      'no-useless-assignment': 'off',
      'no-console': 'warn',
      curly: 'error',
    },
  },
  {
    files: ['server.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        __dirname: 'readonly',
        __filename: 'readonly',
        process: 'readonly',
        require: 'readonly',
        module: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        setTimeout: 'readonly',
      },
    },
    rules: {
      'no-console': 'warn',
      curly: 'error',
      'no-empty': 'off',
    },
  },
];
