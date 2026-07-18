"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Package, Plus, Trash2, Play, RefreshCw, Folder, FileText,
  Github, Globe, Loader2, CheckCircle2, XCircle, Terminal,
  ChevronRight, Download, Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface InstalledTool {
  name: string;
  path: string;
  type: string;
  language?: string;
  installedAt: string | null;
  readme: boolean;
  size: number;
}

interface DirItem {
  name: string;
  type: string;
  size: number;
  path: string;
}

type View = "list" | "install" | "explore" | "run" | "readme";

/**
 * ToolsHub — واجهة إدارة الأدوات الخارجية.
 *
 * تقدر من هنا:
 *   - تثبت أي أداة من GitHub أو PyPI أو npm أو URL مباشر
 *   - تشوف الأدوات المثبتة
 *   - تتصفح ملفات أي أداة
 *   - تشغل أوامر داخل أي أداة
 *   - تقرا الـ README
 */
export function ToolsHub() {
  const [view, setView] = useState<View>("list");
  const [tools, setTools] = useState<InstalledTool[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedTool, setSelectedTool] = useState<string | null>(null);

  // Install form
  const [installUrl, setInstallUrl] = useState("");
  const [installName, setInstallName] = useState("");
  const [installType, setInstallType] = useState<"auto" | "git" | "pip" | "npm" | "fetch">("auto");
  const [installDeps, setInstallDeps] = useState(true);
  const [installing, setInstalling] = useState(false);
  const [installLog, setInstallLog] = useState("");

  // Explore
  const [dirItems, setDirItems] = useState<DirItem[]>([]);
  const [currentPath, setCurrentPath] = useState("");
  const [dirLoading, setDirLoading] = useState(false);

  // Run
  const [runCommand, setRunCommand] = useState("");
  const [runOutput, setRunOutput] = useState<{ stdout: string; stderr: string; error?: string } | null>(null);
  const [running, setRunning] = useState(false);

  // Readme
  const [readmeContent, setReadmeContent] = useState("");

  const fetchTools = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/tools");
      const data = await res.json();
      setTools(data.tools || []);
    } catch (e: any) {
      toast.error("فشل تحميل الأدوات: " + e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTools();
  }, [fetchTools]);

  const handleInstall = async () => {
    if (!installUrl.trim()) {
      toast.error("اكتب URL الأداة");
      return;
    }
    setInstalling(true);
    setInstallLog("");
    try {
      const res = await fetch("/api/admin/tools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "install",
          url: installUrl,
          name: installName || undefined,
          type: installType === "auto" ? undefined : installType,
          installDeps,
        }),
      });
      const data = await res.json();
      if (data.error) {
        toast.error("فشل التثبيت: " + data.error);
        setInstallLog(data.log || "");
      } else {
        toast.success(`تم تثبيت ${data.name} بنجاح!`);
        setInstallLog(data.log || "تم التثبيت");
        setInstallUrl("");
        setInstallName("");
        fetchTools();
        setView("list");
      }
    } catch (e: any) {
      toast.error("خطأ: " + e.message);
    } finally {
      setInstalling(false);
    }
  };

  const handleDelete = async (name: string) => {
    if (!confirm(`هل أنت متأكد من حذف "${name}"؟`)) return;
    try {
      const res = await fetch("/api/admin/tools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", name }),
      });
      const data = await res.json();
      if (data.error) {
        toast.error("فشل الحذف: " + data.error);
      } else {
        toast.success("تم الحذف");
        fetchTools();
      }
    } catch (e: any) {
      toast.error("خطأ: " + e.message);
    }
  };

  const handleExplore = async (name: string, subPath = "") => {
    setSelectedTool(name);
    setView("explore");
    setDirLoading(true);
    setCurrentPath(subPath);
    try {
      const res = await fetch(`/api/admin/tools?action=list-dir&name=${encodeURIComponent(name)}&path=${encodeURIComponent(subPath)}`);
      const data = await res.json();
      setDirItems(data.items || []);
    } catch (e: any) {
      toast.error("خطأ: " + e.message);
    } finally {
      setDirLoading(false);
    }
  };

  const handleReadFile = async (filePath: string) => {
    try {
      const res = await fetch(`/api/admin/tools?action=read&name=${encodeURIComponent(filePath)}`);
      const data = await res.json();
      if (data.error) {
        toast.error(data.error);
      } else {
        // If it's a README, show in readme view; otherwise show in explore
        if (filePath.toLowerCase().includes("readme")) {
          setReadmeContent(data.content);
          setView("readme");
        } else {
          setRunOutput({ stdout: data.content, stderr: "" });
          setView("run");
          setRunCommand("");
        }
      }
    } catch (e: any) {
      toast.error("خطأ: " + e.message);
    }
  };

  const handleShowReadme = async (name: string) => {
    setSelectedTool(name);
    setView("readme");
    setReadmeContent("جاري التحميل...");
    try {
      const res = await fetch(`/api/admin/tools?action=read&name=${encodeURIComponent(name + "/README.md")}`);
      const data = await res.json();
      setReadmeContent(data.error ? "مفيش README.md لهذه الأداة" : data.content);
    } catch (e: any) {
      setReadmeContent("خطأ: " + e.message);
    }
  };

  const handleRun = async () => {
    if (!selectedTool || !runCommand.trim()) return;
    setRunning(true);
    setRunOutput(null);
    try {
      const res = await fetch("/api/admin/tools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "run",
          name: selectedTool,
          command: runCommand,
          timeout: 120000,
        }),
      });
      const data = await res.json();
      setRunOutput({
        stdout: data.stdout || "",
        stderr: data.stderr || "",
        error: data.error,
      });
    } catch (e: any) {
      setRunOutput({ stdout: "", stderr: "", error: e.message });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="flex flex-col h-full" dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border bg-blue-500 px-4 py-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 shadow-md">
          <Package className="h-4.5 w-4.5 text-white" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold">مركز الأدوات</h3>
            <Badge variant="outline" className="text-[10px] gap-1 border-blue-500 text-blue-600 dark:text-blue-300">
              {tools.length} أداة مثبتة
            </Badge>
          </div>
          <p className="text-[11px] text-muted-foreground">ثبّت أي أداة من GitHub / PyPI / npm / URL — تصفحها وشغلها</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => fetchTools()} disabled={loading} className="h-8 text-xs">
          <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
          تحديث
        </Button>
        <Button size="sm" onClick={() => setView("install")} className="h-8 text-xs bg-blue-600 hover:bg-blue-700">
          <Plus className="h-3 w-3" />
          أداة جديدة
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* LIST VIEW */}
        {view === "list" && (
          <div className="space-y-2">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
              </div>
            ) : tools.length === 0 ? (
              <div className="text-center py-12">
                <Package className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground mb-1">مفيش أدوات مثبتة لسه</p>
                <p className="text-xs text-muted-foreground mb-4">ثبّت أول أداة من GitHub أو PyPI أو npm</p>
                <Button size="sm" onClick={() => setView("install")} className="bg-blue-600 hover:bg-blue-700">
                  <Plus className="h-3 w-3" />
                  تثبيت أداة
                </Button>
              </div>
            ) : (
              tools.map((tool) => (
                <div key={tool.name} className="rounded-lg border border-border bg-muted p-3 hover:bg-muted transition-colors">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-lg",
                      tool.type === "python" && "bg-blue-500 text-blue-600 dark:text-blue-300",
                      tool.type === "node" && "bg-blue-500 text-green-600 dark:text-green-300",
                      tool.type === "unknown" && "bg-blue-500 text-slate-600 dark:text-slate-300",
                    )}>
                      {tool.type === "python" ? <Terminal className="h-5 w-5" /> : tool.type === "node" ? <Package className="h-5 w-5" /> : <Package className="h-5 w-5" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-semibold truncate">{tool.name}</h4>
                        <Badge variant="outline" className="text-[9px] h-4 px-1 font-mono uppercase">{tool.type}</Badge>
                        {tool.readme && <Badge variant="outline" className="text-[9px] h-4 px-1 gap-0.5"><FileText className="h-2 w-2" />README</Badge>}
                      </div>
                      <p className="text-[11px] text-muted-foreground font-mono">{tool.path}</p>
                    </div>
                    <div className="text-[10px] text-muted-foreground text-left shrink-0">
                      {tool.size > 0 && <div>{(tool.size / 1024).toFixed(1)} MB</div>}
                      {tool.installedAt && <div>{new Date(tool.installedAt).toLocaleDateString("ar-EG")}</div>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 mt-2 pt-2 border-t border-border">
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => handleExplore(tool.name)}>
                      <Folder className="h-3 w-3" />
                      تصفح
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setSelectedTool(tool.name); setView("run"); setRunCommand(""); setRunOutput(null); }}>
                      <Play className="h-3 w-3" />
                      تشغيل
                    </Button>
                    {tool.readme && (
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => handleShowReadme(tool.name)}>
                        <FileText className="h-3 w-3" />
                        README
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className="h-7 text-xs text-blue-600 hover:text-blue-700 mr-auto" onClick={() => handleDelete(tool.name)}>
                      <Trash2 className="h-3 w-3" />
                      حذف
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* INSTALL VIEW */}
        {view === "install" && (
          <div className="max-w-2xl mx-auto space-y-4">
            <div>
              <h3 className="text-base font-bold mb-1">تثبيت أداة جديدة</h3>
              <p className="text-xs text-muted-foreground">دي أي أداة من GitHub، PyPI، npm، أو أي URL مباشر</p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold mb-1.5 block">رابط الأداة (URL) *</label>
                <Input
                  value={installUrl}
                  onChange={(e) => setInstallUrl(e.target.value)}
                  placeholder="https://github.com/user/repo"
                  className="h-9 text-sm font-mono"
                  dir="ltr"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold mb-1.5 block">اسم الأداة (اختياري)</label>
                  <Input
                    value={installName}
                    onChange={(e) => setInstallName(e.target.value)}
                    placeholder="auto-detected"
                    className="h-9 text-sm font-mono"
                    dir="ltr"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold mb-1.5 block">نوع التثبيت</label>
                  <select
                    value={installType}
                    onChange={(e) => setInstallType(e.target.value as any)}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="auto">تلقائي (مُوصى به)</option>
                    <option value="git">Git Clone</option>
                    <option value="pip">PyPI (pip install)</option>
                    <option value="npm">npm (bun add)</option>
                    <option value="fetch">تنزيل ملف مباشر</option>
                  </select>
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={installDeps}
                  onChange={(e) => setInstallDeps(e.target.checked)}
                  className="h-4 w-4 rounded"
                />
                <span>تثبيت الـ dependencies تلقائياً (package.json / requirements.txt)</span>
              </label>

              <div className="flex gap-2">
                <Button onClick={handleInstall} disabled={installing || !installUrl.trim()} className="bg-blue-600 hover:bg-blue-700">
                  {installing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                  {installing ? "جاري التثبيت..." : "تثبيت"}
                </Button>
                <Button variant="outline" onClick={() => setView("list")}>إلغاء</Button>
              </div>

              {/* Quick examples */}
              <div className="pt-4 border-t border-border">
                <p className="text-xs font-semibold mb-2 text-muted-foreground">أمثلة سريعة:</p>
                <div className="space-y-1.5">
                  {[
                    { label: "PentestGPT (Python)", url: "https://github.com/GreyDGL/PentestGPT", icon: Github },
                    { label: "Lodash (npm)", url: "https://www.npmjs.com/package/lodash", icon: Package },
                    { label: "Requests (PyPI)", url: "https://pypi.org/project/requests/", icon: Terminal },
                    { label: "ملف مباشر", url: "https://raw.githubusercontent.com/user/repo/main/script.py", icon: Globe },
                  ].map((ex) => (
                    <button
                      key={ex.label}
                      onClick={() => { setInstallUrl(ex.url); setInstallType(ex.url.includes("npmjs") ? "npm" : ex.url.includes("pypi") ? "pip" : ex.url.includes("github") ? "git" : "fetch"); }}
                      className="flex items-center gap-2 w-full rounded-md border border-border bg-muted px-3 py-1.5 text-xs hover:bg-accent transition-colors text-right"
                    >
                      <ex.icon className="h-3 w-3 text-muted-foreground shrink-0" />
                      <span className="font-medium">{ex.label}</span>
                      <code className="text-[10px] text-muted-foreground font-mono truncate">{ex.url}</code>
                    </button>
                  ))}
                </div>
              </div>

              {/* Install log */}
              {installLog && (
                <div className="mt-4">
                  <p className="text-xs font-semibold mb-1.5">سجل التثبيت:</p>
                  <pre className="text-[11px] font-mono muted rounded-md p-3 max-h-48 overflow-y-auto whitespace-pre-wrap" dir="ltr">
                    {installLog}
                  </pre>
                </div>
              )}
            </div>
          </div>
        )}

        {/* EXPLORE VIEW */}
        {view === "explore" && selectedTool && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <Folder className="h-4 w-4 text-blue-500" />
              <span className="font-semibold">{selectedTool}</span>
              {currentPath && <span className="text-muted-foreground font-mono text-xs">/{currentPath}</span>}
              <Button size="sm" variant="ghost" className="h-7 text-xs mr-auto" onClick={() => setView("list")}>
                رجوع
              </Button>
            </div>
            {dirLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-blue-500" /></div>
            ) : (
              <div className="rounded-lg border border-border divide-y divide-border">
                {currentPath && (
                  <button
                    onClick={() => {
                      const parts = currentPath.split("/").slice(0, -1);
                      handleExplore(selectedTool, parts.join("/"));
                    }}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-accent text-right"
                  >
                    <ChevronRight className="h-4 w-4 rotate-180" />
                    <span className="text-muted-foreground">..</span>
                  </button>
                )}
                {dirItems.map((item) => (
                  <button
                    key={item.path}
                    onClick={() => {
                      if (item.type === "directory") {
                        handleExplore(selectedTool, item.path.replace(`${selectedTool}/`, ""));
                      } else {
                        handleReadFile(item.path);
                      }
                    }}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-accent text-right"
                  >
                    {item.type === "directory" ? (
                      <Folder className="h-4 w-4 text-blue-500 shrink-0" />
                    ) : (
                      <FileText className="h-4 w-4 text-blue-500 shrink-0" />
                    )}
                    <span className="flex-1 truncate font-mono text-xs">{item.name}</span>
                    {item.size > 0 && <span className="text-[10px] text-muted-foreground">{(item.size / 1024).toFixed(1)}KB</span>}
                  </button>
                ))}
                {dirItems.length === 0 && !dirLoading && (
                  <div className="py-8 text-center text-xs text-muted-foreground">المجلد فارغ</div>
                )}
              </div>
            )}
          </div>
        )}

        {/* RUN VIEW */}
        {view === "run" && selectedTool && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <Terminal className="h-4 w-4 text-blue-500" />
              <span className="font-semibold">تشغيل أمر في: {selectedTool}</span>
              <Button size="sm" variant="ghost" className="h-7 text-xs mr-auto" onClick={() => setView("list")}>رجوع</Button>
            </div>
            <div className="flex gap-2">
              <Input
                value={runCommand}
                onChange={(e) => setRunCommand(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleRun()}
                placeholder="python main.py"
                className="h-9 text-sm font-mono"
                dir="ltr"
              />
              <Button onClick={handleRun} disabled={running || !runCommand.trim()} className="bg-blue-600 hover:bg-blue-700">
                {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                تشغيل
              </Button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {["python --version", "ls -la", "cat README.md", "pip list", "--help"].map((cmd) => (
                <button
                  key={cmd}
                  onClick={() => setRunCommand(cmd)}
                  className="rounded-md border border-border bg-muted px-2 py-1 text-[10px] font-mono hover:bg-accent"
                >
                  {cmd}
                </button>
              ))}
            </div>
            {runOutput && (
              <div className="space-y-2">
                {runOutput.error && (
                  <div className="flex items-center gap-2 rounded-md border border-blue-500 bg-blue-500 px-3 py-2 text-xs text-blue-600 dark:text-blue-300">
                    <XCircle className="h-3.5 w-3.5" />
                    {runOutput.error}
                  </div>
                )}
                {runOutput.stdout && (
                  <div>
                    <p className="text-[10px] font-semibold text-muted-foreground mb-1">STDOUT:</p>
                    <pre className="text-[11px] font-mono muted rounded-md p-3 max-h-72 overflow-y-auto whitespace-pre-wrap" dir="ltr">
                      {runOutput.stdout}
                    </pre>
                  </div>
                )}
                {runOutput.stderr && (
                  <div>
                    <p className="text-[10px] font-semibold text-blue-600 dark:text-blue-300 mb-1">STDERR:</p>
                    <pre className="text-[11px] font-mono bg-blue-500 border border-blue-500 rounded-md p-3 max-h-48 overflow-y-auto whitespace-pre-wrap" dir="ltr">
                      {runOutput.stderr}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* README VIEW */}
        {view === "readme" && selectedTool && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <FileText className="h-4 w-4 text-blue-500" />
              <span className="font-semibold">README.md — {selectedTool}</span>
              <Button size="sm" variant="ghost" className="h-7 text-xs mr-auto" onClick={() => setView("list")}>رجوع</Button>
            </div>
            <pre className="text-[12px] font-mono bg-muted rounded-md p-4 max-h-[500px] overflow-y-auto whitespace-pre-wrap leading-relaxed" dir="ltr">
              {readmeContent}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
