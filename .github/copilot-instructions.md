# Repository Engineering Instructions

## Purpose And Scope

Optimize for correct, maintainable work with the smallest coherent change. Intelligence means making better decisions from evidence, not producing more text, files, abstractions or agents. These rules apply to every development assistant; specialist files add domain procedures and must not silently weaken them.

## Rules

- Write agent-authored content in English unless the user requests another language.
- Use RTK as the default terminal entry point for supported commands. Verify the installed wrapper/help first; do not bypass RTK just because a command is unfamiliar. Use raw commands only for documented exceptions.
- Read the relevant Activity/specification and current implementation before acting. Do not reimplement a checked-off feature because its details appear here.
- Change status only with current repository evidence. Historical checkmarks are not proof that the current checkout still passes.
- Keep tasks atomic and this file concise. Put design details, contracts, test evidence, and caveats in the relevant Activity or code docs; link to them instead of duplicating them.
- Follow **Plan → Execute → Verify**. Report exact checks, failures, blockers, and unverified assumptions. Do not claim production readiness from fixture tests.
- Do not start provider-dependent or infrastructure-heavy work until the source, access rights, cost, deployment needs, and a concrete user requirement are confirmed.
- Never turn illustrative plans into requirements by default. No task authorizes trades, deployment, or consequential financial actions.

## 2. Evidence-First Operating Contract

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

## 3. Inspect Before Designing

Use the narrowest useful inspection first:

1. Read the target implementation and its direct callers.
2. Search for the contract, type, route, tool, event or test that governs it.
3. Inspect package scripts/configuration before choosing validation commands.
4. Trace ownership and trust boundaries for user-controlled data.
5. Check existing tests and fixtures before creating new ones.
6. Only then design the change.

Separate development personas from runtime agent registration. Verify versions, provider coverage, schedules, persistence, feature flags and actual callable signatures.

If a requested capability is not implemented, say so and design against the real boundary. Do not create a prompt that pretends an unavailable tool exists.

## 4. Minimal Complete Change

1. Establish objective, acceptance criteria and non-goals.
2. Identify the smallest complete vertical slice.
3. Modify existing cohesive modules first.
4. Add a file only for a real responsibility, boundary or test convention.
5. Validate the slice before expanding scope.
6. Review the diff for regressions, duplication and documentation drift.
7. Report actual checks and unresolved limitations.

Do not bundle unrelated refactors, dependency upgrades, formatting sweeps or speculative features. Do not create stubs, fake adapters, TODO-only classes or unused abstractions as if implemented.

## 5. Capability And Tool Discipline

A tool name in prose does not prove that the tool exists. Before delegation or implementation:

- verify the relevant file/export/schema;
- verify the enabled tool/delegation capability;
- verify required arguments and output shape;
- identify whether execution is deterministic, model-driven, external-provider or fallback;
- define a bounded call/retry/loop budget.

Never ask an LLM to perform deterministic arithmetic that the repository already implements locally. Never let a model decide authorization, ownership, consent, trade execution or security policy.

## 6. Failure Is Data

Distinguish at least:

`invalid_input`, `unauthorized`, `forbidden`, `not_found`, `unsupported`, `missing_data`, `provider_failure`, `rate_limited`, `timeout`, `cancelled`, `conflict`, `model_failure`, `unresolved`.

Do not convert failure, missing data or partial coverage into zero, empty success, fabricated confidence or a recommendation.

Preserve provenance: source/provider, retrieval time, relevant date/period, units, currency, adjustment/vintage, warnings and coverage where available.

Bound inputs, payloads, retries, concurrency, provider calls and loops. Durable workflows require explicit idempotency/replay semantics. Cancellation must not schedule additional work.

## 7. Agent Collaboration Protocol

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

## 8. Specialist Decision Protocol

Every specialist should follow:

**Observe → Model → Challenge → Change → Verify → Report**

- **Observe:** inspect implementation and contracts.
- **Model:** state the current behavior and relevant invariants.
- **Challenge:** look for edge cases, stale assumptions, adversarial inputs and simpler alternatives.
- **Change:** make the smallest coherent modification.
- **Verify:** run focused checks and inspect the diff.
- **Report:** state evidence, results and remaining uncertainty.

When two interpretations are plausible, prefer the one supported by code/tests; otherwise ask for clarification or preserve the ambiguity explicitly.

## 9. Security And Trust Gates

Security triage applies to every change. Specialist review is mandatory for auth, authorization/ownership, secrets, external input/output, dependencies, tool permissions, file access, webhooks or credible unresolved security findings.

Validate policy outside the model. Prompt instructions are not authorization. Tool descriptions are not access control. Provider URLs and credentials must remain on the intended trust boundary.

Never expose secrets in code, logs, errors, prompts, fixtures or screenshots. Never perform destructive operations, production changes, deployments, merges, financial transactions or paid external calls without explicit authorization and an appropriate repository mechanism.

## 10. Deterministic / Quantitative Rules

Numerical kernels must be model-free and reproducible. Validate inputs, units, dates, alignment, missing values, feasibility and numerical stability. Preserve warnings instead of silently repairing ambiguous data.

Use analytical references, invariants and justified tolerances. Synthetic fixtures validate software behavior, not market truth, model calibration or financial performance.

## 11. Documentation Hygiene

Search for the authoritative section before writing. Update it in place. One topic has one authoritative owner.

Permanent documentation describes maintained behavior, contracts, configuration, examples and limitations. Mark proposals as proposals. Do not create completion reports, duplicate indexes or per-feature guides by default.

Code snippets and commands must be checked against the actual repository. Do not mark a capability available because a prompt or roadmap mentions it.

## 12. Repository Context Architecture And Agent Harness

When the repository defines an agent workflow, follow its existing filesystem-based context architecture instead of inventing a parallel orchestration system. Use the following five-layer model where the project adopts ICM or an equivalent staged workflow:

- **Layer 0 — Global identity:** the repository's authoritative agent instructions, such as `AGENTS.md`, `CLAUDE.md`, or Copilot instructions. Establish workspace identity, global constraints, and resource locations.
- **Layer 1 — Workspace routing:** the root workflow or routing contract that selects the appropriate task/stage. If no router exists and the task is substantial enough to benefit from one, propose or create one only within the requested scope.
- **Layer 2 — Stage contract:** a stage-specific `CONTEXT.md` that defines explicit inputs, procedure, output paths, validation criteria, and transition conditions.
- **Layer 3 — Stable references:** authoritative conventions and architecture constraints, such as `.agents/_config/`, `shared/`, or `references/`. Treat these as persistent rules, not per-run output.
- **Layer 4 — Working artifacts:** task-specific outputs, drafts, reports, generated specifications, and other artifacts that change during execution. Keep them separate from stable reference rules.

### Context Routing And Stage Contracts

- Read the global instructions and the narrowest relevant routing contract first. Do not indiscriminately load every agent, skill, reference, or historical artifact.
- If a task is assigned to a specific stage, read that stage's `CONTEXT.md` and its declared inputs. Do not execute unrelated stages or silently skip required predecessors.
- A stage contract must state its **Inputs**, **Process**, **Outputs**, and **Validation / Exit Criteria**. Add a review gate when the next transition is risky, irreversible, materially changes architecture, or requires owner approval.
- Write artifacts to the stage's declared output location. A downstream stage may consume upstream artifacts only after checking their existence, completeness, provenance, and validation status.
- Keep stable policy in Layer 3 and run-specific artifacts in Layer 4. Do not promote temporary notes or one-off workarounds into permanent rules without evidence and review.
- If the repository has no staged workflow, do not force this architecture onto a small task. Apply the same principles proportionately and avoid creating folders or process files without a concrete need.

### Architecture Specification And Repository Topology

- For material project-level generation or architectural changes, inspect the actual repository tree and define the intended topology before creating files.
- The architecture specification should describe the relevant directory tree, logical modules, file responsibilities, important exports/classes/functions, interfaces, and dependency direction. Exclude irrelevant generated files and bulky vendor directories.
- Treat the architecture tree as a contract for generated or reorganized code. Compare the resulting file tree against the approved specification and explain intentional deviations.
- Validate imports, callers, interfaces, and dependency direction against the real codebase. Do not invent example modules, mixed-language layouts, or interfaces that are unsupported by the project.
- Prefer an architecture tree or SSAT-like representation when it improves traceability for a substantial generation task; do not create a redundant architecture document for a localized fix.

### Task Tracking, State, And Memory

- Use or update the repository's existing `TODO.md` or task tracker for substantial multi-stage work when it is part of the project's workflow. Do not create a new tracker for every small change.
- A useful agent task tracker records the objective, acceptance criteria, current status, ordered tasks, dependencies, validation results, blockers, and review gates. Mark a task complete only after its acceptance criteria have been verified.
- Explicitly distinguish state destinations:
  - **Conversation:** temporary clarification and transient discussion.
  - **Disk / working artifacts:** durable task outputs, implementation, test evidence, and decisions needed by later stages.
  - **Stable configuration:** reviewed rules or reusable discoveries that should govern future sessions.
- Never treat conversation-only reasoning as durable project state. Persist only useful, reviewable information; do not store secrets, speculative conclusions, or duplicate documentation.
- When runtime feedback invalidates an assumption, update the relevant task state or artifact, then re-verify affected downstream work instead of continuing with stale context.

### Plan → Execute → Verify

For substantial tasks, use a bounded Plan → Execute → Verify loop:

1. **Plan:** establish objective, scope, acceptance criteria, dependencies, risks, and the smallest complete implementation slice.
2. **Execute:** make the scoped change and save durable artifacts in their authoritative locations.
3. **Verify:** run relevant deterministic checks, inspect failures, review the actual diff, and confirm acceptance criteria before declaring completion.

- Use deterministic tools—tests, type checkers, linters, parsers, schema validation, and repository checks—as verification sensors where available.
- On failure, preserve the real error and relevant source locations, correct the cause, and rerun the narrowest meaningful check. Bound retries; do not loop indefinitely.
- Do not claim that a harness enforces a boundary unless executable code or platform policy actually enforces it. Markdown instructions are guidance, not runtime authorization or CI enforcement.
- Use human approval gates for destructive operations, production changes, deployments, publishing, credential access, Git history mutation, or other high-impact actions when not already explicitly authorized by an appropriate mechanism.

## 13. Review Gates

Use:
- **Security gate** for trust-boundary and exposure changes.
- **Architecture gate** for contracts, boundaries, lifecycle, schema or capability changes.
- **Business gate** for new product scope, provider cost or user-facing strategic changes.
- **Test gate** for behavioral or numerical changes.
- **Documentation gate** for changed interfaces, configuration or maintained behavior.

A Markdown checklist is guidance, not CI enforcement. A model score cannot waive a failing required check or validated blocker.

Report checks as `passed`, `failed`, `not_run` or `unknown`. Never fabricate execution, citations, probabilities, provider access, cost or production readiness.

## 14. RTK — Mandatory Terminal Routing

**RTK is the default and required entry point for shell/terminal commands.** Do not casually fall back to direct shell execution. The agent must actively route suitable terminal work through RTK; remembering that RTK exists is not enough.

This policy applies to shell/CLI execution, including repository inspection, Git operations, tests, type checks, linting, builds, package scripts, and other development commands. It does not apply to native file/search tools, MCP calls, API requests, or numerical runtime functions.

### Required Decision Procedure

1. **Before the first terminal command in a session**, run `rtk --version`. Inspect `rtk --help` or targeted help only as needed to establish the installed version and supported command mappings.
2. Determine whether a verified RTK hook already rewrites commands in this execution environment. If so, rely on that hook and do not double-wrap commands. Never assume a hook applies to every IDE, remote shell, terminal, or delegated agent.
3. **For every subsequent suitable terminal operation, choose a verified RTK wrapper first.** Use the wrapper explicitly unless a verified hook handles that exact execution path.
4. If the correct wrapper is not known, inspect targeted RTK help and then use the supported mapping. Do not silently skip RTK merely because the command is unfamiliar.
5. For compound commands, pipes, redirections, shell built-ins, scripts, or commands whose semantics might change, verify the supported invocation first. Do not blindly prepend `rtk` to an arbitrary command or expression.
6. Keep the RTK availability/mapping decision in session context. Do not repeat the version/help discovery before every command.
7. At completion, review whether suitable shell commands were routed through RTK. Any direct-execution exception must be justified by the rules below, not convenience or habit.

### Default Routing Examples

Use these forms when the installed RTK version confirms support:

- Git inspection: `rtk git status`, `rtk git diff`, `rtk git log -n 5`
- Tests: `rtk test <verified-test-command>`
- Error-focused checks: `rtk err <verified-command>`
- Raw passthrough: `rtk proxy <command>` when supported and appropriate

These are examples, not a guarantee that every installation supports every subcommand. Inspect repository scripts and configuration before choosing a test/build command. Never invent an RTK subcommand.

### Narrow Exceptions — Direct Execution Is Allowed Only When

- RTK is not installed, unavailable in the current environment, or does not support the required operation.
- The wrapper changes execution semantics, argument boundaries, environment, working directory, exit status, signal handling, or other behavior needed for correctness.
- Exact bytes or unfiltered output are required, including machine-readable JSON consumed by another program, source content, patches, snapshots, binary output, or another program's stdin.
- RTK's filtered output cannot provide evidence required to establish correctness, and supported raw passthrough/recovery cannot retrieve that evidence.
- The command is not actually a shell/CLI operation (for example, a native file/search tool or MCP call).

**An unfamiliar command is not by itself an exception.** First inspect RTK's supported routing or use `rtk proxy` if available. Do not use direct execution merely because it is shorter or more familiar.

When an exception is necessary:
- Prefer `rtk proxy <command>` for raw passthrough if supported and semantically safe.
- Otherwise run the command directly and briefly record the concrete reason in the task notes or final report when material.
- Do not repeat the same exception explanation before every command.
- Do not install RTK, edit hooks, run `rtk init`, or change telemetry automatically; propose setup separately and preserve existing configuration.

### Evidence And Safety Requirements

- RTK output compression is lossy. Preserve exit codes, failed checks, warnings, error messages and relevant source locations.
- A short summary is not proof that no errors occurred or that all tests passed.
- If details are omitted, use supported RTK recovery (such as `rtk recall`, if available) or inspect the relevant saved log before concluding. Prefer recovery over rerunning commands with side effects.
- Preserve quoting, argument boundaries, environment, working directory and shell semantics. Verify explicit-shell behavior when needed.
- Never filter stdout that is machine-readable or consumed as input by another process.
- RTK is an output-routing tool, not a sanitizer, security boundary, authorization mechanism, or permission to commit, push, deploy, migrate, or perform other restricted actions.
- Do not run `rtk gain` after every command. Use it only when requested or useful for a bounded evaluation; estimated output reduction is not actual provider-billed token or monetary savings.

## 15. Caveman — Concise Communication, Complete Engineering

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

## 16. Combined Efficiency And Skill Loading

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