// ============================================================
// NEXUS OS — Sound Synth
//
// Mechanical-keyboard click + beep synth via the Web Audio API.
// Opt-in: the Settings store / shell toggles `enabled`. Each
// keypress plays a short, soft click with light randomization so
// it never feels mechanical-looped.
//
// Singleton: module-level AudioContext is reused across calls.
// ============================================================

let ctx: AudioContext | null = null
let enabled = false

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext
      ctx = new AC()
    } catch {
      return null
    }
  }
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

/** Enable/disable the click synth. Enabling warms up the AudioContext. */
export function setEnabled(v: boolean) {
  enabled = v
  if (v) getCtx()
}

export function isEnabled() {
  return enabled
}

/** Play a soft mechanical keystroke. No-op if disabled or unavailable. */
export function playKeyClick() {
  if (!enabled) return
  const ac = getCtx()
  if (!ac) return
  const now = ac.currentTime

  // Noise burst (the "clack") through a bandpass + quick decay.
  const dur = 0.045
  const buffer = ac.createBuffer(
    1,
    Math.floor(ac.sampleRate * dur),
    ac.sampleRate
  )
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) {
    const t = i / data.length
    const env = Math.pow(1 - t, 3)
    data[i] = (Math.random() * 2 - 1) * env
  }
  const src = ac.createBufferSource()
  src.buffer = buffer

  const bp = ac.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = 1800 + Math.random() * 900
  bp.Q.value = 0.8

  const gain = ac.createGain()
  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.exponentialRampToValueAtTime(0.18, now + 0.004)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + dur)

  src.connect(bp)
  bp.connect(gain)
  gain.connect(ac.destination)
  src.start(now)
  src.stop(now + dur)

  // A tiny low "thock" sine for body.
  const osc = ac.createOscillator()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(150 + Math.random() * 40, now)
  osc.frequency.exponentialRampToValueAtTime(70, now + 0.03)
  const og = ac.createGain()
  og.gain.setValueAtTime(0.0001, now)
  og.gain.exponentialRampToValueAtTime(0.05, now + 0.003)
  og.gain.exponentialRampToValueAtTime(0.0001, now + 0.04)
  osc.connect(og)
  og.connect(ac.destination)
  osc.start(now)
  osc.stop(now + 0.05)
}

/** A small "beep" used for errors / boot. Plays even if disabled. */
export function playBeep(freq = 220, dur = 0.12, vol = 0.12) {
  const ac = getCtx()
  if (!ac) return
  const now = ac.currentTime
  const osc = ac.createOscillator()
  osc.type = 'square'
  osc.frequency.value = freq
  const g = ac.createGain()
  g.gain.setValueAtTime(0.0001, now)
  g.gain.exponentialRampToValueAtTime(vol, now + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, now + dur)
  osc.connect(g)
  g.connect(ac.destination)
  osc.start(now)
  osc.stop(now + dur + 0.02)
}
