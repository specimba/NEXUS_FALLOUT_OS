export function CrtOverlay() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[100]">
      {/* Global scanlines */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "repeating-linear-gradient(to bottom, rgba(0,0,0,0) 0px, rgba(0,0,0,0) 2px, rgba(0,0,0,0.22) 3px, rgba(0,0,0,0.22) 4px)",
        }}
      />
      {/* Phosphor flicker sheet */}
      <div className="crt-flicker absolute inset-0 bg-[#33ff66]" />
      {/* Drifting scan beam */}
      <div className="crt-beam absolute inset-x-0 h-[140px]" />
      {/* Vignette to fake CRT curvature */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(0,0,0,0.55) 100%)",
        }}
      />
    </div>
  );
}
