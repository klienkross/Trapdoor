# Trapdoor MVP Manual Smoke Checklist

Task 16 is the final integration task. These checks are intended for a real Obsidian vault after installing the built plugin. Automated integration tests cover the same behavioral boundaries where practical.

> Manual execution status: **pending in this worker environment**. The GitHub worker can run CI but cannot launch an interactive Obsidian desktop session, so no item below is claimed as manually passed.

## 1. Tidy note challenges the current section

**Setup**
- Open a Markdown note with two headings.
- Put a compact declarative causal/definition/comparison statement under the first heading, for example `因为缓存命中率提高，所以请求延迟降低。`.
- Put the cursor inside that section.

**Action**
- Open the Trapdoor sidebar and click `推我下去`.

**Expected**
- Exactly one question appears.
- The source label says `当前小节` (and may include the heading).
- The question is derived from the current section rather than the unrelated second section.

## 2. No network before `继续拷打`

**Setup**
- Configure an OpenAI-compatible endpoint or observe requests with a local proxy/devtools.
- Open a note that produces a local challenge.

**Action**
- Click `推我下去`.
- Then try `换一个`, `什么破问题`, `有东西`, and `答不上来` in separate runs.

**Expected**
- No `/chat/completions` request occurs during first-question generation or any of those feedback actions.
- Network use begins only after entering `继续拷打` and submitting an answer.

## 3. Near-duplicate suppression after repeated `什么破问题`

**Setup**
- Use a note containing several challengeable structures or multiple templates for the same structure.

**Action**
- Generate a question.
- Press `什么破问题` several times as replacements appear.

**Expected**
- Each rejection immediately replaces the question locally.
- Recently rejected candidate/template/category combinations are penalized/suppressed according to the bounded note-local feedback window.
- A rejection does not permanently ban the category across future unrelated history.
- No LLM request occurs.

## 4. `换一个` does not increase bad count

**Setup**
- Enable debug inspection of `question-feedback.json` or note the current template/category counters.
- Generate a question.

**Action**
- Click `换一个`.

**Expected**
- A replacement question is selected through the normal local ranking path.
- Recent history contains a `replace` event.
- `bad` counters do not increase.
- No LLM request occurs.

## 5. `有东西` writes a nearby `认知坑`

**Setup**
- Put the cursor in a challengeable heading section and generate a section-scoped question.

**Action**
- Click `有东西`.

**Expected**
- The note gains a callout beginning `> [!question] 认知坑`.
- The exact displayed question is written into the callout.
- For section scope it is inserted near the candidate source/section according to PitRecorder semantics.
- The sidebar shows the `pit_saved` acknowledgement.

## 6. Pit insertion uses fresh note contents

**Setup**
- Generate a whole-note-scoped question.
- Before saving the pit, edit the note and append a new paragraph after the content that existed when the candidate was generated.

**Action**
- Click `有东西` (repeat separately with `答不上来`).

**Expected**
- The plugin re-reads the current editor contents at action time.
- A whole-note pit is appended after the newly added paragraph, not at the old cached note end.
- `答不上来` writes a pit but does not increment `bad`.

## 7. Speculative notes trigger `not_suitable`

**Setup**
- Open a question-heavy/draft note containing several uncertainty markers such as `TODO`, `可能`, `也许`, `不确定`, `待验证`, and multiple question marks.

**Action**
- Click `推我下去`.

**Expected**
- Trapdoor shows a `not_suitable` refusal copy.
- No challenge question is generated.
- No LLM request occurs.
- Re-rendering the same state does not rotate/consume another refusal copy.

## 8. One LLM follow-up per answer

**Setup**
- Configure a working OpenAI-compatible endpoint.
- Generate a local question and click `继续拷打`.

**Action**
- Observe that simply entering drill mode sends no request.
- Submit one answer.

**Expected**
- Exactly one provider request is sent for a normal answer operation.
- Exactly one follow-up question appears.
- The UI conversation order remains original challenge → user answer → one assistant follow-up.

## 9. Whole-note escalation is explicit and sticky

**Setup**
- Use a controllable/test-compatible provider that first returns exactly `[[NEED_WHOLE_NOTE]]`, then a normal question.
- Ensure the current section and the rest of the note contain visibly different marker text.

**Action**
- Enter drill and submit an answer.
- After the escalated follow-up appears, submit another answer.

**Expected**
- The first provider operation contains the current section but not whole-note context.
- The explicit escalation operation includes both the current section and whole note.
- Subsequent answer operations continue to include both contexts.
- Escalation happens at most once.
- `[[NEED_WHOLE_NOTE]]` is never rendered to the user.

## 10. Drill exhaustion

**Setup**
- Use a controllable/test-compatible provider that returns exactly `[[DRILL_EXHAUSTED]]`.

**Action**
- Submit a drill answer.

**Expected**
- The sentinel is not displayed.
- A `drill_exhausted` copy is shown.
- The answer textarea/submit control is no longer available.
- Further submit attempts do not call the provider.

## 11. Debug score visibility

**Setup**
- Set Trapdoor `debug` to `true` and generate a question.

**Action**
- Inspect the question card, then repeat after setting `debug` to `false`.

**Expected**
- With debug enabled, category/template and score breakdown are visible.
- With debug disabled, the score block is absent.
- The API key is never displayed or written to feedback JSON.

## 12. Command palette / hotkey uses the same path as the sidebar button

**Setup**
- Keep the Trapdoor sidebar closed.
- Assign any Obsidian hotkey to the `推我下去` command if desired.

**Action**
- Trigger the command from the command palette (and then from the assigned hotkey).

**Expected**
- The right sidebar is activated/revealed.
- The resulting behavior is identical to clicking the large sidebar button: same local selection, feedback store, render state, and zero-network first challenge path.

## 13. Feedback survives restart

**Setup**
- Generate and reject at least one question with `什么破问题`.
- Confirm `question-feedback.json` contains the bounded history/counters.

**Action**
- Reload Obsidian or disable/re-enable Trapdoor without deleting plugin state.
- Generate another relevant challenge.

**Expected**
- Prior shown/bad counters and recent history are loaded.
- Ranking/suppression reflects the persisted feedback.
- The plugin does not rewrite malformed feedback silently; persistence errors should surface as load failure rather than destructive reset.

## 14. Reinstall-like surviving feedback shows legacy copy once

**Setup**
- Preserve a meaningful `question-feedback.json`.
- Remove/reset normal plugin `data.json` metadata to simulate reinstall/plugin-state reset while leaving feedback intact.

**Action**
- Start Trapdoor once, observe the initial sidebar state, then restart again without another reset.

**Expected**
- First startup shows one `legacy_state_found` copy such as `哦。旧账还在。`.
- The durable marker is written to normal plugin data.
- The next normal startup does not show the legacy copy again.
- Ordinary sidebar re-renders do not consume another legacy copy.

## 15. Only useful/cannot-answer create durable note content

**Setup**
- Start from a note with no `认知坑` callout.

**Action**
- In separate runs perform only: generate/shown, `换一个`, `什么破问题`, enter `继续拷打`, exit drill.

**Expected**
- None of those actions inserts a pit.
- Only `有东西` and `答不上来` alter the note by writing a durable `认知坑` callout.
