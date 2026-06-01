import { execSync } from 'node:child_process';
import fs from 'node:fs';

const commits = ['ea77862', '8792f2b', '135b58d', 'f5e8622', '66b5074', 'c80debe'];
const path = 'client/src/components/SettlementPreSettlementPage.tsx';

for (const c of commits) {
  try {
    const buf = execSync(`git show ${c}:${path}`, { encoding: 'buffer', maxBuffer: 10 * 1024 * 1024 });
    const text = buf.toString('utf8');
    const good = text.includes('預結算') && text.includes('一月');
    const bad = text.includes('4.1 ???') || (text.match(/\?\?/g) || []).length > 50;
    console.log(c, 'good=', good, 'badQ=', bad, 'len=', buf.length);
  } catch (e) {
    console.log(c, 'ERR', e.message?.slice(0, 60));
  }
}

const cur = fs.readFileSync(path, 'utf8');
console.log('WORKTREE good=', cur.includes('預結算'), 'badQ=', (cur.match(/\?\?/g) || []).length);
