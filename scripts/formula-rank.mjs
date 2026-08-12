/**
 * 공식별 출제 빈도 — formula-map.js의 손분류를 집계한다.
 *
 * 검증 두 가지를 먼저 한다. 안 맞으면 순위를 내지 않는다:
 *   1) 매핑에 적힌 문항이 실제 기출에 존재하는가 (오타·삭제된 문항)
 *   2) 아직 분류 안 된 문항이 몇 개인가 (진행률)
 *
 *   node scripts/formula-rank.mjs
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const here = path.dirname(fileURLToPath(import.meta.url))
const DIR = path.join(here, '..', 'data', 'expl', 'practical')
const EXAM_FILE = /^\d{4}-\d+\.js$/

const w = { EXAMS: [], FORMULA_MAP: {}, FORMULA_LABELS: {} }
for (const f of fs.readdirSync(DIR).filter(n => EXAM_FILE.test(n)).sort()) {
  new Function('window', fs.readFileSync(path.join(DIR, f), 'utf8'))(w)
}
new Function('window', fs.readFileSync(path.join(DIR, 'formula-map.js'), 'utf8'))(w)

const keyOf = (examId, n) => `${examId.replace('expl-practical-', '')}#${n}`
const all = new Map()
for (const e of w.EXAMS) for (const q of e.questions) all.set(keyOf(e.id, q.n), q)

const ghosts = Object.keys(w.FORMULA_MAP).filter(k => !all.has(k))
if (ghosts.length) {
  console.log('매핑에 있는데 기출에 없는 문항 — 오타로 보입니다:')
  ghosts.forEach(g => console.log('  ', g))
  process.exit(1)
}

// 라벨의 note가 실제 암기노트 항목 이름인지 — 오타면 배지가 영영 안 붙는다
new Function('window', fs.readFileSync(path.join(DIR, 'notes.js'), 'utf8'))(w)
const noteKeys = new Set((w.NOTES?.sections ?? []).flatMap(s => s.items.map(i => i.k)))
const badNotes = Object.entries(w.FORMULA_LABELS)
  .flatMap(([k, v]) => (v.note == null ? [] : [].concat(v.note).map(n => [k, n])))
  .filter(([, n]) => !noteKeys.has(n))
  .map(([k, n]) => `${k} → "${n}"`)
if (badNotes.length) {
  console.log('암기노트에 없는 항목 이름을 가리킵니다 (오타로 보임):')
  badNotes.forEach(b => console.log('  ', b))
  process.exit(1)
}

const done = Object.keys(w.FORMULA_MAP).length
console.log(`분류 완료 ${done} / 전체 ${all.size}문항 (${((done / all.size) * 100).toFixed(0)}%)\n`)

const count = new Map()
const rounds = new Map()
for (const [k, v] of Object.entries(w.FORMULA_MAP)) {
  count.set(v.primary, (count.get(v.primary) ?? 0) + 1)
  if (!rounds.has(v.primary)) rounds.set(v.primary, new Set())
  rounds.get(v.primary).add(k.split('#')[0])
}

const ROUNDS = new Set([...all.keys()].map(k => k.split('#')[0])).size
const rows = [...count.entries()].sort((a, b) => b[1] - a[1])

console.log('횟수  회차   공식                                     암기노트 항목')
for (const [key, n] of rows) {
  const meta = w.FORMULA_LABELS[key] ?? {}
  const noteCell = meta.note === null ? '※ 노트에 없음' : (meta.note ?? '?')
  console.log(
    `${String(n).padStart(3)}회  ${String(rounds.get(key).size).padStart(2)}/${ROUNDS}  ` +
      `${(meta.label ?? key).padEnd(38)} ${noteCell}`
  )
}
console.log(`\n합계 ${rows.reduce((s, r) => s + r[1], 0)}문항`)
