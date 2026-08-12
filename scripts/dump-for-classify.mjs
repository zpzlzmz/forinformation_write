/**
 * 분류 작업용 덤프 — 기출 213문항을 사람이 읽고 공식을 지정할 수 있게 뽑는다.
 *
 * 원본 기출 파일은 건드리지 않는다. 분류 결과는 별도 매핑 파일로 만든다
 * (기출 데이터는 사실이고, 분류는 우리 해석이라 섞으면 나중에 못 가른다).
 *
 *   node scripts/dump-for-classify.mjs > scripts/classify.txt
 *   node scripts/dump-for-classify.mjs 발파진동   # 태그로 걸러서
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const here = path.dirname(fileURLToPath(import.meta.url))
const DIR = path.join(here, '..', 'data', 'expl', 'practical')
const EXAM_FILE = /^\d{4}-\d+\.js$/
const filter = process.argv[2]

const sandbox = { EXAMS: [], FORMULA_MAP: {} }
for (const f of fs.readdirSync(DIR).filter(n => EXAM_FILE.test(n)).sort()) {
  new Function('window', fs.readFileSync(path.join(DIR, f), 'utf8'))(sandbox)
}
// 이미 분류한 문항은 다시 뽑지 않는다 — 두 번 읽으면 분류가 갈릴 수 있다
const MAP_FILE = path.join(DIR, 'formula-map.js')
if (fs.existsSync(MAP_FILE)) new Function('window', fs.readFileSync(MAP_FILE, 'utf8'))(sandbox)
const already = new Set(Object.keys(sandbox.FORMULA_MAP))

const short = (s, n) =>
  String(s ?? '')
    .replace(/\s+/g, ' ')
    .slice(0, n)

let count = 0
for (const e of sandbox.EXAMS) {
  const round = e.id.replace('expl-practical-', '')
  for (const q of e.questions) {
    const tags = q.tags ?? []
    if (filter && !tags.includes(filter)) continue
    if (already.has(`${round}#${q.n}`)) continue
    count++
    const sol = [q.solution, ...(q.parts ?? []).map(p => p.solution)].filter(Boolean).join(' ')
    console.log(`\n### ${round}#${q.n}  [${tags.join(', ')}]  kind=${q.kind}`)
    console.log(`Q : ${short(q.q, 220)}`)
    console.log(`S : ${short(sol, 400)}`)
  }
}
console.error(`문항 ${count}개`)
