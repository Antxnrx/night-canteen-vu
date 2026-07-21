export default function Loading() {
  return (
    <div className="flex min-h-full flex-col">
      <div className="bg-primary-deep px-5 pb-9 pt-6">
        <div className="mx-auto max-w-lg">
          <div className="h-7 w-40 rounded-lg bg-white/10" />
          <div className="mt-7 h-9 w-64 rounded-lg bg-white/10" />
        </div>
      </div>
      <main className="relative z-10 -mt-5 flex-1 rounded-t-[1.75rem] bg-background px-6 pb-28 pt-8">
        <div className="mx-auto max-w-lg space-y-9">
          {[0, 1, 2].map((s) => (
            <div key={s}>
              <div className="mb-4 h-5 w-32 rounded bg-surface-2" />
              <div className="space-y-5">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex items-start justify-between gap-5">
                    <div className="flex-1 space-y-2">
                      <div className="h-4 w-40 rounded bg-surface-2" />
                      <div className="h-3 w-56 rounded bg-surface-2" />
                      <div className="h-4 w-16 rounded bg-surface-2" />
                    </div>
                    <div className="size-9 shrink-0 rounded-full bg-surface-2" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
