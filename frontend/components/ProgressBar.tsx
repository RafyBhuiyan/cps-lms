'use client';

/**
 * Percentage bar for course progress.
 *
 * The numbers come from the server (`/api/courses/:id/progress`) — nothing here
 * recomputes them, so what the bar shows is what the API counted.
 */

export function ProgressBar({
  percent,
  completed,
  total,
  showLabel = true,
}: {
  percent: number;
  completed?: number;
  total?: number;
  showLabel?: boolean;
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));

  return (
    <div>
      {showLabel ? (
        <div className="mb-1.5 flex items-center justify-between text-sm">
          <span className="text-zinc-600 dark:text-zinc-400">
            {completed !== undefined && total !== undefined
              ? `${completed} of ${total} lessons`
              : 'Progress'}
          </span>
          <span className="font-medium tabular-nums">{clamped}%</span>
        </div>
      ) : null}
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-black/[.08] dark:bg-white/[.12]"
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full rounded-full bg-emerald-500 transition-[width] duration-300"
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}
