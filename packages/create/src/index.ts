import {
  cancel,
  confirm,
  intro,
  isCancel,
  log,
  note,
  outro,
  spinner,
  text,
} from "@clack/prompts";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  defaultRoutePath,
  detectPackageManager,
  detectRouter,
  detectTypeScript,
  findProjectRoot,
  installArgs,
  isNextJsProject,
} from "./utils/detect.js";
import {
  appendEnvVars,
  routeHandlerContent,
  writeFileSafe,
} from "./utils/files.js";

function runCommand(cmd: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "inherit", cwd });
    child.on("exit", (code) => {
      code === 0 ? resolve() : reject(new Error(`${cmd} exited with code ${code}`));
    });
    child.on("error", reject);
  });
}

async function main() {
  intro("lightning-ecommerce setup");

  const cwd = process.cwd();
  const root = findProjectRoot(cwd);

  // ── Project detection ────────────────────────────────────────────────────

  if (!isNextJsProject(root)) {
    log.warn(
      "No Next.js project detected in this directory. Continuing anyway.",
    );
  }

  const router = detectRouter(root);
  if (router === "pages") {
    log.error(
      "Pages Router is not yet supported.\n" +
        "Migrate to App Router or add the route handler manually:\n" +
        '  export { GET, POST } from "@lightning-ecommerce/nextjs/server/route";',
    );
    process.exit(1);
  }

  const useTypeScript = detectTypeScript(root);
  const pm = detectPackageManager(root);

  if (router === "app") {
    log.info(`Detected Next.js project (App Router, ${useTypeScript ? "TypeScript" : "JavaScript"})`);
  } else {
    log.info(`No router directory detected — will scaffold under app/`);
  }

  // ── Prompts ───────────────────────────────────────────────────────────────

  const nodeUrl = await text({
    message: "Lightning node URL",
    placeholder: "https://your-node.example.com",
    validate: (v) => {
      if (!v.trim()) return "Required";
      try {
        new URL(v);
      } catch {
        return "Must be a valid URL (e.g. https://node.example.com)";
      }
    },
  });
  if (isCancel(nodeUrl)) {
    cancel("Cancelled.");
    process.exit(0);
  }

  const apiKey = await text({
    message: "API key",
    placeholder: "your-api-key",
    validate: (v) => (v.trim() ? undefined : "Required"),
  });
  if (isCancel(apiKey)) {
    cancel("Cancelled.");
    process.exit(0);
  }

  const routePathDefault = defaultRoutePath(root, useTypeScript);
  const routePathInput = await text({
    message: "Route file path (relative to project root)",
    initialValue: routePathDefault,
    validate: (v) => (v.trim() ? undefined : "Required"),
  });
  if (isCancel(routePathInput)) {
    cancel("Cancelled.");
    process.exit(0);
  }

  const shouldInstall = await confirm({
    message: `Install @lightning-ecommerce/nextjs now? (via ${pm})`,
    initialValue: true,
  });
  if (isCancel(shouldInstall)) {
    cancel("Cancelled.");
    process.exit(0);
  }

  // ── Write files ───────────────────────────────────────────────────────────

  const s = spinner();
  const absRoutePath = resolve(root, routePathInput as string);

  // Route handler
  if (existsSync(absRoutePath)) {
    const overwrite = await confirm({
      message: `${routePathInput} already exists. Overwrite?`,
      initialValue: false,
    });
    if (isCancel(overwrite) || !overwrite) {
      log.info("Skipped: route file unchanged.");
    } else {
      s.start("Writing route handler…");
      writeFileSafe(absRoutePath, routeHandlerContent());
      s.stop(`Created ${routePathInput}`);
    }
  } else {
    s.start("Writing route handler…");
    writeFileSafe(absRoutePath, routeHandlerContent());
    s.stop(`Created ${routePathInput}`);
  }

  // .env.local
  const envPath = join(root, ".env.local");
  s.start("Updating .env.local…");
  const wrote = appendEnvVars(envPath, nodeUrl as string, apiKey as string);
  if (wrote) {
    s.stop("Updated .env.local");
  } else {
    s.stop(
      ".env.local already contains LIGHTNING_NODE_URL / LIGHTNING_API_KEY — skipped.",
    );
  }

  // Install
  if (shouldInstall) {
    const [cmd, args] = installArgs(pm);
    s.start(`Running ${cmd} ${args.join(" ")}…`);
    try {
      await runCommand(cmd, args, root);
      s.stop("Package installed.");
    } catch (err) {
      s.stop(`Install failed — run "${cmd} ${args.join(" ")}" manually.`);
      log.warn(String(err));
    }
  }

  // ── Next steps ────────────────────────────────────────────────────────────

  note(
    [
      "Add the checkout to any page:",
      "",
      '  import { LightningCheckout } from "@lightning-ecommerce/nextjs";',
      "",
      "  <LightningCheckout",
      '    description="Order #1"',
      "    amount_msat={20_000_000}",
      '    onSuccess={(inv) => console.log("Paid!", inv)}',
      "  />",
      "",
      "Env vars written to .env.local — add them to your hosting",
      "provider's environment settings before deploying.",
    ].join("\n"),
    "Next steps",
  );

  outro("Done! Ready to accept Lightning payments. ⚡");
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
