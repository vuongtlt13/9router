import { NextResponse } from "next/server";
import { insertRtkEvents, validateApiKey } from "@/lib/db";

const MAX_BATCH_SIZE = 1000;

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function badRequest(message) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function parseBearerToken(request) {
  const auth = request.headers.get("authorization") || "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

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

function normalizeText(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeEvent(topLevelMachineId, event, index) {
  if (!event || typeof event !== "object" || Array.isArray(event)) {
    throw new Error(`events[${index}] must be an object`);
  }

  const sourceId = normalizeText(event.source_id);
  const machineId = normalizeText(event.machine_id);
  const localId = Number(event.local_id);
  const createdAt = normalizeText(event.created_at);

  if (!sourceId) throw new Error(`events[${index}].source_id is required`);
  if (!machineId) throw new Error(`events[${index}].machine_id is required`);
  if (machineId !== topLevelMachineId) throw new Error(`events[${index}].machine_id must match machine_id`);
  if (!Number.isInteger(localId) || localId < 0) throw new Error(`events[${index}].local_id must be a non-negative integer`);
  if (!createdAt || Number.isNaN(Date.parse(createdAt))) throw new Error(`events[${index}].created_at must be a valid ISO timestamp`);

  return {
    sourceId,
    machineId,
    localId,
    command: normalizeText(event.command),
    originalCmd: normalizeText(event.original_cmd),
    inputTokens: toInt(event.input_tokens),
    outputTokens: toInt(event.output_tokens),
    savedTokens: toInt(event.saved_tokens),
    savingsPct: toNumber(event.savings_pct),
    execTimeMs: toInt(event.exec_time_ms),
    projectPath: normalizeText(event.project_path),
    createdAt: new Date(createdAt).toISOString(),
  };
}

export async function POST(request) {
  try {
    const token = parseBearerToken(request);
    if (!token || !(await validateApiKey(token))) return unauthorized();

    let body;
    try {
      body = await request.json();
    } catch {
      return badRequest("Invalid JSON body");
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) return badRequest("Body must be an object");

    const machineId = normalizeText(body.machine_id);
    if (!machineId) return badRequest("machine_id is required");
    if (!Array.isArray(body.events)) return badRequest("events must be an array");
    if (body.events.length > MAX_BATCH_SIZE) return badRequest(`events must contain at most ${MAX_BATCH_SIZE} items`);

    let events;
    try {
      events = body.events.map((event, index) => normalizeEvent(machineId, event, index));
    } catch (error) {
      return badRequest(error.message);
    }

    const result = await insertRtkEvents(machineId, events);
    return NextResponse.json({
      accepted: result.accepted,
      duplicates: result.duplicates,
      max_local_id: result.maxLocalId,
    });
  } catch (error) {
    console.error("[API] Failed to sync RTK events:", error);
    return NextResponse.json({ error: "Failed to sync RTK events" }, { status: 500 });
  }
}
