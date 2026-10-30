// The fleet: who exists, and what each one is doing.
//
// Two registries feed one list of cards — `app.subagents` (a subagent the daemon
// spawned) and `app.projects` (a room bound to a conversation) — tagged with
// `kind` so a client renders both the same way. The state itself is not decided
// here: `agentState()` in `agents.ts` owns the enum, and this module only gathers
// the facts it needs, one query per conversation.
import type { DatabaseSync } from "node:sqlite";
import {
	agentState,
	ANCHOR_KINDS,
	anchorDetail,
	busyTasks,
	type AnchorFact,
	inboxItemCount,
	liveBusy,
	plainKind,
	REPORTER_KIND,
	reporterChild,
	RUNNING_STATUSES,
	type TaskFact,
} from "./agents.ts";
import type { AgentReport, AgentsReport, FleetReport, NamedAgentCard, OrphanCard } from "./contract.ts";
import { kindVariants, num, parseRecord, str } from "./contract.ts";
import { isNumber, placeholders, readConversationOwners, rootConversation, type WithDb } from "./db.ts";
import { readDocument, readDocumentFor } from "./document-replay.ts";

/** One bound project, as the daemon recorded it in `app.projects`. */
type ProjectRow = {
	readonly name: string;
	readonly room: string | null;
	readonly conversation: number | null;
	readonly cwd: string | null;
	readonly summary: string | null;
};

type ChildFacts = {
	readonly tasks: TaskFact[];
	readonly inbox_items: number | null;
	readonly live_busy: boolean | null;
};

export type Fleet = {
	fleet(): FleetReport;
	agents(): AgentsReport;
};

export function createFleet(deps: { readonly withDb: WithDb }): Fleet {
	const { withDb } = deps;

	function fleet(): FleetReport {
		const probe = withDb((db) => readDocument(db, "app.subagents"));
		if (probe.error !== null) {
			return { ok: false, error: probe.error, agents: [] };
		}
		const record = parseRecord(probe.value?.state);
		const agents = record ? parseRecord(record.agents) : null;
		if (!agents) return { ok: true, error: null, agents: [] };
		// ONE owner: `reported[]` holds answer ENTRY ids, so the newest one is the last
		// reply. The `reporters` map is task ids (the daemon reads them to report a
		// reporter's status) — a different counter, never an entry id.
		const out: AgentReport[] = [];
		for (const [name, raw] of Object.entries(agents)) {
			const entry = parseRecord(raw);
			const reported = Array.isArray(entry?.reported) ? entry.reported.filter(isNumber) : [];
			const lastReportEntry = reported.length > 0 ? Math.max(...reported) : null;
			out.push({
				name,
				branch: `worktree-${name}`,
				worktree: entry ? str(entry.worktree) : null,
				conversation_id: entry ? num(entry.conversationId) : null,
				reports: reported.length,
				last_report_entry: lastReportEntry,
				state: lastReportEntry === null ? "waiting" : "reported",
			});
		}
		return { ok: true, error: null, agents: out.sort((a, b) => a.name.localeCompare(b.name)) };
	}

	function agents(): AgentsReport {
		// The registry is already read for `fleet`; the cards reuse it rather than
		// reopening the same document. Projects are a second registry (`app.projects`),
		// and their cards join the same list, tagged `kind: "project"`.
		const registry = fleet();
		const projectsProbe = withDb((db) => projectRows(db));
		const projects = projectsProbe.value ?? [];
		const probe = withDb((db) => {
			const owners = readConversationOwners(db);
			const rootId = rootConversation(owners);
			const anchors = readAnchors(db);
			const reporting = readPendingReporterChildren(db);

			const childOfAnchor = (anchor: AnchorFact): number | null => {
				for (const [conversation, ownerTask] of owners ?? []) {
					if (ownerTask === anchor.id) return conversation;
				}
				// Fallback when `conversations` is unreadable: the anchor names the agent.
				if (anchor.name === null) return null;
				const byName = registry.agents.find((agent) => agent.name === anchor.name);
				return byName?.conversation_id ?? null;
			};

			const wanted = new Set<number>([rootId]);
			for (const agent of registry.agents) {
				if (agent.conversation_id !== null) wanted.add(agent.conversation_id);
			}
			for (const anchor of anchors) {
				const child = childOfAnchor(anchor);
				if (child !== null) wanted.add(child);
			}
			for (const project of projects) {
				if (project.conversation !== null) wanted.add(project.conversation);
			}

			// A project's card shows how much history it holds; one count per project.
			const entryCounts = new Map<number, number>();
			for (const project of projects) {
				if (project.conversation !== null) {
					entryCounts.set(project.conversation, countEntries(db, project.conversation));
				}
			}

			const facts = new Map<number, ChildFacts>();
			for (const conversation of wanted) facts.set(conversation, readChildFacts(db, conversation));
			return { owners, rootId, anchors, reporting, facts, childOfAnchor, entryCounts };
		});

		const named: NamedAgentCard[] = [];
		if (probe.value === null) {
			// Unreadable ledger: still name the agents (the registry parsed), state unknown.
			for (const agent of registry.agents) {
				named.push({
					kind: "subagent",
					name: agent.name,
					state: "unknown",
					branch: agent.branch,
					worktree: agent.worktree,
					last_reply: agent.last_report_entry,
					conversation: agent.conversation_id,
					anchor: null,
					room: null,
					cwd: null,
					summary: null,
					entries: null,
				});
			}
			for (const project of projects) {
				named.push({
					kind: "project",
					name: project.name,
					state: "unknown",
					branch: "",
					worktree: null,
					last_reply: null,
					conversation: project.conversation,
					anchor: null,
					room: project.room,
					cwd: project.cwd,
					summary: project.summary,
					entries: null,
				});
			}
			return {
				ok: false,
				error: probe.error,
				spike: { kind: "main", state: "unknown", conversation: null },
				named,
				orphans: [],
				retired: null,
				work: { in_flight: null, queued: null },
			};
		}

		const { owners, rootId, anchors, reporting, facts, childOfAnchor, entryCounts } = probe.value;
		const namedConversations = new Set<number>();
		const namedNames = new Set<string>();
		for (const agent of registry.agents) {
			namedNames.add(agent.name);
			if (agent.conversation_id !== null) namedConversations.add(agent.conversation_id);
		}
		for (const project of projects) {
			if (project.conversation !== null) namedConversations.add(project.conversation);
		}

		for (const agent of registry.agents) {
			const conversation = agent.conversation_id;
			const anchor = anchors.find((candidate) => {
				const child = childOfAnchor(candidate);
				return child !== null ? child === conversation : candidate.name === agent.name;
			}) ?? null;
			const childFacts = conversation === null ? null : facts.get(conversation) ?? null;
			named.push({
				kind: "subagent",
				name: agent.name,
				state: agentState({
					// A named agent we cannot locate is `unknown`, not `alive`.
					readable: childFacts !== null,
					tasks: childFacts?.tasks ?? [],
					inbox_items: childFacts?.inbox_items ?? null,
					live_busy: childFacts?.live_busy ?? null,
					reporter_pending: conversation !== null && reporting.has(conversation),
					anchor,
					named: true,
				}),
				branch: agent.branch,
				worktree: agent.worktree,
				last_reply: agent.last_report_entry,
				conversation,
				anchor: anchor?.id ?? null,
				room: null,
				cwd: null,
				summary: null,
				entries: null,
			});
		}

		// Projects: the same enum, the same card, a different registry. Their anchor is
		// matched by CONVERSATION only — every project anchor is named `project-anchor`,
		// so matching by name here would tag them all with the same project.
		for (const project of projects) {
			const conversation = project.conversation;
			const childFacts = conversation === null ? null : facts.get(conversation) ?? null;
			const anchor =
				(conversation === null
					? null
					: anchors.find((candidate) => childOfAnchor(candidate) === conversation) ?? null);
			named.push({
				kind: "project",
				name: project.name,
				state: agentState({
					readable: childFacts !== null,
					tasks: childFacts?.tasks ?? [],
					inbox_items: childFacts?.inbox_items ?? null,
					live_busy: childFacts?.live_busy ?? null,
					reporter_pending: conversation !== null && reporting.has(conversation),
					anchor,
					named: true,
				}),
				branch: "",
				worktree: null,
				last_reply: null,
				conversation,
				anchor: anchor?.id ?? null,
				room: project.room,
				cwd: project.cwd,
				summary: project.summary,
				entries: conversation === null ? null : (entryCounts.get(conversation) ?? 0),
			});
		}

		const orphans: OrphanCard[] = [];
		let retired = 0;
		for (const anchor of anchors) {
			if (anchor.status === "terminal") {
				retired += 1;
				continue;
			}
			const conversation = childOfAnchor(anchor);
			const namedAnchor =
				(conversation !== null && namedConversations.has(conversation)) ||
				(anchor.name !== null && namedNames.has(anchor.name));
			if (namedAnchor) continue;
			orphans.push({ anchor: anchor.id, conversation });
		}

		const rootFacts = facts.get(rootId) ?? null;
		const spike = agentState({
			readable: rootFacts !== null,
			tasks: rootFacts?.tasks ?? [],
			inbox_items: rootFacts?.inbox_items ?? null,
			live_busy: rootFacts?.live_busy ?? null,
			reporter_pending: false,
			anchor: null,
			named: true,
		});

		return {
			ok: true,
			error: probe.error,
			spike: { kind: "main", state: spike, conversation: rootId },
			named: named.sort((a, b) => a.name.localeCompare(b.name)),
			orphans: orphans.sort((a, b) => a.anchor - b.anchor),
			retired,
			work: {
				in_flight: rootFacts === null ? null : busyTasks(rootFacts.tasks).length,
				queued: rootFacts?.inbox_items ?? null,
			},
		};
	}

	return { fleet, agents };
}

/**
 * `app.projects`: the daemon's project registry. It stores POINTERS (room,
 * conversation, directory, the path of `AGENTS.md`), so the wall can name a
 * project but not quote its instructions — which is right: the file is the
 * source of truth and it changes without a daemon restart.
 *
 * A project whose record is unreadable is skipped, never invented.
 */
function projectRows(db: DatabaseSync): ProjectRow[] {
	const doc = readDocument(db, "app.projects");
	const record = parseRecord(doc?.state);
	const projects = record ? parseRecord(record.projects) : null;
	if (!projects) return [];
	const out: ProjectRow[] = [];
	for (const [name, raw] of Object.entries(projects)) {
		const entry = parseRecord(raw);
		if (!entry) continue;
		out.push({
			name,
			room: str(entry.room),
			conversation: num(entry.conversation),
			cwd: str(entry.cwd),
			summary: str(entry.summary),
		});
	}
	return out.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Anchor tasks live in the main conversation; they own the child conversations.
 * Both kinds count: a subagent's anchor (retirable) and a project's anchor
 * (long-lived) hold a conversation the same way, and the state enum must see
 * both or a retired project would read as alive.
 */
export function readAnchors(db: DatabaseSync): AnchorFact[] {
	const variants = ANCHOR_KINDS.flatMap((kind) => kindVariants(kind));
	const rows = db
		.prepare(
			`select id, status, conversation_id, record from tasks where kind in (${variants.map(() => "?").join(", ")}) order by id`,
		)
		.all(...variants) as Record<string, unknown>[];
	const out: AnchorFact[] = [];
	for (const row of rows) {
		const id = num(row.id);
		if (id === null) continue;
		out.push({
			id,
			status: str(row.status) ?? "unknown",
			conversation: num(row.conversation_id),
			name: anchorDetail(parseRecord(row.record)).name,
		});
	}
	return out;
}

/** Children with a reporter task still in flight in the main conversation. */
function readPendingReporterChildren(db: DatabaseSync): Set<number> {
	const [plain, quoted] = kindVariants(REPORTER_KIND);
	const rows = db
		.prepare(
			`select record from tasks where kind in (?, ?) and status in (${placeholders(RUNNING_STATUSES)})`,
		)
		.all(plain, quoted, ...RUNNING_STATUSES) as Record<string, unknown>[];
	const out = new Set<number>();
	for (const row of rows) {
		const child = reporterChild(parseRecord(row.record));
		if (child !== null) out.add(child);
	}
	return out;
}

function readTasks(db: DatabaseSync, conversation: number): TaskFact[] {
	const rows = db
		.prepare("select id, kind, status, conversation_id from tasks where conversation_id = ?")
		.all(conversation) as Record<string, unknown>[];
	const out: TaskFact[] = [];
	for (const row of rows) {
		const id = num(row.id);
		if (id === null) continue;
		out.push({
			id,
			kind: plainKind(row.kind),
			status: str(row.status) ?? "unknown",
			conversation: num(row.conversation_id),
		});
	}
	return out;
}

/** How many entries one conversation holds (a project card's "entries" figure). */
function countEntries(db: DatabaseSync, conversation: number): number {
	try {
		const row = db
			.prepare("select count(*) as total from entries where conversation_id = ?")
			.get(conversation) as { total?: unknown } | undefined;
		return num(row?.total) ?? 0;
	} catch {
		return 0;
	}
}

/** Everything the state enum needs about one conversation, in one probe. */
function readChildFacts(db: DatabaseSync, conversation: number): ChildFacts {
	const inbox = readDocumentFor(db, "pi.inbox", conversation);
	const live = readDocumentFor(db, "pi.live", conversation);
	return {
		tasks: readTasks(db, conversation),
		inbox_items: inboxItemCount(inbox?.state),
		live_busy: liveBusy(live?.state),
	};
}
