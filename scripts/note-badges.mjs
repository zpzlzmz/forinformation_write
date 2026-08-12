/**
 * 암기노트에 실제로 찍힐 배지를 미리 본다 — app.js의 noteHitCounts()와 같은 계산이다.
 *
 * 화면을 열지 않고도 "어느 항목에 몇 회가 붙는지"와 "배지가 안 붙는 항목이 어디인지"를
 * 확인하려고 둔다. 배지 없는 항목은 기출 15회차에 안 나온 것이고, 그 자체가 정보다.
 *
 *   node scripts/note-badges.mjs
 *   node scripts/note-badges.mjs --missing   # 배지 없는 항목만
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const here = path.dirname(fileURLToPath(import.meta.url))
const DIR = path.join(here, '..', 'data', 'expl', 'practical')

const w = { EXAMS: [], NOTES: null, FORMULA_MAP: {}, FORMULA_LABELS: {} }
for (const f of ['notes.js', 'formula-map.js']) {
  new Function('window', fs.readFileSync(path.join(DIR, f), 'utf8'))(w)
}

// app.js의 noteHitCounts()와 같은 규칙 — 여기가 바뀌면 저기도 바꿔야 한다
const hits = new Map()
for (const v of Object.values(w.FORMULA_MAP)) {
  const seen = new Set()
  for (const key of [v.primary, ...(v.also ?? [])]) {
    const meta = w.FORMULA_LABELS[key]
    if (!meta || !meta.note) continue
    for (const note of [].concat(meta.note)) {
      if (seen.has(note)) continue
      seen.add(note)
      hits.set(note, (hits.get(note) ?? 0) + 1)
    }
  }
}

const missingOnly = process.argv.includes('--missing')
let badged = 0
let total = 0
const orphans = []

for (const s of w.NOTES.sections) {
  const lines = []
  for (const it of s.items) {
    total++
    const n = hits.get(it.k) ?? 0
    if (n) badged++
    else orphans.push(`${s.title} · ${it.k}`)
    if (!missingOnly) lines.push(`   ${n ? `${String(n).padStart(2)}회` : '  · '}  ${it.k}`)
  }
  if (!missingOnly) {
    console.log(`\n■ ${s.title} (기출 ${s.count}문항)`)
    console.log(lines.join('\n'))
  }
}

// 라벨은 노트 항목을 가리키는데 노트에 그 이름이 없으면 배지가 영영 안 붙는다
const noteKeys = new Set(w.NOTES.sections.flatMap(s => s.items.map(i => i.k)))
const dangling = [...hits.keys()].filter(k => !noteKeys.has(k))

console.log(`\n배지 붙는 항목 ${badged} / 전체 ${total}`)
if (dangling.length) {
  console.log('\n노트에 없는 이름을 가리키는 라벨 (배지가 사라집니다):')
  dangling.forEach(d => console.log('  ', d))
  process.exit(1)
}
if (missingOnly || orphans.length) {
  console.log(`\n배지 없는 항목 ${orphans.length}개 — 기출 15회차에 안 나온 항목입니다:`)
  orphans.forEach(o => console.log('  ', o))
}
