// Post-build step for Next.js `output: "standalone"`.
//
// `next build` produces `.next/standalone/server.js` but deliberately does NOT
// copy `.next/static` or `public/` into it. Running the standalone server
// (e.g. via pm2: `node .next/standalone/server.js`) without these dirs makes
// every /_next/static/* and /public/* request 404 -> blank UI.
//
// This script restores them and (re)generates the runtime env-config.js that
// docker-entrypoint.sh would otherwise produce, so non-Docker deploys work too.
//
// It runs automatically after `npm run build` (see package.json "build").

import { cpSync, writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const standalone = join(root, ".next", "standalone");

if (!existsSync(standalone)) {
  console.error(
    "[postbuild] .next/standalone not found — is `output: \"standalone\"` set in next.config.ts?"
  );
  process.exit(1);
}

// 1. Copy static assets into the standalone tree.
cpSync(join(root, ".next", "static"), join(standalone, ".next", "static"), {
  recursive: true,
});
cpSync(join(root, "public"), join(standalone, "public"), { recursive: true });

// 2. Resolve BE_BASE_URL with the same precedence the app uses, falling back to
//    the value in .env (which `next build` reads but this script does not).
function fromDotEnv(key) {
  const f = join(root, ".env");
  if (!existsSync(f)) return undefined;
  for (const line of readFileSync(f, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && m[1] === key) return m[2].replace(/^["']|["']$/g, "");
  }
  return undefined;
}

const beBaseUrl =
  process.env.BE_BASE_URL ||
  process.env.NEXT_PUBLIC_BE_BASE_URL ||
  fromDotEnv("NEXT_PUBLIC_BE_BASE_URL") ||
  fromDotEnv("BE_BASE_URL") ||
  "http://localhost:8099";

// 3. Generate the runtime env file consumed by src/pages/_document.tsx.
const publicDir = join(standalone, "public");
mkdirSync(publicDir, { recursive: true });
writeFileSync(
  join(publicDir, "env-config.js"),
  `window._env_ = Object.freeze({\n  "BE_BASE_URL": "${beBaseUrl}",\n});\n`
);

console.log(
  `[postbuild] standalone assets copied; env-config.js BE_BASE_URL=${beBaseUrl}`
);
