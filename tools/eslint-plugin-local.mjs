const JAPANESE = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/u;
const DIRECTIVE = /^(?:@?(?:eslint|typescript-eslint|ts)-(?:disable|enable|ignore|expect-error|nocheck|check)|\/{0,2}\s*<reference\b|(?:c8|coverage|istanbul|v8)\b|(?:biome|prettier)-ignore\b|(?:fmt|format):|@format\b|@?generated\b)/iu;

function isDirective(comment) {
  if (comment.type === 'Shebang') {
    return true;
  }

  const text = comment.value.trim();
  return !text || DIRECTIVE.test(text);
}

const local = {
  rules: {
    'japanese-comments': {
      meta: {
        type: 'suggestion',
        docs: { description: '\u4eba\u9593\u5411\u3051\u306eTypeScript\u30b3\u30e1\u30f3\u30c8\u3068JSDoc\u306b\u65e5\u672c\u8a9e\u3092\u6c42\u3081\u308b\u3002' },
        messages: { missingJapanese: '\u4eba\u9593\u5411\u3051\u30b3\u30e1\u30f3\u30c8\u3068JSDoc\u306b\u306f\u65e5\u672c\u8a9e\u30921\u6587\u5b57\u4ee5\u4e0a\u542b\u3081\u3066\u304f\u3060\u3055\u3044\u3002' },
        schema: [],
      },
      create(context) {
        return {
          Program() {
            for (const comment of context.sourceCode.getAllComments()) {
              if (!isDirective(comment) && !JAPANESE.test(comment.value)) {
                context.report({ loc: comment.loc, messageId: 'missingJapanese' });
              }
            }
          },
        };
      },
    },
  },
};

export default local;
