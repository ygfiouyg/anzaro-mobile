import { NextRequest, NextResponse } from "next/server";
import { extractBearerToken, getUserFromToken } from "@/lib/auth";
import { compileFilesToDocument, type CompiledFile } from "@/lib/ai-document-generator";
import { extractTextFromPdfBase64 } from "@/lib/pdf-text-extractor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes for large multi-file compilation

interface InputFile {
  name: string;
  /** base64 data URL or raw base64 (for PDFs/binary) */
  content?: string;
  /** Pre-extracted text (avoids sending large base64 over JSON) */
  text?: string;
  type: string;
}

/**
 * POST /api/ai/compile
 *
 * Body: { userRequest: string, files: [{name, content, type}], language?: 'ar'|'en' }
 *
 * Extracts FULL text from every file, then sends all text + the user's request
 * to the AI in ONE call. The AI understands the request and writes a complete
 * HTML+CSS document, which is rendered to PDF via Playwright.
 *
 * No lossy summarization. No keyword-based system prompts. The AI reads the
 * user's verbatim request and acts on it.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userRequest, files, language = "ar" } = body as {
      userRequest: string;
      files: InputFile[];
      language?: "ar" | "en";
    };

    if (!userRequest?.trim()) {
      return NextResponse.json(
        { error: "userRequest is required" },
        { status: 400 }
      );
    }
    if (!files || !Array.isArray(files) || files.length === 0) {
      return NextResponse.json(
        { error: "At least one file is required" },
        { status: 400 }
      );
    }
    if (files.length > 15) {
      return NextResponse.json(
        { error: "Maximum 15 files per compile request" },
        { status: 400 }
      );
    }

    // Auth (optional — works without login but tracks user if present)
    const token = extractBearerToken(request.headers.get("authorization"));
    const user = token ? await getUserFromToken(token) : null;

    // ── Extract FULL text from every file ──
    const compiledFiles: CompiledFile[] = [];
    const errors: string[] = [];

    for (const file of files) {
      try {
        let text = "";

        // If pre-extracted text is provided, use it directly (avoids large base64)
        if (file.text && file.text.length > 10) {
          text = file.text;
        } else if (file.content) {
          const rawContent = file.content;
          const base64Data = rawContent.includes(",")
            ? rawContent.split(",")[1]
            : rawContent;

          if (file.type.includes("pdf") || file.name.toLowerCase().endsWith(".pdf")) {
            text = await extractTextFromPdfBase64(base64Data);
          } else if (
            file.type.startsWith("text/") ||
            file.name.match(/\.(txt|md|csv|json)$/i)
          ) {
            text = Buffer.from(base64Data, "base64").toString("utf-8");
          } else {
            text = Buffer.from(base64Data, "base64").toString("utf-8");
          }
        }

        if (text && text.length > 10) {
          compiledFiles.push({ name: file.name, text });
        } else {
          errors.push(`${file.name}: no text could be extracted`);
        }
      } catch (e) {
        errors.push(
          `${file.name}: ${e instanceof Error ? e.message : "extraction failed"}`
        );
      }
    }

    if (compiledFiles.length === 0) {
      return NextResponse.json(
        { error: "Could not extract text from any file", details: errors },
        { status: 422 }
      );
    }

    const totalChars = compiledFiles.reduce((s, f) => s + f.text.length, 0);
    console.log(
      `[Compile API] ${compiledFiles.length}/${files.length} files extracted, ${totalChars} chars total. User: ${user?.email || "anonymous"}`
    );

    // ── Compile into a single document ──
    const result = await compileFilesToDocument({
      userRequest: userRequest.trim(),
      files: compiledFiles,
      language,
    });

    if (!result.success || !result.filePath) {
      return NextResponse.json(
        {
          error: result.error || "Compilation failed",
          extractedFiles: compiledFiles.length,
          extractionErrors: errors,
        },
        { status: 500 }
      );
    }

    // Return a serveable URL
    const fileName = result.filePath.split("/").pop() || "";
    const serveUrl = `/api/pdf/serve/${fileName}`;

    return NextResponse.json({
      success: true,
      fileUrl: serveUrl,
      fileName: result.fileName,
      fileSize: result.fileSize,
      durationMs: result.durationMs,
      extractedFiles: compiledFiles.length,
      totalChars,
      extractionErrors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("[/api/ai/compile] error:", error);
    const msg = error instanceof Error ? error.message : "Compilation failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
