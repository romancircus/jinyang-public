import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

export default [{
  files: ['src/**/*.ts'],
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    parser: tsparser
  },
  plugins: {
    '@typescript-eslint': tseslint
  },
  rules: {
    '@typescript-eslint/no-unused-vars': 'warn',
    '@typescript-eslint/no-explicit-any': 'warn'
  }
}];