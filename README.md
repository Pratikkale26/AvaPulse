# AvaPulse

**Alerting-first observability for self-hosted Avalanche L1s and ICM relayers.**

> "Up" is not the same as "working." A relayer process can report healthy while cross-chain messages silently pile up undelivered. AvaPulse watches the message lifecycle — not just the process — and alerts you before your users notice.

[![Status](https://img.shields.io/badge/status-in%20development-orange)](docs/ROADMAP.md)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

---

## The problem

Every team that self-hosts an Avalanche L1 inherits the same unsolved ops burden:

- **The ICM relayer exposes only raw Prometheus metrics.** No official alerting layer, no official ICM Grafana dashboard. Assembling Prometheus + Grafana + Alertmanager + custom checks is a multi-day project every L1 team repeats from scratch.
- **The worst failures are semantic, not infrastructural.** No generic Alertmanager rule can catch them, because detecting them requires understanding the Teleporter message lifecycle:
  - a relayer that is **"up" while messages stop being delivered**
  - a **destination-chain gas wallet quietly draining to zero** — delivery halts with no error anywhere
  - a validator drifting toward its uptime threshold
- **Existing tools don't cover the gap.** Managed platforms (AvaCloud, Zeeve) monitor nodes and chains for their customers but are not ICM-aware. Avalanche Notify is email-only, beta, and covers primary-network validators only. `avalanche-monitoring` is DIY Grafana JSON with no notifications.

## What AvaPulse does

One `docker-compose up` gives you:

| Component | What it does |
|---|---|
| **Collector** | Ingests AvalancheGo node metrics, ICM relayer Prometheus metrics, and RPC health checks across any number of L1s |
| **ICM lifecycle tracker** | Follows Teleporter messages by `messageID` (send → receive → execute → receipt) to detect stuck messages, latency degradation, and retry storms |
| **Alert engine** | Avalanche-native rules shipped out of the box — see [docs/ALERT-RULES.md](docs/ALERT-RULES.md) |
| **Notifier** | Telegram, Discord, Slack, email, and generic webhooks |
| **Dashboards** | Node health, chain health, and a cross-chain message-flow view |

### The alert rules that don't exist anywhere else

1. **Relayer stalled while "up"** — process healthy, but messages accumulating with none delivered
2. **Relayer gas wallet low** — destination-chain balance below threshold (the classic silent killer)
3. **Stuck ICM message** — a tracked message exceeds its delivery-time threshold
4. **Validator offline / uptime dipping** — before the threshold is breached, not after
5. **Chain degraded** — RPC unresponsive or blocks not being produced

## Status

AvaPulse is in active development, building in public. It builds on the message-correlation engine validated in [ICM Trace](https://icm-trace.vercel.app/), a cross-chain execution debugger by the same builder — post-mortem debugging and live alerting are two halves of the same observability story.

See the [litepaper](docs/LITEPAPER.md) for the full picture, [docs/ROADMAP.md](docs/ROADMAP.md) for milestones, and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the technical design.

## Landing page

The `site/` directory contains the project landing page. To deploy on Vercel, set the project's **Root Directory** to `site/`.

## License

[MIT](LICENSE)
