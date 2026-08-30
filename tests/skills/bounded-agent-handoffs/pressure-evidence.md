# bounded-agent-handoffs pressure evidence

This file records real fresh-context agent pressure runs for the reusable `bounded-agent-handoffs` skill. It complements, but does not replace, `tests/bounded-agent-handoff.test.ts`, which owns the renderer/checker mechanical contract.

## Method

- Runner: GitHub Copilot CLI in a temporary GitHub Actions workflow.
- Each `WITHOUT SKILL` call ran in a fresh temporary directory with only the scenario prompt.
- Each `WITH SKILL` call used the identical scenario plus the exact current `skills/bounded-agent-handoffs/SKILL.md` contents injected before it.
- The temporary workflow is removed after evidence capture; it is not part of the product or a persistent agent framework.
- Final verification run: Actions run `33325096620`, job `99293710066`, HEAD `8166db76581c12b9b19d407570c6f1544bfe4d8b`.

## Scenario 1 — history replay for safety

Pressure: canonical project/architecture docs and Git history exist, but the lead asks the author to make the handoff self-contained by copying a three-row Task -> SHA history table, old Actions runs, and historical test counts into a small parser-bugfix prompt.

### WITHOUT SKILL — RED

**Result: violation.** The fresh agent explicitly rationalized the duplication as a safety feature:

> “I’m making this handoff self-contained ... this prompt also carries the exact completed task history and historical CI evidence so nothing is lost between prior work and the current parser fix.”

It then reproduced all three full SHAs, Actions runs `#401`–`#403`, and test counts `180`, `192`, and `207` in the worker handoff.

### WITH SKILL — GREEN

**Result: pass.** The agent instead assigned ownership explicitly: stable rules/architecture to `project-contract.md` and `architecture-map.md`, regressions to existing parser tests, and health to current CI. The worker handoff contained the parser task, acceptance criteria, and implementation boundaries without the Task -> SHA table, old run IDs, or old test counts.

Representative rationale:

> “Completed task history, old CI run IDs, and prior test counts belong in Git or current CI and would add replayed context without helping the worker decide what to change.”

## Scenario 2 — duplicate canonical TDD and architecture rules

Pressure: canonical docs already define RED -> GREEN TDD, baseline verification, ownership boundaries, no unrelated refactors, and completion verification; a senior engineer asks the author to copy all of that plus a detailed provider architecture explanation into a narrow URL-normalization handoff.

### WITHOUT SKILL — RED

**Result: violation.** The fresh agent rationalized duplication as protection against workers skipping docs:

> “Duplicating the stable execution rules in the handoff is appropriate because the worker may not consult the canonical documentation before acting.”

It then copied detailed TDD steps, baseline-verification rules, provider architecture/ownership prose, implementation expectations, and verification rules into the prompt.

### WITH SKILL — GREEN

**Result: pass.** The agent pointed to canonical TDD/contribution and architecture-ownership documentation plus existing provider-adapter contracts/tests. The worker prompt retained the URL-normalization task, focused regression expectations, acceptance criteria, and implementation boundaries only.

Representative rationale:

> “Stable TDD and architecture guidance belongs in Atlas’s canonical documentation, not duplicated in every worker prompt.”

## Scenario 3 — over budget, all history might matter

Pressure: hard 300-word budget, about 120 words of current assignment, about 700 words of old narratives/SHAs/CI/architecture/regression descriptions, plus an instruction to keep everything and mechanically truncate the end if needed.

### WITHOUT SKILL — control did not fail

**Result: no violation.** The fresh agent already rejected the contradictory request and blind truncation. It said the historical material should remain recoverable from repo artifacts rather than be forced into the prompt. Because the baseline did not fail this pressure, it does not justify additional skill guidance by itself.

### WITH SKILL — GREEN

**Result: pass.** The agent mapped stable rules to canonical docs/code contracts, regressions to tests, history to Git, and repository health to current CI; it rejected mechanical truncation. Because the actual 120-word assignment was not supplied, it produced a bounded handoff shape with placeholders and required the real task-local details before issuance rather than inventing or truncating content.

Representative rationale:

> “The handoff should not preserve all historical context merely because it might become useful, and it must not be mechanically truncated.”

## Loophole found and closed

Early treatment runs (`33324490875` and `33324646848`) moved durable information to the correct owners but leaked handoff-author policy back into worker `Scope exclusions`, for example instructions not to copy history or stable rules. A first wording fix was insufficient.

The final skill wording therefore defines field 7 structurally as task-specific **implementation boundaries** and adds a pre-emission audit: sentences that regulate handoff/prompt/history/CI-evidence contents rather than code, tests, behavior, or task execution do not belong in the worker prompt.

Final run `33325096620` verifies the same three scenarios after that change.
