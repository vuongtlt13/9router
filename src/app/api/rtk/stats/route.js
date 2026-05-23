import { NextResponse } from "next/server";
import { getRecentRtkEvents, getRtkCommandStats, getRtkMachineStats, getRtkStats } from "@/lib/db";

const PERIODS = new Set(["today", "24h", "7d", "30d", "60d", "all"]);

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get("period") || "all";
    const machineId = searchParams.get("machineId") || null;

    if (!PERIODS.has(period)) {
      return NextResponse.json({ error: "Invalid period" }, { status: 400 });
    }

    const filter = { period, machineId };
    const [summary, byCommand, byMachine, recent] = await Promise.all([
      getRtkStats(filter),
      getRtkCommandStats({ ...filter, limit: 20 }),
      getRtkMachineStats({ ...filter, limit: 20 }),
      getRecentRtkEvents({ ...filter, limit: 20 }),
    ]);

    return NextResponse.json({ summary, byCommand, byMachine, recent });
  } catch (error) {
    console.error("[API] Failed to get RTK stats:", error);
    return NextResponse.json({ error: "Failed to fetch RTK stats" }, { status: 500 });
  }
}
