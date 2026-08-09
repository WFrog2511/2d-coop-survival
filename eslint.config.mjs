import js from '@eslint/js';
import stylistic from '@stylistic/eslint-plugin';
import jsdoc from 'eslint-plugin-jsdoc';
import tseslint from 'typescript-eslint';
import local from './tools/eslint-plugin-local.mjs';

const typeScriptFiles = ['**/*.{ts,tsx,mts,cts}'];

export default tseslint.config(
  {
    ignores: [
      '**/build/**',
      '**/coverage/**',
      '**/dist/**',
      '**/generated/**',
      '**/node_modules/**',
      '**/third_party/**',
    ],
  },
  js.configs.recommended,
  stylistic.configs.customize({
    indent: 2,
    quotes: 'single',
    semi: true,
    jsx: true,
    braceStyle: '1tbs',
  }),
  ...tseslint.configs.recommendedTypeChecked.map(config => ({
    ...config,
    files: typeScriptFiles,
  })),
  {
    files: typeScriptFiles,
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { local },
    rules: { 'local/japanese-comments': 'error' },
  },
  {
    files: ['src/rules.ts', 'src/arena-map.ts'],
    plugins: { jsdoc },
    rules: {
      'jsdoc/require-jsdoc': ['error', {
        publicOnly: true,
        enableFixer: false,
        require: {
          FunctionDeclaration: true,
          ArrowFunctionExpression: false,
          FunctionExpression: false,
          ClassDeclaration: false,
          ClassExpression: false,
          MethodDefinition: false,
        },
        contexts: ['TSInterfaceDeclaration', 'TSTypeAliasDeclaration'],
      }],
      'jsdoc/require-description': 'error',
      'jsdoc/require-param': ['error', {
        checkDestructured: false,
        checkDestructuredRoots: false,
        enableFixer: false,
        enableRestElementFixer: false,
        enableRootFixer: false,
      }],
      'jsdoc/require-param-description': 'error',
      'jsdoc/require-param-type': 'off',
      'jsdoc/require-returns': ['error', { enableFixer: false, publicOnly: true }],
      'jsdoc/require-returns-description': 'error',
      'jsdoc/require-returns-type': 'off',
    },
  },
  {
    files: ['**/*.{js,jsx,mjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
  }, {
    files: ['**/*.cjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
    },
  },
);
