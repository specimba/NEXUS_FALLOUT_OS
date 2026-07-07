'use client'

import { useSettingsStore } from '@/stores/settings-store'

/**
 * CRTOverlay
 *
 * Fullscreen, pointer-events-none overlay rendering the phosphor CRT effects:
 *   - scanlines + vignette  (always, while CRT enabled)
 *   - flicker               (subtle + full)
 *   - beam                  (full only)
 *
 * Returns null when settings.crt is false (or during SSR with no state).
 * The scanline opacity is read live from --crt-scanline-opacity which the
 * ThemeApplier writes; the inline style here just guarantees a sane fallback.
 */
export function CRTOverlay() {
  const crt = useSettingsStore((s) => s.crt)
  const crtQuality = useSettingsStore((s) => s.crtQuality)
  const scanlines = useSettingsStore((s) => s.scanlines)

  if (!crt) return null

  const opacity = (scanlines / 200).toFixed(3)

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[100]"
      style={
        {
          '--crt-scanline-opacity': opacity,
        } as React.CSSProperties
      }
    >
      {/* scanlines + vignette — always */}
      <div className="crt-scanlines absolute inset-0" />
      {/* flicker — subtle + full */}
      {crtQuality !== 'static' && (
        <div className="crt-flicker absolute inset-0 bg-white" />
      )}
      {/* beam — full only */}
      {crtQuality === 'full' && (
        <div className="crt-beam absolute inset-x-0 h-40" />
      )}
    </div>
  )
}
