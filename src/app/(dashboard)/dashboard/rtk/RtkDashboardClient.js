"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Card, SegmentedControl, Spinner } from "@/shared/components";

const PERIODS = [
  { value: "today", label: "Today" },
  { value: "24h", label: "24h" },
  { value: "7d", label: "7D" },
  { value: "30d", label: "30D" },
  { value: "60d", label: "60D" },
  { value: "all", label: "All" },
];

const EMPTY_SUMMARY = {
  totalCommands: 0,
  inputTokens: 0,
  outputTokens: 0,
  savedTokens: 0,
  execTimeMs: 0,
  efficiencyPct: 0,
  machines: 0,
  projects: 0,
};

function formatNumber(value) {
  return new Intl.NumberFormat().format(value || 0);
}

function formatTokens(value) {
  const n = value || 0;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return formatNumber(n);
}

function formatPct(value) {
  return `${(value || 0).toFixed(1)}%`;
}

function formatDuration(ms) {
  const totalSeconds = Math.round((ms || 0) / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return `${minutes}m ${seconds}s`;
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  return `${hours}h ${remMinutes}m`;
}

function formatTime(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function MetricCard({ label, value, sublabel }) {
  return (
    <Card className="p-5">
      <div className="text-sm text-text-muted">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-text-primary">{value}</div>
      {sublabel && <div className="mt-1 text-xs text-text-muted">{sublabel}</div>}
    </Card>
  );
}

function TerminalSummary({ summary }) {
  const lines = [
    "RTK Token Savings",
    "=================",
    "",
    `Total commands:   ${formatNumber(summary.totalCommands)}`,
    `Input tokens:     ${formatTokens(summary.inputTokens)}`,
    `Output tokens:    ${formatTokens(summary.outputTokens)}`,
    `Tokens saved:     ${formatTokens(summary.savedTokens)} (${formatPct(summary.efficiencyPct)})`,
    `Total duration:   ${formatDuration(summary.execTimeMs)}`,
    `Efficiency meter: ${"█".repeat(Math.round((summary.efficiencyPct || 0) / 5)).padEnd(20, "░")} ${formatPct(summary.efficiencyPct)}`,
  ];

  return (
    <Card>
      <pre className="overflow-x-auto rounded-lg bg-black p-4 font-mono text-xs leading-5 text-green-400 whitespace-pre">
        {lines.join("\n")}
      </pre>
    </Card>
  );
}

export default function RtkDashboardClient() {
  const [period, setPeriod] = useState("all");
  const [data, setData] = useState({ summary: EMPTY_SUMMARY, byCommand: [], byMachine: [], recent: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/rtk/stats?period=${encodeURIComponent(period)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to fetch RTK stats");
      setData({
        summary: { ...EMPTY_SUMMARY, ...(json.summary || {}) },
        byCommand: json.byCommand || [],
        byMachine: json.byMachine || [],
        recent: json.recent || [],
      });
    } catch (err) {
      console.error("Failed to fetch RTK stats:", err);
      setError(err.message || "Failed to fetch RTK stats");
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const summary = data.summary || EMPTY_SUMMARY;
  const efficiencyWidth = useMemo(() => `${Math.max(0, Math.min(100, summary.efficiencyPct || 0))}%`, [summary.efficiencyPct]);
  const spinner = (
    <div className="flex items-center justify-center py-12 text-text-muted">
      <span className="material-symbols-outlined animate-spin text-[32px]">progress_activity</span>
    </div>
  );

  return (
    <div className="flex min-w-0 flex-col gap-6 px-1 sm:px-0">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">RTK Gain</h1>
          <p className="mt-1 text-sm text-text-muted">Track token savings uploaded by rtk-sync.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <SegmentedControl options={PERIODS} value={period} onChange={setPeriod} size="sm" className="w-full sm:w-auto" />
          <Button size="sm" variant="outline" icon="refresh" onClick={fetchStats} disabled={loading}>
            Refresh
          </Button>
          {loading && <Spinner size="sm" className="text-text-muted" />}
        </div>
      </div>

      {error && (
        <Card className="border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
          {error}
        </Card>
      )}

      {loading ? spinner : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <MetricCard label="Total Commands" value={formatNumber(summary.totalCommands)} sublabel={`${formatNumber(summary.machines)} machines`} />
          <MetricCard label="Input Tokens" value={formatTokens(summary.inputTokens)} />
          <MetricCard label="Output Tokens" value={formatTokens(summary.outputTokens)} />
          <MetricCard label="Tokens Saved" value={formatTokens(summary.savedTokens)} sublabel={formatPct(summary.efficiencyPct)} />
          <MetricCard label="Duration" value={formatDuration(summary.execTimeMs)} sublabel={`${formatNumber(summary.projects)} projects`} />
        </div>
      )}

      {loading ? spinner : (
        <Card className="p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-medium text-text-primary">Efficiency Meter</div>
              <div className="mt-1 text-xs text-text-muted">Saved tokens as a share of total processed tokens.</div>
            </div>
            <div className="text-2xl font-semibold text-green-500">{formatPct(summary.efficiencyPct)}</div>
          </div>
          <div className="mt-4 h-3 overflow-hidden rounded-full bg-bg-subtle">
            <div className="h-full rounded-full bg-green-500 transition-all" style={{ width: efficiencyWidth }} />
          </div>
        </Card>
      )}

      {loading ? spinner : <TerminalSummary summary={summary} />}

      <Card>
        <div className="border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold text-text-primary">By Command</h2>
        </div>
        {loading ? spinner : (
        <div className="overflow-x-auto">
          <table className="w-full table-fixed text-sm">
            <thead className="bg-bg-subtle/30 text-xs uppercase text-text-muted">
              <tr>
                <th className="w-[44%] px-6 py-3 text-left font-medium">Command</th>
                <th className="w-[9%] px-4 py-3 text-right font-medium">Count</th>
                <th className="w-[10%] px-4 py-3 text-right font-medium">Input</th>
                <th className="w-[10%] px-4 py-3 text-right font-medium">Output</th>
                <th className="w-[10%] px-4 py-3 text-right font-medium">Saved</th>
                <th className="w-[9%] px-4 py-3 text-right font-medium">Duration</th>
                <th className="w-[8%] px-4 py-3 text-right font-medium">Efficiency</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.byCommand.length === 0 ? (
                <tr><td colSpan={7} className="px-6 py-8 text-center text-text-muted">No RTK events yet.</td></tr>
              ) : data.byCommand.map((row) => (
                <tr key={row.command} className="hover:bg-bg-subtle/20">
                  <td className="px-6 py-3">
                    <div className="truncate font-mono text-xs text-text-primary" title={row.command}>{row.command}</div>
                  </td>
                  <td className="px-4 py-3 text-right text-text-secondary">{formatNumber(row.count)}</td>
                  <td className="px-4 py-3 text-right text-text-secondary">{formatTokens(row.inputTokens)}</td>
                  <td className="px-4 py-3 text-right text-text-secondary">{formatTokens(row.outputTokens)}</td>
                  <td className="px-4 py-3 text-right font-medium text-green-500">{formatTokens(row.savedTokens)}</td>
                  <td className="px-4 py-3 text-right text-text-secondary">{formatDuration(row.execTimeMs)}</td>
                  <td className="px-4 py-3 text-right text-text-secondary">{formatPct(row.efficiencyPct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
      </Card>

      <Card>
        <div className="border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold text-text-primary">By Machine</h2>
        </div>
        {loading ? spinner : (
        <div className="overflow-x-auto">
          <table className="w-full table-fixed text-sm">
            <thead className="bg-bg-subtle/30 text-xs uppercase text-text-muted">
              <tr>
                <th className="w-[30%] px-6 py-3 text-left font-medium">Machine</th>
                <th className="w-[10%] px-4 py-3 text-right font-medium">Count</th>
                <th className="w-[10%] px-4 py-3 text-right font-medium">Projects</th>
                <th className="w-[10%] px-4 py-3 text-right font-medium">Input</th>
                <th className="w-[10%] px-4 py-3 text-right font-medium">Output</th>
                <th className="w-[10%] px-4 py-3 text-right font-medium">Saved</th>
                <th className="w-[10%] px-4 py-3 text-right font-medium">Duration</th>
                <th className="w-[10%] px-4 py-3 text-right font-medium">Efficiency</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.byMachine.length === 0 ? (
                <tr><td colSpan={8} className="px-6 py-8 text-center text-text-muted">No RTK machines yet.</td></tr>
              ) : data.byMachine.map((row) => (
                <tr key={row.machineId} className="hover:bg-bg-subtle/20">
                  <td className="px-6 py-3">
                    <div className="truncate font-mono text-xs text-text-primary" title={row.machineId}>{row.machineId}</div>
                  </td>
                  <td className="px-4 py-3 text-right text-text-secondary">{formatNumber(row.count)}</td>
                  <td className="px-4 py-3 text-right text-text-secondary">{formatNumber(row.projects)}</td>
                  <td className="px-4 py-3 text-right text-text-secondary">{formatTokens(row.inputTokens)}</td>
                  <td className="px-4 py-3 text-right text-text-secondary">{formatTokens(row.outputTokens)}</td>
                  <td className="px-4 py-3 text-right font-medium text-green-500">{formatTokens(row.savedTokens)}</td>
                  <td className="px-4 py-3 text-right text-text-secondary">{formatDuration(row.execTimeMs)}</td>
                  <td className="px-4 py-3 text-right text-text-secondary">{formatPct(row.efficiencyPct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
      </Card>

      <Card>
        <div className="border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold text-text-primary">Recent Events</h2>
        </div>
        {loading ? spinner : (
        <div className="overflow-x-auto">
          <table className="w-full table-fixed text-sm">
            <thead className="bg-bg-subtle/30 text-xs uppercase text-text-muted">
              <tr>
                <th className="w-[18%] px-6 py-3 text-left font-medium">Time</th>
                <th className="w-[20%] px-4 py-3 text-left font-medium">Machine</th>
                <th className="w-[24%] px-4 py-3 text-left font-medium">Command</th>
                <th className="w-[22%] px-4 py-3 text-left font-medium">Project</th>
                <th className="w-[8%] px-4 py-3 text-right font-medium">Saved</th>
                <th className="w-[8%] px-4 py-3 text-right font-medium">Duration</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.recent.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-8 text-center text-text-muted">No recent RTK events.</td></tr>
              ) : data.recent.map((event) => (
                <tr key={event.sourceId} className="hover:bg-bg-subtle/20">
                  <td className="px-6 py-3 whitespace-nowrap text-text-secondary">{formatTime(event.createdAt)}</td>
                  <td className="px-4 py-3">
                    <div className="truncate font-mono text-xs text-text-secondary" title={event.machineId}>{event.machineId}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="truncate font-mono text-xs text-text-primary" title={event.command || "unknown"}>{event.command || "unknown"}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="truncate text-text-secondary" title={event.projectPath || ""}>{event.projectPath || "-"}</div>
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-green-500">{formatTokens(event.savedTokens)}</td>
                  <td className="px-4 py-3 text-right text-text-secondary">{formatDuration(event.execTimeMs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
      </Card>
    </div>
  );
}
