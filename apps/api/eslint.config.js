import tseslint from '@typescript-eslint/eslint-plugin';
import parser from '@typescript-eslint/parser';

export default [{
  files: ['**/*.ts'],
  languageOptions: { parser, parserOptions: { sourceType: 'module' } },
  plugins: { '@typescript-eslint': tseslint },
  rules: { 'no-unused-vars': 'off', '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }] }
}];
