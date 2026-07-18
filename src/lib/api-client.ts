/**
 * Safe fetch utility that handles non-JSON API responses gracefully.
 * Prevents "Unexpected token '<'" errors when the server returns HTML error pages.
 */

/**
 * Parse an API response safely, handling non-JSON responses (HTML error pages from gateway/proxy).
 * Always call this AFTER checking `response.ok`.
 */
export async function parseApiResponse<T = Record<string, unknown>>(response: Response): Promise<T> {
  return response.json();
}

/**
 * Handle a non-ok response by trying to extract a JSON error message,
 * falling back to a generic Arabic error message for HTML responses.
 */
export async function handleApiError(response: Response): Promise<never> {
  let errorMessage = `خطأ في الخادم (${response.status})`;

  try {
    const errorData = await response.json();
    errorMessage = errorData.error || errorMessage;
  } catch {
    // Response is not JSON (e.g., HTML error page from gateway/proxy/timeout)
    if (response.status === 504 || response.status === 502) {
      errorMessage = 'انتهت مهلة الخادم. يرجى المحاولة مرة أخرى.';
    } else if (response.status === 401) {
      errorMessage = 'يرجى تسجيل الدخول أولاً';
    } else if (response.status === 429) {
      errorMessage = 'طلبات كثيرة جداً. يرجى الانتظار قليلاً ثم المحاولة مرة أخرى.';
    } else if (response.status === 404) {
      errorMessage = 'الخدمة المطلوبة غير متاحة حالياً.';
    }
  }

  throw new Error(errorMessage);
}

/**
 * Safe fetch wrapper that handles both network errors and non-JSON API responses.
 * Usage: const data = await safeFetch<T>('/api/endpoint', options);
 */
export async function safeFetch<T = Record<string, unknown>>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(url, options);

  if (!response.ok) {
    await handleApiError(response);
  }

  return parseApiResponse<T>(response);
}
