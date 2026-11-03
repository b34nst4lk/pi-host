# Plan — a command guard (draft for review, 2026-11-02)

Status: **proposal, not implemented.** Nothing in `src/` changes until the three
decisions at the end are answered.

Why this exists: on 2026-11-02 an agent in this repo ran a bare `git push` while
`HEAD` was still on `main` (the branch had been created with `git branch -f`
instead of `git switch -c`), and `origin/main` moved without a pull request. The
rule that forbade it already existed in prose (`AGENTS.md`: "never push to
`main`, open a PR") and was still broken by a two-word command. Prose is not a
mechanism.

## 1. Threat model — the commands that actually cost something

Each of these has happened here or was one keystroke away:

| command shape | damage |
|---|---|
| `git push` (bare, on `main`) | main moves unreviewed; 2026-11-02, PR auto-closed as MERGED |
| `git push --force` / `-f` on any shared ref | rewrites published history |
| `git reset --hard`, `git clean -fdx` | discards uncommitted work in a worktree |
| `git add -A` / `git add .` | stages secrets, `storage/`, `worktrees/` |
| `cat /run/secrets*`, `cat .gh/hosts.yml`, `printenv GITHUB_TOKEN` | reads a credential the agent is not granted |
| `docker restart pi-host`, `docker compose … up -d` | deploy / restart without a human |
| `rm -rf` outside the workspace, `rm` on `storage/` or `worktrees/` | destroys the ledger or a subagent's branch |
| `gh api -X DELETE …` / `-X PUT …rulesets` | changes repository policy |

Two actors can issue them: the **daemon's bash tool** (an agent, including a
project agent with a push grant) and **a human or shell script**. They need
different locks; neither lock covers the other.

## 2. Layer A — daemon-side guard (the only place an agent's command can be stopped)

New pure module `src/guard.ts`:

```ts
export type Refusal = { readonly rule: string; readonly why: string; readonly hint: string };
export type Verdict = { readonly ok: true } | { readonly ok: false } & Refusal;

export function inspectCommand(command: string, ctx: GuardContext): Verdict;
```

`GuardContext` = `{ readonly kind: "main" | "project" | "subagent"; readonly pushGranted: boolean }`.

Rules are **data in one table**, not hand-written branches, so each rule carries
its own reason and its own hint:

```ts
const RULES: readonly Rule[] = [
  { id: "push-bare-or-main", match: /^git\s+push(\s|$)/, unless: /^git\s+push\s+(origin\s+)?[\w./-]+$/,
    why: "a bare `git push` pushes the branch HEAD is on; on main that moves main",
    hint: "name the refspec: git push origin <branch>" },
  // force-push, reset --hard, clean -f, add -A, secret paths, docker, rm, gh api mutations …
];
```

Deny wins over allow. Matching is deliberately **not** a shell parser: the
command is split on shell metacharacters (`;`, `&&`, `||`, `|`, backticks,
`$(`, `sh -c`, `eval`) and a rule matches if its pattern appears in any segment,
**and** if the command contains an unparseable construct (a subshell, `eval`, an
interpreter invocation) any denied token anywhere in the string is refused. A
guard that pretends to understand shell quoting lies to its operator.

Wiring (`src/env.ts`, inside the wrapper `createAgentEnv` already builds):

- a denied command never reaches `exec`; it returns a failed `ShellExecResult`
  whose message is the `why` + `hint`, so the model reads a correction instead of
  a mystery;
- one `journal` line per refusal (`guard: refused <rule> in <cwd>`), which is what
  makes the guard observable in `/status` and in the Wall later;
- no approval loop, no retry, no exception — a refusal is an answer.

Behind `PI_HOST_GUARD=on` for the first session (default off), so a false
positive cannot stop work before we have watched the rate.

## 3. Layer B — the lock that covers humans: a committed `pre-push` hook

`scripts/git-hooks/pre-push` + `npm run hooks` (`git config core.hooksPath
scripts/git-hooks`). The hook refuses:

- any refspec targeting `refs/heads/main` (`git push`, `git push origin main`,
  `git push origin HEAD:main`, `--force` variants);
- any force update to an existing ref (`+` refspec or `--force`/`-f`);
- a push whose commits touch a secret-looking path (`.gh/`, `*.env`,
  `/run/secrets`).

This is the layer that would have caught 2026-11-02 with no daemon involved, and
it also binds me, a human, and any script — which the daemon-side guard does not.

## 4. Layer C — instructions (thinnest, last)

`AGENTS.md` gains exactly two lines once the mechanisms exist: "never run bare
`git push`; name the refspec", and "`npm run hooks` once per clone — the hooks are
the guard". Prose is the reminder; it is no longer the enforcement.

## 5. Tests — the regression corpus is the transcript

`tests/guard.test.ts`, table-driven, one case per rule, and the corpus is made of
commands that were really run or nearly run:

- denied with the exact hint text: `git push`, `git push origin main`,
  `gh pr view 2 && git push`, `GH_CONFIG_DIR=/opt/pi-host/.gh git push`,
  `sh -c 'git push'`, `git reset --hard HEAD~1`, `git add -A`, `git add .`,
  `cat .gh/hosts.yml`, `cat /run/secrets/matrix_token`, `printenv GH_CONFIG_DIR`,
  `docker restart pi-host`, `docker compose -f deploy/docker-compose.yml up -d`,
  `rm -rf worktrees`, `gh api -X DELETE repos/b34nst4lk/pi-host/rulesets`;
- allowed (proven unaffected): `git push origin feature/x`, `git status`,
  `npm run gates`, `gh pr create`, `git switch -c x`, `git commit -m …`,
  `./node_modules/.bin/vitest run tests/guard.test.ts`, `git log --oneline`;
- a project conversation with `pushGranted: false` and one with `true` produce
  the same verdict for `git push origin main` (the grant is about *where*, not
  *whether the rules apply*).

Plus `tests/git-hooks.test.ts` (or a shell test in `npm run gates`): run the hook
with a synthetic stdin of refspecs and assert the exit codes. A hook nobody tests
is a hook that silently rots.

## 6. Honesty clause (goes into `docs/HANDOFF.md`)

A pattern guard is a seatbelt. `bash script.sh`, an alias, `printf '%s' …
| sh`, or a heredoc can dodge any string match, and the guard sees only what the
model chose to type. The structural lock is branch protection on `main` — WS5,
currently blocked on GitHub's plan limit for the three private repos. Record that
ordering so nobody trusts the guard further than it reaches.

## 7. Sequence (each step its own commit, `npm run gates` green)

1. `src/guard.ts` + `tests/guard.test.ts` — pure, unwired, no behaviour change.
2. Wire into `createAgentEnv` behind `PI_HOST_GUARD=on`; one session of watching
   the refusal journal before it becomes the default.
3. `scripts/git-hooks/pre-push` + `npm run hooks` + the hook test.
4. `AGENTS.md` lines + the HANDOFF paragraph (mechanism, then prose).
5. Flip the default on; keep a per-rule `PI_HOST_GUARD_ALLOW=<ids>` escape hatch so
   a mis-tuned rule can be relaxed without a code change (and is still journaled).

Size: `guard.ts` should land well under the 4,000-token warn line (the rule table
is the bulk); `src/env.ts` grows by the wrapper only.

## 8. Decisions needed before step 1

- **(a) Refuse, or ask?** Refusing is cheap and needs no plumbing. "Ask the room"
  (agent requests approval, jack replies `/allow 7`) needs a task, a pending map
  and reply handling — roughly a day, and it turns every refusal into a Matrix
  round trip. Recommendation: refuse now, ask later if the false-positive rate
  justifies it.
- **(b) One table or several?** Does a project agent get a stricter table than the
  main agent, and does a push-granted project get an extra rule ("never
  `refs/heads/main`, even with a credential")? Recommendation: same table for all
  three kinds; the push grant only changes which *repositories* a legal push can
  reach — and `main` is never legal.
- **(c) Scope of the hook.** Do the committed hooks go into the other four repos
  (fourier, pr-review-workflow, cartographer, blog) as well? That means writing in
  repositories this session does not own — a fan-out decision for their agents, or
  for you.

## 9. Explicitly out of scope

- Sandboxing (`NodeExecutionEnv` is not one) — unchanged v1 posture.
- Reading the ledger, the Wall, or the Matrix surface — no interaction.
- Branch protection (WS5) — the structural lock, tracked separately, blocked.
