---
phase: 01-dev-qrl-segment-core
fixed_at: 2026-05-09T22:21:58Z
review_path: .planning/phases/01-dev-qrl-segment-core/01-REVIEW.md
iteration: 1
findings_in_scope: 2
fixed: 2
skipped: 0
status: all_fixed
---

# Phase 01-dev-qrl-segment-core: Code Review Fix Report

**Fixed at:** 2026-05-09T22:21:58Z
**Source review:** .planning/phases/01-dev-qrl-segment-core/01-REVIEW.md
**Iteration:** 1

**Summary:**

- Findings in scope: 2
- Fixed: 2
- Skipped: 0

## Fixed Issues

### CR-01: BLOCKER - Self-accepted QRL updates do not notify Qwik HMR listeners

**Files modified:** `src/dev.ts`, `test/rolldown-runtime.test.ts`
**Commit:** 8ac238a
**Applied fix:** Generated dev QRL segment self-accept callbacks now dispatch the `qHmr` event with the parent file in `detail.files` and `document.__hmrT`; focused runtime coverage asserts the event payload.

### CR-02: BLOCKER - Dev transforms never use optimizer HMR mode

**Files modified:** `src/rolldown.ts`, `test/rolldown-runtime.test.ts`
**Commit:** 2897624
**Applied fix:** Dev transforms now select optimizer `hmr` mode when HMR is enabled and retain `dev` mode when `hmr: false`; focused runtime coverage asserts both paths.

---

_Fixed: 2026-05-09T22:21:58Z_
_Fixer: OpenCode (gsd-code-fixer)_
_Iteration: 1_
