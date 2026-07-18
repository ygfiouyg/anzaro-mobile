export const dynamic = 'force-dynamic';
import Link from 'next/link';

/**
 * not-found.tsx — Custom 404 page with Arabic text.
 * Displayed when a route is not found.
 */
export default function NotFound() {
  return (
    <div
      className="flex items-center justify-center min-h-screen bg-background p-6"
      dir="rtl"
    >
      <div className="flex flex-col items-center gap-6 text-center max-w-lg">
        {/* 404 number */}
        <div className="relative">
          <h1 className="text-8xl font-extrabold text-primary select-none">
            404
          </h1>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted">
              <svg
                className="h-10 w-10 text-muted-foreground"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
                />
              </svg>
            </div>
          </div>
        </div>

        {/* Arabic message */}
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-foreground">
            الصفحة غير موجودة
          </h2>
          <p className="text-muted-foreground">
            عذراً، الصفحة التي تبحث عنها غير موجودة أو تم نقلها.
          </p>
        </div>

        {/* Back to home link */}
        <Link
          href="/"
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
              d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25"
            />
          </svg>
          العودة إلى الصفحة الرئيسية
        </Link>
      </div>
    </div>
  );
}
