import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { existsSync } from "fs";
import { db } from "@/lib/db";
import { extractBearerToken, getUserFromToken } from "@/lib/auth";

/**
 * GET /api/ai/image/download/[id]
 *
 * Serves a generated image back to the authenticated user who owns it.
 * Looks up the GenerativeAsset by ID, reads the file from disk, and
 * returns it with the correct Content-Type (from stored metadata).
 *
 * SECURITY:
 * - Requires authentication (bearer token)
 * - Only the owning user (or admin) may fetch the asset
 * - Path traversal protection (filePath comes from DB, not user input)
 */

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

function getMimeFromExt(ext: string): string {
  switch (ext.toLowerCase()) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    case "bmp":
      return "image/bmp";
    default:
      return "image/png";
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // ── Auth ──
    const token = extractBearerToken(request.headers.get("Authorization"));
    if (!token) {
      return NextResponse.json(
        { error: "رمز المصادقة مطلوب" },
        { status: 401 }
      );
    }
    const user = await getUserFromToken(token);
    if (!user) {
      return NextResponse.json(
        { error: "جلسة غير صالحة" },
        { status: 401 }
      );
    }

    const { id } = await params;

    // ── Look up the asset ──
    const asset = await db.generativeAsset.findUnique({ where: { id } });
    if (!asset || asset.type !== "image") {
      return NextResponse.json(
        { error: "الصورة غير موجودة" },
        { status: 404 }
      );
    }

    // ── Authorization: owner or admin only ──
    if (asset.userId !== user.id && user.role !== "admin") {
      return NextResponse.json(
        { error: "غير مصرح لك بالوصول إلى هذه الصورة" },
        { status: 403 }
      );
    }

    // ── Read the file ──
    const filePath = asset.filePath;
    if (!filePath || !existsSync(filePath)) {
      return NextResponse.json(
        { error: "ملف الصورة غير موجود على القرص" },
        { status: 404 }
      );
    }

    // Enforce size limit
    if (asset.fileSize && asset.fileSize > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "حجم الصورة يتجاوز الحد المسموح" },
        { status: 413 }
      );
    }

    const buffer = await readFile(filePath);

    // Determine mime type from metadata or file extension
    let mimeType = "image/png";
    try {
      const meta = asset.metadata ? JSON.parse(asset.metadata) : {};
      if (meta.mimeType) {
        mimeType = meta.mimeType;
      } else if (meta.format) {
        mimeType = getMimeFromExt(meta.format);
      }
    } catch {
      const ext = filePath.split(".").pop() || "png";
      mimeType = getMimeFromExt(ext);
    }

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": mimeType,
        "Content-Length": buffer.length.toString(),
        "Cache-Control": "private, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("[/api/ai/image/download] error:", error);
    return NextResponse.json(
      { error: "فشل في تحميل الصورة" },
      { status: 500 }
    );
  }
}
