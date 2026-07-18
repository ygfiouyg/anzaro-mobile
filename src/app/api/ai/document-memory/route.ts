import { NextRequest, NextResponse } from "next/server";
import { extractBearerToken, getUserFromToken } from "@/lib/auth";
import { db } from "@/lib/db";
import { extractTextFromPdfBase64 } from "@/lib/pdf-text-extractor";
import { compileFilesToDocument, type CompiledFile } from "@/lib/ai-document-generator";
import { existsSync, mkdirSync, writeFileSync, statSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// ─── Helpers ──────────────────────────────────────────────────────────────

function getOwnerId(user: { id: string } | null, request: NextRequest): string {
  if (user) return user.id;
  // Fallback: use IP-based hash for anonymous users
  const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "anon";
  return `anon_${ip.slice(0, 40)}`;
}

function parseBase64Content(content: string): string {
  if (!content) return "";
  if (content.includes(",")) return content.split(",")[1];
  return content;
}

// ─── POST: upload files → extract → store in DocumentMemory ───────────────

interface UploadBody {
  action: "upload";
  userRequest: string;
  files: Array<{ name: string; content?: string; text?: string; type: string }>;
  language?: string;
}

interface GenerateBody {
  action: "generate";
  memoryId: string;
}

interface FeedbackBody {
  action: "feedback";
  memoryId: string;
  satisfied: boolean;
  feedback?: string;
}

interface ClearBody {
  action: "clear";
  memoryId: string;
}

type Body = UploadBody | GenerateBody | FeedbackBody | ClearBody;

export async function POST(request: NextRequest) {
  try {
    const token = extractBearerToken(request.headers.get("authorization"));
    const user = token ? await getUserFromToken(token) : null;
    const ownerId = getOwnerId(user, request);

    const body = (await request.json()) as Body;

    switch (body.action) {
      case "upload":
        return await handleUpload(body as UploadBody, ownerId);
      case "generate":
        return await handleGenerate(body as GenerateBody, ownerId);
      case "feedback":
        return await handleFeedback(body as FeedbackBody, ownerId);
      case "clear":
        return await handleClear(body as ClearBody, ownerId);
      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }
  } catch (error) {
    console.error("[/api/ai/document-memory] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}

// ─── GET: retrieve current memory state for the user ──────────────────────

export async function GET(request: NextRequest) {
  try {
    const token = extractBearerToken(request.headers.get("authorization"));
    const user = token ? await getUserFromToken(token) : null;
    const ownerId = getOwnerId(user, request);

    const memory = await db.documentMemory.findFirst({
      where: {
        ownerId,
        status: { in: ["uploaded", "analyzing", "generated", "awaiting_feedback", "revising"] },
      },
      orderBy: { updatedAt: "desc" },
    });

    if (!memory) {
      return NextResponse.json({ memory: null });
    }

    return NextResponse.json({
      memory: {
        id: memory.id,
        status: memory.status,
        userRequest: memory.userRequest,
        fileCount: memory.fileCount,
        totalChars: memory.totalChars,
        lastPdfPath: memory.lastPdfPath,
        feedback: memory.feedback,
        language: memory.language,
        createdAt: memory.createdAt,
        updatedAt: memory.updatedAt,
        files: JSON.parse(memory.filesJson).map((f: CompiledFile) => ({
          name: f.name,
          charCount: f.text.length,
          preview: f.text.slice(0, 100),
        })),
      },
    });
  } catch (error) {
    console.error("[/api/ai/document-memory GET] error:", error);
    return NextResponse.json({ error: "Failed to load memory" }, { status: 500 });
  }
}

// ─── Action: upload — extract text from all files, store in DB ────────────

async function handleUpload(body: UploadBody, ownerId: string) {
  const { userRequest, files, language = "ar" } = body;

  if (!userRequest?.trim()) {
    return NextResponse.json({ error: "userRequest is required" }, { status: 400 });
  }
  if (!files || !Array.isArray(files) || files.length === 0) {
    return NextResponse.json({ error: "At least one file is required" }, { status: 400 });
  }
  if (files.length > 15) {
    return NextResponse.json({ error: "Maximum 15 files" }, { status: 400 });
  }

  // Clear any existing active memory for this user (only one active at a time)
  await db.documentMemory.deleteMany({
    where: {
      ownerId,
      status: { in: ["uploaded", "analyzing", "generated", "awaiting_feedback", "revising"] },
    },
  });

  // Extract FULL text from every file
  const compiledFiles: CompiledFile[] = [];
  const errors: string[] = [];

  for (const file of files) {
    try {
      let text = "";
      if (file.text && file.text.length > 10) {
        text = file.text;
      } else if (file.content) {
        const base64Data = parseBase64Content(file.content);
        if (file.type.includes("pdf") || file.name.toLowerCase().endsWith(".pdf")) {
          text = await extractTextFromPdfBase64(base64Data);
        } else if (file.type.startsWith("text/") || file.name.match(/\.(txt|md|csv|json)$/i)) {
          text = Buffer.from(base64Data, "base64").toString("utf-8");
        } else {
          text = Buffer.from(base64Data, "base64").toString("utf-8");
        }
      }
      if (text && text.length > 10) {
        compiledFiles.push({ name: file.name, text });
      } else {
        errors.push(`${file.name}: no text extracted`);
      }
    } catch (e) {
      errors.push(`${file.name}: ${e instanceof Error ? e.message : "extraction failed"}`);
    }
  }

  if (compiledFiles.length === 0) {
    return NextResponse.json(
      { error: "Could not extract text from any file", details: errors },
      { status: 422 }
    );
  }

  const totalChars = compiledFiles.reduce((s, f) => s + f.text.length, 0);

  // Store in DB — this is the PERSISTENT memory
  const memory = await db.documentMemory.create({
    data: {
      ownerId,
      userRequest: userRequest.trim(),
      filesJson: JSON.stringify(compiledFiles),
      fileCount: compiledFiles.length,
      totalChars,
      status: "uploaded",
      language,
    },
  });

  console.log(`[DocumentMemory] Stored ${compiledFiles.length} files (${totalChars} chars) for ${ownerId}. Memory ID: ${memory.id}`);

  return NextResponse.json({
    success: true,
    memoryId: memory.id,
    fileCount: compiledFiles.length,
    totalChars,
    extractionErrors: errors.length > 0 ? errors : undefined,
    status: "uploaded",
    message: `تم حفظ ${compiledFiles.length} ملف في ذاكرة النظام. المحتوى جاهز للتحليل والتوليد.`,
  });
}

// ─── Action: generate — compile files into PDF (reads from memory) ─────────

async function handleGenerate(body: GenerateBody, ownerId: string) {
  const { memoryId } = body;

  const memory = await db.documentMemory.findUnique({ where: { id: memoryId } });
  if (!memory || memory.ownerId !== ownerId) {
    return NextResponse.json({ error: "Memory not found" }, { status: 404 });
  }

  // Update status to analyzing
  await db.documentMemory.update({
    where: { id: memoryId },
    data: { status: "analyzing" },
  });

  const files: CompiledFile[] = JSON.parse(memory.filesJson);

  // Use the SAME compileFilesToDocument function — it reads ALL file content
  // and generates a unique PDF. The model has access to every word.
  const result = await compileFilesToDocument({
    userRequest: memory.userRequest + (memory.feedback ? `\n\nملاحظات المستخدم للمراجعة: ${memory.feedback}` : ""),
    files,
    language: memory.language as "ar" | "en",
  });

  if (!result.success || !result.filePath) {
    await db.documentMemory.update({
      where: { id: memoryId },
      data: { status: "uploaded" },
    });
    return NextResponse.json(
      { error: result.error || "Generation failed" },
      { status: 500 }
    );
  }

  // Save PDF path to a servable location
  const downloadDir = join(process.cwd(), "download");
  if (!existsSync(downloadDir)) mkdirSync(downloadDir, { recursive: true });
  const fileName = result.filePath.split("/").pop() || `${randomUUID()}.pdf`;
  const serveUrl = `/api/pdf/serve/${fileName}`;

  // Update memory: PDF generated, awaiting feedback
  await db.documentMemory.update({
    where: { id: memoryId },
    data: {
      status: "awaiting_feedback",
      lastPdfPath: result.filePath,
      feedback: null,
    },
  });

  console.log(`[DocumentMemory] PDF generated for ${memoryId}. Status: awaiting_feedback.`);

  return NextResponse.json({
    success: true,
    fileUrl: serveUrl,
    fileName,
    fileSize: result.fileSize,
    durationMs: result.durationMs,
    status: "awaiting_feedback",
    message: "تم إنشاء الملف. المحتوى لا يزال محفوظاً في الذاكرة — هل النتيجة مناسبة لك؟",
  });
}

// ─── Action: feedback — user says satisfied or wants revision ──────────────

async function handleFeedback(body: FeedbackBody, ownerId: string) {
  const { memoryId, satisfied, feedback } = body;

  const memory = await db.documentMemory.findUnique({ where: { id: memoryId } });
  if (!memory || memory.ownerId !== ownerId) {
    return NextResponse.json({ error: "Memory not found" }, { status: 404 });
  }

  if (satisfied) {
    // User is happy → clear the memory
    await db.documentMemory.update({
      where: { id: memoryId },
      data: { status: "satisfied", feedback: null },
    });
    // Delete the memory record (content no longer needed)
    await db.documentMemory.delete({ where: { id: memoryId } });

    console.log(`[DocumentMemory] ${memoryId}: user satisfied. Memory cleared.`);
    return NextResponse.json({
      success: true,
      status: "satisfied",
      message: "تم مسح الذاكرة. شكراً لاستخدامك النظام!",
    });
  } else {
    // User wants revision → store feedback, set status to revising
    await db.documentMemory.update({
      where: { id: memoryId },
      data: {
        status: "revising",
        feedback: feedback || "يرجى إعادة العمل مع تحسينات",
      },
    });

    console.log(`[DocumentMemory] ${memoryId}: user wants revision. Feedback: ${feedback?.slice(0, 80)}`);
    return NextResponse.json({
      success: true,
      status: "revising",
      message: "تم حفظ ملاحظاتك. المحتوى لا يزال في الذاكرة. اضغط \"إعادة التوليد\" لتوليد نسخة جديدة بالتعديلات.",
      feedback,
    });
  }
}

// ─── Action: clear — manually clear memory ────────────────────────────────

async function handleClear(body: ClearBody, ownerId: string) {
  const { memoryId } = body;

  const memory = await db.documentMemory.findUnique({ where: { id: memoryId } });
  if (!memory || memory.ownerId !== ownerId) {
    return NextResponse.json({ error: "Memory not found" }, { status: 404 });
  }

  await db.documentMemory.delete({ where: { id: memoryId } });

  console.log(`[DocumentMemory] ${memoryId}: manually cleared.`);
  return NextResponse.json({
    success: true,
    message: "تم مسح الذاكرة.",
  });
}
