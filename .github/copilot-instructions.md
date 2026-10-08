# Repository Engineering Instructions

## Purpose And Scope

Optimize for correct, maintainable work with the smallest coherent change. Intelligence means making better decisions from evidence, not producing more text, files, abstractions or agents. These rules apply to every development assistant; specialist files add domain procedures and must not silently weaken them.

## 1. Evidence-First Operating Contract

Before acting, establish:

- **Objective** — what outcome the user actually wants.
- **Scope** — files/surfaces that may change and explicit non-goals.
- **Acceptance criteria** — observable conditions that make the task complete.
- **Risk** — security, data integrity, financial correctness, compatibility, cost and operational impact.
- **Unknowns** — facts that must be verified before implementation.

Treat repository code, tests, schemas, package scripts and actual runtime behavior as the primary source of truth. Agent inventories, README claims, examples, comments and proposed schemas are navigation hints until verified.

For every material decision, distinguish:
`verified_fact` → `inference` → `proposal` → `unknown`.

Never turn an unknown into a plausible default merely to keep moving.

## 2. Inspect Before Designing

Use the narrowest useful inspection first:

1. Read the target implementation and its direct callers.
2. Search for the contract, type, route, tool, event or test that governs it.
3. Inspect package scripts/configuration before choosing validation commands.
4. Trace ownership and trust boundaries for user-controlled data.
5. Check existing tests and fixtures before creating new ones.
6. Only then design the change.

Separate development personas from runtime agent registration. Verify versions, provider coverage, schedules, persistence, feature flags and actual callable signatures.

If a requested capability is not implemented, say so and design against the real boundary. Do not create a prompt that pretends an unavailable tool exists.

## 3. Minimal Complete Change

1. Establish objective, acceptance criteria and non-goals.
2. Identify the smallest complete vertical slice.
3. Modify existing cohesive modules first.
4. Add a file only for a real responsibility, boundary or test convention.
5. Validate the slice before expanding scope.
6. Review the diff for regressions, duplication and documentation drift.
7. Report actual checks and unresolved limitations.

Do not bundle unrelated refactors, dependency upgrades, formatting sweeps or speculative features. Do not create stubs, fake adapters, TODO-only classes or unused abstractions as if implemented.

## 4. Capability And Tool Discipline

A tool name in prose does not prove that the tool exists. Before delegation or implementation:

- verify the relevant file/export/schema;
- verify the enabled tool/delegation capability;
- verify required arguments and output shape;
- identify whether execution is deterministic, model-driven, external-provider or fallback;
- define a bounded call/retry/loop budget.

Never ask an LLM to perform deterministic arithmetic that the repository already implements locally. Never let a model decide authorization, ownership, consent, trade execution or security policy.

## 5. Failure Is Data

Distinguish at least:

`invalid_input`, `unauthorized`, `forbidden`, `not_found`, `unsupported`, `missing_data`, `provider_failure`, `rate_limited`, `timeout`, `cancelled`, `conflict`, `model_failure`, `unresolved`.

Do not convert failure, missing data or partial coverage into zero, empty success, fabricated confidence or a recommendation.

Preserve provenance: source/provider, retrieval time, relevant date/period, units, currency, adjustment/vintage, warnings and coverage where available.

Bound inputs, payloads, retries, concurrency, provider calls and loops. Durable workflows require explicit idempotency/replay semantics. Cancellation must not schedule additional work.

## 6. Agent Collaboration Protocol

The orchestrator owns scope, delegation, integration and final gate consolidation. Specialists own bounded investigation or implementation.

Do not summon the whole roster for a narrow task. Parallelize only genuinely independent work with non-overlapping ownership.

Every handoff must contain:

- **Objective**
- **Context / verified facts**
- **In scope / out of scope**
- **Relevant files or contracts**
- **Expected artifact**
- **Validation required**
- **Known risks / unknowns**

A specialist must return compact findings: changed files, evidence, decisions, tests, blockers and follow-ups. Do not return a second full specification.

When delegation is unavailable, perform the specialist reasoning sequentially rather than inventing tool support.

## 7. Specialist Decision Protocol

Every specialist should follow:

**Observe → Model → Challenge → Change → Verify → Report**

- **Observe:** inspect implementation and contracts.
- **Model:** state the current behavior and relevant invariants.
- **Challenge:** look for edge cases, stale assumptions, adversarial inputs and simpler alternatives.
- **Change:** make the smallest coherent modification.
- **Verify:** run focused checks and inspect the diff.
- **Report:** state evidence, results and remaining uncertainty.

When two interpretations are plausible, prefer the one supported by code/tests; otherwise ask for clarification or preserve the ambiguity explicitly.

## 8. Security And Trust Gates

Security triage applies to every change. Specialist review is mandatory for auth, authorization/ownership, secrets, external input/output, dependencies, tool permissions, file access, webhooks or credible unresolved security findings.

Validate policy outside the model. Prompt instructions are not authorization. Tool descriptions are not access control. Provider URLs and credentials must remain on the intended trust boundary.

Never expose secrets in code, logs, errors, prompts, fixtures or screenshots. Never perform destructive operations, production changes, deployments, merges, financial transactions or paid external calls without explicit authorization and an appropriate repository mechanism.

## 9. Deterministic / Quantitative Rules

Numerical kernels must be model-free and reproducible. Validate inputs, units, dates, alignment, missing values, feasibility and numerical stability. Preserve warnings instead of silently repairing ambiguous data.

Use analytical references, invariants and justified tolerances. Synthetic fixtures validate software behavior, not market truth, model calibration or financial performance.

## 10. Documentation Hygiene

Search for the authoritative section before writing. Update it in place. One topic has one authoritative owner.

Permanent documentation describes maintained behavior, contracts, configuration, examples and limitations. Mark proposals as proposals. Do not create completion reports, duplicate indexes or per-feature guides by default.

Code snippets and commands must be checked against the actual repository. Do not mark a capability available because a prompt or roadmap mentions it.

## 11. Review Gates

Use:
- **Security gate** for trust-boundary and exposure changes.
- **Architecture gate** for contracts, boundaries, lifecycle, schema or capability changes.
- **Business gate** for new product scope, provider cost or user-facing strategic changes.
- **Test gate** for behavioral or numerical changes.
- **Documentation gate** for changed interfaces, configuration or maintained behavior.

A Markdown checklist is guidance, not CI enforcement. A model score cannot waive a failing required check or validated blocker.

Report checks as `passed`, `failed`, `not_run` or `unknown`. Never fabricate execution, citations, probabilities, provider access, cost or production readiness.

## Final Diff Checklist

- Does every changed file serve the requested outcome?
- Is the behavior based on verified repository contracts?
- Are invalid/missing states explicit?
- Are trust boundaries and ownership enforced?
- Are deterministic calculations outside model judgment?
- Are retries, loops and external calls bounded?
- Did tests cover the changed behavior and important failure modes?
- Did documentation change only in authoritative locations?
- Are skipped checks and remaining unknowns explicit?
