import { NextRequest } from 'next/server';
import { getUserFromToken, extractBearerToken } from '@/lib/auth';
import { getMemoriesForUser, deleteMemory, clearAllMemories } from '@/lib/user-memory.service';

// GET /api/user/memory — Get all memories for the authenticated user
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const token = extractBearerToken(authHeader);
    if (!token) {
      return new Response(
        JSON.stringify({ error: 'غير مصرح' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const user = await getUserFromToken(token);
    if (!user) {
      return new Response(
        JSON.stringify({ error: 'غير مصرح' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const memories = await getMemoriesForUser(user.id);
    return new Response(
      JSON.stringify({ memories }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[Memory API] GET error:', error);
    return new Response(
      JSON.stringify({ error: 'حدث خطأ غير متوقع' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// DELETE /api/user/memory — Delete a single memory or clear all
export async function DELETE(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const token = extractBearerToken(authHeader);
    if (!token) {
      return new Response(
        JSON.stringify({ error: 'غير مصرح' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const user = await getUserFromToken(token);
    if (!user) {
      return new Response(
        JSON.stringify({ error: 'غير مصرح' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const body = await request.json();
    const { memoryId, clearAll } = body as { memoryId?: string; clearAll?: boolean };

    if (clearAll) {
      const count = await clearAllMemories(user.id);
      return new Response(
        JSON.stringify({ success: true, deletedCount: count }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (memoryId) {
      const success = await deleteMemory(user.id, memoryId);
      if (!success) {
        return new Response(
          JSON.stringify({ error: 'الذاكرة غير موجودة' }),
          { status: 404, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'يجب تحديد memoryId أو clearAll' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[Memory API] DELETE error:', error);
    return new Response(
      JSON.stringify({ error: 'حدث خطأ غير متوقع' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
