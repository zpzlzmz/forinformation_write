(() => {
  const POINTS_PER_Q = 5;
  const SECTION_SIZE = 20;
  const PASS_SUBJECT = 40;
  const PASS_AVG = 60;

  const SUBJECTS = [
    { id: 1, name: "소프트웨어 설계", start: 1, end: 20 },
    { id: 2, name: "소프트웨어 개발", start: 21, end: 40 },
    { id: 3, name: "데이터베이스 구축", start: 41, end: 60 },
    { id: 4, name: "프로그래밍 언어 활용", start: 61, end: 80 },
    { id: 5, name: "정보시스템 구축관리", start: 81, end: 100 },
  ];

  const state = {
    exam: null,
    mode: null, // 'full' | 'subject'
    subjectIds: [], // selected subject ids
    answers: {}, // n -> choice (1-4)
    lastResult: null,
  };

  const $ = (sel) => document.querySelector(sel);
  const screens = {
    home: $("#screen-home"),
    mode: $("#screen-mode"),
    quiz: $("#screen-quiz"),
    result: $("#screen-result"),
  };

  function show(name) {
    Object.entries(screens).forEach(([key, el]) => {
      el.classList.toggle("hidden", key !== name);
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function exams() {
    const list = Array.isArray(window.EXAMS) ? window.EXAMS.slice() : [];
    return list.sort((a, b) => String(a.id).localeCompare(String(b.id), "ko"));
  }

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
    if (stored) return stored;

    const ans = q.ans;
    const letter = answerLetter(ans);
    const opt = String((q.opts || [])[ans - 1] || "").trim();
    const stem = String(q.q || "");
    const others = (q.opts || [])
      .map((t, i) => ({ i: i + 1, t: String(t || "").trim() }))
      .filter((o) => o.i !== ans && o.t);

    const isWrongType = /틀린|옳지\s*않|아닌\s*것|거리가\s*먼|해당하지\s*않|옳지않은|아닌\s*것은/.test(stem);
    const isRightType = /옳은\s*것|맞는\s*것|해당하는\s*것|올바른|부합|해당하(?:는|는가)/.test(stem);
    const isCode = Boolean(q.code) || /결과|출력|실행되었|실행했을|프로그램/.test(stem);
    const isCalc = /얼마|횟수|기간|점수|크기|개수|차수|간선/.test(stem);

    let body;
    if (isWrongType) {
      body = `이 문제는 ‘틀린/옳지 않은’ 보기를 고르는 문항입니다. ${letter} 「${opt}」만 개념이 틀리거나 반대 설명이므로 정답입니다.`;
      if (others.length) {
        body += ` 나머지 보기(${others.map((o) => answerLetter(o.i)).join(", ")})는 대체로 올바른 설명에 가깝습니다.`;
      }
    } else if (isCode) {
      body = `코드를 순서대로 따라가면 결과가 ${letter} 「${opt}」가 됩니다.`;
    } else if (isCalc) {
      body = `문제 조건으로 계산·판별하면 답이 ${letter} 「${opt}」입니다.`;
    } else if (isRightType) {
      body = `문제의 정의·조건에 가장 잘 맞는 보기는 ${letter} 「${opt}」입니다. 다른 보기는 비슷해 보여도 핵심 개념이나 범위가 다릅니다.`;
    } else {
      body = `이 문항에서 묻는 개념에 해당하는 보기는 ${letter} 「${opt}」입니다.`;
    }

    if (q.box) {
      body += ` 제시된 지문/표를 기준으로 보면 ${letter}번 설명이 가장 잘 맞습니다.`;
    }

    return `정답은 ${letter}번입니다.\n\n${body}`;
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
        <p>${escapeHtml(buildExplanation(q)).replace(/\n/g, "<br>")}</p>
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

  function renderHome() {
    const list = $("#exam-list");
    const empty = $("#home-empty");
    const items = exams();
    list.innerHTML = "";
    empty.classList.toggle("hidden", items.length > 0);

    items.forEach((exam) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "exam-card";
      btn.innerHTML = `
        <strong>${escapeHtml(exam.title || exam.id)}</strong>
        <span>${(exam.questions || []).length}문항 · 5과목</span>
      `;
      btn.addEventListener("click", () => {
        state.exam = exam;
        state.mode = null;
        state.subjectIds = [];
        state.answers = {};
        state.lastResult = null;
        $("#mode-title").textContent = `${exam.title} · 모드 선택`;
        $("#subject-list").classList.add("hidden");
        show("mode");
      });
      list.appendChild(btn);
    });
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
          <p>${escapeHtml(buildExplanation(q)).replace(/\n/g, "<br>")}</p>
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
      bySubject[s.id] = {
        subject: s,
        correct: 0,
        total: 0,
        blank: 0,
        wrong: 0,
        details: [],
      };
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
      return {
        ...b,
        score,
        max: b.total * POINTS_PER_Q,
        pass: score >= PASS_SUBJECT,
      };
    });

    const avg =
      subjectResults.length > 0
        ? subjectResults.reduce((sum, s) => sum + s.score, 0) / subjectResults.length
        : 0;
    const allPassSubjects = subjectResults.every((s) => s.pass);
    const passExam = state.mode === "full"
      ? allPassSubjects && avg >= PASS_AVG
      : subjectResults[0]?.pass;

    state.lastResult = {
      subjectResults,
      avg,
      passExam,
      totalCorrect: subjectResults.reduce((n, s) => n + s.correct, 0),
      totalQs: qs.length,
    };

    renderResult();
    show("result");
  }

  function renderResult() {
    const r = state.lastResult;
    const summary = $("#result-summary");
    const subjects = $("#result-subjects");
    const review = $("#review-list");
    review.classList.add("hidden");
    review.innerHTML = "";

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

  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // Events
  document.querySelectorAll("[data-back]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const to = btn.dataset.back;
      if (to === "home") {
        state.exam = null;
        show("home");
      } else if (to === "mode") {
        show("mode");
      }
    });
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
    const qs = questionsForSubjects(state.subjectIds);
    const answered = qs.filter((q) => document.querySelector(`input[name="q-${q.n}"]:checked`)).length;
    if (answered < qs.length) {
      const ok = confirm(`아직 ${qs.length - answered}문항이 비어 있습니다. 그래도 채점할까요?`);
      if (!ok) return;
    }
    grade();
  });

  $("#quiz-form").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-reveal]");
    if (!btn) return;
    e.preventDefault();
    const n = Number(btn.dataset.reveal);
    const q = findQuestion(n);
    const card = btn.closest(".q-card");
    if (!q || !card) return;
    if (btn.dataset.open === "1") {
      hideQuestionCard(card);
      return;
    }
    const checked = card.querySelector(`input[name="q-${n}"]:checked`);
    const chosen = checked ? Number(checked.value) : null;
    revealQuestionCard(card, q, chosen);
  });

  $("#btn-reveal-all").addEventListener("click", () => {
    const cards = [...document.querySelectorAll("#quiz-form .q-card")];
    const allOpen = cards.every((c) => c.dataset.revealed === "1");
    cards.forEach((card) => {
      const n = Number(card.dataset.n);
      const q = findQuestion(n);
      if (!q) return;
      if (allOpen) {
        hideQuestionCard(card);
        return;
      }
      const checked = card.querySelector(`input[name="q-${n}"]:checked`);
      const chosen = checked ? Number(checked.value) : null;
      revealQuestionCard(card, q, chosen);
    });
    $("#btn-reveal-all").textContent = allOpen ? "전체 정답 보기" : "전체 정답 숨기기";
  });

  $("#btn-review").addEventListener("click", renderReview);
  $("#btn-retry").addEventListener("click", () => {
    state.answers = {};
    startQuiz();
  });

  renderHome();
  show("home");
})();
