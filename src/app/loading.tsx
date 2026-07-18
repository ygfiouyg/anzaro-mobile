export const dynamic = 'force-dynamic';
export default function Loading() {
  return (
    <div
      className="flex items-center justify-center min-h-screen bg-background"
      dir="rtl"
    >
      <div className="flex flex-col items-center gap-5">
        {/* Geometric Arabic-style spinner */}
        <div className="relative h-14 w-14">
          <div className="absolute inset-0 rounded-full border-4 border-muted-foreground"></div>
          <div className="absolute inset-0 rounded-full border-4 border-t-primary border-r-primary animate-spin"></div>
        </div>
        <div className="flex flex-col items-center gap-1.5">
          <p className="text-sm font-medium text-foreground animate-pulse">
            جاري التحميل
          </p>
          <p className="text-xs text-muted-foreground">
            يرجى الانتظار...
          </p>
        </div>
      </div>
    </div>
  );
}
