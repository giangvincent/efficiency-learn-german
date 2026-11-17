/* Renders every historical korrektur in practice-data/ with the real site.js
   parser and asserts that the q/w groups land on the right textareas. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const siteJs = fs.readFileSync(path.join(__dirname, 'assets', 'site.js'), 'utf8');
function extract(re) {
  const m = siteJs.match(re);
  if (!m) throw new Error('could not extract ' + re);
  return m[0];
}
const sandbox = { console };
vm.createContext(sandbox);
vm.runInContext([
  extract(/function esc\(s\) \{[\s\S]*?\n  \}/),
  extract(/function inline\(s\) \{[\s\S]*?\n  \}/),
  extract(/function tableHtml\(rows\) \{[\s\S]*?\n  \}/),
  extract(/function mdToHtml\(src\) \{[\s\S]*?\n  \}/),
  extract(/function splitSections\(md\) \{[\s\S]*?\n  \}/),
  extract(/function splitItems\(lines\) \{[\s\S]*?\n  \}/),
  extract(/function splitTableItems\(lines\) \{[\s\S]*?\n  \}/)
].join('\n'), sandbox);

let failed = 0;
function check(name, cond) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`);
  if (!cond) failed++;
}

const dir = path.join(__dirname, 'practice-data');
const files = fs.readdirSync(dir).filter(f => f.endsWith('-korrektur.md')).sort();

for (const file of files) {
  const lid = file.slice(0, 4);
  const md = fs.readFileSync(path.join(dir, file), 'utf8');
  const sections = sandbox.splitSections(md);
  const groups = sections.map(s => s.group).filter(Boolean);

  const lessonFile = fs.readdirSync(path.join(__dirname, 'lessons'))
    .find(f => f.startsWith(lid));
  const lesson = fs.readFileSync(path.join(__dirname, 'lessons', lessonFile), 'utf8');
  const hasQ = /data-practice="q"/.test(lesson);
  const hasW = /data-practice="w"/.test(lesson);

  check(`${file}: has q anchor iff lesson has q practice`, groups.includes('q') === hasQ);
  check(`${file}: has w anchor iff lesson has w practice`, groups.includes('w') === hasW);

  if (groups.includes('q')) {
    const qSec = sections.find(s => s.group === 'q');
    const expected = (lesson.match(/data-practice="q"/g) || []).length;
    let items = sandbox.splitItems(qSec.lines).items;
    if (!items.length) {
      const tableItems = sandbox.splitTableItems(qSec.lines);
      items = tableItems || [];
    }
    /* A correction may only mention the questions that need work (sparse
       list), or answer all of them. Both are valid; the placement is what
       matters: every item must map to a real question. */
    check(`${file}: q feedback items are numbered 1..${expected} (${items.length} given)`,
      items.length > 0 && items.every(it => it.n >= 1 && it.n <= expected));
    if (items.length === expected) {
      check(`${file}: every question has feedback`,
        items.map(i => i.n).sort((a, b) => a - b).join() ===
        Array.from({ length: expected }, (_, i) => i + 1).join());
    }
  }
}

console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
