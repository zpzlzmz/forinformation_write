(() => {
  const AUTH_KEY = "quiz_auth_v1";
  // 계정은 소스에 그대로 들어 있다. 링크를 공개할 거면 서버 인증으로 바꿔야 한다.
  const ACCOUNTS = [
    { id: "admin", pw: "admin" },
    { id: "drake2525", pw: "fhfodcjf12" },
  ];

  // 정보처리기사 필기 채점 규칙
  const POINTS_PER_Q = 5;
  const PASS_SUBJECT = 40;
  const PASS_AVG = 60;
  const PASS_PRACTICAL = 60;

  const SUBJECTS = [
    { id: 1, name: "소프트웨어 설계", start: 1, end: 20 },
    { id: 2, name: "소프트웨어 개발", start: 21, end: 40 },
    { id: 3, name: "데이터베이스 구축", start: 41, end: 60 },
    { id: 4, name: "프로그래밍 언어 활용", start: 61, end: 80 },
    { id: 5, name: "정보시스템 구축관리", start: 81, end: 100 },
  ];

  const state = {
    cert: null,
    type: null,
    exam: null,
    mode: null, // 'full' | 'subject'
    subjectIds: [],
    answers: {},
    lastResult: null,
  };

  const $ = (sel) => document.querySelector(sel);
  const screens = {
    cert: $("#screen-cert"),
    type: $("#screen-type"),
    home: $("#screen-home"),
    note: $("#screen-note"),
    mode: $("#screen-mode"),
    quiz: $("#screen-quiz"),
    result: $("#screen-result"),
  };

  const engine = () => state.type?.engine || "mcq";

  function isLoggedIn() {
    return sessionStorage.getItem(AUTH_KEY) === "1";
  }

  function setLoggedIn(on) {
    if (on) sessionStorage.setItem(AUTH_KEY, "1");
    else sessionStorage.removeItem(AUTH_KEY);
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error(`failed: ${src}`));
      document.body.appendChild(s);
    });
  }

  /** 선택한 (자격증, 시험유형)의 데이터 파일만 그때 불러온다. */
  async function loadType(type) {
    if (type._exams) return type._exams;
    window.EXAMS = window.EXAMS || [];
    const before = window.EXAMS.length;
    for (const src of type.scripts) await loadScript(src);
    type._exams = window.EXAMS.slice(before);
    return type._exams;
  }

  function showApp(loggedIn) {
    $("#screen-login").classList.toggle("hidden", loggedIn);
    $("#app-root").classList.toggle("hidden", !loggedIn);
  }

  function show(name) {
    Object.entries(screens).forEach(([key, el]) => {
      el.classList.toggle("hidden", key !== name);
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /** 줄바꿈을 살린 본문 HTML. KaTeX 구분자($)는 그대로 남겨 둔다. */
  function textHtml(str) {
    return escapeHtml(str).replace(/\n/g, "<br>");
  }

  function typesetMath(root) {
    if (!root || typeof window.renderMathInElement !== "function") return;
    try {
      window.renderMathInElement(root, {
        delimiters: [
          { left: "$$", right: "$$", display: true },
          { left: "$", right: "$", display: false },
        ],
        throwOnError: false,
      });
    } catch (err) {
      console.warn("KaTeX", err);
    }
  }

  // ---------------------------------------------------------------- 공통 화면

  function renderCerts() {
    const list = $("#cert-list");
    list.innerHTML = "";
    (window.CATALOG?.certs || []).forEach((cert) => {
      const ready = cert.types.filter((t) => t.scripts.length > 0).map((t) => t.name);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "exam-card";
      btn.innerHTML = `
        <strong>${escapeHtml(cert.name)}</strong>
        <span>${escapeHtml(cert.desc)}</span>
        <span class="chip-row">${
          ready.length
            ? ready.map((n) => `<span class="chip on">${escapeHtml(n)}</span>`).join("")
            : '<span class="chip">준비 중</span>'
        }</span>
      `;
      btn.addEventListener("click", () => {
        state.cert = cert;
        state.type = null;
        state.exam = null;
        renderTypes();
        show("type");
      });
      list.appendChild(btn);
    });
    $("#top-eyebrow").textContent = "국가기술자격";
    $("#top-title").textContent = "문제풀이";
    $("#top-rule").textContent = "자격증을 선택하세요";
  }

  function renderTypes() {
    const cert = state.cert;
    $("#type-title").textContent = `${cert.name} · 시험 유형`;
    const list = $("#type-list");
    list.innerHTML = "";
    cert.types.forEach((type) => {
      const ready = type.scripts.length > 0;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "card mode-card";
      btn.disabled = !ready;
      btn.innerHTML = `
        ${ready ? "" : '<span class="card-kicker muted">준비 중</span>'}
        <strong>${escapeHtml(type.name)}</strong>
        <span>${escapeHtml(type.desc)}</span>
      `;
      btn.addEventListener("click", async () => {
        if (!ready) return;
        state.type = type;
        btn.disabled = true;
        try {
          await loadType(type);
        } catch (err) {
          console.error(err);
          alert("문제 데이터를 불러오지 못했습니다.");
          btn.disabled = false;
          return;
        }
        btn.disabled = false;
        renderHome();
        show("home");
      });
      list.appendChild(btn);
    });
    $("#top-eyebrow").textContent = cert.name;
    $("#top-title").textContent = "시험 유형 선택";
    $("#top-rule").textContent = cert.desc;
  }

  /** chunk 이 지정된 문제집은 회차 목록에서 여러 묶음으로 나눠 보여 준다. */
  function expandChunks(exam) {
    if (!exam.chunk) return [exam];
    const qs = (exam.questions || []).slice().sort((a, b) => a.n - b.n);
    const out = [];
    for (let i = 0; i < qs.length; i += exam.chunk) {
      const part = qs.slice(i, i + exam.chunk);
      const idx = out.length + 1;
      out.push({
        ...exam,
        chunk: 0,
        id: `${exam.id}-${idx}`,
        title: `${exam.title} ${idx}`,
        note: `${part[0].n}~${part[part.length - 1].n}번`,
        order: (exam.order || 0) + idx / 1000,
        questions: part,
      });
    }
    return out;
  }

  function currentExams() {
    const list = (state.type?._exams || []).flatMap(expandChunks);
    return list.sort((a, b) => {
      const ao = a.order ?? 0;
      const bo = b.order ?? 0;
      if (ao !== bo) return ao - bo;
      return String(a.id).localeCompare(String(b.id), "ko");
    });
  }

  /** 암기노트 — 이 자격증·시험유형에 붙은 노트가 있으면 회차 목록 위에 띄운다. */
  function notesForCurrent() {
    const n = window.NOTES;
    if (!n || n.cert !== state.cert?.id || n.type !== state.type?.id) return null;
    return n;
  }

  /**
   * 암기노트 항목별 기출 출제 횟수. formula-map.js의 손분류를 항목 이름으로 되짚는다.
   *
   * 숫자를 notes.js에 직접 적어 두지 않는 이유: 분류가 바뀌면 두 파일이 조용히
   * 갈라진다. 여기서 매번 세면 분류가 곧 표시값이라 갈라질 수가 없다.
   */
  function noteHitCounts() {
    const map = window.FORMULA_MAP;
    const labels = window.FORMULA_LABELS;
    if (!map || !labels) return null;
    const hits = new Map();
    for (const v of Object.values(map)) {
      // primary만 세면 부수적으로 쓰인 공식이 0회로 보인다 — 가스비용을 묻는 문항이
      // 비에너지까지 물어도 비에너지 배지가 안 붙는 식이다. 배지의 뜻은
      // "이 공식을 쓴 문항 수"이므로 also까지 센다.
      const keys = [v.primary].concat(v.also || []);
      const seen = new Set();
      for (const key of keys) {
        const meta = labels[key];
        if (!meta || !meta.note) continue;
        // 한 문항이 1종·3종 보안물건처럼 두 항목을 같이 물으면 양쪽에 센다
        for (const note of [].concat(meta.note)) {
          if (seen.has(note)) continue;
          seen.add(note);
          hits.set(note, (hits.get(note) || 0) + 1);
        }
      }
    }
    return hits;
  }

  function renderNote() {
    const n = notesForCurrent();
    if (!n) return;
    // 배지가 없는 항목 = 기출 15회차에 안 나온 것. 0회라고 찍지 않고 비워 둔다 —
    // 0은 "안 나온다"가 아니라 "이 15회차에는 없었다"라서 단정하면 안 된다.
    const hits = noteHitCounts();
    // 배지는 숫자만 보여주는 게 아니라 **외울 순서**를 보여줘야 한다.
    // 그래서 빈도에 따라 세기를 다르게 준다 — 5회 이상이면 눈에 먼저 걸린다.
    const badge = (k) => {
      const n2 = hits && hits.get(k);
      if (!n2) return "";
      const tier = n2 >= 5 ? "hot" : n2 >= 3 ? "warm" : "mild";
      return (
        `<span class="note-hit note-hit--${tier}"` +
        ` title="기출 15회차(2019~2025) 중 이 공식을 쓴 문항 ${n2}개">` +
        `<b>${n2}</b>회</span>`
      );
    };

    $("#note-title").textContent = n.title;
    $("#note-intro").textContent = n.intro;
    const legend = hits
      ? `<p class="note-legend">
           <span>항목 옆 배지 = 기출 15회차에서 그 공식을 쓴 문항 수</span>
           <span class="note-hit note-hit--hot"><b>5</b>회+</span>
           <span class="note-hit note-hit--warm"><b>3</b>~4회</span>
           <span class="note-hit note-hit--mild"><b>1</b>~2회</span>
         </p>`
      : "";
    $("#note-body").innerHTML = legend + n.sections
      .map(
        (s) => `
        <section class="note-sec">
          <h3>${escapeHtml(s.title)} <span class="note-count">기출 ${s.count}문항</span></h3>
          ${s.lead ? `<p class="note-lead">${textHtml(s.lead)}</p>` : ""}
          <dl class="note-list">
            ${s.items
              .map(
                (it) => `
              <div class="note-item">
                <dt>${textHtml(it.k)}${badge(it.k)}</dt>
                <dd class="note-v">${textHtml(it.v)}</dd>
                ${it.t ? `<dd class="note-t">${textHtml(it.t)}</dd>` : ""}
              </div>`
              )
              .join("")}
          </dl>
        </section>`
      )
      .join("");
    typesetMath($("#note-body"));
  }

  function renderHome() {
    const cert = state.cert;
    const type = state.type;
    const list = $("#exam-list");
    const empty = $("#home-empty");
    const items = currentExams();

    $("#home-title").textContent = `${cert.name} ${type.name} · 회차 선택`;
    $("#home-hint").textContent =
      engine() === "mcq"
        ? "회차 선택 → 전체(100문항) 또는 과목별(20문항) 응시. 문항당 5점으로 과목별 점수·평균을 냅니다."
        : "필답형입니다. 답을 직접 입력하면 자동으로 채점하고, 부분점수와 해설을 보여줍니다.";
    $("#top-eyebrow").textContent = `${cert.name} ${type.name}`;
    $("#top-title").textContent = "회차 선택";
    $("#top-rule").textContent =
      engine() === "mcq"
        ? "문항당 5점 · 과목당 100점 · 과락 40 / 평균 60 합격"
        : `100점 만점 · ${PASS_PRACTICAL}점 이상 합격`;

    $("#btn-note").classList.toggle("hidden", !notesForCurrent());
    list.innerHTML = "";
    empty.classList.toggle("hidden", items.length > 0);

    items.forEach((exam) => {
      const qs = exam.questions || [];
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "exam-card";
      // 랜덤 드릴은 한 번에 한 문제씩 끝없이 도는 방식이라 총점 표기가 오해를 준다
      const meta =
        engine() === "mcq"
          ? `${qs.length}문항 · 5과목`
          : exam.flow === "random"
            ? `한 문제씩 무한 반복 · 문제 ${qs.length}개`
            : `${qs.length}문항 · ${qs.reduce((n, q) => n + (q.points || 5), 0)}점`;
      btn.innerHTML = `
        <strong>${escapeHtml(exam.title || exam.id)}</strong>
        <span>${escapeHtml(meta)}</span>
        ${exam.note ? `<span class="chip-row"><span class="chip">${escapeHtml(exam.note)}</span></span>` : ""}
      `;
      btn.addEventListener("click", () => {
        state.exam = exam;
        state.mode = null;
        state.subjectIds = [];
        state.answers = {};
        state.lastResult = null;
        if (engine() === "mcq") {
          $("#mode-title").textContent = `${exam.title} · 모드 선택`;
          $("#subject-list").classList.add("hidden");
          show("mode");
        } else {
          startPractical();
        }
      });
      list.appendChild(btn);
    });
  }

  // ------------------------------------------------------- 필기(4지선다) 엔진

  function countInSubject(exam, subject) {
    return (exam.questions || []).filter((q) => q.n >= subject.start && q.n <= subject.end).length;
  }

  function questionsForSubjects(subjectIds) {
    const set = new Set(subjectIds);
    const ranges = SUBJECTS.filter((s) => set.has(s.id));
    return state.exam.questions
      .filter((q) => ranges.some((r) => q.n >= r.start && q.n <= r.end))
      .sort((a, b) => a.n - b.n);
  }

  function subjectOf(n) {
    return SUBJECTS.find((s) => n >= s.start && n <= s.end);
  }

  function answerLetter(n) {
    return ["①", "②", "③", "④"][n - 1] || String(n);
  }

  function findQuestion(n) {
    return (state.exam?.questions || []).find((q) => q.n === n);
  }

  /** 저장된 해설이 없으면 보기·문항 유형으로 짧은 요약 생성 */
  function buildExplanation(q) {
    const stored = (q.exp || "").trim();
    // 껍데기 템플릿(「다른 개념/조건」 등)은 쓰지 않음
    if (
      stored &&
      !/다른 개념\/조건/.test(stored) &&
      !/문항이 묻는 핵심 개념이/.test(stored) &&
      !/문제의 정의·조건과 일치하는 보기/.test(stored)
    ) {
      return stored;
    }
    const letter = answerLetter(q.ans);
    const opt = String((q.opts || [])[q.ans - 1] || "").trim();
    return `정답은 ${letter}번「${opt}」입니다.\n\n이 문항 해설은 아직 개념 설명으로 교체 중입니다.`;
  }

  function revealQuestionCard(card, q, chosen = null) {
    if (!card || !q) return;
    const letters = ["①", "②", "③", "④"];
    card.querySelectorAll(".opt").forEach((label, i) => {
      const val = i + 1;
      label.classList.remove("correct", "wrong");
      if (val === q.ans) label.classList.add("correct");
      else if (chosen != null && chosen === val && chosen !== q.ans) label.classList.add("wrong");
    });
    const panel = card.querySelector(".q-explain");
    if (panel) {
      panel.classList.remove("hidden");
      panel.innerHTML = `
        <div class="q-explain-badge">정답 ${letters[q.ans - 1]}</div>
        <p>${textHtml(buildExplanation(q))}</p>
      `;
    }
    const btn = card.querySelector("[data-reveal]");
    if (btn) {
      btn.textContent = "정답 숨기기";
      btn.dataset.open = "1";
    }
    card.dataset.revealed = "1";
  }

  function hideQuestionCard(card) {
    if (!card) return;
    card.querySelectorAll(".opt").forEach((label) => label.classList.remove("correct", "wrong"));
    const panel = card.querySelector(".q-explain");
    if (panel) {
      panel.classList.add("hidden");
      panel.innerHTML = "";
    }
    const btn = card.querySelector("[data-reveal]");
    if (btn) {
      btn.textContent = "정답 보기";
      delete btn.dataset.open;
    }
    delete card.dataset.revealed;
  }

  function renderSubjects() {
    const wrap = $("#subject-list");
    wrap.classList.remove("hidden");
    wrap.innerHTML = SUBJECTS.map((s) => {
      const cnt = countInSubject(state.exam, s);
      return `
      <button type="button" class="subject-card" data-subject="${s.id}" ${cnt ? "" : "disabled"}>
        <strong>${s.id}. ${escapeHtml(s.name)}</strong>
        <span>${s.start}–${s.end}번 · ${cnt}/20문항 · 문항당 ${POINTS_PER_Q}점(100점 만점)</span>
      </button>`;
    }).join("");

    wrap.querySelectorAll("[data-subject]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = Number(btn.dataset.subject);
        state.mode = "subject";
        state.subjectIds = [id];
        state.answers = {};
        startQuiz();
      });
    });
  }

  function startQuiz() {
    const qs = questionsForSubjects(state.subjectIds);
    if (!qs.length) {
      alert("선택한 범위에 문제가 없습니다.");
      return;
    }

    const title =
      state.mode === "full"
        ? `${state.exam.title} · 전체 모의고사`
        : `${state.exam.title} · ${SUBJECTS.find((s) => s.id === state.subjectIds[0]).name}`;

    $("#quiz-title").textContent = title;
    $("#quiz-progress").textContent = `${qs.length}문항 · 문항당 ${POINTS_PER_Q}점 · 20문제=1과목`;
    $("#quiz-back").textContent = "← 모드 선택";
    $("#quiz-back").dataset.to = "mode";
    $("#btn-reveal-all").classList.remove("hidden");

    const form = $("#quiz-form");
    let html = "";
    let lastSubjectId = null;
    qs.forEach((q) => {
      const sub = subjectOf(q.n);
      if (sub && sub.id !== lastSubjectId) {
        lastSubjectId = sub.id;
        html += `
          <div class="subject-divider" id="subject-${sub.id}">
            <span class="subject-divider-kicker">제${sub.id}과목</span>
            <strong>${escapeHtml(sub.name)}</strong>
            <span>${sub.start}–${sub.end}번 · 20문항 · 100점</span>
          </div>`;
      }
      html += renderQuestion(q);
    });
    form.innerHTML = html;
    show("quiz");
  }

  function renderQuestion(q, opts = {}) {
    const { reveal = false, chosen = null, review = false } = opts;
    const letters = ["①", "②", "③", "④"];
    const options = (q.opts || [])
      .map((text, i) => {
        const val = i + 1;
        let cls = "opt";
        if (reveal) {
          if (val === q.ans) cls += " correct";
          else if (chosen === val && chosen !== q.ans) cls += " wrong";
        }
        return `
          <label class="${cls}">
            <input type="radio" name="q-${q.n}" value="${val}" ${chosen === val ? "checked" : ""} ${reveal ? "disabled" : ""} />
            <span>${letters[i]} ${escapeHtml(text)}</span>
          </label>
        `;
      })
      .join("");

    const explainHtml = reveal
      ? `<div class="q-explain">
          <div class="q-explain-badge">정답 ${letters[q.ans - 1]}</div>
          <p>${textHtml(buildExplanation(q))}</p>
        </div>`
      : `<div class="q-explain hidden" data-explain-for="${q.n}"></div>`;

    const actions = review
      ? ""
      : `<div class="q-foot">
          <button type="button" class="btn-reveal" data-reveal="${q.n}">정답 보기</button>
        </div>`;

    return `
      <article class="q-card" data-n="${q.n}" ${reveal ? 'data-revealed="1"' : ""}>
        <div class="q-head">
          <div class="q-num">${q.n}</div>
          <p class="q-text">${escapeHtml(q.q)}</p>
        </div>
        ${q.box ? `<div class="q-box">${escapeHtml(q.box)}</div>` : ""}
        ${q.code ? `<pre class="q-code">${escapeHtml(q.code)}</pre>` : ""}
        ${q.note ? `<p class="q-note">※ ${escapeHtml(q.note)}</p>` : ""}
        <div class="opts">${options}</div>
        ${actions}
        ${explainHtml}
      </article>
    `;
  }

  function grade() {
    const qs = questionsForSubjects(state.subjectIds);
    const answers = {};
    qs.forEach((q) => {
      const checked = document.querySelector(`input[name="q-${q.n}"]:checked`);
      answers[q.n] = checked ? Number(checked.value) : null;
    });
    state.answers = answers;

    const bySubject = {};
    SUBJECTS.forEach((s) => {
      if (!state.subjectIds.includes(s.id)) return;
      bySubject[s.id] = { subject: s, correct: 0, total: 0, blank: 0, wrong: 0, details: [] };
    });

    qs.forEach((q) => {
      const sub = subjectOf(q.n);
      const bucket = bySubject[sub.id];
      bucket.total += 1;
      const chosen = answers[q.n];
      const ok = chosen === q.ans;
      if (chosen == null) bucket.blank += 1;
      else if (!ok) bucket.wrong += 1;
      if (ok) bucket.correct += 1;
      bucket.details.push({ q, chosen, ok });
    });

    const subjectResults = Object.values(bySubject).map((b) => {
      const score = b.correct * POINTS_PER_Q;
      return { ...b, score, max: b.total * POINTS_PER_Q, pass: score >= PASS_SUBJECT };
    });

    const avg =
      subjectResults.length > 0
        ? subjectResults.reduce((sum, s) => sum + s.score, 0) / subjectResults.length
        : 0;
    const allPassSubjects = subjectResults.every((s) => s.pass);
    const passExam =
      state.mode === "full" ? allPassSubjects && avg >= PASS_AVG : subjectResults[0]?.pass;

    state.lastResult = {
      kind: "mcq",
      subjectResults,
      avg,
      passExam,
      totalCorrect: subjectResults.reduce((n, s) => n + s.correct, 0),
      totalQs: qs.length,
    };

    renderResult();
    show("result");
  }

  // -------------------------------------------------------- 실기(필답형) 엔진

  const SUB_DIGITS = "₀₁₂₃₄₅₆₇₈₉";

  /** 채점용 정규화: 공백·구두점·첨자 차이를 지운다. */
  function norm(str) {
    let s = String(str ?? "").toLowerCase();
    s = s.replace(/[₀-₉]/g, (c) => String(SUB_DIGITS.indexOf(c)));
    return s
      .replace(/\s+/g, "")
      .replace(/[.,·・‧、，。'"'"''""`]/g, "")
      .replace(/[()[\]{}]/g, "")
      .replace(/[-–—_]/g, "");
  }

  /** 숫자 답에서 첫 번째 수치를 뽑는다. "약 2.88 m" → 2.88 */
  function parseNum(str) {
    const m = String(str ?? "").replace(/,/g, "").match(/-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?/);
    return m ? Number(m[0]) : null;
  }

  /** 입력에서 앞쪽 수치를 떼어 낸 나머지 = 응시자가 쓴 단위 */
  function unitPart(str) {
    return String(str ?? "")
      .replace(/,/g, "")
      .replace(/^\s*[-+]?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?/, "")
      .replace(/\s+/g, "")
      .replace(/³/g, "3")
      .replace(/²/g, "2")
      .replace(/㎥/g, "m3")
      .replace(/㎤/g, "cm3")
      .replace(/[\^*]/g, "")
      .toLowerCase();
  }

  const UNIT_ALT = {
    "g/cm3": ["g/cm3", "g/cc", "gcm3"],
    "kg/m3": ["kg/m3", "kgm3"],
    "초/m": ["초/m", "s/m", "sec/m", "second/m"],
    "%": ["%", "퍼센트", "percent"],
  };

  /** 단위가 정의된 문항은 단위까지 맞아야 정답 */
  function unitOk(given, unit, custom) {
    const want = unitPart(unit);
    if (!want) return true;
    const got = unitPart(given);
    const allow = custom ? custom.map(unitPart) : UNIT_ALT[want] || [want];
    return allow.includes(got);
  }

  function numMatches(given, target, q) {
    if (given == null || target == null) return false;
    if (q.tol != null) return Math.abs(given - target) <= q.tol + 1e-12;
    const rtol = q.rtol != null ? q.rtol : 0.02;
    const allow = Math.abs(target) * rtol;
    return Math.abs(given - target) <= (allow || 1e-9) + 1e-12;
  }

  function wordMatches(given, accept) {
    const g = norm(given);
    if (!g) return false;
    return (accept || []).some((a) => {
      const t = norm(a);
      return t && (g === t || g.includes(t));
    });
  }

  function countKeywords(given, keywords) {
    const g = norm(given);
    if (!g) return 0;
    let hit = 0;
    (keywords || []).forEach((k) => {
      const alts = Array.isArray(k) ? k : [k];
      if (alts.some((a) => g.includes(norm(a)))) hit += 1;
    });
    return hit;
  }

  function pointsOf(q) {
    return q.points || 5;
  }

  /** 한 문항 채점 → {verdict, score, max, parts} */
  function gradePractical(q, raw) {
    const max = pointsOf(q);
    const kind = q.kind || "word";

    if (kind === "multi") {
      const parts = q.parts || [];
      const per = max / (parts.length || 1);
      let score = 0;
      const detail = parts.map((p, i) => {
        const given = (raw && raw[i]) || "";
        let ok = false;
        if (!String(given).trim()) {
          return { label: p.label, given, ok: false, blank: true, score: 0 };
        }
        let reason = "";
        if (p.answer != null) {
          const numOk = numMatches(parseNum(given), p.answer, { ...q, ...p });
          const uOk = unitOk(given, p.unit, p.unitAccept);
          ok = numOk && uOk;
          if (numOk && !uOk) reason = "단위";
        } else if (p.accept) ok = wordMatches(given, p.accept);
        else if (p.keywords) ok = countKeywords(given, p.keywords) >= (p.need || p.keywords.length);
        if (ok) score += per;
        return { label: p.label, given, ok, blank: false, reason, score: ok ? per : 0 };
      });
      const answered = detail.filter((d) => !d.blank).length;
      const verdict = answered === 0 ? "blank" : score >= max - 1e-9 ? "ok" : score > 0 ? "partial" : "wrong";
      return { verdict, score, max, parts: detail };
    }

    const given = String(raw ?? "");
    if (!given.trim()) return { verdict: "blank", score: 0, max, parts: null };

    if (kind === "num") {
      const got = parseNum(given);
      // also: 지수 표기처럼 같은 값을 다르게 적는 경우를 함께 인정한다
      const targets = [q.answer, ...(q.also || [])];
      const numOk = targets.some((t) => numMatches(got, t, q));
      const uOk = unitOk(given, q.unit, q.unitAccept);
      const ok = numOk && uOk;
      return {
        verdict: ok ? "ok" : "wrong",
        score: ok ? max : 0,
        max,
        parts: null,
        reason: numOk && !uOk ? "단위" : "",
      };
    }

    if (kind === "desc") {
      const need = q.need || (q.keywords || []).length || 1;
      const hit = countKeywords(given, q.keywords);
      const ratio = Math.min(1, hit / need);
      const score = Math.round(max * ratio * 10) / 10;
      const verdict = ratio >= 1 ? "ok" : ratio > 0 ? "partial" : "wrong";
      return { verdict, score, max, parts: null, hit, need };
    }

    const ok = wordMatches(given, q.accept);
    return { verdict: ok ? "ok" : "wrong", score: ok ? max : 0, max, parts: null };
  }

  function practicalQuestions() {
    return (state.exam.questions || []).slice().sort((a, b) => a.n - b.n);
  }

  function startPractical() {
    const qs = practicalQuestions();
    if (!qs.length) {
      alert("이 회차에는 문제가 없습니다.");
      return;
    }
    if (state.exam.flow === "step" || state.exam.flow === "random") {
      startStep();
      return;
    }
    document.querySelector(".quiz-actions").classList.remove("hidden");
    const total = qs.reduce((n, q) => n + pointsOf(q), 0);
    $("#quiz-title").textContent = state.exam.title;
    $("#quiz-progress").textContent = `${qs.length}문항 · ${total}점 만점 · ${PASS_PRACTICAL}점 이상 합격`;
    $("#quiz-back").textContent = "← 회차 선택";
    $("#quiz-back").dataset.to = "home";
    $("#btn-reveal-all").classList.remove("hidden");

    const form = $("#quiz-form");
    form.innerHTML = qs.map((q) => renderPracticalQuestion(q)).join("");
    typesetMath(form);
    show("quiz");
  }

  /**
   * 입력칸에는 답을 짐작하게 하는 힌트도, 단위도 띄우지 않는다.
   * 단위가 있는 문항은 응시자가 단위까지 직접 써야 정답이다.
   */
  function inputsFor(q, { disabled = false, values = null } = {}) {
    const kind = q.kind || "word";
    if (kind === "multi") {
      return `<div class="ans-grid">${(q.parts || [])
        .map((p, i) => {
          const v = values ? values[i] || "" : "";
          return `
            <label class="ans-row">
              <span class="ans-label">${escapeHtml(p.label || `(${i + 1})`)}</span>
              <input type="text" class="ans-input" name="a-${q.n}-${i}" value="${escapeHtml(v)}"
                     autocomplete="off" ${disabled ? "disabled" : ""} placeholder="답 입력" />
            </label>`;
        })
        .join("")}</div>`;
    }
    if (kind === "desc") {
      const v = values || "";
      return `<textarea class="ans-input ans-area" name="a-${q.n}" rows="3" ${disabled ? "disabled" : ""}
                placeholder="한두 줄로 쓰세요">${escapeHtml(v)}</textarea>`;
    }
    const v = values || "";
    return `
      <label class="ans-row single">
        <input type="text" class="ans-input" name="a-${q.n}" value="${escapeHtml(v)}" autocomplete="off"
               ${disabled ? "disabled" : ""} placeholder="답 입력" />
      </label>`;
  }

  function modelAnswerHtml(q) {
    const kind = q.kind || "word";
    if (kind === "multi") {
      return `<ul class="model-list">${(q.parts || [])
        .map((p) => {
          const a = p.answer != null ? `${p.answer}${p.unit ? " " + p.unit : ""}` : (p.accept || p.keywords || []).map((x) => (Array.isArray(x) ? x[0] : x)).join(" / ");
          return `<li><b>${escapeHtml(p.label || "")}</b> ${textHtml(a)}</li>`;
        })
        .join("")}</ul>`;
    }
    if (kind === "num") return textHtml(`${q.answer}${q.unit ? " " + q.unit : ""}`);
    if (kind === "desc") return textHtml(q.model || (q.keywords || []).map((k) => (Array.isArray(k) ? k[0] : k)).join(", "));
    return textHtml((q.accept || []).join(" / "));
  }

  function feedbackHtml(q, result) {
    const badge =
      result == null
        ? '<span class="v-badge">정답</span>'
        : result.verdict === "ok"
          ? '<span class="v-badge ok">정답</span>'
          : result.verdict === "partial"
            ? '<span class="v-badge partial">부분정답</span>'
            : result.verdict === "blank"
              ? '<span class="v-badge blank">미응답</span>'
              : '<span class="v-badge wrong">오답</span>';
    const scoreText = result ? ` <span class="v-score">${result.score}/${result.max}점</span>` : "";
    const partsText =
      result && result.parts
        ? `<div class="part-marks">${result.parts
            .map(
              (p) =>
                `<span class="mark ${p.ok ? "ok" : p.blank ? "blank" : "wrong"}">${escapeHtml(p.label || "")} ${
                  p.ok ? "O" : p.blank ? "-" : "X"
                }${p.reason === "단위" ? " (단위)" : ""}</span>`
            )
            .join("")}</div>`
        : "";
    const unitText =
      (result && result.reason === "단위") || (result && result.parts || []).some?.((p) => p.reason === "단위")
        ? '<p class="q-note">수치는 맞았지만 단위가 없거나 틀렸습니다. 실기는 단위까지 써야 정답입니다.</p>'
        : "";
    const hitText =
      result && result.hit != null ? `<p class="q-note">핵심 용어 ${result.hit}/${result.need}개 포함</p>` : "";

    return `
      <div class="q-explain">
        <div class="q-explain-badge">${badge}${scoreText}</div>
        ${partsText}
        ${unitText}
        ${hitText}
        <div class="ans-block">
          <div class="ans-block-title">정답</div>
          <div class="ans-block-body">${modelAnswerHtml(q)}</div>
          ${q.figAnswer ? `<figure class="q-fig"><img src="${escapeHtml(q.figAnswer)}" alt="문제 ${q.n} 정답 그림" loading="lazy" /></figure>` : ""}
        </div>
        ${
          q.solution
            ? `<div class="ans-block">
                 <div class="ans-block-title">풀이</div>
                 <div class="ans-block-body">${textHtml(q.solution)}</div>
               </div>`
            : ""
        }
        ${
          q.exp
            ? `<div class="ans-block">
                 <div class="ans-block-title">해설</div>
                 <div class="ans-block-body">${textHtml(q.exp)}</div>
               </div>`
            : ""
        }
      </div>`;
  }

  function renderPracticalQuestion(q, opts = {}) {
    const { reveal = false, values = null, result = null, review = false } = opts;
    const tags = (q.tags || []).map((t) => `<span class="chip">${escapeHtml(t)}</span>`).join("");
    const actions = review
      ? ""
      : `<div class="q-foot">
          <button type="button" class="btn-reveal" data-reveal="${q.n}">정답 보기</button>
        </div>`;

    return `
      <article class="q-card practical" data-n="${q.n}" ${reveal ? 'data-revealed="1"' : ""}>
        <div class="q-head">
          <div class="q-num">${q.n}</div>
          <div class="q-text">${textHtml(q.q)}</div>
        </div>
        ${q.box ? `<div class="q-box">${textHtml(q.box)}</div>` : ""}
        ${q.fig ? `<figure class="q-fig"><img src="${escapeHtml(q.fig)}" alt="문제 ${q.n} 그림" loading="lazy" /></figure>` : ""}
        ${q.note ? `<p class="q-note">※ ${textHtml(q.note)}</p>` : ""}
        <div class="ans-wrap">${inputsFor(q, { disabled: reveal, values })}</div>
        <div class="q-meta-row">
          <span class="pts">${pointsOf(q)}점</span>${tags}
        </div>
        ${actions}
        ${reveal ? feedbackHtml(q, result) : `<div class="q-explain hidden" data-explain-for="${q.n}"></div>`}
      </article>`;
  }

  // 한 문제씩 넘기며 푸는 모드 — 기본 다지기처럼 가볍게 반복할 때 쓴다

  const isDrill = () => state.exam?.flow === "random";

  function shuffled(list) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function startStep() {
    const qs = practicalQuestions();
    state.queue = isDrill() ? shuffled(qs) : qs;
    state.stepIndex = 0;
    state.stepGiven = {};
    state.stepResult = {};
    state.drill = { done: 0, ok: 0, partial: 0, wrong: 0 };
    $("#quiz-back").textContent = "← 회차 선택";
    $("#quiz-back").dataset.to = "home";
    $("#top-title").textContent = isDrill() ? "랜덤 드릴" : "문제 풀기";
    document.querySelector(".quiz-actions").classList.add("hidden");
    renderStep();
    show("quiz");
  }

  function stepNavHtml(i, total, checked) {
    const drill = isDrill();
    const last = !drill && i + 1 === total;
    const left = drill
      ? `<button type="button" class="btn ghost" data-step="stop" ${state.drill.done ? "" : "disabled"}>그만하기</button>`
      : `<button type="button" class="btn ghost" data-step="prev" ${i === 0 ? "disabled" : ""}>← 이전</button>`;
    const count = drill
      ? `<span class="step-count">푼 문제 ${state.drill.done} · 정답 ${state.drill.ok}</span>`
      : `<span class="step-count">${i + 1} / ${total}</span>`;
    return `
      <div class="step-nav">
        ${left}
        ${count}
        ${
          checked
            ? `<button type="button" class="btn primary" data-step="next">${last ? "결과 보기" : "다음 문제 →"}</button>`
            : `<button type="button" class="btn primary" data-step="check">확인</button>`
        }
      </div>`;
  }

  function renderStep() {
    const total = state.queue.length;
    const i = state.stepIndex;
    const q = state.queue[i];
    const checked = state.stepResult[q.n] != null;
    $("#quiz-title").textContent = state.exam.title;
    $("#quiz-progress").textContent = isDrill()
      ? state.drill.done
        ? `정답률 ${Math.round((state.drill.ok / state.drill.done) * 100)}% · 랜덤 출제`
        : "랜덤으로 한 문제씩 나옵니다"
      : `${i + 1} / ${total}문항 · 확인을 누르면 바로 채점됩니다`;
    const form = $("#quiz-form");
    form.innerHTML =
      renderPracticalQuestion(q, {
        reveal: checked,
        values: state.stepGiven[q.n] ?? null,
        result: state.stepResult[q.n] || null,
        review: true,
      }) + stepNavHtml(i, total, checked);
    typesetMath(form);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function readStepAnswer(q) {
    if ((q.kind || "word") === "multi") {
      return (q.parts || []).map((_, k) => document.querySelector(`[name="a-${q.n}-${k}"]`)?.value || "");
    }
    return document.querySelector(`[name="a-${q.n}"]`)?.value || "";
  }

  function stepCheck() {
    const q = state.queue[state.stepIndex];
    const raw = readStepAnswer(q);
    const first = state.stepResult[q.n] == null;
    state.stepGiven[q.n] = raw;
    const result = gradePractical(q, raw);
    state.stepResult[q.n] = result;
    if (first) {
      state.drill.done += 1;
      state.drill[result.verdict === "blank" ? "wrong" : result.verdict] += 1;
    }
    renderStep();
  }

  /** 랜덤 드릴에서 다음 문제로. 한 바퀴 다 돌면 다시 섞는다. */
  function drillNext() {
    if (state.stepIndex + 1 < state.queue.length) {
      state.stepIndex += 1;
    } else {
      state.queue = shuffled(practicalQuestions());
      state.stepIndex = 0;
    }
    renderStep();
  }

  function finishStep() {
    const qs = isDrill() ? practicalQuestions().filter((q) => state.stepResult[q.n]) : practicalQuestions();
    state.answers = state.stepGiven;
    const details = qs.map((q) => {
      const blank = (q.kind || "word") === "multi" ? (q.parts || []).map(() => "") : "";
      const given = state.stepGiven[q.n] ?? blank;
      const result = state.stepResult[q.n] || gradePractical(q, given);
      return { q, given, result };
    });
    const score = details.reduce((n, d) => n + d.result.score, 0);
    const max = details.reduce((n, d) => n + d.result.max, 0);
    const scaled = max ? (score / max) * 100 : 0;
    state.lastResult = {
      kind: "short",
      details,
      score: Math.round(score * 10) / 10,
      max,
      scaled: Math.round(scaled * 10) / 10,
      passExam: scaled >= PASS_PRACTICAL,
      counts: {
        ok: details.filter((d) => d.result.verdict === "ok").length,
        partial: details.filter((d) => d.result.verdict === "partial").length,
        wrong: details.filter((d) => d.result.verdict === "wrong").length,
        blank: details.filter((d) => d.result.verdict === "blank").length,
      },
    };
    renderResult();
    show("result");
  }

  function readPracticalAnswers() {
    const out = {};
    practicalQuestions().forEach((q) => {
      if ((q.kind || "word") === "multi") {
        out[q.n] = (q.parts || []).map((_, i) => {
          const el = document.querySelector(`[name="a-${q.n}-${i}"]`);
          return el ? el.value : "";
        });
      } else {
        const el = document.querySelector(`[name="a-${q.n}"]`);
        out[q.n] = el ? el.value : "";
      }
    });
    return out;
  }

  function gradePracticalExam() {
    const qs = practicalQuestions();
    const answers = readPracticalAnswers();
    state.answers = answers;

    const details = qs.map((q) => ({ q, given: answers[q.n], result: gradePractical(q, answers[q.n]) }));
    const score = details.reduce((n, d) => n + d.result.score, 0);
    const max = details.reduce((n, d) => n + d.result.max, 0);
    const scaled = max ? (score / max) * 100 : 0;

    state.lastResult = {
      kind: "short",
      details,
      score: Math.round(score * 10) / 10,
      max,
      scaled: Math.round(scaled * 10) / 10,
      passExam: scaled >= PASS_PRACTICAL,
      counts: {
        ok: details.filter((d) => d.result.verdict === "ok").length,
        partial: details.filter((d) => d.result.verdict === "partial").length,
        wrong: details.filter((d) => d.result.verdict === "wrong").length,
        blank: details.filter((d) => d.result.verdict === "blank").length,
      },
    };

    renderResult();
    show("result");
  }

  // ------------------------------------------------------------------ 결과

  function renderResult() {
    const r = state.lastResult;
    const summary = $("#result-summary");
    const subjects = $("#result-subjects");
    const review = $("#review-list");
    review.classList.add("hidden");
    review.innerHTML = "";

    if (r.kind === "short") {
      summary.innerHTML = `
        <div class="stat ${r.passExam ? "pass" : "fail"}">
          <div class="label">판정</div>
          <div class="value">${r.passExam ? "합격" : "불합격"}</div>
        </div>
        <div class="stat">
          <div class="label">100점 환산</div>
          <div class="value">${r.scaled}</div>
        </div>
        <div class="stat">
          <div class="label">득점</div>
          <div class="value">${r.score}/${r.max}</div>
        </div>
        <div class="stat">
          <div class="label">정답 / 부분</div>
          <div class="value">${r.counts.ok} / ${r.counts.partial}</div>
        </div>
      `;
      subjects.innerHTML = `
        <div class="subject-row">
          <div>
            <strong>문항별 결과</strong>
            <div style="color:var(--muted);font-size:.9rem">
              정답 ${r.counts.ok} · 부분정답 ${r.counts.partial} · 오답 ${r.counts.wrong} · 미응답 ${r.counts.blank}
            </div>
          </div>
          <div class="score">${r.scaled}점</div>
          <span class="badge ${r.passExam ? "ok" : "ng"}">${r.passExam ? "통과" : "미달"}</span>
        </div>`;
      return;
    }

    const avgText = Number.isInteger(r.avg) ? String(r.avg) : r.avg.toFixed(1);
    const passClass = r.passExam ? "pass" : "fail";
    const passLabel =
      state.mode === "full"
        ? r.passExam
          ? "합격"
          : "불합격"
        : r.passExam
          ? "과락 없음"
          : "과락";

    summary.innerHTML = `
      <div class="stat ${passClass}">
        <div class="label">판정</div>
        <div class="value">${passLabel}</div>
      </div>
      <div class="stat">
        <div class="label">${state.mode === "full" ? "5과목 평균" : "과목 점수"}</div>
        <div class="value">${avgText}</div>
      </div>
      <div class="stat">
        <div class="label">정답 수</div>
        <div class="value">${r.totalCorrect}/${r.totalQs}</div>
      </div>
      <div class="stat">
        <div class="label">득점 합계</div>
        <div class="value">${r.totalCorrect * POINTS_PER_Q}</div>
      </div>
    `;

    subjects.innerHTML = r.subjectResults
      .map((s) => `
        <div class="subject-row">
          <div>
            <strong>${s.subject.id}. ${escapeHtml(s.subject.name)}</strong>
            <div style="color:var(--muted);font-size:.9rem">
              ${s.correct}/${s.total} · 미응답 ${s.blank} · 오답 ${s.wrong}
            </div>
          </div>
          <div class="score">${s.score}점</div>
          <span class="badge ${s.pass ? "ok" : "ng"}">${s.pass ? "통과" : "과락"}</span>
        </div>
      `)
      .join("");
  }

  function renderReview() {
    const r = state.lastResult;
    if (!r) return;
    const wrap = $("#review-list");
    wrap.classList.remove("hidden");

    if (r.kind === "short") {
      wrap.innerHTML = r.details
        .map(({ q, given, result }) => {
          const tagMap = { ok: "ok", partial: "partial", wrong: "wrong", blank: "blank" };
          const labelMap = { ok: "정답", partial: "부분정답", wrong: "오답", blank: "미응답" };
          return `
            <article class="review-card">
              <span class="tag ${tagMap[result.verdict]}">${labelMap[result.verdict]}</span>
              ${renderPracticalQuestion(q, { reveal: true, values: given, result, review: true })}
            </article>`;
        })
        .join("");
      typesetMath(wrap);
      wrap.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    wrap.innerHTML = r.subjectResults
      .map((s) => {
        const head = `
          <div class="subject-divider">
            <span class="subject-divider-kicker">제${s.subject.id}과목</span>
            <strong>${escapeHtml(s.subject.name)}</strong>
            <span>${s.score}점 · ${s.correct}/${s.total}</span>
          </div>`;
        const body = s.details
          .map(({ q, chosen, ok }) => {
            let tag = '<span class="tag ok">정답</span>';
            if (chosen == null) tag = '<span class="tag blank">미응답</span>';
            else if (!ok) tag = '<span class="tag wrong">오답</span>';
            return `
              <article class="review-card">
                ${tag}
                ${renderQuestion(q, { reveal: true, chosen, review: true })}
              </article>`;
          })
          .join("");
        return head + body;
      })
      .join("");

    wrap.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // ------------------------------------------------------------------ 이벤트

  document.querySelectorAll("[data-back]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const to = btn.dataset.back;
      if (to === "cert") {
        state.type = null;
        state.exam = null;
        renderCerts();
        show("cert");
      } else if (to === "type") {
        state.exam = null;
        renderTypes();
        show("type");
      } else if (to === "home") {
        state.exam = null;
        renderHome();
        show("home");
      }
    });
  });

  $("#btn-note").addEventListener("click", () => {
    renderNote();
    $("#top-title").textContent = "암기노트";
    show("note");
  });

  $("#quiz-back").addEventListener("click", () => {
    const to = $("#quiz-back").dataset.to || "home";
    if (to === "mode") {
      show("mode");
    } else {
      state.exam = null;
      renderHome();
      show("home");
    }
  });

  $("#result-back").addEventListener("click", () => {
    if (engine() === "mcq") show("mode");
    else startPractical();
  });

  document.querySelectorAll("[data-mode]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const mode = btn.dataset.mode;
      if (mode === "full") {
        state.mode = "full";
        state.subjectIds = SUBJECTS.map((s) => s.id);
        state.answers = {};
        $("#subject-list").classList.add("hidden");
        startQuiz();
      } else {
        renderSubjects();
      }
    });
  });

  $("#quiz-form").addEventListener("submit", (e) => {
    e.preventDefault();
    if (engine() === "short") {
      // 한 문제씩 모드에서는 엔터가 곧 "확인"이다
      if (state.exam?.flow === "step" || state.exam?.flow === "random") {
        if (state.stepResult[state.queue[state.stepIndex].n] == null) stepCheck();
        return;
      }
      const qs = practicalQuestions();
      const answers = readPracticalAnswers();
      const blank = qs.filter((q) => {
        const v = answers[q.n];
        return Array.isArray(v) ? v.every((x) => !String(x).trim()) : !String(v).trim();
      }).length;
      if (blank > 0 && !confirm(`아직 ${blank}문항이 비어 있습니다. 그래도 채점할까요?`)) return;
      gradePracticalExam();
      return;
    }
    const qs = questionsForSubjects(state.subjectIds);
    const answered = qs.filter((q) => document.querySelector(`input[name="q-${q.n}"]:checked`)).length;
    if (answered < qs.length) {
      if (!confirm(`아직 ${qs.length - answered}문항이 비어 있습니다. 그래도 채점할까요?`)) return;
    }
    grade();
  });

  $("#quiz-form").addEventListener("click", (e) => {
    const step = e.target.closest("[data-step]");
    if (step) {
      e.preventDefault();
      const act = step.dataset.step;
      if (act === "check") stepCheck();
      else if (act === "stop") finishStep();
      else if (act === "prev" && state.stepIndex > 0) {
        state.stepIndex -= 1;
        renderStep();
      } else if (act === "next") {
        if (isDrill()) drillNext();
        else if (state.stepIndex + 1 >= state.queue.length) finishStep();
        else {
          state.stepIndex += 1;
          renderStep();
        }
      }
      return;
    }

    const btn = e.target.closest("[data-reveal]");
    if (!btn) return;
    e.preventDefault();
    const n = Number(btn.dataset.reveal);
    const q = findQuestion(n);
    const card = btn.closest(".q-card");
    if (!q || !card) return;

    if (btn.dataset.open === "1") {
      if (engine() === "short") {
        const panel = card.querySelector(".q-explain");
        panel.classList.add("hidden");
        panel.innerHTML = "";
        btn.textContent = "정답 보기";
        delete btn.dataset.open;
        delete card.dataset.revealed;
      } else {
        hideQuestionCard(card);
      }
      return;
    }

    if (engine() === "short") {
      const raw =
        (q.kind || "word") === "multi"
          ? (q.parts || []).map((_, i) => document.querySelector(`[name="a-${n}-${i}"]`)?.value || "")
          : document.querySelector(`[name="a-${n}"]`)?.value || "";
      const result = gradePractical(q, raw);
      const panel = card.querySelector(".q-explain");
      panel.classList.remove("hidden");
      panel.outerHTML = feedbackHtml(q, result);
      typesetMath(card);
      btn.textContent = "정답 숨기기";
      btn.dataset.open = "1";
      card.dataset.revealed = "1";
      return;
    }

    const checked = card.querySelector(`input[name="q-${n}"]:checked`);
    const chosen = checked ? Number(checked.value) : null;
    revealQuestionCard(card, q, chosen);
  });

  $("#btn-reveal-all").addEventListener("click", () => {
    const cards = [...document.querySelectorAll("#quiz-form .q-card")];
    const allOpen = cards.length > 0 && cards.every((c) => c.dataset.revealed === "1");
    cards.forEach((card) => {
      const btn = card.querySelector("[data-reveal]");
      if (!btn) return;
      const open = btn.dataset.open === "1";
      if (allOpen === open) btn.click();
    });
    $("#btn-reveal-all").textContent = allOpen ? "전체 정답 보기" : "전체 정답 숨기기";
  });

  $("#btn-review").addEventListener("click", renderReview);
  $("#btn-retry").addEventListener("click", () => {
    state.answers = {};
    if (engine() === "short") startPractical();
    else startQuiz();
  });

  async function enterApp() {
    showApp(true);
    renderCerts();
    show("cert");
  }

  $("#login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = ($("#login-id").value || "").trim();
    const pw = $("#login-pw").value || "";
    const err = $("#login-error");
    if (ACCOUNTS.some((acc) => acc.id === id && acc.pw === pw)) {
      err.classList.add("hidden");
      setLoggedIn(true);
      await enterApp();
      return;
    }
    err.classList.remove("hidden");
  });

  $("#btn-logout").addEventListener("click", () => {
    setLoggedIn(false);
    state.cert = null;
    state.type = null;
    state.exam = null;
    state.answers = {};
    state.lastResult = null;
    showApp(false);
    $("#login-pw").value = "";
    $("#login-id").focus();
  });

  // 홈 화면 설치 — 브라우저가 설치 가능하다고 알릴 때만 버튼을 띄운다
  let deferredInstall = null;
  const installBtn = $("#btn-install");
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredInstall = e;
    installBtn.classList.remove("hidden");
  });
  installBtn.addEventListener("click", async () => {
    if (!deferredInstall) return;
    installBtn.disabled = true;
    deferredInstall.prompt();
    await deferredInstall.userChoice;
    deferredInstall = null;
    installBtn.disabled = false;
    installBtn.classList.add("hidden");
  });
  window.addEventListener("appinstalled", () => {
    deferredInstall = null;
    installBtn.classList.add("hidden");
  });

  if (isLoggedIn()) {
    enterApp();
  } else {
    showApp(false);
    $("#login-id").focus();
  }
})();
