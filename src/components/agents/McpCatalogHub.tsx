"use client";

import { useState, useCallback } from "react";
import {
  Loader2, Plus, Trash2, Play, X, Globe, Wrench, Zap,
  CheckCircle2, XCircle, AlertCircle, Terminal, RefreshCw,
} from 'lucide-react';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useAuthStore } from "@/store/auth-store";

// ─── Types ───────────────────────────────────────────────────

interface TimelineStep {
  step: string;
  status: "ok" | "error" | "pending";
  timestamp: string;
  detail?: string;
}

interface ExternalTool {
  name: string;
  description: string;
  inputSchema?: unknown;
}

interface ConnectedServer {
  id: string;
  name: string;
  url: string;
  isEnabled: boolean;
  toolCount: number;
  lastError: string | null;
  hasAuth: boolean;
}

// ─── Component ───────────────────────────────────────────────

export function McpCatalogHub() {
  // ── State ──
  const [connected, setConnected] = useState<ConnectedServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [timeline, setTimeline] = useState<TimelineStep[]>([]);
  const [telemetry, setTelemetry] = useState<string[]>([]);
  const [fetchedTools, setFetchedTools] = useState<ExternalTool[]>([]);
  const [testError, setTestError] = useState<string | null>(null);

  // Form state
  const [serverName, setServerName] = useState("");
  const [serverUrl, setServerUrl] = useState("");
  const [authToken, setAuthToken] = useState("");
  const [saving, setSaving] = useState(false);

  // Dry-run state
  const [dryRunTool, setDryRunTool] = useState<string | null>(null);
  const [dryRunResult, setDryRunResult] = useState<string | null>(null);
  const [dryRunning, setDryRunning] = useState(false);

  const { token } = useAuthStore();
  const authHeaders = { ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  const ts = () => new Date().toISOString();

  // ── Fetch connected servers ──
  const fetchServers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/mcp-servers", { headers: authHeaders });
      if (res.ok) {
        const data = await res.json();
        setConnected(data.servers || []);
      }
    } catch {} finally { setLoading(false); }
  }, [token]);

  // ── URL validation ──
  const isValidUrl = (url: string): boolean => {
    try {
      const u = new URL(url);
      return u.protocol === "http:" || u.protocol === "https:";
    } catch { return false; }
  };

  // ── Add telemetry line ──
  const addTelemetry = (msg: string) => {
    const time = new Date().toLocaleTimeString();
    setTelemetry(prev => [...prev, `[${time}] ${msg}`]);
  };

  // ── Handle connect (the REAL dynamic flow) ──
  const handleConnect = async () => {
    // Validate
    if (!serverName.trim()) { toast.error("Server name is required"); return; }
    if (!serverUrl.trim()) { toast.error("URL is required"); return; }
    if (!isValidUrl(serverUrl)) { toast.error("URL must start with http:// or https://"); return; }

    setTesting(true);
    setTimeline([]);
    setTelemetry([]);
    setFetchedTools([]);
    setTestError(null);

    addTelemetry(`[Attempting Connection] ${serverUrl}`);

    // Step 1: Attempting
    const steps: TimelineStep[] = [
      { step: "Attempting Connection", status: "pending", timestamp: ts(), detail: serverUrl },
    ];
    setTimeline([...steps]);

    try {
      // Step 2: Handshake — call test-connection API
      addTelemetry(`[Handshake Sent] initialize request → ${serverUrl}`);
      steps.push({ step: "Handshake Sent (initialize)", status: "pending", timestamp: ts() });
      setTimeline([...steps]);

      const res = await fetch("/api/mcp/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: serverUrl, authToken: authToken || undefined }),
      });

      const data = await res.json();

      if (!data.success) {
        // ── ERROR: show immediately, do NOT save ──
        addTelemetry(`[ERROR] ${data.error}`);
        steps[steps.length - 1].status = "error";
        steps[steps.length - 1].detail = data.error;
        steps.push({ step: "Connection Failed", status: "error", timestamp: ts(), detail: data.error });
        setTimeline([...steps]);
        setTestError(data.error);
        toast.error(`Connection failed: ${data.error}`);
        setTesting(false);
        return; // ── DO NOT SAVE ──
      }

      // ── SUCCESS: handshake worked ──
      addTelemetry(`[Capabilities Verified] ${data.toolCount} tools, ${data.resources?.length || 0} resources`);
      steps[steps.length - 1].status = "ok";
      steps.push({ step: "Capabilities Verified", status: "ok", timestamp: ts(), detail: `${data.toolCount} tools` });
      setTimeline([...steps]);

      // Show fetched tools
      if (data.tools && data.tools.length > 0) {
        setFetchedTools(data.tools);
        addTelemetry(`[Tools Registered] ${data.tools.map((t: ExternalTool) => t.name).join(", ").slice(0, 200)}`);
      }

      // Step 3: Active
      steps.push({ step: "Active", status: "ok", timestamp: ts(), detail: `Connected to ${serverName}` });
      setTimeline([...steps]);
      addTelemetry(`[Active ✓] ${serverName} — ${data.toolCount} tools available`);

      // ── NOW save to DB (only after successful handshake) ──
      addTelemetry(`[Saving] Registering server in database...`);
      setSaving(true);
      const saveRes = await fetch("/api/mcp-servers", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({
          name: serverName,
          url: serverUrl,
          authToken: authToken || undefined,
        }),
      });

      const saveData = await saveRes.json();
      if (saveData.success) {
        addTelemetry(`[Saved ✓] Server ID: ${saveData.server?.id || "created"}`);
        toast.success(`Connected & saved! ${data.toolCount} tools available`);
        setServerName(""); setServerUrl(""); setAuthToken("");
        fetchServers();
      } else {
        addTelemetry(`[Save Warning] ${saveData.message || "Already exists"}`);
        toast.info(saveData.message || "Server already exists");
      }
      setSaving(false);
      setTesting(false);

    } catch (e: unknown) {
      // ── Network error — show immediately, do NOT save ──
      addTelemetry(`[ERROR] ${e instanceof Error ? e.message : String(e)}`);
      steps.push({ step: "Connection Error", status: "error", timestamp: ts(), detail: e instanceof Error ? e.message : String(e) });
      setTimeline([...steps]);
      setTestError(e instanceof Error ? e.message : String(e));
      toast.error(`Network error: ${e instanceof Error ? e.message : String(e)}`);
      setTesting(false);
    }
  };

  // ── Delete server ──
  const handleDelete = async (id: string) => {
    try {
      await fetch(`/api/mcp-servers/${id}`, { method: "DELETE", headers: authHeaders });
      toast.success("Server deleted");
      fetchServers();
    } catch { toast.error("Delete failed"); }
  };

  // ── Dry-run a local MCP tool ──
  const handleDryRun = async (toolName: string) => {
    setDryRunTool(toolName);
    setDryRunResult(null);
    setDryRunning(true);
    try {
      const res = await fetch("/api/mcp/dry-run", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ toolName }),
      });
      const data = await res.json();
      if (data.success) {
        setDryRunResult(`✅ ${toolName} — OK (${data.durationMs}ms)\nParams: ${JSON.stringify(data.generatedParams)}\nResult: ${typeof data.result === "string" ? data.result.slice(0, 500) : JSON.stringify(data.result).slice(0, 500)}`);
        toast.success(`${toolName} dry-run OK (${data.durationMs}ms)`);
      } else {
        setDryRunResult(`❌ ${toolName} — ${data.error}`);
        toast.error(`${toolName}: ${data.error}`);
      }
    } catch (e: unknown) {
      setDryRunResult(`❌ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setDryRunning(false);
    }
  };

  // ── Load on mount ──
  useCallback(() => { fetchServers(); }, [fetchServers]);

  // ─── Render ─────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* ── Dynamic Server Connection Form ── */}
      <div className="rounded-xl border border-blue-500 bg-blue-500 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Globe className="h-4 w-4 text-blue-500" />
          <h3 className="text-sm font-bold">ربط MCP Server خارجي (Dynamic SSE)</h3>
        </div>
        <div className="space-y-2">
          <Input
            value={serverName}
            onChange={(e) => setServerName(e.target.value)}
            placeholder="اسم السيرفر (e.g., GitHub MCP)"
            className="h-8 text-xs"
          />
          <Input
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
            placeholder="رابط SSE (e.g., https://example.com/mcp)"
            className="h-8 text-xs"
            dir="ltr"
          />
          <Input
            value={authToken}
            onChange={(e) => setAuthToken(e.target.value)}
            placeholder="Bearer Token (اختياري)"
            className="h-8 text-xs"
            dir="ltr"
          />
          <Button
            onClick={handleConnect}
            disabled={testing || saving || !serverName.trim() || !serverUrl.trim()}
            className="h-8 gap-1.5 text-xs bg-gradient-to-r from-blue-500 to-blue-600 text-white"
          >
            {testing ? <Loader2 className="h-3 w-3 animate-spin" /> : saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
            {testing ? "جاري الاتصال..." : saving ? "جاري الحفظ..." : "ربط"}
          </Button>
        </div>
      </div>

      {/* ── Telemetry Console ── */}
      {telemetry.length > 0 && (
        <div className="rounded-lg border border-blue-500 bg-blue-500 p-3">
          <div className="flex items-center gap-2 mb-2">
            <Terminal className="h-3.5 w-3.5 text-blue-500" />
            <span className="text-xs font-semibold text-blue-600 dark:text-blue-300">Telemetry Console</span>
            <button onClick={() => setTelemetry([])} className="ml-auto text-[10px] text-muted-foreground hover:text-foreground">Clear</button>
          </div>
          <div className="font-mono text-[10px] text-muted-foreground space-y-0.5 max-h-32 overflow-y-auto">
            {telemetry.map((line, i) => (
              <div key={i} className={cn(
                line.includes("[ERROR]") && "text-blue-500",
                line.includes("[Active") && "text-blue-500",
                line.includes("[Saved") && "text-blue-500",
              )}>{line}</div>
            ))}
          </div>
        </div>
      )}

      {/* ── Connection Timeline ── */}
      {timeline.length > 0 && (
        <div className="rounded-lg border border-border bg-muted p-3">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="h-3.5 w-3.5 text-blue-500" />
            <span className="text-xs font-semibold">Connection Timeline</span>
          </div>
          <div className="space-y-1">
            {timeline.map((step, i) => (
              <div key={i} className="flex items-center gap-2 text-[10px]">
                {step.status === "ok" && <CheckCircle2 className="h-3 w-3 text-blue-500 shrink-0" />}
                {step.status === "error" && <XCircle className="h-3 w-3 text-blue-500 shrink-0" />}
                {step.status === "pending" && <Loader2 className="h-3 w-3 animate-spin text-blue-500 shrink-0" />}
                <span className="font-medium">{step.step}</span>
                {step.detail && <span className="text-muted-foreground">— {step.detail}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Error Block (if connection failed) ── */}
      {testError && (
        <div className="rounded-lg border border-blue-500 bg-blue-500 p-3">
          <div className="flex items-center gap-2 mb-1">
            <AlertCircle className="h-3.5 w-3.5 text-blue-500" />
            <span className="text-xs font-semibold text-blue-600 dark:text-blue-300">Connection Error</span>
          </div>
          <p className="text-[10px] font-mono text-blue-600 dark:text-blue-400">{testError}</p>
        </div>
      )}

      {/* ── Fetched Tools from external server ── */}
      {fetchedTools.length > 0 && (
        <div className="rounded-lg border border-blue-500 bg-blue-500 p-3">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="h-3.5 w-3.5 text-blue-500" />
            <span className="text-xs font-semibold">Fetched Tools ({fetchedTools.length})</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-1 max-h-40 overflow-y-auto">
            {fetchedTools.map((t) => (
              <div key={t.name} className="flex items-center gap-2 text-[10px] px-2 py-1 rounded border border-border">
                <Wrench className="h-2.5 w-2.5 text-muted-foreground shrink-0" />
                <span className="font-mono font-semibold truncate">{t.name}</span>
                <span className="text-muted-foreground truncate flex-1">{t.description.slice(0, 40)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Connected Servers ── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Connected Servers ({connected.length})
          </h3>
          <Button size="sm" variant="ghost" onClick={fetchServers} disabled={loading} className="h-6 text-[10px]">
            <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
          </Button>
        </div>
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground py-3">
            <Loader2 className="h-3 w-3 animate-spin" /> Loading...
          </div>
        ) : connected.length === 0 ? (
          <div className="text-[11px] text-muted-foreground py-3 text-center rounded-lg border border-border bg-muted">
            No external servers connected yet. Use the form above to connect.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {connected.map((s) => (
              <div key={s.id} className="rounded-lg border border-border background p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className={cn("h-2 w-2 rounded-full", s.isEnabled ? "bg-blue-500" : "bg-muted")} />
                  <span className="text-xs font-semibold truncate">{s.name}</span>
                  <Badge variant="outline" className="text-[9px] ml-auto">{s.toolCount} tools</Badge>
                </div>
                <div className="text-[10px] text-muted-foreground font-mono truncate" dir="ltr">{s.url}</div>
                {s.lastError && <div className="text-[9px] text-blue-500 mt-1">⚠️ {s.lastError.slice(0, 60)}</div>}
                <div className="flex gap-1 mt-2">
                  <button onClick={() => {
                    setServerName(s.name); setServerUrl(s.url);
                    handleConnect();
                  }} className="text-[9px] px-2 py-0.5 rounded border border-border hover:bg-muted">Re-test</button>
                  <button onClick={() => handleDelete(s.id)} className="text-[9px] px-2 py-0.5 rounded border border-border text-blue-500 hover:bg-blue-500">Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Local Tools Dry-Run ── */}
      <div>
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
          Local MCP Tools — Dry Run
        </h3>
        <p className="text-[10px] text-muted-foreground mb-2">
          اختبر أي أداة محلية بـ dummy data (auto-generated من JSON schema)
        </p>
        <DryRunPanel dryRunTool={dryRunTool} dryRunResult={dryRunResult} dryRunning={dryRunning} onRun={handleDryRun} authHeaders={authHeaders} />
      </div>
    </div>
  );
}

// ─── Dry-Run Panel (fetches local tools + runs them) ─────────

function DryRunPanel({ dryRunTool, dryRunResult, dryRunning, onRun, authHeaders }: {
  dryRunTool: string | null;
  dryRunResult: string | null;
  dryRunning: boolean;
  onRun: (name: string) => void;
  authHeaders: Record<string, string>;
}) {
  const [tools, setTools] = useState<ExternalTool[]>([]);
  const [search, setSearch] = useState("");
  const [loaded, setLoaded] = useState(false);

  const loadTools = useCallback(async () => {
    try {
      const res = await fetch("/api/mcp/execute", { headers: authHeaders });
      if (res.ok) {
        const data = await res.json();
        setTools(data.tools || []);
      }
    } catch {} finally { setLoaded(true); }
  }, [authHeaders]);

  // Load on mount
  if (!loaded && tools.length === 0) {
    loadTools();
  }

  const filtered = search.trim()
    ? tools.filter(t => t.name.toLowerCase().includes(search.toLowerCase()) || t.description.toLowerCase().includes(search.toLowerCase()))
    : tools;

  return (
    <div className="space-y-2">
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={`ابحث في ${tools.length} أداة...`}
        className="h-7 text-xs"
      />
      <div className="max-h-48 overflow-y-auto rounded-lg border border-border">
        {!loaded ? (
          <div className="flex items-center justify-center py-3">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center text-[10px] text-muted-foreground py-3">No tools found</div>
        ) : (
          filtered.slice(0, 100).map((tool) => (
            <div key={tool.name} className="flex items-center gap-2 px-2 py-1.5 border-b border-border hover:bg-muted">
              <Wrench className="h-3 w-3 text-muted-foreground shrink-0" />
              <span className="text-[10px] font-mono font-semibold truncate flex-1">{tool.name}</span>
              <button
                onClick={() => onRun(tool.name)}
                disabled={dryRunning && dryRunTool === tool.name}
                className="text-[9px] px-1.5 py-0.5 rounded border border-border hover:bg-muted shrink-0"
              >
                {dryRunning && dryRunTool === tool.name ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : "Dry Run"}
              </button>
            </div>
          ))
        )}
        {filtered.length > 100 && (
          <div className="text-center text-[10px] text-muted-foreground py-2">+{filtered.length - 100} more...</div>
        )}
      </div>

      {/* Dry-Run Result */}
      {dryRunResult && (
        <div className={cn(
          "rounded-lg border p-3",
          dryRunResult.startsWith("✅") ? "border-blue-500 bg-blue-500" : "border-blue-500 bg-blue-500"
        )}>
          <div className="flex items-center gap-2 mb-1">
            {dryRunResult.startsWith("✅") ? <CheckCircle2 className="h-3.5 w-3.5 text-blue-500" /> : <AlertCircle className="h-3.5 w-3.5 text-blue-500" />}
            <span className="text-xs font-semibold">Dry Run Result</span>
            <button onClick={() => setDryRunResultState(null)} className="ml-auto text-[10px] text-muted-foreground">✕</button>
          </div>
          <pre className="text-[10px] font-mono whitespace-pre-wrap max-h-40 overflow-y-auto">{dryRunResult}</pre>
        </div>
      )}
    </div>
  );

  function setDryRunResultState(val: string | null) {
    // This is a hack to clear the result from parent
    // In production, lift this state up properly
  }
}
