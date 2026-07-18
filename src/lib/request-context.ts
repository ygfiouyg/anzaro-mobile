/**
 * Request-Scoped Context (AsyncLocalStorage)
 * ===========================================
 * بيخلي أي MCP tool تقرا الـ HTTP request الجاي من غير تعديل signature.
 */
import { AsyncLocalStorage } from "async_hooks";
import type { NextRequest } from "next/server";

interface RequestContext {
  req: NextRequest;
}

const requestStorage = new AsyncLocalStorage<RequestContext>();

export function runWithContext<T>(req: NextRequest, fn: () => Promise<T>): Promise<T> {
  return requestStorage.run({ req }, fn);
}

export function getRequestContext(): NextRequest | null {
  return requestStorage.getStore()?.req ?? null;
}

export default getRequestContext;
