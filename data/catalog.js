/**
 * 자격증 → 시험유형(필기/실기) → 회차 카탈로그.
 * scripts 가 비어 있으면 앱이 "준비 중"으로 표시한다.
 */
window.CATALOG = {
  certs: [
    {
      id: "info",
      name: "정보처리기사",
      desc: "소프트웨어 설계 · 개발 · 데이터베이스 · 프로그래밍 · 정보시스템 구축관리",
      types: [
        {
          id: "written",
          name: "필기",
          engine: "mcq",
          desc: "4지선다 100문항 · 문항당 5점 · 과락 40 / 평균 60",
          scripts: [
            "data/2024-1.js",
            "data/2024-2.js",
            "data/2024-3.js",
            "data/2025-1.js",
            "data/2025-2.js",
            "data/2025-3.js",
            "data/2026-1.js",
          ],
        },
        {
          id: "practical",
          name: "실기",
          engine: "short",
          desc: "프로그래밍 · SQL · 신기술 용어 필답형",
          scripts: [],
        },
      ],
    },
    {
      id: "expl",
      name: "화약류관리기사",
      desc: "화약류 일반 · 발파설계 및 작업 · 암반굴착 및 시공 · 안전관리 관계 법규",
      types: [
        {
          id: "written",
          name: "필기",
          engine: "mcq",
          desc: "화약류 일반 · 발파공학 · 암석발파 · 관계 법규",
          scripts: [],
        },
        {
          id: "practical",
          name: "실기",
          engine: "short",
          desc: "필답형 — 단답 · 계산 · 서술. 입력하면 바로 채점됩니다.",
          scripts: [
            "data/expl/practical/basics-01.js",
            "data/expl/practical/basics-02.js",
            "data/expl/practical/basics-03.js",
            "data/expl/practical/basics-04.js",
            "data/expl/practical/basics-05.js",
            "data/expl/practical/variant-01.js",
            "data/expl/practical/variant-02.js",
            "data/expl/practical/variant-03.js",
            "data/expl/practical/variant-04.js",
            "data/expl/practical/2025-4.js",
            "data/expl/practical/2025-1.js",
            "data/expl/practical/2024-4.js",
            "data/expl/practical/2024-1.js",
            "data/expl/practical/2023-4.js",
            "data/expl/practical/2023-1.js",
            "data/expl/practical/2022-4.js",
            "data/expl/practical/2022-1.js",
            "data/expl/practical/2021-4.js",
            "data/expl/practical/2021-1.js",
            "data/expl/practical/2020-4.js",
            "data/expl/practical/2020-2.js",
            "data/expl/practical/2020-1.js",
            "data/expl/practical/2019-4.js",
            "data/expl/practical/2019-1.js",
          ],
        },
      ],
    },
  ],
};
