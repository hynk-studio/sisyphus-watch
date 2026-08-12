import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const ignoredDirectories = new Set([
  ".git",
  ".next",
  ".vinext",
  ".wrangler",
  "dist",
  "node_modules",
  "outputs",
  "work",
]);
const ignoredExtensions = new Set([
  ".gif",
  ".ico",
  ".ipynb",
  ".jpeg",
  ".jpg",
  ".lock",
  ".pdf",
  ".png",
  ".webp",
]);
const secretPatterns = [
  /sk-(?:proj-)?[A-Za-z0-9_-]{20,}/,
  /AIza[0-9A-Za-z_-]{35}/,
  /gh[opusr]_[A-Za-z0-9]{36,}/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
];

const matches = [];

async function scanDirectory(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await scanDirectory(absolutePath);
      continue;
    }
    if (!entry.isFile() || ignoredExtensions.has(path.extname(entry.name))) continue;
    if ((await stat(absolutePath)).size > 2_000_000) continue;

    const contents = await readFile(absolutePath, "utf8");
    if (secretPatterns.some((pattern) => pattern.test(contents))) {
      matches.push(path.relative(repositoryRoot, absolutePath));
    }
  }
}

await scanDirectory(repositoryRoot);

if (matches.length > 0) {
  console.error(`FAIL potential secret patterns found in ${matches.length} file(s)`);
  for (const match of matches) console.error(`- ${match}`);
  process.exitCode = 1;
} else {
  console.log("PASS no high-confidence secret patterns found");
}
