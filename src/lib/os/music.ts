// ============================================================
// NEXUS OS — Chiptune Music Player
//
// Web Audio synth that schedules oscillator note sequences — no
// real audio files needed. Five tracks adapted from the v4 reference
// (citysleep / neonrain / ghostmode / pingu / deepdive).
//
// MusicPlayer singleton: play(song), stop(), isPlaying(), currentSong(),
// on(callback) for "now playing" UI updates.
// ============================================================

export type Song = {
  id: string
  title: string
  artist: string
  genre: string
  bpm: number
  /** sequence of {note, beats}; note='-' is a rest. */
  track: { note: string; beats: number }[]
}

// Frequencies for a few octaves (Hz).
const N: Record<string, number> = {
  '-': 0,
  C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196.0, A3: 220.0, B3: 246.94,
  C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.0, A4: 440.0, B4: 493.88,
  C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880.0, B5: 987.77,
  Cs4: 277.18, Ds4: 311.13, Fs4: 369.99, Gs4: 415.3, As4: 466.16,
  Cs5: 554.37, Ds5: 622.25, Fs5: 739.99, Gs5: 830.61, As5: 932.33,
}

function s(note: string, beats = 1) {
  return { note, beats }
}

export const LIBRARY: Song[] = [
  {
    id: 'citysleep',
    title: 'Citysleep',
    artist: 'ghostlink',
    genre: 'ambient',
    bpm: 72,
    track: [
      s('A3', 2), s('E4', 2), s('A4', 2), s('E4', 2),
      s('G3', 2), s('D4', 2), s('G4', 2), s('D4', 2),
      s('F3', 2), s('C4', 2), s('F4', 2), s('C4', 2),
      s('E3', 2), s('B3', 2), s('E4', 2), s('B3', 2),
    ],
  },
  {
    id: 'neonrain',
    title: 'Neonrain',
    artist: 'phase/shift',
    genre: 'synthwave',
    bpm: 96,
    track: [
      s('A4', 1), s('-', 0.5), s('C5', 0.5), s('E5', 1), s('A4', 1), s('E5', 1), s('D5', 1), s('-', 1),
      s('G4', 1), s('-', 0.5), s('B4', 0.5), s('D5', 1), s('G4', 1), s('D5', 1), s('C5', 1), s('-', 1),
      s('F4', 1), s('-', 0.5), s('A4', 0.5), s('C5', 1), s('F4', 1), s('C5', 1), s('B4', 1), s('-', 1),
      s('E4', 1), s('-', 0.5), s('G4', 0.5), s('B4', 1), s('E4', 1), s('B4', 1), s('A4', 2),
    ],
  },
  {
    id: 'ghostmode',
    title: 'Ghostmode',
    artist: 'nullside',
    genre: 'darkwave',
    bpm: 80,
    track: [
      s('D3', 2), s('A3', 1), s('D4', 1), s('A3', 1), s('D4', 1), s('F4', 2), s('E4', 2),
      s('C3', 2), s('G3', 1), s('C4', 1), s('G3', 1), s('C4', 1), s('Ds4', 1), s('D4', 1), s('-', 2),
      s('D3', 2), s('A3', 1), s('D4', 1), s('A3', 1), s('D4', 1), s('F4', 2), s('E4', 2),
      s('A3', 4), s('-', 4),
    ],
  },
  {
    id: 'pingu',
    title: 'Pingu',
    artist: '8bitwizard',
    genre: 'chiptune',
    bpm: 132,
    track: [
      s('E5', 0.5), s('E5', 0.5), s('-', 0.5), s('E5', 0.5), s('-', 0.5), s('C5', 0.5), s('E5', 1),
      s('G5', 1), s('-', 1), s('G4', 1), s('-', 1),
      s('C5', 0.5), s('-', 0.5), s('G4', 1), s('E4', 1), s('-', 0.5),
      s('A4', 0.5), s('B4', 0.5), s('A4', 0.5), s('Gs4', 0.5), s('A4', 0.5), s('-', 0.5),
      s('G4', 0.5), s('G4', 0.5), s('A4', 1), s('G4', 1), s('E4', 1),
    ],
  },
  {
    id: 'deepdive',
    title: 'Deepdive',
    artist: 'halcyon',
    genre: 'ambient',
    bpm: 64,
    track: [
      s('E3', 4), s('B3', 2), s('E4', 2),
      s('A3', 4), s('E4', 2), s('A4', 2),
      s('G3', 4), s('D4', 2), s('G4', 2),
      s('F3', 4), s('C4', 2), s('F4', 2),
    ],
  },
]

export function findSong(id: string): Song | undefined {
  return LIBRARY.find((sng) => sng.id === id || sng.id.startsWith(id.toLowerCase()))
}

export function songDurationSec(song: Song): number {
  const beats = song.track.reduce((a, n) => a + n.beats, 0)
  return (beats * 60) / song.bpm
}

export function formatTime(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export type PlaybackState = {
  song: Song
  elapsedSec: number
  totalSec: number
  playing: boolean
}

type UpdateCb = (state: PlaybackState | null) => void

class MusicPlayer {
  private ctx: AudioContext | null = null
  private timer: ReturnType<typeof setInterval> | null = null
  private startedAt = 0
  private pausedElapsed = 0
  private current: Song | null = null
  private cb: UpdateCb | null = null

  private getCtx(): AudioContext | null {
    if (typeof window === 'undefined') return null
    if (!this.ctx) {
      try {
        const AC =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext
        this.ctx = new AC()
      } catch {
        return null
      }
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume()
    return this.ctx
  }

  /** Subscribe to playback state updates (called ~4×/sec while playing). */
  on(cb: UpdateCb) {
    this.cb = cb
  }

  isPlaying() {
    return !!this.current && this.timer !== null
  }

  currentSong() {
    return this.current
  }

  play(song: Song) {
    this.stop()
    const ac = this.getCtx()
    if (!ac) return
    this.current = song
    this.pausedElapsed = 0
    this.startedAt = ac.currentTime
    this.scheduleTrack(song, 0)
    this.emit(true)
    this.timer = setInterval(() => {
      if (!this.current) return
      const ac2 = this.getCtx()
      if (!ac2) return
      const elapsed = ac2.currentTime - this.startedAt + this.pausedElapsed
      const total = songDurationSec(this.current)
      if (elapsed >= total) {
        // loop
        this.stop(false)
        this.play(song)
      } else {
        this.emit(true)
      }
    }, 250)
  }

  private scheduleTrack(song: Song, offsetSec: number) {
    const ac = this.getCtx()
    if (!ac) return
    const beat = 60 / song.bpm
    let t = ac.currentTime + offsetSec
    for (const n of song.track) {
      const dur = n.beats * beat
      if (n.note !== '-' && N[n.note]) {
        this.scheduleNote(N[n.note], t, dur * 0.9)
      }
      t += dur
    }
  }

  private scheduleNote(freq: number, start: number, dur: number) {
    const ac = this.ctx!
    // two oscillators (a soft triangle lead + sine sub) for warmth
    const osc1 = ac.createOscillator()
    osc1.type = 'triangle'
    osc1.frequency.value = freq
    const osc2 = ac.createOscillator()
    osc2.type = 'sine'
    osc2.frequency.value = freq / 2

    const g = ac.createGain()
    g.gain.setValueAtTime(0.0001, start)
    g.gain.exponentialRampToValueAtTime(0.16, start + 0.02)
    g.gain.setValueAtTime(0.16, start + dur * 0.6)
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur)

    const g2 = ac.createGain()
    g2.gain.setValueAtTime(0.0001, start)
    g2.gain.exponentialRampToValueAtTime(0.05, start + 0.03)
    g2.gain.exponentialRampToValueAtTime(0.0001, start + dur)

    // gentle lowpass
    const lp = ac.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = Math.min(freq * 6, 6000)

    osc1.connect(g)
    osc2.connect(g2)
    g.connect(lp)
    g2.connect(lp)
    lp.connect(ac.destination)
    osc1.start(start)
    osc2.start(start)
    osc1.stop(start + dur + 0.05)
    osc2.stop(start + dur + 0.05)
  }

  stop(emit = true) {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    this.current = null
    this.pausedElapsed = 0
    if (emit) this.emit(false)
  }

  private emit(playing: boolean) {
    if (!this.cb) return
    if (!this.current || !playing) {
      this.cb(null)
      return
    }
    const ac = this.getCtx()
    const elapsed = ac ? ac.currentTime - this.startedAt + this.pausedElapsed : 0
    this.cb({
      song: this.current,
      elapsedSec: elapsed,
      totalSec: songDurationSec(this.current),
      playing,
    })
  }
}

export const MusicPlayerInstance = new MusicPlayer()
