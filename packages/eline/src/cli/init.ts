import { mkdirSync, writeFileSync, existsSync, readFileSync, readdirSync, statSync, copyFileSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = resolve(__dirname, "../../templates");

export async function initCommand(
  name: string | undefined,
  options: { template: string }
): Promise<void> {
  const targetDir = name
    ? resolve(process.cwd(), name)
    : resolve(process.cwd(), ".");

  if (existsSync(targetDir) && name) {
    console.error(`Directory already exists: ${targetDir}`);
    process.exit(1);
  }

  const templateDir = resolve(TEMPLATES_DIR, options.template);
  if (!existsSync(templateDir)) {
    console.error(`Template not found: ${options.template}`);
    process.exit(1);
  }

  console.log(`\n  Scaffolding agent in ${targetDir}...\n`);

  copyTemplate(templateDir, targetDir);

  if (name) {
    updatePackageJson(targetDir, name);
  }

  console.log(`  Done! Created agent in ${targetDir}`);
  console.log(`\n  Next steps:`);
  console.log(`    cd ${name || "."}`);
  console.log(`    npm install`);
  console.log(`    npm run dev`);
  console.log();
}

function copyTemplate(src: string, dest: string): void {
  const entries = collectFiles(src);

  for (const entry of entries) {
    const relative = entry.replace(src, "").replace(/^\//, "");
    const destPath = join(dest, relative);

    if (entry.endsWith(".gitkeep")) {
      const parentDir = destPath.replace("/.gitkeep", "");
      mkdirSync(parentDir, { recursive: true });
      writeFileSync(join(parentDir, ".gitkeep"), "");
      continue;
    }

    mkdirSync(dirname(destPath), { recursive: true });

    if (entry.endsWith(".ts") || entry.endsWith(".md") || entry.endsWith(".json")) {
      const content = readFileSync(entry, "utf-8");
      writeFileSync(destPath, content);
    } else {
      copyFileSync(entry, destPath);
    }
  }
}

function collectFiles(dir: string): string[] {
  const files: string[] = [];
  const entries = readdirSync(dir);

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...collectFiles(fullPath));
    } else {
      files.push(fullPath);
    }
  }

  return files;
}

function updatePackageJson(targetDir: string, projectName: string): void {
  const pkgPath = join(targetDir, "package.json");

  if (existsSync(pkgPath)) {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    pkg.name = projectName;
    writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
  }
}
