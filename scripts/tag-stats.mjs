/**
 * 기출 태그 집계 — "뭐가 많이 나오나"를 문항 단위로 센다.
 *
 * 대상은 **기출 회차뿐**이다. basics-*(기본 다지기)와 variant-*(변형)는 우리가 만든
 * 연습 문제라 출제 빈도에 섞으면 숫자가 거짓말이 된다.
 *
 *   node scripts/tag-stats.mjs            # 요약
 *   node scripts/tag-stats.mjs --json     # 기계용 전체 결과
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const here = path.dirname(fileURLToPath(import.meta.url))
const DIR = path.join(here, '..', 'data', 'expl', 'practical')

/** 기출 파일만 — YYYY-N.js 꼴 */
const EXAM_FILE = /^\d{4}-\d+\.js$/

function loadExams() {
  const sandbox = { EXAMS: [] }
  for (const f of fs.readdirSync(DIR).filter(n => EXAM_FILE.test(n)).sort()) {
    const src = fs.readFileSync(path.join(DIR, f), 'utf8')
    // 파일은 window.EXAMS.push({...}) 한 덩어리다. window만 만들어 주면 그대로 돈다.
    new Function('window', src)(sandbox)
  }
  return sandbox.EXAMS
}

const exams = loadExams()
const rounds = exams.length
const questions = exams.flatMap(e =>
  e.questions.map(q => ({ ...q, examId: e.id, year: Number(String(e.order).slice(0, 4)) }))
)

/** 태그 → 나온 문항들 */
const byTag = new Map()
for (const q of questions) {
  for (const t of q.tags ?? []) {
    if (!byTag.has(t)) byTag.set(t, [])
    byTag.get(t).push(q)
  }
}

const untagged = questions.filter(q => !(q.tags ?? []).length)

const rows = [...byTag.entries()]
  .map(([tag, qs]) => ({
    tag,
    count: qs.length,
    pct: (qs.length / questions.length) * 100,
    rounds: new Set(qs.map(q => q.examId)).size,
    years: [...new Set(qs.map(q => q.year))].sort(),
    kinds: [...new Set(qs.map(q => q.kind))].sort(),
    points: qs.reduce((n, q) => n + (q.points ?? 0), 0)
  }))
  .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ rounds, total: questions.length, rows, untagged: untagged.length }, null, 2))
} else {
  console.log(`기출 ${rounds}회차 · ${questions.length}문항 · 태그 ${rows.length}종`)
  console.log(`태그 없는 문항: ${untagged.length}개\n`)
  console.log('순위  횟수  비중    출제회차  배점   태그')
  rows.forEach((r, i) => {
    console.log(
      `${String(i + 1).padStart(3)}.  ${String(r.count).padStart(3)}  ${r.pct.toFixed(1).padStart(5)}%  ` +
        `${String(r.rounds).padStart(2)}/${rounds}회차  ${String(r.points).padStart(4)}점  ${r.tag}`
    )
  })
}
