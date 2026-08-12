import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const siteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distRoot = path.join(siteRoot, "dist");
const clientRoot = path.join(distRoot, "client");
const textExtensions = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".map",
  ".mjs",
]);
const inheritedKey = process.env.OPENAI_API_KEY;
const forbiddenPatterns = [
  { name: "server key variable name", pattern: /OPENAI_API_KEY/ },
  { name: "OpenAI-style secret", pattern: /sk-(?:proj-)?[A-Za-z0-9_-]{20,}/ },
  { name: "private key", pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
];
const matches = [];
const inheritedKeyMatches = [];

async function scan(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await scan(absolutePath);
      continue;
    }
    if (!entry.isFile() || !textExtensions.has(path.extname(entry.name))) continue;
    if ((await stat(absolutePath)).size > 10_000_000) continue;

    const contents = await readFile(absolutePath, "utf8");
    for (const forbidden of forbiddenPatterns) {
      if (forbidden.pattern.test(contents)) {
        matches.push({
          file: path.relative(siteRoot, absolutePath),
          reason: forbidden.name,
        });
      }
    }
    if (inheritedKey && inheritedKey.length >= 16 && contents.includes(inheritedKey)) {
      matches.push({
        file: path.relative(siteRoot, absolutePath),
        reason: "inherited key value",
      });
    }
  }
}

async function scanBuiltSecretValue(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await scanBuiltSecretValue(absolutePath);
      continue;
    }
    if (!entry.isFile() || !inheritedKey || inheritedKey.length < 16) continue;
    if ((await stat(absolutePath)).size > 20_000_000) continue;
    const contents = await readFile(absolutePath);
    if (contents.includes(Buffer.from(inheritedKey))) {
      inheritedKeyMatches.push(path.relative(siteRoot, absolutePath));
    }
  }
}

try {
  await scan(clientRoot);
  await scanBuiltSecretValue(distRoot);
} catch (error) {
  if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
    console.error("FAIL built browser assets are missing; run the build first");
    process.exit(1);
  }
  throw error;
}

if (matches.length > 0 || inheritedKeyMatches.length > 0) {
  console.error(`FAIL potential secret exposure found in ${matches.length + inheritedKeyMatches.length} built asset match(es)`);
  for (const match of matches) console.error(`- ${match.file}: ${match.reason}`);
  for (const file of inheritedKeyMatches) console.error(`- ${file}: inherited key value`);
  process.exitCode = 1;
} else {
  console.log("PASS built client assets contain no server key name or high-confidence secret pattern; no built asset contains the inherited key value");
}
