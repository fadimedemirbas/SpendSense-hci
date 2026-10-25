// Read-only publication audit. Never print matched credential values.
import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
function git(args, input, binary = false) {
  const result = spawnSync("git", args, {
    cwd: root,
    input,
    encoding: binary ? undefined : "utf8",
    maxBuffer: 128 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(`Git audit command failed: ${args[0]}`);
  return result.stdout;
}
const tracked = git(["ls-files", "-z"]).split("\0").filter(Boolean);
const candidates = [
  ...new Set(
    git(["ls-files", "--cached", "--others", "--exclude-standard", "-z"])
      .split("\0")
      .filter(Boolean),
  ),
];
const findings = [];
const fixtures = new Set([
  "sb_secret_TEST_ONLY_DO_NOT_BUNDLE",
  "sb_secret_testonly",
  "test-only-password",
]);
const patterns = [
  ["Supabase secret key", /\bsb_secret_[A-Za-z0-9_-]{8,}/g],
  [
    "database connection URI",
    /\b(?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?):\/\/[^\s"'`<>]+/gi,
  ],
  ["private key", /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g],
  [
    "provider access token",
    /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[A-Z0-9]{16}|sk_live_[A-Za-z0-9]{16,}|sk-proj-[A-Za-z0-9_-]{20,})/g,
  ],
  ["literal password", /\b(?:password|passwd|pwd)\s*[:=]\s*["']([^"'\r\n]{6,})["']/gi],
  [
    "sensitive configuration literal",
    /\b(?:DATABASE_URL|DB_PASSWORD|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY|JWT_SECRET)\s*[:=]\s*["']([^"'\r\n]+)["']/g,
  ],
  ["JWT", /\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g],
];
let scanned = 0;
function scan(buffer, path, source) {
  let text;
  if (buffer[0] === 0xff && buffer[1] === 0xfe) text = buffer.toString("utf16le");
  else {
    if (buffer.includes(0)) return;
    text = buffer.toString("utf8");
  }
  scanned++;
  for (const [kind, pattern] of patterns) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      const value = match[1] ?? match[0];
      if (fixtures.has(value)) continue;
      if (kind === "JWT") {
        try {
          const payload = JSON.parse(Buffer.from(value.split(".")[1], "base64url").toString());
          if (!["service_role", "authenticated"].includes(payload.role)) continue;
        } catch {
          continue;
        }
      }
      findings.push({ source, path, line: text.slice(0, match.index).split("\n").length, kind });
    }
  }
}

for (const path of tracked) {
  if (
    /(^|\/)(node_modules|dist|dist-ssr|\.vercel)(\/|$)/.test(path) ||
    (/(^|\/)\.env(?:\.|$)/.test(path) && !/\.env\.(example|template)$/.test(path))
  ) {
    findings.push({ source: "index", path, kind: "tracked generated/local configuration" });
  }
}
for (const path of candidates)
  if (existsSync(resolve(root, path)))
    scan(readFileSync(resolve(root, path)), path, "working tree");

// Include the actual index (even deleted/edited working files), plus every blob
// reachable from local branches/tags/remote-tracking refs; never rewrite history.
const objects = new Map();
for (const entry of git(["rev-list", "--objects", "--all"]).trim().split("\n")) {
  const space = entry.indexOf(" ");
  objects.set(space < 0 ? entry : entry.slice(0, space), {
    path: space < 0 ? "(git object)" : entry.slice(space + 1),
    source: "reachable history",
  });
}
for (const entry of git(["ls-files", "--stage", "-z"]).split("\0").filter(Boolean)) {
  const [header, path] = entry.split("\t");
  objects.set(header.split(" ")[1], { path, source: "index/history" });
}
const checks = git(
  ["cat-file", "--batch-check=%(objectname) %(objecttype)"],
  [...objects.keys()].join("\n") + "\n",
);
const blobs = checks
  .trim()
  .split("\n")
  .filter((line) => line.endsWith(" blob"))
  .map((line) => line.split(" ")[0]);
const batch = git(["cat-file", "--batch"], blobs.join("\n") + "\n", true);
let offset = 0;
for (const hash of blobs) {
  const end = batch.indexOf(10, offset);
  const size = Number(batch.subarray(offset, end).toString().split(" ")[2]);
  const object = objects.get(hash);
  scan(batch.subarray(end + 1, end + 1 + size), object.path, object.source);
  offset = end + 1 + size + 1;
}
const remotes = git(["remote"])
  .trim()
  .split("\n")
  .filter(Boolean)
  .map((name) => {
    const value = git(["remote", "get-url", name]).trim();
    // Do not emit URLs: check whether HTTP credentials are embedded instead.
    return {
      name,
      embeddedCredentials: /^https?:\/\/[^/]*@/i.test(value),
      github: /github\.com[/:]/i.test(value),
    };
  });
for (const remote of remotes)
  if (remote.embeddedCredentials)
    findings.push({
      source: "local Git config",
      path: remote.name,
      kind: "credential-bearing remote URL",
    });
const unique = [...new Map(findings.map((item) => [JSON.stringify(item), item])).values()];
console.log(
  JSON.stringify(
    {
      trackedPaths: tracked.length,
      publicationCandidates: candidates.filter((path) => existsSync(resolve(root, path))).length,
      reachableBlobs: blobs.length,
      scannedTextVersions: scanned,
      remotes,
      findings: unique,
    },
    null,
    2,
  ),
);
if (unique.length) process.exitCode = 1;
