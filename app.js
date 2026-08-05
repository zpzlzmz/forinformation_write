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
    const { reveal = false, chosen = null } = opts;
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

    return `
      <article class="q-card" data-n="${q.n}">
        <div class="q-head">
          <div class="q-num">${q.n}</div>
          <p class="q-text">${escapeHtml(q.q)}</p>
        </div>
        ${q.box ? `<div class="q-box">${escapeHtml(q.box)}</div>` : ""}
        ${q.code ? `<pre class="q-code">${escapeHtml(q.code)}</pre>` : ""}
        ${q.note ? `<p class="q-note">※ ${escapeHtml(q.note)}</p>` : ""}
        <div class="opts">${options}</div>
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
                ${renderQuestion(q, { reveal: true, chosen })}
                <div class="exp"><strong>해설</strong><br>${escapeHtml(q.exp || "해설 없음")}</div>
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

  $("#btn-review").addEventListener("click", renderReview);
  $("#btn-retry").addEventListener("click", () => {
    state.answers = {};
    startQuiz();
  });

  renderHome();
  show("home");
})();
