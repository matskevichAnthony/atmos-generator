(function () {
  const Orig = window.AudioContext || window.webkitAudioContext
  if (!Orig) return

  const taps = []
  let recording = false
  let lastStats = { frames: 0, peak: 0 }
  let levelPeak = 0
  let scopeBlock = new Float32Array(1024)
  let capturedEnd = 0

  const protoConnect = AudioNode.prototype.connect
  AudioNode.prototype.connect = function (target, ...rest) {
    for (const t of taps) {
      if (target === t.dest && this !== t.proc) {
        try { protoConnect.call(this, t.proc) } catch (e) { /* already linked */ }
      }
    }
    return protoConnect.call(this, target, ...rest)
  }

  const installTap = (ctx) => {
    try {
      const proc = ctx.createScriptProcessor(4096, 2, 2)
      const tap = { ctx, dest: ctx.destination, proc, blocks: [] }
      proc.onaudioprocess = (e) => {
        const buf = e.inputBuffer
        const ch0 = buf.getChannelData(0)
        let peak = 0
        for (let i = 0; i < ch0.length; i++) { const a = Math.abs(ch0[i]); if (a > peak) peak = a }
        levelPeak = Math.max(peak, levelPeak * 0.82)
        scopeBlock.set(ch0.subarray(0, 1024))
        if (!recording) return
        tap.blocks.push({
          t: e.playbackTime,
          L: Float32Array.from(ch0),
          R: Float32Array.from(buf.getChannelData(buf.numberOfChannels > 1 ? 1 : 0)),
        })
        capturedEnd = Math.max(capturedEnd, e.playbackTime + ch0.length / ctx.sampleRate)
      }
      proc.connect(ctx.destination)
      taps.push(tap)
    } catch (e) { console.warn('[capture] tap failed', e) }
  }

  const Patched = function (...args) {
    const ctx = new Orig(...args)
    installTap(ctx)
    return ctx
  }
  Patched.prototype = Orig.prototype
  window.AudioContext = Patched
  if (window.webkitAudioContext) window.webkitAudioContext = Patched

  const merge = (chunks, len) => {
    const out = new Float32Array(len)
    let off = 0
    for (const c of chunks) { out.set(c, off); off += c.length }
    return out
  }

  const peakOf = (...arrays) => {
    let peak = 0
    for (const arr of arrays) for (let i = 0; i < arr.length; i++) {
      const a = Math.abs(arr[i]); if (a > peak) peak = a
    }
    return peak
  }

  const encodeWav = (L, R, sampleRate, scale) => {
    const len = L.length
    const buffer = new ArrayBuffer(44 + len * 4)
    const view = new DataView(buffer)
    const str = (o, s) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)) }
    str(0, 'RIFF'); view.setUint32(4, 36 + len * 4, true); str(8, 'WAVE')
    str(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true)
    view.setUint16(22, 2, true); view.setUint32(24, sampleRate, true)
    view.setUint32(28, sampleRate * 4, true); view.setUint16(32, 4, true); view.setUint16(34, 16, true)
    str(36, 'data'); view.setUint32(40, len * 4, true)
    let off = 44
    for (let i = 0; i < len; i++) {
      const l = Math.max(-1, Math.min(1, L[i] * scale)), r = Math.max(-1, Math.min(1, R[i] * scale))
      view.setInt16(off, l < 0 ? l * 0x8000 : l * 0x7fff, true); off += 2
      view.setInt16(off, r < 0 ? r * 0x8000 : r * 0x7fff, true); off += 2
    }
    return new Blob([view], { type: 'audio/wav' })
  }

  const style = document.createElement('style')
  style.textContent = '.is-rec{background:#e11d1d!important;color:#fff!important;border-color:#e11d1d!important;animation:recblink 1s steps(2,jump-none) infinite}@keyframes recblink{50%{opacity:.45}}'
  document.head.appendChild(style)

  const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

  window.StrudelCapture = {
    isRecording: () => recording,
    getLevel: () => levelPeak,
    getScope: () => scopeBlock,
    getCapturedEnd: () => capturedEnd,

    startRaw() {
      taps.forEach((t) => { t.blocks = [] })
      capturedEnd = 0
      recording = true
    },

    stopRaw() {
      recording = false
      const active = taps.filter((t) => t.blocks.length)
      if (!active.length) return { L: new Float32Array(0), R: new Float32Array(0), sampleRate: 44100, blocks: [] }
      // several AudioContexts may exist (engine spares); pick the one carrying actual signal
      const energy = (t) => {
        let sum = 0
        for (const b of t.blocks) for (let i = 0; i < b.L.length; i += 32) sum += Math.abs(b.L[i])
        return sum
      }
      const tap = active.sort((a, b) => energy(b) - energy(a))[0]
      const len = tap.blocks.reduce((a, b) => a + b.L.length, 0)
      return {
        L: merge(tap.blocks.map((b) => b.L), len),
        R: merge(tap.blocks.map((b) => b.R), len),
        sampleRate: tap.ctx.sampleRate,
        blocks: tap.blocks,
      }
    },

    // sample-accurate extraction of [tStart, tStart+seconds) from timestamped blocks; gaps are zero-filled
    slice(raw, tStart, seconds) {
      const sr = raw.sampleRate
      const n = Math.round(seconds * sr)
      const L = new Float32Array(n)
      const R = new Float32Array(n)
      for (const b of raw.blocks) {
        const offset = Math.round((b.t - tStart) * sr)
        const from = Math.max(0, -offset)
        const to = Math.min(b.L.length, n - offset)
        for (let i = from; i < to; i++) {
          L[offset + i] = b.L[i]
          R[offset + i] = b.R[i]
        }
      }
      return { L, R, sampleRate: sr }
    },

    makeWav(L, R, sampleRate) {
      const peak = peakOf(L, R)
      const scale = peak > 0.99 ? 0.99 / peak : 1
      return { blob: encodeWav(L, R, sampleRate, scale), peak, normalized: scale < 1 }
    },

    saveBlob(blob, filename) {
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    },

    start() { this.startRaw() },
    stop(name) {
      const { L, R, sampleRate } = this.stopRaw()
      lastStats = { frames: L.length, peak: 0, sampleRate }
      if (!L.length) return lastStats
      const { blob, peak, normalized } = this.makeWav(L, R, sampleRate)
      lastStats = { frames: L.length, peak, sampleRate, normalized }
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      this.saveBlob(blob, `${name || 'strudel'}-${stamp}.wav`)
      return lastStats
    },
    lastStats: () => lastStats,

    attach(button, { name = 'strudel', ensurePlaying, timeEl } = {}) {
      const label = button.textContent
      let t0 = 0, timer = 0
      button.addEventListener('click', () => {
        if (!this.isRecording()) {
          if (ensurePlaying) ensurePlaying()
          this.start()
          button.classList.add('is-rec')
          button.textContent = '● STOP+SAVE'
          t0 = performance.now()
          timer = setInterval(() => { if (timeEl) timeEl.textContent = fmt((performance.now() - t0) / 1000) }, 200)
        } else {
          this.stop(name)
          button.classList.remove('is-rec')
          button.textContent = label
          clearInterval(timer)
          if (timeEl) timeEl.textContent = ''
        }
      })
    },
  }
})()
