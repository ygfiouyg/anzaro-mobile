/**
 * GET  /api/mcp-servers  — list all external MCP servers
 * POST /api/mcp-servers  — add a new external MCP server
 *
 * POST body:
 *   {
 *     "name":      string,  // required
 *     "url":       string,  // required (http:// or https://)
 *     "authToken"?: string, // optional bearer token
 *     "ownerId"?:  string   // optional
 *   }
 *
 * After adding, automatically tests the connection and caches tools.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { connectToMcpServer, clearExternalToolsCache } from "@/lib/agents/mcp-client";
import { withAuth, type AuthContext } from "@/lib/with-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── GET: list all servers ────────────────────────────────────
export const GET = withAuth(async (_req: NextRequest, _ctx) => {
  try {
    const servers = await db.externalMcpServer.findMany({
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      count: servers.length,
      servers: servers.map((s) => ({
        id: s.id,
        name: s.name,
        url: s.url,
        transport: s.transport,
        isEnabled: s.isEnabled,
        toolCount: s.toolCount,
        ownerId: s.ownerId,
        lastConnectedAt: s.lastConnectedAt,
        lastError: s.lastError,
        // Don't expose authToken in list
        hasAuth: !!s.authToken,
        createdAt: s.createdAt,
      })),
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: "fetch_failed", message: e.message },
      { status: 500 },
    );
  }
});

// ── POST: add a new server ───────────────────────────────────
interface AddServerBody {
  name?: string;
  url?: string;
  authToken?: string;
  ownerId?: string;
}

export const POST = withAuth(async (req: NextRequest, _ctx) => {
  try {
    const body = (await req.json()) as AddServerBody;

    const name = String(body.name || "").trim();
    const url = String(body.url || "").trim();

    if (!name) {
      return NextResponse.json(
        { error: "missing_name", message: "name مطلوب" },
        { status: 400 },
      );
    }
    if (!url) {
      return NextResponse.json(
        { error: "missing_url", message: "url مطلوب" },
        { status: 400 },
      );
    }
    if (!/^https?:\/\//i.test(url)) {
      return NextResponse.json(
        { error: "invalid_url", message: "URL لازم يبدأ بـ http:// أو https://" },
        { status: 400 },
      );
    }

    const authToken = body.authToken ? String(body.authToken).trim() : null;
    const ownerId = body.ownerId ? String(body.ownerId).trim() : null;

    // Check for duplicate URL
    const existing = await db.externalMcpServer.findFirst({ where: { url } });
    if (existing) {
      return NextResponse.json(
        { error: "duplicate_url", message: `يوجد سيرفر بنفس الـ URL: ${existing.name}` },
        { status: 409 },
      );
    }

    // Create the server record
    const server = await db.externalMcpServer.create({
      data: {
        name,
        url,
        transport: "streamable-http",
        authToken,
        ownerId,
      },
    });

    // Test connection and fetch tools
    const result = await connectToMcpServer(url, authToken ?? undefined);

    if (result.success) {
      // Cache the tools
      const toolsCache = result.tools.map((t) => ({
        name: t.toolName,
        description: t.description,
      }));

      const updated = await db.externalMcpServer.update({
        where: { id: server.id },
        data: {
          toolCount: result.toolCount,
          toolsCacheJson: JSON.stringify(toolsCache),
          lastConnectedAt: new Date(),
          lastError: null,
        },
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
          lastConnectedAt: updated.lastConnectedAt,
        },
        tools: toolsCache,
        message: `تم إضافة السيرفر بنجاح. ${result.toolCount} أداة متاحة.`,
      });
    } else {
      // Connection failed — keep the server but record the error
      await db.externalMcpServer.update({
        where: { id: server.id },
        data: { lastError: result.error },
      });

      return NextResponse.json({
        success: false,
        server: {
          id: server.id,
          name: server.name,
          url: server.url,
          isEnabled: server.isEnabled,
          toolCount: 0,
        },
        error: result.error,
        message: `تم إضافة السيرفر لكن فشل الاتصال: ${result.error}`,
      });
    }
  } catch (e: any) {
    return NextResponse.json(
      { error: "create_failed", message: e.message },
      { status: 500 },
    );
  }
});
