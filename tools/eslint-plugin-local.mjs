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
        docs: { description: '人間向けのTypeScriptコメントとJSDocに日本語を求める。' },
        messages: { missingJapanese: '人間向けコメントとJSDocには日本語を1文字以上含めてください。' },
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
