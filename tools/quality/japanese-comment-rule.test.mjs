import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import local from '../eslint-plugin-local.mjs';

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 'latest',
    parser: tseslint.parser,
    sourceType: 'module',
  },
});

ruleTester.run('local/japanese-comments', local.rules['japanese-comments'], {
  valid: [
    '// \u65e5\u672c\u8a9e\u306e\u30b3\u30e1\u30f3\u30c8\nconst value = 1;',
    '// eslint-disable-next-line no-console\nconsole.log(1);',
    '// @ts-expect-error directive\nconst value = 1;',
    '/// <reference types="node" />\nconst value = 1;',
    '// coverage: ignore next\nconst value = 1;',
    '// prettier-ignore\nconst value = 1;',
    '// @generated\nconst value = 1;',
    '//\nconst value = 1;',
    { code: '/** \u65e5\u672c\u8a9e\u306eJSDoc */\nconst value = <div />;', filename: 'example.tsx' },
  ],
  invalid: [
    {
      code: '// English comment\nconst value = 1;',
      errors: [{ messageId: 'missingJapanese' }],
    },
    {
      code: '/* English block */\nconst value = 1;',
      errors: [{ messageId: 'missingJapanese' }],
    },
  ],
});
