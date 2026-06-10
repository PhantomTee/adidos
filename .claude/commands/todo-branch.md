# Todo Branch

Structured workflow to turn a vague todo into implemented, committed code on the current branch.

**RULES**
- Follow phases in order: INIT → SELECT → REFINE → IMPLEMENT → COMMIT
- Get user confirmation at every STOP
- Never mention yourself in commit messages
- Stage ALL changed files before committing

---

## INIT

1. Check for a `todos/project-description.md`. If missing, use parallel agents to analyse the codebase and produce one covering: purpose, features, tech stack, structure, architecture, and key commands. STOP → confirm or correct.

2. Check for orphaned in-progress tasks in `todos/work/`. If found, list them. STOP → "Resume orphaned task? (number / ignore)"

---

## SELECT

1. Read `todos/todos.md` in full.
2. Present numbered list with one-line summaries.
3. STOP → "Which todo? (enter number)"
4. Create a timestamped task folder:
   ```bash
   TIMESTAMP=$(date +%Y%m%d-%H%M%S)
   TASK_DIR="todos/work/${TIMESTAMP}-[task-slug]"
   mkdir -p "$TASK_DIR"
   ```
5. Write `${TASK_DIR}/task.md` with: title, Status: Refining, original todo text, description placeholder, implementation plan placeholder.
6. Remove selected todo from `todos/todos.md`.

---

## REFINE

1. Run parallel agents to research: where changes are needed, existing patterns to follow, related code.
2. Write findings to `${TASK_DIR}/analysis.md`.
3. Draft description. STOP → "Use this description? (y/n)"
4. Draft implementation plan with checkboxes. STOP → "Use this plan? (y/n)"
5. Update `${TASK_DIR}/task.md`, set Status: InProgress.

---

## IMPLEMENT

1. Work through each checkbox:
   - Make changes
   - Summarise what changed
   - STOP → "Approve? (y/n)"
   - Check off the box in task.md
   - `git add -A`
   - If unexpected work discovered: propose new checkbox. STOP → "Add? (y/n)"

2. After all checkboxes: run lint + tests.
   - If failing: propose fix checkboxes. STOP → "Add? (y/n)". Return to step 1.

3. Present user test steps. STOP → "All pass? (y/n)"
   - If no: gather failure details, return to step 1.

4. Set Status: AwaitingCommit in task.md.

---

## COMMIT

1. Summarise all changes made.
2. STOP → "Ready to commit? (y/n)"
3. Set Status: Done in task.md.
4. Move task files to `todos/done/`, remove work folder.
5. `git add -A`
6. Show proposed commit message. STOP → "Use this message? (y/n)"
7. `git commit -m "[task-title]: [summary]"` — ONE commit for everything.
8. STOP → "Continue with next todo? (y/n)"
