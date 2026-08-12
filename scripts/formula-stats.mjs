/**
 * 세분화 통계 — 단원 → 세부주제 → 공식.
 *
 * 세 층으로 센다:
 *   1) 단원   : 태그 중 암기노트 섹션에 해당하는 것(대분류)
 *   2) 세부   : 그 문항이 같이 달고 있는 나머지 태그
 *   3) 공식   : 풀이(solution) 안의 LaTeX에서 뽑은 식 — 실제로 손이 가는 단위
 *
 * 기출 회차만 센다. basics·variant 파일은 우리가 만든 연습분이라 제외한다.
 *
 *   node scripts/formula-stats.mjs
 *   node scripts/formula-stats.mjs --json
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const here = path.dirname(fileURLToPath(import.meta.url))
const DIR = path.join(here, '..', 'data', 'expl', 'practical')
const EXAM_FILE = /^\d{4}-\d+\.js$/

/** 대분류로 쓸 태그 — 암기노트 섹션과 같은 눈금이다 */
const MAJOR = [
  '발파진동', '관계법규', '발파설계', '발파작업', '발파소음', '성능시험',
  '폭발특성', '암반역학', '암반분류', '터널발파', '조절발파', '수중발파',
  '회귀분석', '결선', '심빼기', '안정도시험', '화약류 일반'
]

function loadExams() {
  const sandbox = { EXAMS: [] }
  for (const f of fs.readdirSync(DIR).filter(n => EXAM_FILE.test(n)).sort()) {
    new Function('window', fs.readFileSync(path.join(DIR, f), 'utf8'))(sandbox)
  }
  return sandbox.EXAMS
}

const questions = loadExams().flatMap(e =>
  e.questions.map(q => ({ ...q, examId: e.id, year: Number(String(e.order).slice(0, 4)) }))
)
const ROUNDS = new Set(questions.map(q => q.examId)).size

/**
 * 풀이에서 "=" 왼쪽 기호를 뽑아 공식을 식별한다.
 * 완전한 파싱은 못 하고 할 필요도 없다 — 어떤 양을 구하는 식인지만 알면
 * "이 공식이 몇 번 나왔나"를 셀 수 있다.
 */
/**
 * 그리스문자를 먼저 글자 하나로 바꾼다. 안 그러면 `\sigma_h =` 가 "ma_h"로 잘린다
 * (정규식이 sig|ma 뒤쪽만 물어서). 실제로 그렇게 나왔다.
 */
const GREEK = {
  sigma: 'σ', tau: 'τ', theta: 'θ', rho: 'ρ', phi: 'φ', varphi: 'φ', lambda: 'λ',
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', Delta: 'Δ', mu: 'μ', pi: 'π',
  eta: 'η', epsilon: 'ε', varepsilon: 'ε', omega: 'ω', nu: 'ν', psi: 'ψ'
}
const GREEK_RE = new RegExp(`\\\\(${Object.keys(GREEK).join('|')})\\b`, 'g')

const LHS = /(?:^|[\s$({[])([A-Za-zα-ωΑ-Ωσ恒]{1,3})(?:_\{?([A-Za-z0-9α-ω,%]{1,6})\}?)?\s*=(?!=)/g

const NOISE = /^(kg|cm|mm|km|m|g|sec|s|text|frac|dfrac|left|right|times|sqrt|log|ln|sin|cos|tan|approx|therefore|cdot|and|the|if)$/i

function formulasOf(q) {
  const src = [q.solution, ...(q.parts ?? []).map(p => p.solution)]
    .filter(Boolean)
    .join('\n')
    .replace(GREEK_RE, (_, name) => GREEK[name])
  const found = new Set()
  for (const m of src.matchAll(LHS)) {
    const sym = m[2] ? `${m[1]}_${m[2]}` : m[1]
    if (NOISE.test(sym)) continue
    found.add(sym)
  }
  return [...found]
}

const major = new Map()
for (const q of questions) {
  const tags = q.tags ?? []
  const heads = tags.filter(t => MAJOR.includes(t))
  const head = heads[0] ?? '기타'
  if (!major.has(head)) major.set(head, { count: 0, rounds: new Set(), sub: new Map(), formula: new Map() })
  const bucket = major.get(head)
  bucket.count++
  bucket.rounds.add(q.examId)
  for (const t of tags) {
    if (t === head) continue
    bucket.sub.set(t, (bucket.sub.get(t) ?? 0) + 1)
  }
  for (const f of formulasOf(q)) {
    bucket.formula.set(f, (bucket.formula.get(f) ?? 0) + 1)
  }
}

const ordered = [...major.entries()].sort((a, b) => b[1].count - a[1].count)

if (process.argv.includes('--json')) {
  console.log(
    JSON.stringify(
      ordered.map(([k, v]) => ({
        major: k,
        count: v.count,
        rounds: v.rounds.size,
        sub: [...v.sub.entries()].sort((a, b) => b[1] - a[1]),
        formula: [...v.formula.entries()].sort((a, b) => b[1] - a[1])
      })),
      null,
      2
    )
  )
} else {
  console.log(`기출 ${ROUNDS}회차 · ${questions.length}문항\n`)
  for (const [name, v] of ordered) {
    const pct = ((v.count / questions.length) * 100).toFixed(1)
    console.log(`\n■ ${name} — ${v.count}문항 (${pct}%) · ${v.rounds.size}/${ROUNDS}회차 출제`)
    const sub = [...v.sub.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
    if (sub.length) console.log('   세부 : ' + sub.map(([t, n]) => `${t} ${n}`).join(' · '))
    const fm = [...v.formula.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
    if (fm.length) console.log('   공식 : ' + fm.map(([t, n]) => `${t}= ${n}회`).join(' · '))
  }
}
