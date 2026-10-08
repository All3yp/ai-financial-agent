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

## 12. RTK — Terminal Output Discipline

Use RTK for terminal commands when the installed version provides a suitable wrapper with equivalent execution semantics. This rule applies to shell/CLI execution, not native file/search tools, MCP calls, API requests or numerical runtime functions.

### Availability And Routing

- At the first relevant terminal operation, verify `rtk --version` and inspect only the help needed for the intended wrapper. Cache the result for the session; do not repeat setup checks for every command.
- If a verified hook already rewrites commands, use that integration and avoid double wrapping. Never assume global configuration covers every editor, remote environment or subagent.
- Otherwise invoke the verified RTK equivalent explicitly. Never blindly prepend `rtk` to arbitrary scripts or compound shell expressions.
- Typical supported forms include `rtk git status`, `rtk git diff`, `rtk git log -n 5`, `rtk test pnpm test`, and `rtk err pnpm typecheck`. Verify local support and inspect package scripts before running tests/builds.
- Use native scoped file/search tools when they provide the exact evidence needed. Do not force an extra terminal call solely to increase RTK usage.

### Evidence Recovery And Exceptions

Compact output is an inspection aid, not a substitute for complete evidence. Preserve exit status, failed checks, relevant warnings and source locations. If output is filtered, do not infer absence of errors or complete test coverage from a short summary.

When omitted detail affects correctness, inspect RTK's recovery output if available (`rtk recall` in supported versions) or read the relevant saved log. Prefer recovering existing output over rerunning commands, especially commands with side effects.

Use `rtk proxy <command>` for raw passthrough when supported and necessary. Use direct execution if RTK is unavailable, unsupported, changes required semantics or cannot expose needed evidence. State a brief meaningful exception once; do not add boilerplate before every command.

Do not filter stdout that is being consumed as machine-readable JSON, source content, patches, exact snapshots or another program's input. Use raw execution for byte-sensitive operations. RTK compression is lossy and is not a sanitizer or authorization layer.

Preserve argument boundaries, quoting, environment, working directory and shell semantics. Do not assume filtered wrappers expand glob patterns, pipes or shell operators. Inspect supported explicit-shell behavior only when required.

### Setup, Metrics And Privacy

Do not install RTK, edit hooks, run init or change telemetry automatically. Propose setup separately and preserve existing configuration; verify flags against installed help.
Use `rtk gain` only when requested or useful to a bounded evaluation, not after every command. Its estimated output reduction is not actual provider-billed token or monetary savings.
No RTK wrapper grants permission for commits, pushes, migrations or other restricted operations.

## 13. Caveman — Concise Communication, Complete Engineering

Apply Caveman-style low-noise communication to chat progress, handoffs and final reports. Preserve analytical rigor and technical detail where needed. Compress narration, not implementation, acceptance criteria, evidence or maintained documentation.

### Skill Discovery And Activation

- If an approved Caveman skill is installed and discoverable, use its actual metadata/name and supported activation mechanism. Do not assume a slash command, plugin or skill exists just because it is mentioned here.
- Reuse one installed skill; do not copy its entire body into these instructions or into every agent.
- Load only the relevant skill and workflow instructions. Do not open all skills, examples, resource files or upstream documentation on every task.
- Skill bodies enter context when activated; activation has overhead and is not automatically a net token saving. Do not reread or reinvoke a communication skill at every step.
- If unavailable, follow the concise rules below without claiming the skill was loaded. Continue work; do not install packages, create skill folders or configure a proxy without approval.
- A skill for response style should apply inline. Do not spawn a subagent merely to rewrite a message tersely. Do not assume parent activation propagates to every subagent; provide the same concise-output requirement in the handoff when needed.

### Communication Rules

Answer or report the outcome first. Prefer short active sentences and compact bullets. Remove greetings, filler, repeated plans, narration of routine tool calls, duplicated recaps and generic offers to continue.

For multi-step work, provide a short meaningful phase update only when needed. Report blockers immediately. In a final response, use only applicable fields: outcome; changed files; checks/results; blockers/limitations; next required action. Omit empty sections.

Preserve negation, uncertainty, conditions, severity, dates, numbers, units, identifiers, paths, commands, error text and evidence references. Never drop `not`, `never`, `only` or an important qualifier to shorten a sentence. Do not use broken grammar or change the requested language.

Do not impose a fixed word budget that hides complexity. Expand for explanations explicitly requested, financial/numerical assumptions, safety warnings, consent, irreversible actions or ambiguity. Accuracy and user intent override terseness.

Code remains clean, complete and conventionally formatted. Do not minify code, shorten meaningful names, delete necessary comments, compress schemas or weaken tests. Technical specifications and maintained documentation remain readable and sufficiently detailed; they are not written in caveman fragments.

### Optional Caveman Workflow Skills

When installed and relevant, inspect the actual skill descriptions before choosing an investigate-first, lean-build, surgical-patch, safe-refactor, migration or verify-and-stop workflow. These are optional upstream workflows, not required tools or permission to broaden scope. Load the smallest relevant set; existing repository policy and owner authorization take precedence.

Do not run memory-file compression, skill conversion, proxy setup or optimization commands merely to save tokens. They change artifacts or configuration and require review/authorization. No skill may silently rewrite repository instructions or user prompts.

## 14. Combined Efficiency And Skill Loading

RTK reduces terminal-output noise; Caveman communication reduces unnecessary prose. Use one appropriate compressor per surface. Do not pipe RTK output through Caveman shrink by default or add redundant summarization/delegation passes.

Caveman's optional proxy/middleware is a separate integration, not activated by a skill or by this file. Do not assume it supports the current Copilot environment. If proposed, review compatibility, evidence recovery, telemetry, configuration changes and overlap with RTK before adoption.

Skill discovery provides metadata; full instructions/resources should load only when relevant. Avoid duplicate skill names/locations and copying full skill instructions into permanently loaded policies. A long inventory also has overhead; install only useful approved capabilities.

Evaluate efficiency by successful task completion, input/output usage where measured, tool calls, retries and rework. Do not infer request-billed savings from shorter answers. Never claim a percentage saving without a measured baseline and clear accounting.

Protect clean code, complete documentation and verified evidence first. If compression causes ambiguity or repeated retrieval, prefer clearer/full relevant context.

## Final Diff Checklist

Apply the core checks to every change. Apply conditional checks only when
the affected surface is relevant.

Record material blockers and verification gaps. Do not produce a verbose
checklist report for every small task. Use `not_applicable` when appropriate;
do not invent evidence to complete a checkbox.

### Scope And Maintainability

- Does every changed file directly serve the requested outcome and acceptance criteria?
- Is this the smallest complete change, without unrelated refactors, upgrades or formatting churn?
- Were existing implementations inspected before adding another solution?
- Does each new file, dependency, abstraction or agent have a concrete current responsibility?
- Are functions, components and modules cohesive rather than oversized or fragmented into trivial wrappers?
- Are names, types and control flow understandable without unnecessary explanation?
- Were dead code, debug output, commented-out code, unused exports and obsolete comments removed from the changed areas?
- Does the diff avoid speculative features, generic frameworks and duplicated business rules?

### Correctness And Contracts

- Is the behavior based on verified repository contracts and actual callers?
- Are invalid, missing, partial and unsupported states explicit?
- Are defaults intentional, rather than silently hiding missing data or failed operations?
- Are errors preserved and handled at the appropriate boundary?
- Are existing callers and supported behavior preserved, or are intentional breaking changes identified?
- Does disabled or unavailable optional functionality preserve the expected baseline behavior?

### Security And Data Integrity

- Are trust boundaries, server-side authorization and owner isolation enforced?
- Are secrets and sensitive data excluded from code, logs, errors, fixtures and external requests?
- Are user-controlled inputs bounded and validated before reaching files, databases, tools or providers?
- Are deterministic calculations outside model judgment?
- Are provenance, dates, units, currency, alignment and numerical assumptions preserved where relevant?

### Tests And Verification

- Do tests cover the changed behavior and important failure modes?
- Would the relevant tests fail if the implementation were broken?
- Are assertions meaningful, with justified numerical tolerances where needed?
- Were unrelated tests, assertions or safeguards left intact rather than weakened to obtain a pass?
- Are offline tests independent of paid calls, production credentials and uncontrolled network access?
- Were the actual diff and applicable validation results inspected after the final edits?
- Are failed, skipped and unverified checks reported accurately?

### Documentation And Repository Hygiene

- Did documentation change only in authoritative locations?
- Are examples, commands, paths and configuration consistent with the actual implementation?
- Were obsolete claims corrected instead of contradicted by appended text?
- Are links updated after file moves or removals?
- Does the diff avoid duplicate guides, completion reports, task indexes and unnecessary permanent documents?
- Are temporary files, local logs, credentials and unrelated generated artifacts excluded?
- Are task statuses supported by verified acceptance criteria?

### Conditional: Dependencies And Integration

- Is each new or changed dependency necessary, compatible and the intended package?
- Are dependency manifests and lockfiles consistent, without unrelated churn?
- Are optional workflows and integrations justified by a current requirement?
- Are configuration, credentials, data rights and operational prerequisites explicit?
- Are unavailable integrations clearly distinguished from functioning implementations?

### Conditional: Async Work And External Calls

- Are retries, loops, concurrency and external calls bounded?
- Are timeout, cancellation, rate limits and partial failure handled explicitly?
- Are idempotency and replay behavior verified for side-effecting or durable work?
- Can retries or concurrent execution duplicate actions, overwrite newer state or cross owner boundaries?
- Does cancellation prevent additional work from being scheduled?

### Conditional: Operational And Schema Changes

- Are migrations, deployment steps and configuration changes necessary and authorized?
- Is compatibility with existing data and running application versions understood?
- Is an appropriate rollback, disablement, forward-fix or recovery path identified?
- Are irreversible actions and rollback limitations explicit?
- Were operational checks separated from ordinary local validation?

### Conditional: UI Changes

- Are loading, empty, error, partial and disabled states understandable?
- Are keyboard interaction, focus, labels and relevant accessibility behavior checked?
- Does the change avoid unnecessary client-side work or exposing server-only information?
- Is the existing UI pattern reused without a broad unrelated redesign?

### Tool And Token Efficiency

- Was RTK used for suitable terminal operations, without double wrapping or lost evidence?
- Were exact or machine-readable outputs kept unfiltered when required?
- Were Caveman and other skills loaded only when relevant, without duplicating their instructions?
- Did concise communication preserve complete code, documentation, qualifiers and validation evidence?
- Did optimization avoid extra calls, repeated inspections or rework that negate its benefit?

### Completion Decision

- Are all applicable acceptance criteria satisfied?
- Are validated blockers resolved or explicitly left open?
- Are remaining unknowns, limitations and required owner decisions clear?
- Is the final status accurate: complete, partially complete or blocked?
- Are optional polish suggestions distinguished from correctness or security blockers?