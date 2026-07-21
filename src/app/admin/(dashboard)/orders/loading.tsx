export default function Loading() {
  return (
    <div>
      <div className="mb-4 h-6 w-24 rounded bg-surface-2" />
      <div className="mb-3 flex justify-end">
        <div className="h-8 w-24 rounded-lg bg-surface-2" />
      </div>
      <div className="mb-2 h-4 w-20 rounded bg-surface-2" />
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-2xl border border-border bg-surface p-4">
            <div className="flex items-center justify-between">
              <div className="h-6 w-16 rounded bg-surface-2" />
              <div className="h-4 w-12 rounded bg-surface-2" />
            </div>
            <div className="mt-3 space-y-2">
              <div className="h-3 w-40 rounded bg-surface-2" />
              <div className="h-3 w-28 rounded bg-surface-2" />
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
              <div className="h-4 w-14 rounded bg-surface-2" />
              <div className="h-8 w-28 rounded-lg bg-surface-2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
