"use client"

import { useEffect, useRef, useState } from "react"

type Alert = {
  id: number
  sev: "CRIT" | "WARN" | "OK"
  title: string
  detail: string
  time: string
  cls: "" | "warn" | "ok"
}

const SCRIPT: Omit<Alert, "id" | "time">[] = [
  {
    sev: "CRIT",
    title: "Relayer stalled while “up”",
    detail: "14 msgs sent on c-chain → 0 delivered on my-l1 (5m window)",
    cls: "",
  },
  {
    sev: "WARN",
    title: "Relayer gas wallet low",
    detail: "0xRelayer…f3a on my-l1 → 0.31 AVAX · empty in ~6h at current spend",
    cls: "warn",
  },
  {
    sev: "CRIT",
    title: "Stuck ICM message",
    detail: "messageID 0x8c41…09be · c-chain → my-l1 · 214s > 120s threshold",
    cls: "",
  },
  {
    sev: "OK",
    title: "Recovered: relayer delivering",
    detail: "backlog drained · 14/14 delivered · latency 3.1s",
    cls: "ok",
  },
]

function useNow() {
  // Deterministic-ish clock strings for the demo feed
  const base = useRef(Date.now())
  return (offset: number) => {
    const d = new Date(base.current + offset)
    return d.toTimeString().slice(0, 8)
  }
}

export default function HeroConsole() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const flatline = useRef(false)
  const [alerts, setAlerts] = useState<Alert[]>([])
  const fmt = useNow()

  // Pulse line: healthy heartbeat that periodically flatlines while the
  // status chip keeps reading UP — the product thesis, animated.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const dpr = window.devicePixelRatio || 1

    const resize = () => {
      const { width, height } = canvas.getBoundingClientRect()
      canvas.width = width * dpr
      canvas.height = height * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener("resize", resize)

    const samples: number[] = []
    let t = 0
    let raf = 0

    const beat = (x: number) => {
      // ECG-ish: quiet baseline with a sharp spike each cycle
      const phase = x % 1
      if (phase < 0.08) return Math.sin(phase * 39.27) * 0.9
      if (phase < 0.16) return -Math.sin((phase - 0.08) * 39.27) * 0.35
      return Math.sin(phase * 6.28) * 0.04
    }

    const draw = () => {
      const { width, height } = canvas.getBoundingClientRect()
      const mid = height / 2

      t += 0.012
      // flatline between cycle 4 and 6 of every 8-cycle loop
      const loop = t % 8
      flatline.current = loop > 4 && loop < 6
      samples.push(flatline.current ? 0 : beat(t))
      const max = Math.floor(width / 2)
      while (samples.length > max) samples.shift()

      ctx.clearRect(0, 0, width, height)

      // faint grid
      ctx.strokeStyle = "rgba(42, 54, 80, 0.35)"
      ctx.lineWidth = 1
      for (let gx = 0; gx < width; gx += 28) {
        ctx.beginPath()
        ctx.moveTo(gx, 0)
        ctx.lineTo(gx, height)
        ctx.stroke()
      }

      ctx.beginPath()
      samples.forEach((v, i) => {
        const x = i * 2
        const y = mid - v * mid * 0.85
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      })
      ctx.strokeStyle = flatline.current ? "#e84142" : "#3ddc97"
      ctx.lineWidth = 1.6
      ctx.stroke()

      // emphasized endpoint
      const last = samples[samples.length - 1] ?? 0
      ctx.beginPath()
      ctx.arc((samples.length - 1) * 2, mid - last * mid * 0.85, 2.6, 0, Math.PI * 2)
      ctx.fillStyle = flatline.current ? "#e84142" : "#3ddc97"
      ctx.fill()

      raf = requestAnimationFrame(draw)
    }

    if (reduced) {
      // static healthy trace
      for (let i = 0; i < 400; i++) samples.push(beat(i * 0.012))
      t = 0.5
      const { width, height } = canvas.getBoundingClientRect()
      const mid = height / 2
      ctx.clearRect(0, 0, width, height)
      ctx.beginPath()
      samples.forEach((v, i) => {
        const x = i * 2
        const y = mid - v * mid * 0.85
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      })
      ctx.strokeStyle = "#3ddc97"
      ctx.lineWidth = 1.6
      ctx.stroke()
    } else {
      raf = requestAnimationFrame(draw)
    }

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener("resize", resize)
    }
  }, [])

  // Alert feed cycles through the scripted incident
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    let i = 0
    const push = () => {
      const s = SCRIPT[i % SCRIPT.length]
      setAlerts((prev) =>
        [{ ...s, id: Date.now() + i, time: fmt(i * 4000) }, ...prev].slice(0, 3),
      )
      i++
    }
    push()
    if (reduced) {
      push()
      push()
      return
    }
    const iv = setInterval(push, 4200)
    return () => clearInterval(iv)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="console" aria-label="Simulated AvaPulse monitoring console">
      <div className="console-bar">
        <div className="dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        avapulse · my-l1 ⇄ c-chain
        <div className="console-status">
          <span className="dot" />
          <span className="label">RELAYER UP</span>
        </div>
      </div>
      <div className="pulse-wrap">
        <div className="pulse-meta">
          <span>icm message delivery</span>
          <span>fuji · live demo data</span>
        </div>
        <canvas ref={canvasRef} className="pulse-canvas" />
      </div>
      <div className="alert-feed" aria-live="polite">
        {alerts.map((a) => (
          <div key={a.id} className={`alert-item ${a.cls}`}>
            <div className="stripe" />
            <div className="alert-body">
              <div className="alert-title">
                <span className="sev">{a.sev}</span>
                <span className="t">{a.title}</span>
                <span className="alert-time">{a.time}</span>
              </div>
              <div className="alert-detail">{a.detail}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
