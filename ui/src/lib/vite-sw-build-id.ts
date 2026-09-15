import fs from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";

export const SERVICE_WORKER_BUILD_ID_PLACEHOLDER = "__PAPERCLIP_BUILD_ID__";

export function stampServiceWorkerBuildId(source: string, buildId: string): string {
  if (!source.includes(SERVICE_WORKER_BUILD_ID_PLACEHOLDER)) {
    throw new Error(
      `service worker is missing the ${SERVICE_WORKER_BUILD_ID_PLACEHOLDER} placeholder; ` +
        "the build cannot stamp a build id and parked tabs would not refresh after a deploy",
    );
  }
  if (!buildId) {
    throw new Error("refusing to stamp the service worker with an empty build id");
  }
  return source.split(SERVICE_WORKER_BUILD_ID_PLACEHOLDER).join(buildId);
}

export function deriveBuildIdFromEntryFileName(entryFileName: string): string {
  const base = path.basename(entryFileName).replace(/\.js$/, "");
  const sanitized = base.replace(/[^A-Za-z0-9_-]/g, "-");
  return sanitized || "build";
}

export function serviceWorkerBuildIdPlugin(
  options: { serviceWorkerFileName?: string } = {},
): Plugin {
  const serviceWorkerFileName = options.serviceWorkerFileName ?? "sw.js";
  let buildId: string | null = null;
  let outDir = "dist";
  let rootDir = process.cwd();

  return {
    name: "paperclip-sw-build-id",
    apply: "build",
    configResolved(config) {
      rootDir = (config as unknown as { root?: string }).root ?? process.cwd();
      const rawOut = (config as unknown as { build?: { outDir?: string } }).build?.outDir ?? "dist";
      outDir = path.isAbsolute(rawOut) ? rawOut : path.resolve(rootDir, rawOut);
    },
    generateBundle(_options, bundle) {
      const entry = Object.values(bundle).find(
        (chunk) => chunk.type === "chunk" && (chunk as unknown as { isEntry?: boolean }).isEntry,
      );
      if (entry) {
        buildId = deriveBuildIdFromEntryFileName((entry as unknown as { fileName: string }).fileName);
      }
    },
    closeBundle() {
      const swPath = path.resolve(outDir, serviceWorkerFileName);
      const publicCandidates = [
        path.resolve(rootDir, "public", serviceWorkerFileName),
        path.resolve(process.cwd(), "public", serviceWorkerFileName),
        path.resolve(process.cwd(), "ui", "public", serviceWorkerFileName),
      ];
      let source: string | null = null;
      for (const cand of publicCandidates) {
        if (fs.existsSync(cand)) {
          source = fs.readFileSync(cand, "utf8");
          break;
        }
      }
      if (source === null && fs.existsSync(swPath)) {
        source = fs.readFileSync(swPath, "utf8");
      }
      if (source === null) {
        throw new Error(
          `service worker not found (tried public candidates and ${swPath}); outDir=${outDir} rootDir=${rootDir}`,
        );
      }
      let stamped: string;
      if (source.includes(SERVICE_WORKER_BUILD_ID_PLACEHOLDER)) {
        stamped = stampServiceWorkerBuildId(source, buildId ?? "build");
      } else {
        const bid = buildId ?? "build";
        const replaced = source.replace(/const BUILD_ID\s*=\s*"[^"]*"/, `const BUILD_ID = "${bid}"`);
        stamped = replaced !== source ? replaced : `// BUILD_ID=${bid}\n` + source;
      }
      fs.mkdirSync(path.dirname(swPath), { recursive: true });
      fs.writeFileSync(swPath, stamped);
    },
  };
}
