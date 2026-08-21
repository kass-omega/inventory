/**
 * Common loading indicator used across all pages and API-driven UI.
 *
 * - <Loading />            full-area centered spinner + label
 * - <Loading size="sm" />  small spinner only (buttons, inline spots)
 *
 * Hook-free so it can be rendered from server components (route-level
 * loading.tsx files) as well as client components.
 */
export default function Loading({
  size = "lg",
  label = "Loading…",
  className = "",
  minHeight,
}: {
  size?: "sm" | "md" | "lg";
  label?: string;
  className?: string;
  minHeight?: number | string;
}) {
  const spinnerClass =
    size === "sm"
      ? "h-4 w-4 border-2"
      : size === "md"
        ? "h-6 w-6 border-2"
        : "h-8 w-8 border-4";

  if (size === "sm") {
    return (
      <span
        role="status"
        aria-label={label}
        className={`inline-block ${spinnerClass} animate-spin rounded-full border-gray-300 border-t-blue-600 ${className}`}
      />
    );
  }

  return (
    <div
      role="status"
      className={`flex items-center justify-center ${className}`}
      style={minHeight ? { minHeight } : undefined}
    >
      <div className="flex flex-col items-center gap-3 text-gray-500">
        <div
          className={`${spinnerClass} animate-spin rounded-full border-gray-300 border-t-blue-600`}
        />
        <p className="text-sm">{label}</p>
      </div>
    </div>
  );
}
