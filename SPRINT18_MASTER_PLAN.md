# SPRINT 18 MASTER PLAN — PSH Platform Production Architecture

**Status:** Planning complete. Analysis only — no code, no deploy, no commit. Awaiting Founder Approval before any implementation.

---

## Mission

Prepare PSH Platform for long-term production operation and future multi-business expansion, while preserving all existing functionality. Current production business: Pshop Music (`pshopmusic.com`). Future business (deferred, not implemented this sprint): A Tiểu.

## One correction to the Sprint 18 brief, made up front

OpenClaw was described as "already installed and operational." Repository evidence (every `OPENCLAW_*.md` document, explicitly) says otherwise: planning/documentation only, no live connection ever established. This plan proceeds on the verified state, per the sprint's own rule that repository evidence is the only source of truth. Full verification: `OPENCLAW_INTEGRATION_REPORT.md`.

## Document Map

| Document | Purpose |
|---|---|
| `SYSTEM_DISCOVERY_REPORT.md` | What exists today, module by module — the raw audit |
| `PSH_PRODUCTION_ARCHITECTURE.md` | Current architecture + target Business Operating Platform design (not implemented) |
| `OPENCLAW_INTEGRATION_REPORT.md` | Capability-by-capability verification of OpenClaw readiness |
| `PSH_PRODUCTION_GAP_ANALYSIS.md` | Status of every module vs. a complete platform, plus a shared-services reusability lens (Sprint 18 addendum) |
| `PSH_PRODUCTION_ROADMAP.md` | Prioritized tiers of work, plus Production Validation tier (Sprint 18 addendum) |
| `PSH_IMPLEMENTATION_PHASES.md` | Objectives/Tasks/Risks/Dependencies/Acceptance Criteria per phase, plus complexity + order mapping to Sprint 18's 7 named phases (addendum) |
| `PSH_FOUNDER_RECOMMENDATIONS.md` | 11 ranked recommendations + Founder Review completion summary (addendum) |

(Per Founder's explicit instruction this round: the 4 documents already written for the Pshop-Music-only pass were extended in place rather than duplicated under new Sprint 18 filenames, to avoid redundant/conflicting copies.)

## Phase Overview (detail in `PSH_IMPLEMENTATION_PHASES.md`)

1. **Architecture Validation** — reconcile doc/code inconsistencies found in this audit. No new features.
2. **Production Platform Foundation** — deploy already-built async worker, activate `agent` role end-to-end, small automation wins.
3. **Pshop Music Production Integration** — same foundation work, applied against real Pshop Music data (per-product SEO/pages).
4. **Operational Automation** — Telegram notifications, validation checkpoints.
5. **OpenClaw Operations** — connect a real OpenClaw session per its own existing Stage A→C plan (`OPENCLAW_WORKFLOW.md`), stopping at Marketing Agent usage.
6. **Future Multi-Business Preparation** — design discipline only; zero multi-tenant code. `docs/DECISION_RECORD_BUSINESS_MANAGER.md` stays unimplemented.
7. **Production Validation** — reconciliation, RBAC completeness, deployment-pipeline, and security re-audit checkpoints, run at the end of each phase they validate.

## Founder Review Summary

See `PSH_FOUNDER_RECOMMENDATIONS.md`'s closing section for the full Founder Review (maturity, architecture quality, production readiness, technical debt, priorities, Sprint 19 suggestion). Headline: this is a mature, well-disciplined single-tenant platform with two real, cheap-to-close gaps (RBAC enforcement inconsistency, undeployed async worker) standing between it and OpenClaw actually being usable — everything else identified is genuinely new scope that needs a Founder decision, not an assumption, before it's sized.

## Rules honored in producing this plan

Repository evidence used as the only source of truth throughout (see correction above). No completed sprint revisited or redesigned. No production, deploy, database, or commit action taken — read and write-to-new/existing-doc operations only. No multi-business code written. No business logic duplicated — every recommendation above explicitly reuses existing architecture where one exists.

**Stopping here. Waiting for Founder Approval before any implementation work begins.**
