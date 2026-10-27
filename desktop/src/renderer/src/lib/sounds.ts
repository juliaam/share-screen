// Short UI cues synthesized with Web Audio: no audio files, nothing for the
// CSP to allow. Kept well below full scale so they never startle anyone.

/** Peak gain of each note (0..1, about -16 dBFS); the OS volume still applies. */
const CUE_VOLUME = 0.16

export type Cue = 'join' | 'leave'

/** Notes as [frequency Hz, start s, duration s]. Join rises, leave falls and sits lower. */
const CUES: Record<Cue, [number, number, number][]> = {
  join: [
    [587.33, 0, 0.16], // D5
    [880, 0.09, 0.22] // A5
  ],
  leave: [
    [440, 0, 0.16], // A4
    [293.66, 0.11, 0.26] // D4
  ]
}

let context: AudioContext | null = null

export function playCue(cue: Cue): void {
  try {
    context ??= new AudioContext()
    const ctx = context
    if (ctx.state === 'suspended') void ctx.resume()
    const now = ctx.currentTime + 0.01
    for (const [freq, offset, duration] of CUES[cue]) {
      const start = now + offset
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'triangle'
      osc.frequency.value = freq
      // Short attack and exponential decay: no clicks at either end.
      gain.gain.setValueAtTime(0, start)
      gain.gain.linearRampToValueAtTime(CUE_VOLUME, start + 0.012)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
      osc.connect(gain).connect(ctx.destination)
      osc.start(start)
      osc.stop(start + duration + 0.02)
    }
  } catch {
    // A missing cue is harmless.
  }
}
