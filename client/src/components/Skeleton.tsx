/**
 * Loading placeholders shaped like the content that is coming.
 *
 * Not spinners: a spinner says "wait" without saying what for, and at ~170ms
 * warm / ~7s cold from Algeria to us-east-2 the cold case is long enough that a
 * customer reads a blank screen as broken. These reserve the real layout, so
 * nothing jumps when the data lands.
 *
 * Everything uses palette tokens — `line` for bars, the same arch + glow the
 * real photo placeholder uses — so a skeleton never introduces a new grey.
 */

/** One grey bar. `w` and `h` are Tailwind classes so callers keep control. */
export function Bar({ w = 'w-full', h = 'h-4', className = '' }: { w?: string; h?: string; className?: string }) {
  return <div className={`${w} ${h} animate-pulse rounded-sm bg-line/60 ${className}`} aria-hidden />
}

/** The arch-and-glow shape a real product photo occupies. */
export function ArchSkeleton({ className = 'h-[210px]' }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`${className} animate-pulse rounded-arch border border-cream-edge bg-glow`}
    />
  )
}

export function ProductCardSkeleton() {
  return (
    <div className="flex flex-col gap-2.5">
      <ArchSkeleton />
      <Bar w="w-3/4" h="h-3.5" />
      <Bar w="w-1/2" h="h-3" />
      <Bar w="w-1/3" h="h-4" className="mt-0.5" />
    </div>
  )
}

/** Mirrors the storefront grid: 2 columns at 375, 4 at 1440, staggered. */
export function ProductGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div
      role="status"
      aria-busy="true"
      className="mt-4 grid grid-cols-2 gap-x-3.5 gap-y-6 lg:mt-8 lg:grid-cols-4 lg:gap-x-6 lg:gap-y-10"
    >
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={i % 2 === 1 ? 'mt-7 lg:mt-0' : ''}>
          <ProductCardSkeleton />
        </div>
      ))}
    </div>
  )
}

/** Product detail: gallery on one side, buying column on the other. */
export function ProductDetailSkeleton() {
  return (
    <div role="status" aria-busy="true" className="mx-auto max-w-shell px-gutter py-7 lg:px-gutter-lg lg:py-10">
      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[1fr_460px] lg:gap-10">
        <ArchSkeleton className="h-[400px] lg:h-[620px]" />
        <div className="flex flex-col gap-4">
          <Bar w="w-1/3" h="h-3" />
          <Bar w="w-4/5" h="h-9" />
          <Bar w="w-1/4" h="h-7" />
          <Bar w="w-full" h="h-3" />
          <Bar w="w-11/12" h="h-3" />
          <Bar w="w-2/3" h="h-3" />
          <div className="mt-2 flex gap-2.5">
            {Array.from({ length: 4 }, (_, i) => (
              <Bar key={i} w="w-11" h="h-11" className="rounded-pill" />
            ))}
          </div>
          <div className="mt-1 flex gap-2">
            {Array.from({ length: 4 }, (_, i) => (
              <Bar key={i} w="w-14" h="h-11" />
            ))}
          </div>
          <Bar w="w-full" h="h-14" className="mt-3 rounded-pill" />
        </div>
      </div>
    </div>
  )
}

/** A field label + input, for the checkout selects while wilayas load. */
export function FieldSkeleton() {
  return (
    <div className="flex flex-col gap-1.5">
      <Bar w="w-24" h="h-3" />
      <Bar w="w-full" h="h-12" className="rounded-[12px]" />
    </div>
  )
}

/**
 * Admin table rows. `cols` is the desktop grid template so the skeleton lands
 * on the same column edges as the real table.
 */
export function TableSkeleton({ rows = 6, cols }: { rows?: number; cols: string }) {
  return (
    <div role="status" aria-busy="true" className="flex flex-col">
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="grid grid-cols-[1fr_auto] items-center gap-3 border-b border-line py-[18px] lg:gap-5"
          style={{ gridTemplateColumns: undefined }}
        >
          <div className={`hidden w-full lg:grid lg:gap-5 ${cols}`}>
            <Bar w="w-20" h="h-3.5" />
            <Bar w="w-32" h="h-3.5" />
            <Bar w="w-24" h="h-3.5" />
            <Bar w="w-28" h="h-3.5" />
            <Bar w="w-16" h="h-3.5" />
            <Bar w="w-16" h="h-3.5" />
          </div>
          {/* Mobile card shape */}
          <div className="flex w-full flex-col gap-2 lg:hidden">
            <div className="flex justify-between">
              <Bar w="w-24" h="h-3.5" />
              <Bar w="w-16" h="h-3.5" />
            </div>
            <Bar w="w-40" h="h-3" />
            <Bar w="w-2/3" h="h-3" />
          </div>
        </div>
      ))}
    </div>
  )
}
