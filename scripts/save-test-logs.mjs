// テスト実行ログを UTF-8 でエビデンスとして保存
// PowerShell 経由だと文字化けするため Node 経由で実行する
//
// 使い方: node scripts/save-test-logs.mjs
// targets 配列にプロジェクトの npm script 名を追加・編集する

import { spawnSync } from 'child_process';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const evidenceDir = join(root, 'store', 'test-evidence');
if (!existsSync(evidenceDir)) mkdirSync(evidenceDir, { recursive: true });

// プロジェクトに合わせて編集する。実装にない script はスキップして OK
const targets = [
  { script: 'test:pure', log: 'test-pure.log' },
  { script: 'smoke', log: 'smoke.log' },
  // 例: { script: 'test:bates', log: 'test-bates.log' },
];

for (const t of targets) {
  const r = spawnSync('npm', ['run', t.script], {
    cwd: root,
    encoding: 'utf8',
    shell: true,
    env: { ...process.env, FORCE_COLOR: '0' },
  });
  const body = (r.stdout || '') + (r.stderr || '');
  // ANSI エスケープ除去
  const clean = body.replace(/\x1b\[[0-9;]*m/g, '');
  writeFileSync(join(evidenceDir, t.log), clean, 'utf8');
  console.log(`[OK] ${t.log} (${clean.length} bytes, exit=${r.status})`);
}
