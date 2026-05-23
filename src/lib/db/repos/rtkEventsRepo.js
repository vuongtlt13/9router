import { getAdapter } from "../driver.js";

function toInt(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.trunc(n));
}

function toNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, n);
}

function clampPct(value) {
  return Math.max(0, Math.min(100, value));
}

function normalizePeriod(period) {
  const now = new Date();
  switch (period) {
    case "today": {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      return start.toISOString();
    }
    case "24h":
      return new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    case "7d":
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    case "30d":
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    case "60d":
      return new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString();
    default:
      return null;
  }
}

function buildFilterWhere(filter = {}) {
  const conds = [];
  const params = [];
  const startDate = normalizePeriod(filter.period);

  if (startDate) { conds.push("createdAt >= ?"); params.push(startDate); }
  if (filter.machineId) { conds.push("machineId = ?"); params.push(filter.machineId); }

  return {
    where: conds.length ? `WHERE ${conds.join(" AND ")}` : "",
    params,
  };
}

function efficiencyPct(inputTokens, outputTokens, savedTokens) {
  const total = inputTokens + outputTokens + savedTokens;
  if (total <= 0) return 0;
  return clampPct((savedTokens / total) * 100);
}

function rowToEvent(row) {
  return {
    sourceId: row.sourceId,
    machineId: row.machineId,
    localId: row.localId,
    command: row.command,
    originalCmd: row.originalCmd,
    inputTokens: row.inputTokens || 0,
    outputTokens: row.outputTokens || 0,
    savedTokens: row.savedTokens || 0,
    savingsPct: row.savingsPct || 0,
    execTimeMs: row.execTimeMs || 0,
    projectPath: row.projectPath,
    createdAt: row.createdAt,
    receivedAt: row.receivedAt,
  };
}

export async function insertRtkEvents(machineId, events) {
  const db = await getAdapter();
  const receivedAt = new Date().toISOString();
  let accepted = 0;
  let duplicates = 0;

  db.transaction(() => {
    for (const event of events) {
      const result = db.run(
        `INSERT OR IGNORE INTO rtkEvents(sourceId, machineId, localId, command, originalCmd, inputTokens, outputTokens, savedTokens, savingsPct, execTimeMs, projectPath, createdAt, receivedAt) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          event.sourceId,
          event.machineId,
          event.localId,
          event.command || null,
          event.originalCmd || null,
          toInt(event.inputTokens),
          toInt(event.outputTokens),
          toInt(event.savedTokens),
          clampPct(toNumber(event.savingsPct)),
          toInt(event.execTimeMs),
          event.projectPath || null,
          event.createdAt,
          receivedAt,
        ]
      );

      if ((result?.changes ?? 0) > 0) accepted += 1;
      else duplicates += 1;
    }
  });

  const row = db.get(`SELECT MAX(localId) AS maxLocalId FROM rtkEvents WHERE machineId = ?`, [machineId]);
  return { accepted, duplicates, maxLocalId: row?.maxLocalId || 0 };
}

export async function getRtkStats(filter = {}) {
  const db = await getAdapter();
  const { where, params } = buildFilterWhere(filter);
  const row = db.get(
    `SELECT COUNT(*) AS totalCommands,
      COALESCE(SUM(inputTokens), 0) AS inputTokens,
      COALESCE(SUM(outputTokens), 0) AS outputTokens,
      COALESCE(SUM(savedTokens), 0) AS savedTokens,
      COALESCE(SUM(execTimeMs), 0) AS execTimeMs,
      COUNT(DISTINCT machineId) AS machines,
      COUNT(DISTINCT projectPath) AS projects
    FROM rtkEvents ${where}`,
    params
  ) || {};

  const summary = {
    totalCommands: row.totalCommands || 0,
    inputTokens: row.inputTokens || 0,
    outputTokens: row.outputTokens || 0,
    savedTokens: row.savedTokens || 0,
    execTimeMs: row.execTimeMs || 0,
    machines: row.machines || 0,
    projects: row.projects || 0,
  };

  return {
    ...summary,
    efficiencyPct: efficiencyPct(summary.inputTokens, summary.outputTokens, summary.savedTokens),
  };
}

function mapAggregateRow(row) {
  return {
    count: row.count || 0,
    inputTokens: row.inputTokens || 0,
    outputTokens: row.outputTokens || 0,
    savedTokens: row.savedTokens || 0,
    execTimeMs: row.execTimeMs || 0,
    efficiencyPct: efficiencyPct(row.inputTokens || 0, row.outputTokens || 0, row.savedTokens || 0),
  };
}

export async function getRtkCommandStats(filter = {}) {
  const db = await getAdapter();
  const { where, params } = buildFilterWhere(filter);
  const rows = db.all(
    `SELECT COALESCE(command, 'unknown') AS command,
      COUNT(*) AS count,
      COALESCE(SUM(inputTokens), 0) AS inputTokens,
      COALESCE(SUM(outputTokens), 0) AS outputTokens,
      COALESCE(SUM(savedTokens), 0) AS savedTokens,
      COALESCE(SUM(execTimeMs), 0) AS execTimeMs
    FROM rtkEvents ${where}
    GROUP BY COALESCE(command, 'unknown')
    ORDER BY savedTokens DESC, count DESC
    LIMIT ?`,
    [...params, filter.limit || 20]
  );

  return rows.map((row) => ({ command: row.command, ...mapAggregateRow(row) }));
}

export async function getRtkMachineStats(filter = {}) {
  const db = await getAdapter();
  const { where, params } = buildFilterWhere(filter);
  const rows = db.all(
    `SELECT machineId,
      COUNT(*) AS count,
      COALESCE(SUM(inputTokens), 0) AS inputTokens,
      COALESCE(SUM(outputTokens), 0) AS outputTokens,
      COALESCE(SUM(savedTokens), 0) AS savedTokens,
      COALESCE(SUM(execTimeMs), 0) AS execTimeMs,
      COUNT(DISTINCT projectPath) AS projects,
      MAX(createdAt) AS lastSeen
    FROM rtkEvents ${where}
    GROUP BY machineId
    ORDER BY savedTokens DESC, count DESC
    LIMIT ?`,
    [...params, filter.limit || 20]
  );

  return rows.map((row) => ({
    machineId: row.machineId,
    projects: row.projects || 0,
    lastSeen: row.lastSeen,
    ...mapAggregateRow(row),
  }));
}

export async function getRecentRtkEvents(filter = {}) {
  const db = await getAdapter();
  const { where, params } = buildFilterWhere(filter);
  const rows = db.all(
    `SELECT sourceId, machineId, localId, command, originalCmd, inputTokens, outputTokens, savedTokens, savingsPct, execTimeMs, projectPath, createdAt, receivedAt
    FROM rtkEvents ${where}
    ORDER BY createdAt DESC
    LIMIT ?`,
    [...params, filter.limit || 25]
  );

  return rows.map(rowToEvent);
}
