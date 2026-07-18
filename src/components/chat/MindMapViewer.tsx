'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  GitBranch, ZoomIn, ZoomOut, RotateCcw, Sparkles,
  Loader2, BookOpen, Target,
  Maximize2, Download, Minimize2, ImageIcon, Palette,
  Zap, Upload, X, Languages, ChevronLeft,
  PlusCircle,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────
interface MindMapNode {
  id: string;
  text: string;
  children: MindMapNode[];
  color?: string;
}

interface MindMapResult {
  mindmap: MindMapNode;
  summary: string;
  isFallback?: boolean;
  language?: 'ar' | 'en';
  hasContentSource?: boolean; // True when generated from uploaded content
}

interface MindMapViewerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTopic?: string;
}

// ─── SVG Layout Constants ─────────────────────────────────────────────
const NODE_WIDTH = 150;
const NODE_HEIGHT = 40;
const H_GAP = 60;
const V_GAP = 14;
const ROOT_WIDTH = 190;
const ROOT_HEIGHT = 50;

// ─── Color Themes ─────────────────────────────────────────────────────
const COLOR_THEMES = [
  { name: 'أخضر', primary: '#10b981', secondary: '#6ee7b7' },
  { name: 'برتقالي', primary: '#f97316', secondary: '#fdba74' },
  { name: 'بنفسجي', primary: '#8b5cf6', secondary: '#c4b5fd' },
  { name: 'أحمر', primary: '#ef4444', secondary: '#fca5a5' },
  { name: 'أزرق سماوي', primary: '#06b6d4', secondary: '#67e8f9' },
  { name: 'وردي', primary: '#ec4899', secondary: '#f9a8d4' },
  { name: 'أصفر', primary: '#eab308', secondary: '#fde047' },
  { name: 'أزرق نيلي', primary: '#6366f1', secondary: '#a5b4fc' },
];

// ─── Layout Computation ───────────────────────────────────────────────
interface LayoutNode {
  node: MindMapNode;
  x: number;
  y: number;
  width: number;
  height: number;
  subtreeHeight: number;
  children: LayoutNode[];
}

function truncateText(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1) + '…';
}

function computeSubtreeHeight(node: MindMapNode): number {
  if (!node.children || node.children.length === 0) return NODE_HEIGHT;
  const childrenHeight = node.children.reduce(
    (sum, child) => sum + computeSubtreeHeight(child) + V_GAP,
    -V_GAP
  );
  return Math.max(NODE_HEIGHT, childrenHeight);
}

function layoutNode(
  node: MindMapNode,
  x: number,
  y: number,
  direction: 'left' | 'right'
): LayoutNode {
  const isRoot = node.id === 'root';
  const width = isRoot ? ROOT_WIDTH : NODE_WIDTH;
  const height = isRoot ? ROOT_HEIGHT : NODE_HEIGHT;
  const subtreeHeight = computeSubtreeHeight(node);

  const layout: LayoutNode = {
    node, x,
    y: y + subtreeHeight / 2 - height / 2,
    width, height, subtreeHeight,
    children: [],
  };

  if (!node.children || node.children.length === 0) return layout;

  let currentY = y;
  for (const child of node.children) {
    const childSubtreeHeight = computeSubtreeHeight(child);
    const childX = direction === 'right'
      ? x + width + H_GAP
      : x - NODE_WIDTH - H_GAP;
    const childLayout = layoutNode(child, childX, currentY, direction);
    layout.children.push(childLayout);
    currentY += childSubtreeHeight + V_GAP;
  }

  return layout;
}

function layoutMindMap(root: MindMapNode) {
  const children = root.children || [];
  const rightChildren = children.slice(0, Math.ceil(children.length / 2));
  const leftChildren = children.slice(Math.ceil(children.length / 2));

  const rightRoot: MindMapNode = { ...root, children: rightChildren, id: 'right-root' };
  const rightLayout = layoutNode(rightRoot, 0, 0, 'right');

  const leftLayouts: LayoutNode[] = [];
  let leftY = 0;
  for (const child of leftChildren) {
    const childSubtreeHeight = computeSubtreeHeight(child);
    const childLayout = layoutNode(child, -NODE_WIDTH - H_GAP, leftY, 'left');
    leftLayouts.push(childLayout);
    leftY += childSubtreeHeight + V_GAP;
  }

  const rightHeight = computeSubtreeHeight(rightRoot);
  const leftHeight = leftChildren.reduce(
    (sum, c) => sum + computeSubtreeHeight(c) + V_GAP, -V_GAP
  );
  const totalHeight = Math.max(rightHeight, leftHeight);

  return {
    rightNodes: rightLayout,
    leftNodes: leftLayouts,
    totalWidth: 1400,
    totalHeight: totalHeight + 120,
  };
}

// ─── Count all nodes in tree ─────────────────────────────────────────
function countNodes(node: MindMapNode): number {
  let count = 1;
  if (node.children) {
    for (const child of node.children) {
      count += countNodes(child);
    }
  }
  return count;
}

// ─── Recursive SVG Node Renderer ──────────────────────────────────────
function MindMapSVGNode({
  layoutNode,
  direction,
  centerX,
  colorTheme,
  onNodeClick,
  onExpandNode,
  expandingNodeId,
}: {
  layoutNode: LayoutNode;
  direction: 'left' | 'right';
  centerX: number;
  colorTheme: { primary: string; secondary: string };
  onNodeClick: (node: MindMapNode) => void;
  onExpandNode: (node: MindMapNode) => void;
  expandingNodeId: string | null;
}) {
  const { node, x, y, width, height, children } = layoutNode;
  const isRoot = node.id === 'root' || node.id === 'right-root';
  const color = node.color || colorTheme.primary;
  const isExpanding = expandingNodeId === node.id;
  const hasChildren = children.length > 0;

  return (
    <g>
      {/* Connection lines to children */}
      {children.map((child, idx) => {
        const lineColor = child.node.color || color;
        const startX = direction === 'right' ? x + width : x;
        const startY = y + height / 2;
        const endX = direction === 'right' ? child.x : child.x + child.width;
        const endY = child.y + child.height / 2;
        const midX = (startX + endX) / 2;

        return (
          <path
            key={`line-${child.node.id}-${idx}`}
            d={`M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`}
            fill="none"
            stroke={lineColor}
            strokeWidth="2"
            opacity="0.4"
          />
        );
      })}

      {/* Node */}
      {isRoot ? (
        <g>
          <rect x={centerX - width / 2} y={y} width={width} height={height} rx={26} ry={26} fill={color} opacity="0.15" />
          <rect x={centerX - width / 2} y={y} width={width} height={height} rx={26} ry={26} fill="none" stroke={color} strokeWidth="3" />
          <text x={centerX} y={y + height / 2} textAnchor="middle" dominantBaseline="central" fill={color} fontSize="16" fontWeight="bold" fontFamily="system-ui, -apple-system, sans-serif">
            {truncateText(node.text, 30)}
          </text>
        </g>
      ) : (
        <g onClick={() => onNodeClick(node)} style={{ cursor: 'pointer' }}>
          <rect x={x} y={y} width={width} height={height} rx={14} ry={14} fill={color} opacity="0.1" />
          <rect x={x} y={y} width={width} height={height} rx={14} ry={14} fill="none" stroke={color} strokeWidth="1.5" />
          <text x={x + width / 2} y={y + height / 2} textAnchor="middle" dominantBaseline="central" fill={color} fontSize="12" fontWeight="600" fontFamily="system-ui, -apple-system, sans-serif">
            {truncateText(node.text, 22)}
          </text>
          {/* Expand button for leaf nodes (no children) */}
          {!hasChildren && (
            <g
              onClick={(e) => { e.stopPropagation(); onExpandNode(node); }}
              style={{ cursor: 'pointer' }}
            >
              <circle
                cx={direction === 'right' ? x + width + 10 : x - 10}
                cy={y + height / 2}
                r="8"
                fill={isExpanding ? '#fbbf24' : color}
                opacity="0.3"
              />
              <circle
                cx={direction === 'right' ? x + width + 10 : x - 10}
                cy={y + height / 2}
                r="8"
                fill="none"
                stroke={color}
                strokeWidth="1"
              />
              {isExpanding ? (
                <g transform={`translate(${direction === 'right' ? x + width + 10 : x - 10}, ${y + height / 2})`}>
                  <circle r="4" fill="none" stroke={color} strokeWidth="1.5" strokeDasharray="2 2">
                    <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="1s" repeatCount="indefinite" />
                  </circle>
                </g>
              ) : (
                <text
                  x={direction === 'right' ? x + width + 10 : x - 10}
                  y={y + height / 2}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill={color}
                  fontSize="12"
                  fontWeight="bold"
                >
                  +
                </text>
              )}
            </g>
          )}
        </g>
      )}

      {/* Recurse children */}
      {children.map((child, idx) => (
        <MindMapSVGNode
          key={child.node.id + idx}
          layoutNode={child}
          direction={direction}
          centerX={centerX}
          colorTheme={colorTheme}
          onNodeClick={onNodeClick}
          onExpandNode={onExpandNode}
          expandingNodeId={expandingNodeId}
        />
      ))}
    </g>
  );
}

// ─── SVG Mind Map Display ─────────────────────────────────────────────
function MindMapDisplay({
  data,
  colorTheme,
  onExpandNode,
  expandingNodeId,
}: {
  data: MindMapResult;
  colorTheme: { primary: string; secondary: string };
  onExpandNode: (node: MindMapNode) => void;
  expandingNodeId: string | null;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedNode, setSelectedNode] = useState<MindMapNode | null>(null);

  const layoutResult = useMemo(() => {
    try {
      return layoutMindMap(data.mindmap);
    } catch {
      return {
        rightNodes: { node: data.mindmap, x: 600, y: 200, width: ROOT_WIDTH, height: ROOT_HEIGHT, subtreeHeight: ROOT_HEIGHT, children: [] },
        leftNodes: [],
        totalWidth: 1400,
        totalHeight: 400,
      };
    }
  }, [data.mindmap]);

  const { rightNodes, leftNodes, totalHeight } = layoutResult;
  const centerX = 600;
  const svgWidth = 1200;
  const svgHeight = Math.max(totalHeight, 500);
  const viewBox = `${-zoom * 50 + pan.x} ${-zoom * 50 + pan.y} ${svgWidth * zoom} ${svgHeight * zoom}`;

  const handleZoomIn = () => setZoom((z) => Math.min(z + 0.2, 3));
  const handleZoomOut = () => setZoom((z) => Math.max(z - 0.2, 0.3));
  const handleReset = () => { setZoom(1); setPan({ x: 0, y: 0 }); };

  // ─── Mouse drag ──────────────────────────────────────────────────
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  };
  const handleMouseUp = () => setIsDragging(false);

  // ─── Touch drag for mobile ───────────────────────────────────────
  const [touchStart, setTouchStart] = useState<{ x: number; y: number; panX: number; panY: number } | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    setTouchStart({ x: touch.clientX, y: touch.clientY, panX: pan.x, panY: pan.y });
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStart || e.touches.length !== 1) return;
    const touch = e.touches[0];
    const dx = touch.clientX - touchStart.x;
    const dy = touch.clientY - touchStart.y;
    setPan({ x: touchStart.panX + dx, y: touchStart.panY + dy });
  };

  const handleTouchEnd = () => {
    setTouchStart(null);
    setIsDragging(false);
  };

  // ─── Wheel zoom ──────────────────────────────────────────────────
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.08 : 0.08;
    setZoom((z) => Math.max(0.3, Math.min(3, z + delta)));
  };

  const handleNodeClick = useCallback((node: MindMapNode) => {
    setSelectedNode((prev) => prev?.id === node.id ? null : node);
  }, []);

  const handleDownloadSVG = () => {
    if (!svgRef.current) return;
    const svgData = new XMLSerializer().serializeToString(svgRef.current);
    const blob = new Blob([svgData], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mindmap-${data.mindmap.text.slice(0, 20)}.svg`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('تم تحميل الخريطة الذهنية كـ SVG');
  };

  const handleExportPNG = useCallback(() => {
    const svgElement = svgRef.current;
    if (!svgElement) return;
    const svgData = new XMLSerializer().serializeToString(svgElement);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
      canvas.width = img.width * 2;
      canvas.height = img.height * 2;
      if (ctx) {
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      }
      const pngUrl = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = pngUrl;
      a.download = `mindmap-${Date.now()}.png`;
      a.click();
      toast.success('تم تحميل الخريطة الذهنية كـ PNG');
    };
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  }, []);

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!isFullscreen) containerRef.current.requestFullscreen?.();
    else document.exitFullscreen?.();
  };

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  const nodeCount = useMemo(() => countNodes(data.mindmap), [data.mindmap]);

  return (
    <div className="space-y-3">
      {/* Fallback notice */}
      {data.isFallback && (
        <div className="p-2.5 rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800">
          <p className="text-[11px] text-blue-700 dark:text-blue-300">
            ⚠️ خريطة ذهنية أساسية — يمكنك الضغط على + بجانب أي فرع لتوسيعه بالذكاء الاصطناعي
          </p>
        </div>
      )}

      {/* Content-only mode badge - only when content was provided */}
      {data.hasContentSource && !data.isFallback && (
        <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800">
          <p className="text-[10px] text-blue-700 dark:text-blue-300 flex items-center gap-1">
            🔒 ملتزم بالمحتوى المرفق فقط — لا معلومات من الخارج • اضغط + لتوسيع أي فرع بالتفاصيل من المحتوى
          </p>
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" onClick={handleZoomIn} className="size-8" aria-label="تكبير"><ZoomIn className="size-4" /></Button>
          <Button variant="outline" size="icon" onClick={handleZoomOut} className="size-8" aria-label="تصغير"><ZoomOut className="size-4" /></Button>
          <Button variant="outline" size="icon" onClick={handleReset} className="size-8" aria-label="إعادة ضبط"><RotateCcw className="size-4" /></Button>
          <Badge variant="outline" className="text-[10px] font-mono">{Math.round(zoom * 100)}%</Badge>
          <Badge variant="secondary" className="text-[10px]">{nodeCount} عقدة</Badge>
          {data.language && (
            <Badge variant="outline" className="text-[10px] gap-1">
              <Languages className="size-3" />
              {data.language === 'ar' ? 'عربي' : 'English'}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" onClick={toggleFullscreen} className="size-8" aria-label="ملء الشاشة">
            {isFullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportPNG} className="h-8 gap-1 text-xs"><ImageIcon className="size-3.5" /> PNG</Button>
          <Button variant="outline" size="icon" onClick={handleDownloadSVG} className="size-8" aria-label="SVG"><Download className="size-4" /></Button>
        </div>
      </div>

      {/* SVG Canvas */}
      <div
        ref={containerRef}
        className="relative border border-border rounded-xl bg-gradient-to-b from-blue-50 to-background dark:from-blue-950 dark:to-background overflow-hidden"
        style={{ height: isFullscreen ? '100vh' : '420px' }}
      >
        <svg
          ref={svgRef}
          width="100%"
          height="100%"
          viewBox={viewBox}
          className="select-none"
          style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onWheel={handleWheel}
        >
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="currentColor" strokeWidth="0.5" opacity="0.05" />
            </pattern>
          </defs>
          <rect width={svgWidth * 3} height={svgHeight * 3} x={-svgWidth} y={-svgHeight} fill="url(#grid)" />

          <MindMapSVGNode
            layoutNode={rightNodes}
            direction="right"
            centerX={centerX}
            colorTheme={colorTheme}
            onNodeClick={handleNodeClick}
            onExpandNode={onExpandNode}
            expandingNodeId={expandingNodeId}
          />

          {leftNodes.map((leftLayout, idx) => (
            <MindMapSVGNode
              key={`left-${idx}`}
              layoutNode={leftLayout}
              direction="left"
              centerX={centerX}
              colorTheme={colorTheme}
              onNodeClick={handleNodeClick}
              onExpandNode={onExpandNode}
              expandingNodeId={expandingNodeId}
            />
          ))}
        </svg>

        {/* Hint */}
        {!isFullscreen && (
          <div className="absolute bottom-2 left-2 text-[10px] text-muted-foreground flex items-center gap-1 background px-2 py-1 rounded-md">
            اسحب للتحريك • عجلة للتكبير • اضغط + للتوسيع
          </div>
        )}
      </div>

      {/* Node Detail Panel */}
      <AnimatePresence>
        {selectedNode && (
          <motion.div
            initial={{ opacity: 0, y: 10, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -10, height: 0 }}
            className="overflow-hidden"
          >
            <div className="p-4 rounded-xl muted border border-border">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold">{selectedNode.text}</span>
                <div className="flex items-center gap-1.5">
                  {selectedNode.children.length === 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => { onExpandNode(selectedNode); setSelectedNode(null); }}
                      className="h-7 text-xs gap-1 text-blue-600 border-blue-200 hover:bg-blue-50 dark:text-blue-400 dark:border-blue-800 dark:hover:bg-blue-950"
                    >
                      <PlusCircle className="size-3" />
                      توسيع بالذكاء الاصطناعي
                    </Button>
                  )}
                  <button onClick={() => setSelectedNode(null)} className="size-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" aria-label="إغلاق">✕</button>
                </div>
              </div>
              {selectedNode.children.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {selectedNode.children.map((child, idx) => (
                    <span key={idx} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300" dir="auto">
                      {child.text}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Summary */}
      <div className="p-3 rounded-xl muted border border-border">
        <div className="flex items-center gap-2 mb-1">
          <BookOpen className="size-4 text-blue-500" />
          <span className="text-xs font-semibold text-muted-foreground">ملخص</span>
        </div>
        <p className="text-sm text-foreground leading-relaxed" dir="auto">{data.summary}</p>
      </div>
    </div>
  );
}

// ─── Helper: Add children to a node in the tree ─────────────────────
function addChildrentoNode(root: MindMapNode, nodeId: string, newChildren: MindMapNode[]): MindMapNode {
  if (root.id === nodeId) {
    return { ...root, children: [...root.children, ...newChildren] };
  }
  if (root.children.length > 0) {
    return {
      ...root,
      children: root.children.map(child => addChildrentoNode(child, nodeId, newChildren)),
    };
  }
  return root;
}

// ─── Main Component ───────────────────────────────────────────────────
export function MindMapViewer({ open, onOpenChange, initialTopic }: MindMapViewerProps) {
  const [topic, setTopic] = useState('');
  const [content, setContent] = useState('');
  const [mindmapData, setMindmapData] = useState<MindMapResult | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [colorThemeIdx, setColorThemeIdx] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [expandingNodeId, setExpandingNodeId] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [originalContent, setOriginalContent] = useState<string>(''); // Store content used for generation

  const colorTheme = COLOR_THEMES[colorThemeIdx];
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Set initial topic from props
  useEffect(() => {
    if (initialTopic && open) setTopic(initialTopic);
  }, [initialTopic, open]);

  // Timer
  const startTimer = useCallback(() => {
    setElapsedTime(0);
    timerRef.current = setInterval(() => setElapsedTime((p) => p + 1), 1000);
  }, []);
  const stopTimer = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);
  useEffect(() => { return () => stopTimer(); }, [stopTimer]);

  // ─── Load Demo ─────────────────────────────────────────────────────
  const handleLoadDemo = useCallback(async () => {
    setIsGenerating(true);
    setMindmapData(null);
    setErrorMessage(null);
    startTimer();
    try {
      const response = await fetch('/api/ai/mindmap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: 'demo', demo: true }),
      });
      stopTimer();
      if (!response.ok) throw new Error('فشل في تحميل العينة');
      const data: MindMapResult = await response.json();
      setMindmapData(data);
    } catch (error) {
      stopTimer();
      setErrorMessage(error instanceof Error ? error.message : 'فشل في تحميل العينة');
      toast.error('فشل في تحميل العينة');
    } finally {
      setIsGenerating(false);
    }
  }, [startTimer, stopTimer]);

  // ─── Generate Mind Map ─────────────────────────────────────────────
  const handleGenerate = useCallback(async () => {
    if (!topic.trim()) { toast.error('يرجى إدخال الموضوع'); return; }

    setIsGenerating(true);
    setMindmapData(null);
    setErrorMessage(null);
    startTimer();

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30_000);

    try {
      const response = await fetch('/api/ai/mindmap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: topic.trim(),
          content: content.trim() || undefined,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      stopTimer();

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'فشل في توليد الخريطة الذهنية');
      }

      const data: MindMapResult = await response.json();

      if (!data.mindmap || !data.mindmap.children) {
        throw new Error('الخريطة المولدة غير صالحة');
      }

      // Store the original content so expand node can stick to it
      setOriginalContent(content.trim());
      setMindmapData(data);
      toast.success(data.isFallback ? 'تم إنشاء خريطة أساسية — اضغط + لتوسيع الفروع' : 'تم توليد الخريطة الذهنية بنجاح! 🗺️');
    } catch (error) {
      clearTimeout(timeoutId);
      stopTimer();
      let msg = 'فشل في توليد الخريطة الذهنية';
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          msg = 'انتهت المهلة — جرب "عينة سريعة" أو أعد المحاولة';
        } else if (error.message === 'Failed to fetch') {
          msg = 'فشل الاتصال بالسيرفر';
        } else {
          msg = error.message;
        }
      }
      setErrorMessage(msg);
      toast.error(msg);
    } finally {
      setIsGenerating(false);
    }
  }, [topic, content, startTimer, stopTimer]);

  // ─── Expand Node with AI ───────────────────────────────────────────
  const handleExpandNode = useCallback(async (node: MindMapNode) => {
    if (!mindmapData || expandingNodeId) return;

    setExpandingNodeId(node.id);
    console.log(`[MindMap] Expanding node: ${node.text}`);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20_000);

      const response = await fetch('/api/ai/mindmap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expandNodeId: node.id,
          expandNodeText: node.text,
          expandContext: mindmapData.mindmap.text,
          expandContent: originalContent,  // Pass original content so AI sticks to it
          language: mindmapData.language || 'ar',
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) throw new Error('فشل في توسيع العقدة');

      const data = await response.json();

      if (data.children && data.children.length > 0) {
        setMindmapData(prev => {
          if (!prev) return prev;
          const newMindmap = addChildrentoNode(prev.mindmap, node.id, data.children);
          return { ...prev, mindmap: newMindmap, isFallback: false };
        });
        toast.success(`تم توسيع "${truncateText(node.text, 20)}" — ${data.children.length} فروع جديدة`);
      } else {
        toast.error('لم يتم توليد فروع — جرب مرة أخرى');
      }
    } catch (error) {
      const msg = error instanceof Error && error.name === 'AbortError'
        ? 'انتهت مهلة التوسيع — جرب مرة أخرى'
        : 'فشل في توسيع العقدة';
      toast.error(msg);
    } finally {
      setExpandingNodeId(null);
    }
  }, [mindmapData, expandingNodeId]);

  // ─── File Upload ───────────────────────────────────────────────────
  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error('حجم الملف أكبر من 5 ميجابايت');
      return;
    }

    setFileName(file.name);

    try {
      if (file.type === 'text/plain' || file.name.endsWith('.txt') || file.name.endsWith('.md')) {
        const text = await file.text();
        setContent(prev => prev ? prev + '\n\n' + text : text);
        // Auto-set topic from filename if empty
        if (!topic.trim()) {
          const nameFromfile = file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
          setTopic(nameFromfile);
        }
        toast.success('تم تحميل الملف النصي');
      } else if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch('/api/files/extract-text', {
          method: 'POST',
          body: formData,
        });
        if (res.ok) {
          const data = await res.json();
          setContent(prev => prev ? prev + '\n\n' + data.text : data.text);
          if (!topic.trim()) {
            setTopic(file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '));
          }
          toast.success('تم استخراج النص من PDF');
        } else {
          toast.error('فشل في استخراج النص من PDF');
        }
      } else {
        // Try as text
        const text = await file.text();
        if (text.trim()) {
          setContent(prev => prev ? prev + '\n\n' + text : text);
          if (!topic.trim()) setTopic(file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '));
          toast.success('تم تحميل الملف');
        } else {
          toast.error('نوع الملف غير مدعوم. استخدم TXT أو PDF');
        }
      }
    } catch {
      toast.error('فشل في قراءة الملف');
    }

    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [topic]);

  // ─── Close Handler ────────────────────────────────────────────────
  const handleClose = useCallback((isOpen: boolean) => {
    if (!isOpen) {
      stopTimer();
      setTimeout(() => {
        setMindmapData(null);
        setTopic('');
        setContent('');
        setErrorMessage(null);
        setElapsedTime(0);
        setFileName(null);
        setExpandingNodeId(null);
        setOriginalContent('');
      }, 300);
    }
    onOpenChange(isOpen);
  }, [onOpenChange, stopTimer]);

  const contentLength = content.length;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="sm:max-w-4xl max-h-[90vh] overflow-y-auto"
        dir="rtl"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitBranch className="size-5 text-blue-500" />
            خريطة ذهنية
          </DialogTitle>
          <DialogDescription>
            أنشئ خريطة ذهنية تفاعلية — ارفع ملف أو أدخل موضوع والذكاء الاصطناعي يولدها تلقائياً
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Input Section */}
          {!mindmapData && !isGenerating && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">

              {/* Topic row */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold flex items-center gap-1.5">
                  <Target className="size-3.5 text-blue-500" />
                  الموضوع *
                </Label>
                <Input
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="مثال: Artificial Intelligence, الذكاء الاصطناعي..."
                  dir="auto"
                  className="text-sm h-10"
                />
              </div>

              {/* Content area */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold flex items-center gap-1.5">
                    <BookOpen className="size-3.5 text-blue-500" />
                    محتوى إضافي <span className="text-muted-foreground font-normal">(اختياري — كل ما يكون أطول، الخريطة تكون أشمل)</span>
                  </Label>
                  <div className="flex items-center gap-2">
                    {fileName && (
                      <Badge variant="secondary" className="text-[9px] gap-1">
                        📄 {fileName.slice(0, 18)}
                        <button onClick={() => { setFileName(null); setContent(''); }} className="hover:text-destructive"><X className="size-2.5" /></button>
                      </Badge>
                    )}
                    <span className={cn('text-[10px] font-mono', contentLength > 3000 ? 'text-blue-500' : 'text-muted-foreground')}>
                      {contentLength.toLocaleString()} حرف
                    </span>
                  </div>
                </div>
                <Textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="الصق محتوى عربي أو إنجليزي — اللغة تتحدد تلقائياً... أو ارفع ملف من الأسفل 📎"
                  rows={4}
                  dir="auto"
                  className="text-sm resize-none"
                />
              </div>

              {/* Action buttons */}
              <div className="flex items-end gap-2 flex-wrap">
                {/* Color Theme */}
                <div className="space-y-1.5 flex-shrink-0">
                  <Label className="text-[10px] font-semibold">الألوان</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="h-9 gap-2">
                        <div className="size-4 rounded-full border border-border" style={{ backgroundColor: colorTheme.primary }} />
                        {colorTheme.name}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-2" dir="rtl" align="start">
                      <div className="grid grid-cols-4 gap-2">
                        {COLOR_THEMES.map((theme, idx) => (
                          <button key={idx} onClick={() => setColorThemeIdx(idx)}
                            className={cn('flex flex-col items-center gap-1 p-2 rounded-lg transition-colors', idx === colorThemeIdx ? 'bg-muted ring-2 ring-primary' : 'hover:muted')}
                            aria-label={theme.name}
                          >
                            <div className="flex gap-0.5">
                              <div className="size-4 rounded-full border border-border" style={{ backgroundColor: theme.primary }} />
                              <div className="size-4 rounded-full border border-border" style={{ backgroundColor: theme.secondary }} />
                            </div>
                            <span className="text-[9px] text-muted-foreground">{theme.name}</span>
                          </button>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>

                {/* Upload file */}
                <input ref={fileInputRef} type="file" accept=".txt,.md,.pdf,.doc,.docx" className="hidden" onChange={handleFileUpload} />
                <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} className="h-9 text-xs gap-1.5">
                  <Upload className="size-3.5" />
                  رفع ملف
                </Button>

                {/* Demo */}
                <Button variant="outline" size="sm" onClick={handleLoadDemo} disabled={isGenerating}
                  className="h-9 text-xs gap-1.5 border-blue-300 text-blue-700 dark:border-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950"
                >
                  <Zap className="size-3.5" />
                  عينة سريعة
                </Button>

                {/* Generate */}
                <div className="flex-1" />
                <Button
                  onClick={handleGenerate}
                  disabled={isGenerating || !topic.trim()}
                  className="bg-blue-600 dark:bg-blue-500 hover:bg-blue-700 dark:hover:bg-blue-600 text-white h-9 text-sm font-semibold"
                >
                  <Sparkles className="size-4 ml-2" />
                  توليد تلقائي
                </Button>
              </div>

              {/* Language auto-detect hint */}
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                <Languages className="size-3" />
                اللغة تُحدد تلقائياً حسب المحتوى (عربي / إنجليزي) • العمق وعدد الفروع يتحدد تلقائياً حسب طول المحتوى
                {content.trim().length > 50 && (
                  <Badge variant="outline" className="text-[9px] gap-1 border-blue-300 text-blue-700 dark:border-blue-700 dark:text-blue-400">
                    🔒 الخريطة ستلتزم بالمحتوى المرفق فقط
                  </Badge>
                )}
              </div>
            </motion.div>
          )}

          {/* Loading */}
          <AnimatePresence>
            {isGenerating && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                <div className="border border-blue-200 dark:border-blue-800 rounded-xl p-4 bg-blue-50 dark:bg-blue-950">
                  <div className="flex items-center gap-3">
                    <Loader2 className="size-5 text-blue-500 animate-spin" />
                    <div>
                      <p className="text-sm font-semibold text-blue-700 dark:text-blue-300">جاري إنشاء الخريطة الذهنية</p>
                      <p className="text-xs text-blue-600 dark:text-blue-400">
                        {elapsedTime < 10
                          ? 'يتم تحليل المحتوى وتوليد الفروع تلقائياً...'
                          : 'جاري المعالجة... يمكنك استخدام "عينة سريعة" كبديل'}
                      </p>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px] font-mono text-blue-600">⏱ {elapsedTime}s</Badge>
                    {elapsedTime > 12 && (
                      <Button variant="ghost" size="sm" onClick={handleLoadDemo} className="text-[10px] h-6 text-blue-600">
                        <Zap className="size-3 ml-1" /> عينة بدلاً من ذلك
                      </Button>
                    )}
                  </div>
                  <div className="mt-3 space-y-2">
                    <Skeleton className="h-6 w-3/4" />
                    <div className="flex gap-2">
                      <Skeleton className="h-10 w-20 rounded-lg" />
                      <Skeleton className="h-10 w-20 rounded-lg" />
                      <Skeleton className="h-10 w-20 rounded-lg" />
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Error */}
          <AnimatePresence>
            {errorMessage && !isGenerating && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                className="p-4 rounded-xl bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800"
              >
                <div className="flex items-center gap-3">
                  <div className="size-10 rounded-full bg-red-100 dark:bg-red-900 flex items-center justify-center flex-shrink-0">
                    <X className="size-5 text-red-500" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-red-700 dark:text-red-300">حدث خطأ</p>
                    <p className="text-xs text-red-600 dark:text-red-400">{errorMessage}</p>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Button variant="outline" size="sm" onClick={handleGenerate} className="h-7 gap-1 text-xs border-red-200 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300">
                      <RotateCcw className="size-3" /> إعادة
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleLoadDemo} className="h-7 gap-1 text-xs border-blue-200 text-blue-700 hover:bg-blue-50 dark:border-blue-800 dark:text-blue-300">
                      <Zap className="size-3" /> عينة
                    </Button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Mind Map Display */}
          <AnimatePresence>
            {mindmapData && !isGenerating && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.3 }}>
                <MindMapDisplay
                  key={mindmapData.mindmap.id + '-' + countNodes(mindmapData.mindmap)}
                  data={mindmapData}
                  colorTheme={colorTheme}
                  onExpandNode={handleExpandNode}
                  expandingNodeId={expandingNodeId}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* New mind map button when result is shown */}
          <AnimatePresence>
            {mindmapData && !isGenerating && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setMindmapData(null); setErrorMessage(null); }}
                  className="text-xs gap-1.5"
                >
                  <RotateCcw className="size-3.5" />
                  خريطة جديدة
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </DialogContent>
    </Dialog>
  );
}
