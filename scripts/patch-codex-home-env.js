#!/usr/bin/env node
/**
 * Ensure the packaged Electron app passes its resolved Codex home to the
 * bundled Rust CLI/app-server. Without this, Windows child processes can fall
 * back to the bundled catalog and ignore the user's ~/.codex config/catalog.
 */
const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);
const check = args.includes("--check");
const platform = args.find((a) => ["mac-arm64", "mac-x64", "win"].includes(a));

const repoRoot = path.resolve(__dirname, "..");
const targets = platform
  ? [platform]
  : ["mac-arm64", "mac-x64", "win"].filter((p) =>
      fs.existsSync(path.join(repoRoot, "src", p, "_asar", ".vite", "build")),
    );

const OLD = "let j=r.E({moduleDir:__dirname});await Yp(j.codexHome)";
const NEW =
  "let j=r.E({moduleDir:__dirname});process.env.CODEX_HOME??=j.codexHome;await Yp(j.codexHome)";

function patchFile(file) {
  const src = fs.readFileSync(file, "utf8");
  if (src.includes(NEW)) {
    console.log(`[ok] already patched: ${file}`);
    return false;
  }
  const count = src.split(OLD).length - 1;
  if (count !== 1) {
    throw new Error(`Expected one Codex home startup marker in ${file}, found ${count}`);
  }
  if (check) {
    console.log(`[check] would patch: ${file}`);
    return true;
  }
  fs.writeFileSync(file, src.replace(OLD, NEW), "utf8");
  console.log(`[ok] patched: ${file}`);
  return true;
}

function main() {
  let changed = 0;
  for (const target of targets) {
    const buildDir = path.join(repoRoot, "src", target, "_asar", ".vite", "build");
    const files = fs
      .readdirSync(buildDir)
      .filter((name) => name.endsWith(".js"))
      .map((name) => path.join(buildDir, name));

    let matched = false;
    for (const file of files) {
      const src = fs.readFileSync(file, "utf8");
      if (!src.includes(OLD) && !src.includes(NEW)) continue;
      matched = true;
      if (patchFile(file)) changed++;
    }
    if (!matched) throw new Error(`No Codex home startup marker found for ${target}`);
  }
  console.log(check ? `[check] ${changed} file(s) need patching` : `[done] ${changed} file(s) patched`);
}

main();
