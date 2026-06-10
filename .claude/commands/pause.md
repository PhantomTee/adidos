# Pause

Save the current session state and generate a return prompt so you can resume seamlessly later.

Detect mode from the invocation:
- **Quick** — "quick pause" or `/pause --quick` → short break, local commit only, minimal prompt
- **Full** — just `/pause` → end of session, commit + push, comprehensive prompt

---

## Quick Mode

1. `git status --short` — check for uncommitted changes
2. If changes exist: `git add -A && git commit -m "Quick pause: [one-line context]"` (no push)
3. Output a minimal resume prompt:

```
Status: [one sentence — what you were doing]
Next: [single next action]
Key files: [1-2 files]
```

Target: done in under 3 seconds.

---

## Full Mode

1. `git status --short`
2. If changes: `git add -A && git commit -m "[context]: WIP pause"` then `git push`
3. Generate a comprehensive resume prompt that passes the **Amnesia Test** — if you woke up with only this, could you continue seamlessly?

Required fields:
```
## Session Resume Prompt

**Current position:** [exactly where you are in the work]
**Completed this session:** [bullet list of what got done]
**Next steps:** [ordered list]
**Key files:** [files actively being worked on with line references]
**Pending proposals:** [any suggestions made but not yet approved — verbatim]
**Tone/context:** [any important conversational context]
```

Banned: vague summaries like "discussed dashboard stuff", omitted pending proposals, unclear waiting states.

Target: done in under 8 seconds.
