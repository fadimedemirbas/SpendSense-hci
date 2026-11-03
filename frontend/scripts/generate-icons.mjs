import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Both commands use the original PNG artwork and the same sizing rules.
const result = spawnSync(
  process.env.PYTHON || "python",
  [fileURLToPath(new URL("./generate-icons.py", import.meta.url))],
  { stdio: "inherit" },
);
if (result.error) throw result.error;
process.exit(result.status ?? 1);
