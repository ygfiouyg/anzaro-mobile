'use client';
export const dynamic = 'force-dynamic';

import { useEffect } from 'react';

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Next.js error.tsx — catches errors from any route in the app.
 * Displays a user-friendly Arabic error message with a retry button.
 */
export default function ErrorPage({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    console.error('[ErrorPage] Route error:', error);
  }, [error]);

  return (
    <div
      className="flex items-center justify-center min-h-screen bg-background p-6"
      dir="rtl"
    >
      <div className="flex flex-col items-center gap-6 text-center max-w-lg">
        {/* Error icon */}
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-red-100 dark:bg-red-900">
          <svg
            className="h-10 w-10 text-red-600 dark:text-red-400"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
            />
          </svg>
        </div>

        {/* Error text */}
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-foreground">
            حدث خطأ غير متوقع
          </h1>
          <p className="text-muted-foreground">
            نعتذر عن هذا الخطأ. يرجى المحاولة مرة أخرى أو العودة لاحقاً.
          </p>
        </div>

        {/* Error details in development */}
        {process.env.NODE_ENV === 'development' && (
          <div
            className="w-full rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950"
            dir="ltr"
          >
            <p className="text-xs font-mono text-red-700 dark:text-red-400 break-words">
              {error.message}
            </p>
            {error.digest && (
              <p className="mt-2 text-xs text-red-500 dark:text-red-500">
                Error ID: {error.digest}
              </p>
            )}
          </div>
        )}

        {/* Retry button */}
        <button
          onClick={reset}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182"
            />
          </svg>
          حاول مرة أخرى
        </button>
      </div>
    </div>
  );
}
