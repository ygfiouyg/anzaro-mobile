/**
 * GET    /api/mcp-servers/[id]  — get one server
 * PATCH  /api/mcp-servers/[id]  — update (name, url, authToken, isEnabled)
 * DELETE /api/mcp-servers/[id]  — delete a server
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { clearExternalToolsCache } from "@/lib/agents/mcp-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}

// ── GET ──────────────────────────────────────────────────────
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const server = await db.externalMcpServer.findUnique({ where: { id } });
    if (!server) {
      return NextResponse.json(
        { error: "not_found", message: "السيرفر غير موجود" },
        { status: 404 },
      );
    }
    return NextResponse.json({
      server: {
        id: server.id,
        name: server.name,
        url: server.url,
        transport: server.transport,
        isEnabled: server.isEnabled,
        toolCount: server.toolCount,
        ownerId: server.ownerId,
        lastConnectedAt: server.lastConnectedAt,
        lastError: server.lastError,
        hasAuth: !!server.authToken,
        createdAt: server.createdAt,
        updatedAt: server.updatedAt,
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: "fetch_failed", message: e.message },
      { status: 500 },
    );
  }
}

// ── PATCH ────────────────────────────────────────────────────
interface PatchBody {
  name?: string;
  url?: string;
  authToken?: string | null;
  isEnabled?: boolean;
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = (await req.json()) as PatchBody;

    const existing = await db.externalMcpServer.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: "not_found", message: "السيرفر غير موجود" },
        { status: 404 },
      );
    }

    const data: Record<string, unknown> = {};

    if (typeof body.name === "string") {
      data.name = body.name.trim();
    }
    if (typeof body.url === "string") {
      const url = body.url.trim();
      if (!/^https?:\/\//i.test(url)) {
        return NextResponse.json(
          { error: "invalid_url", message: "URL لازم يبدأ بـ http:// أو https://" },
          { status: 400 },
        );
      }
      data.url = url;
    }
    if (body.authToken !== undefined) {
      data.authToken = body.authToken ? String(body.authToken).trim() : null;
    }
    if (typeof body.isEnabled === "boolean") {
      data.isEnabled = body.isEnabled;
    }

    const updated = await db.externalMcpServer.update({
      where: { id },
      data,
    });

    clearExternalToolsCache();

    return NextResponse.json({
      success: true,
      server: {
        id: updated.id,
        name: updated.name,
        url: updated.url,
        isEnabled: updated.isEnabled,
        toolCount: updated.toolCount,
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: "update_failed", message: e.message },
      { status: 500 },
    );
  }
}

// ── DELETE ───────────────────────────────────────────────────
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const existing = await db.externalMcpServer.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: "not_found", message: "السيرفر غير موجود" },
        { status: 404 },
      );
    }

    await db.externalMcpServer.delete({ where: { id } });
    clearExternalToolsCache();

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: "delete_failed", message: e.message },
      { status: 500 },
    );
  }
}
