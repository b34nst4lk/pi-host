# Skills

Behaviour files, read on demand. Each one is a skill: a small, opinionated procedure,
not documentation. Sources and licences are named inside each file.

| skill | fires when | file |
|---|---|---|
| **ponytail** | any code work: build, fix, refactor — smallest complete change; also the review/audit checklist and shortcut-debt ledger | `ponytail/SKILL.md` |
| **deslopping** | "deslop", "make it sound human", "clean this up", a diff that reads AI-generated, prose for a room or a doc | `deslopping/SKILL.md` |
| **thermonuclear-review** | before a push or merge, "gate it", "be brutal", "would this survive review" — strict structural maintainability verdict | `thermonuclear-review/SKILL.md` |

Order of precedence when they disagree: **correctness > ponytail's smallest change >
thermonuclear blockers > deslopping polish**. Ponytail is the default posture; the other
two are modes you enter on a trigger.

These are prompt-level skills (they change how the agent behaves), not tools. Nothing in
the daemon loads them: a project or subagent only picks them up if its own `AGENTS.md`
points here.
