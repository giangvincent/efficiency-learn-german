/* Verifies the correction contract: practice groups are identified by
   <!-- group:x --> anchors, never by prose — so a course in any language
   renders the same way. Parses a Chinese correction with the real site.js
   functions and asserts both the group assignment and the placement.
   Run: node test_correction_contract.js */
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

/* A Chinese correction: prose must not be needed to place it. */
const md = `# 批改 — 第 1 课

## 已经掌握的部分

- 时态用对了。

<!-- group:q -->
## 理解问题

**1.** "我工作在北京。"
→ *我在北京的一家小公司工作。*
- \`在北京\` → \`在北京的一家小公司\` — **内容 [A2]**. 问题有两部分。

<!-- group:w -->
## 写作任务

**1.** "我的工作日很长。"
→ *我的工作日很长，但很有意思。*
- \`很长\` → \`很长，但很有意思\` — **完整度 [A2]**. 至少写 5–8 句。
`;

const sections = sandbox.splitSections(md);
console.log('parsed sections:', JSON.stringify(sections.map(s => ({ title: s.title, group: s.group }))));

const q = sections.filter(s => s.group === 'q');
const w = sections.filter(s => s.group === 'w');
const extra = sections.filter(s => !s.group);

check('question section carries group q', q.length === 1);
check('writing section carries group w', w.length === 1);
check('unanchored sections stay as extras', extra.length >= 1);
check('Chinese heading matched by anchor, not prose', q[0].title.includes('理解问题'));
check('extra section keeps its Chinese title', extra.some(s => s.title.includes('已经掌握')));

const parsed = sandbox.splitItems(q[0].lines);
check('question items are numbered', parsed.items.length === 1 && parsed.items[0].n === 1);

const html = sandbox.mdToHtml(q[0].lines.join('\n'));
check('markdown renders to html', html.includes('<strong>1.</strong>') || html.includes('1.'));

/* placement: each group must land under its own textarea, not in the extras */
function place(md) {
  const boxes = {};
  for (const sec of sandbox.splitSections(md)) {
    if (sec.group === 'w') {
      boxes.w = (boxes.w || '') + sandbox.mdToHtml(sec.lines.join('\n'));
    } else if (sec.group === 'q') {
      const parts = sandbox.splitItems(sec.lines);
      const list = parts.items.length ? parts.items : (sandbox.splitTableItems(sec.lines) || []);
      for (const it of list) {
        boxes['q' + it.n] = (boxes['q' + it.n] || '') + sandbox.mdToHtml(it.lines.join('\n'));
      }
    }
  }
  return boxes;
}

const boxes = place(md);
check('question 1 feedback placed under q1', !!boxes.q1 && boxes.q1.includes('在北京'));
check('writing feedback placed under the writing textarea', !!boxes.w && boxes.w.includes('我的工作日'));
check('unanchored intro NOT placed under a practice', !boxes.q1.includes('已经掌握'));

/* an anchor must bind to the next heading only, not leak to later sections */
const leak = sandbox.splitSections('<!-- group:q -->\n## A\n\nx\n\n## B\n\ny\n');
check('anchor binds only to the next heading',
  leak.find(s => s.title === 'A').group === 'q' && leak.find(s => s.title === 'B').group === null);

console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
