// File-size gate: every source file stays under ~5,000 tokens.
//
// Tokens are estimated as characters / 4 — the worst case for source code, so a
// file that passes here is under the limit under any real tokenizer. No deps: the
// point is that the rule is checkable from a checkout with nothing installed.
//
// A file over the WARN line is printed (so growth is visible before it fails);
// a file over the LIMIT fails the run (exit 1) and is meant to be SPLIT along its
// module boundary, never padded or compressed.
import fs from "node:fs";
import path from "node:path";

const WARN = 4_000;
const LIMIT = 5_000;

/** Roots to measure, and the files inside them that are source rather than data. */
const ROOTS = ["src", "tests", "wall/src", "wall/test", "wall/assets/index.html"];
const TEXT = /\.(ts|tsx|mjs|cjs|js|gleam|html|css)$/;
const SKIP = new Set(["node_modules", "build", ".git", "dist"]);

/** Every source file under `root`, or the file itself when `root` is one. */
function walk(root) {
	let stat;
	try {
		stat = fs.statSync(root);
	} catch {
		return []; // a root that does not exist yet is not a failure
	}
	if (!stat.isDirectory()) return TEXT.test(root) ? [root] : [];
	const out = [];
	for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
		if (SKIP.has(entry.name)) continue;
		const full = path.join(root, entry.name);
		if (entry.isDirectory()) out.push(...walk(full));
		else if (TEXT.test(entry.name)) out.push(full);
	}
	return out;
}

/** Characters as UTF-16 code units — good enough, and free. */
function chars(file) {
	const buffer = fs.readFileSync(file);
	// A binary that happens to carry a source extension is not ours to measure.
	if (buffer.includes(0)) return null;
	return buffer.toString("utf8").length;
}

const files = ROOTS.flatMap((root) => walk(root));
const measured = [];
for (const file of files) {
	const size = chars(file);
	if (size !== null) measured.push({ file, chars: size, tokens: Math.round(size / 4) });
}
measured.sort((a, b) => b.chars - a.chars);

const over = measured.filter((entry) => entry.tokens > WARN);
for (const entry of over) {
	const flag = entry.tokens > LIMIT ? "FAIL" : "warn";
	console.log(`${flag}  ${String(entry.tokens).padStart(5)} tok  ${String(entry.chars).padStart(6)} ch  ${entry.file}`);
}

const total = measured.reduce((sum, entry) => sum + entry.tokens, 0);
console.log(
	`\n${measured.length} files, ${total} tokens total; largest ${measured[0]?.tokens ?? 0} (${measured[0]?.file ?? "none"}); ` +
		`${over.length} over the ${WARN} warn line; limit ${LIMIT}`,
);

const failed = measured.filter((entry) => entry.tokens > LIMIT);
if (failed.length > 0) {
	console.error(`\nfsize: ${failed.length} file(s) over ${LIMIT} tokens — split along the module boundary:`);
	for (const entry of failed) console.error(`  ${entry.file} (${entry.tokens} tokens)`);
	process.exit(1);
}
