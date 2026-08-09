#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { TextDecoder } from 'node:util';

import { ESLint } from 'eslint';
import tseslint from 'typescript-eslint';

import local from '../tools/eslint-plugin-local.mjs';

const TYPESCRIPT_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts']);
const EXCLUDED_DIRECTORIES = new Set([
  '.git',
  '.mypy_cache',
  '.pytest_cache',
  '.ruff_cache',
  '.venv',
  '__pycache__',
  'build',
  'coverage',
  'dist',
  'generated',
  'node_modules',
  'third_party',
  'venv',
]);
const UTF8 = new TextDecoder('utf-8', { fatal: true });

function isTypeScriptPath(filePath) {
  return TYPESCRIPT_EXTENSIONS.has(path.extname(filePath));
}

function writeStdout(message) {
  process.stdout.write(`${message}\n`);
}

function writeStderr(message) {
  process.stderr.write(`${message}\n`);
}

function usage() {
  return '使い方: node scripts/check_typescript_comments.mjs [--staged] [file-or-directory ...]';
}

function parseArguments(argumentsList) {
  const paths = [];
  let staged = false;
  for (const argument of argumentsList) {
    if (argument === '--staged') {
      staged = true;
      continue;
    }
    if (argument === '--help' || argument === '-h') {
      writeStdout(usage());
      return null;
    }
    if (argument.startsWith('-')) {
      throw new Error(`不明なオプションです: ${argument}`);
    }
    paths.push(argument);
  }
  if (staged && paths.length > 0) {
    throw new Error('--stagedとpathsは同時に指定できません。');
  }
  return { paths, staged };
}

async function collectTypeScriptFiles(paths) {
  const roots = paths.length > 0 ? paths : [process.cwd()];
  const files = new Set();
  for (const root of roots) {
    await collectPath(root, files);
  }
  return [...files].sort();
}

async function collectPath(candidate, files) {
  let metadata;
  try {
    metadata = await stat(candidate);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return;
    }
    throw error;
  }
  if (metadata.isFile()) {
    if (isTypeScriptPath(candidate)) {
      files.add(path.resolve(candidate));
    }
    return;
  }
  if (!metadata.isDirectory()) {
    return;
  }
  for (const entry of await readdir(candidate, { withFileTypes: true })) {
    if (entry.isDirectory() && EXCLUDED_DIRECTORIES.has(entry.name)) {
      continue;
    }
    await collectPath(path.join(candidate, entry.name), files);
  }
}

function runGit(argumentsList) {
  const result = spawnSync('git', argumentsList, { encoding: 'buffer' });
  if (result.error) {
    throw new Error(`Gitを実行できません: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const message = result.stderr?.toString('utf8').trim() || 'Gitからステージ済みファイルを取得できません。';
    throw new Error(message);
  }
  return result.stdout;
}

function decodeUtf8(content, label) {
  try {
    return UTF8.decode(content);
  } catch (error) {
    throw new Error(`${label}: UTF-8として読めません: ${error.message}`, { cause: error });
  }
}

function collectStagedTypeScriptSources() {
  const changed = runGit(['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z']);
  const paths = decodeUtf8(changed, 'ステージ済みファイル名')
    .split('\0')
    .filter(Boolean)
    .filter(isTypeScriptPath);
  return paths.map(filePath => ({
    content: decodeUtf8(runGit(['show', `:${filePath}`]), filePath),
    filePath,
  }));
}

async function collectDirectSources(paths) {
  return Promise.all(
    (await collectTypeScriptFiles(paths)).map(async filePath => ({
      content: await readFile(filePath, 'utf8'),
      filePath,
    })),
  );
}

function createCommentChecker() {
  return new ESLint({
    ignore: false,
    overrideConfig: [{
      files: ['**/*.{ts,tsx,mts,cts}'],
      languageOptions: {
        parser: tseslint.parser,
        parserOptions: {
          ecmaFeatures: { jsx: true },
          ecmaVersion: 'latest',
          sourceType: 'module',
        },
      },
      plugins: { local },
      rules: { 'local/japanese-comments': 'error' },
    }],
    overrideConfigFile: true,
  });
}

async function collectFindings(sources) {
  const checker = createCommentChecker();
  const findings = [];
  for (const source of sources) {
    const [result] = await checker.lintText(source.content, { filePath: path.basename(source.filePath) });
    for (const message of result.messages) {
      if (message.severity !== 2) {
        continue;
      }
      const location = message.line ? `${source.filePath}:${message.line}:${message.column}` : source.filePath;
      const rule = message.ruleId ? ` (${message.ruleId})` : '';
      findings.push(`${location}: ${message.message}${rule}`);
    }
  }
  return findings;
}

async function main() {
  let options;
  try {
    options = parseArguments(process.argv.slice(2));
  } catch (error) {
    writeStderr(error.message);
    writeStderr(usage());
    return 2;
  }
  if (options === null) {
    return 0;
  }

  let sources;
  try {
    sources = options.staged
      ? collectStagedTypeScriptSources()
      : await collectDirectSources(options.paths);
  } catch (error) {
    writeStderr(error.message);
    return 2;
  }
  if (options.staged && sources.length === 0) {
    writeStdout('ステージ済みTypeScriptファイルはありません。');
    return 0;
  }

  try {
    const findings = await collectFindings(sources);
    if (findings.length > 0) {
      for (const finding of findings) {
        writeStderr(finding);
      }
      return 1;
    }
  } catch (error) {
    writeStderr(error.message);
    return 2;
  }

  writeStdout('TypeScriptコメント/JSDoc日本語チェック: OK');
  return 0;
}

process.exitCode = await main();
