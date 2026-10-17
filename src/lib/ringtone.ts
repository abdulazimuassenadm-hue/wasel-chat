/**
 * نغمة الرنين — مُولَّدة عبر Web Audio (بدون ملفات صوتية خارجية)
 */
export interface Ringtone {
  start: () => void
  stop: () => void
}

export function createRingtone(pattern: 'incoming' | 'outgoing' = 'incoming'): Ringtone {
  let context: AudioContext | null = null
  let timer: number | null = null
  let stopped = true

  const beep = (frequency: number, startAt: number, duration: number, volume = 0.08) => {
    if (!context) return
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = 'sine'
    oscillator.frequency.value = frequency
    gain.gain.setValueAtTime(0, startAt)
    gain.gain.linearRampToValueAtTime(volume, startAt + 0.01)
    gain.gain.linearRampToValueAtTime(0, startAt + duration)
    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.start(startAt)
    oscillator.stop(startAt + duration + 0.02)
  }

  const playPattern = () => {
    if (!context) return
    const now = context.currentTime
    if (pattern === 'incoming') {
      beep(880, now, 0.35)
      beep(660, now + 0.45, 0.35)
    } else {
      beep(520, now, 0.6, 0.05)
    }
  }

  return {
    start() {
      if (stopped === false) return
      stopped = false
      try {
        const AudioCtor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
        context = new AudioCtor()
        void context.resume()
        playPattern()
        timer = window.setInterval(playPattern, pattern === 'incoming' ? 2200 : 3000)
      } catch {
        stopped = true
      }
    },
    stop() {
      stopped = true
      if (timer) window.clearInterval(timer)
      timer = null
      if (context) {
        void context.close().catch(() => undefined)
        context = null
      }
    },
  }
}
