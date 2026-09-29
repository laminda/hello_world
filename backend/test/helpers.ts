import { nowIso, run } from "../src/db.js";

export function createInvestigation(title = "test") {
  const id = `INV-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  run(
    `INSERT INTO investigations (id, title, status, created_at, updated_at, is_demo)
     VALUES (?, ?, 'draft', ?, ?, 0)`,
    id,
    title,
    nowIso(),
    nowIso()
  );
  return id;
}
