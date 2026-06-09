import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";
import JavaScriptObfuscator from "javascript-obfuscator";

const projectRoot = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const distDir = join(projectRoot, "dist");
const bundledFile = join(distDir, "index.bundle.js");
const outputFile = join(distDir, "index.js");

await rm(distDir, { recursive: true, force: true });
await mkdir(distDir, { recursive: true });

await build({
  entryPoints: [join(projectRoot, "src", "index.ts")],
  outfile: bundledFile,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node18.17",
  minify: true,
  legalComments: "none",
  banner: {
    js: "#!/usr/bin/env node",
  },
});

const bundledCode = await readFile(bundledFile, "utf8");
const codeWithoutShebang = bundledCode.replace(/^(#![^\n]*\n)+/, "");
const obfuscated = JavaScriptObfuscator.obfuscate(codeWithoutShebang, {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.6,
  deadCodeInjection: false,
  identifierNamesGenerator: "hexadecimal",
  renameGlobals: false,
  rotateStringArray: true,
  selfDefending: false,
  simplify: true,
  splitStrings: true,
  splitStringsChunkLength: 8,
  stringArray: true,
  stringArrayCallsTransform: true,
  stringArrayEncoding: ["base64"],
  stringArrayThreshold: 0.8,
  target: "node",
});

await writeFile(outputFile, `#!/usr/bin/env node\n${obfuscated.getObfuscatedCode()}\n`);
await rm(bundledFile, { force: true });
await chmod(outputFile, 0o755);
