# Resolve PR Comments

Systematically resolve all comments, to-dos, and review issues in the current pull request.

## Phase 1: Discovery

Gather ALL comment types using these commands in parallel:

```bash
gh pr view --comments
gh api repos/$(gh repo view --json owner,name | jq -r '.owner.login')/$(gh repo view --json owner,name | jq -r '.name')/pulls/$(gh pr view --json number | jq -r '.number')/comments | jq '.[] | {id: .id, author: .user.login, body: .body, path: .path, line: .line}'
gh api repos/$(gh repo view --json owner,name | jq -r '.owner.login')/$(gh repo view --json owner,name | jq -r '.name')/pulls/$(gh pr view --json number | jq -r '.number')/reviews | jq '.[] | {id: .id, author: .user.login, state: .state, body: .body}'
```

## Phase 2: Planning

Classify each comment:
- **HIGH** — must/required/critical/blocking
- **MEDIUM** — should/suggest/recommend/consider
- **LOW** — nit/minor/style/typo/optional

Create a todo list grouped by file. For independent comments across different files, resolve in parallel using sub-agents.

## Phase 3: Implementation

Work through each item:
1. Make the requested code change
2. Run lint + tests after each file is done
3. Mark the item complete

## Phase 4: Verification

```bash
gh pr checks
git diff --stat HEAD~1
```

Commit all changes with a clear message summarising what was addressed. Do not push unless asked.
