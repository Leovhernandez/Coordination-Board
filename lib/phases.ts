// Default trade phases seeded on job creation, in sequence order. The owner can
// rename/reorder/add/remove later (M3+). Verticalized for the contractor's
// world per CLAUDE.md §3 — short and trade-real, not configurable boilerplate.
export const DEFAULT_PHASES = ["Demo", "Rough-in", "Inspection", "Finish"] as const;
