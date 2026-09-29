import fs from "node:fs";
import os from "node:os";
import path from "node:path";

if (!process.env.SVOD_DATA_DIR) {
  process.env.SVOD_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "svod-test-"));
}
