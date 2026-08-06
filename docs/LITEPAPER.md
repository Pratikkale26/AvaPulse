# AvaPulse — Litepaper

**Alerting-first observability for self-hosted Avalanche L1s and ICM relayers**

*Pratik Kale · August 2026 · v1.0*

---

## Abstract

Every team that self-hosts an Avalanche L1 inherits an unsolved operations problem: the infrastructure exposes raw metrics, but nothing turns them into alerts — and the failures that actually take down cross-chain applications are invisible to generic monitoring because they are *semantic*, not infrastructural. A relayer can report "up" while messages silently stop being delivered. A gas wallet can drain to zero and halt delivery with no error surfaced anywhere.

AvaPulse is an open-source monitoring stack, deployable with one `docker-compose up`, that watches the ICM message lifecycle — not just process health — and delivers Avalanche-native alerts to Telegram, Discord, Slack, email, and webhooks. Self-hosted is first-class and free; a hosted tier funds sustainability.

## Background

Avalanche's architecture is a network of sovereign L1s connected by Interchain Messaging (ICM/Teleporter). Messages between chains are delivered by relayers — off-chain services any team can run — which pay destination-chain gas from their own wallets. The ecosystem is actively expanding: the Avalanche Foundation's Retro9000 program alone has issued 35+ grants across four cohorts to teams launching L1s and infrastructure, with 150+ projects building on its testnet. Every new self-hosted L1 needs monitoring from day one.

## The problem

**1. The tooling stops at raw metrics.** The official ICM relayer (`ava-labs/icm-services`) exposes a Prometheus endpoint and nothing more — no alerting layer, no official dashboards. Ava Labs' `avalanche-monitoring` repo provides node-level Grafana dashboard JSONs with no notification pipeline. Assembling Prometheus + Grafana + Alertmanager + custom checks is a multi-day project that every L1 team repeats from scratch.

**2. The worst failures are semantic.** Three failure modes recur in ICM operations, and none can be expressed as a generic Alertmanager rule, because each exists only in the *relationship* between signals that individually look healthy:

- **Relayer stalled while "up"** — the process is healthy and scraping fine, but the source chain keeps emitting `SendCrossChainMessage` events while the delivered counter stays flat.
- **Gas wallet drained** — the relayer's destination-chain account empties; delivery halts silently. Detecting it early requires balance probes plus spend-rate projection.
- **Stuck message** — an individual message passes send but never reaches execution; catching it requires tracking each `messageID` through its lifecycle with per-chain-pair delivery expectations.

**3. Existing tools don't cover the gap.**

| | ICM-aware | Alerting-first | Self-host | Free core |
|---|---|---|---|---|
| **AvaPulse** | ✓ | ✓ | ✓ | ✓ |
| Zeeve | — | ✓ | ✓ | enterprise pricing |
| Avalanche Notify | — | email-only, beta | — | ✓ |
| avalanche-monitoring | — | DIY Grafana | ✓ | ✓ |
| AvaCloud | — | — | managed only | — |

Zeeve monitors nodes and chains well, at enterprise pricing, without ICM awareness. Avalanche Notify emails when a primary-network validator is unresponsive — no L1-chain, relayer, or message coverage, and Ava Labs itself recommends redundant monitoring alongside it. The cross-chain message layer is watched by nothing. That layer is AvaPulse's wedge.

## The product

One YAML config declaring chains, relayers, gas wallets, and ICM chain pairs; one `docker-compose up`. Then:

- **Collector** — ingests AvalancheGo node metrics, relayer Prometheus metrics, and RPC health probes across any number of L1s.
- **ICM lifecycle tracker** — subscribes to Teleporter event logs on source and destination chains and correlates them by `messageID` (send → receive → execute → receipt), so the system knows which messages are late *right now*.
- **Alert engine** — five Avalanche-native rules shipped as defaults: `relayer_stalled_while_up`, `relayer_gas_wallet_low` (with projected time-to-empty), `icm_message_stuck` (with escalation), `validator_uptime_dipping` (fires *before* the threshold is breached), `chain_degraded`. Declarative YAML rules, deduplication, cooldowns, and a recovery notification for every firing alert — silence means healthy, not unknown.
- **Notifier** — Telegram, Discord, Slack, email, generic webhooks, routed per severity.
- **Dashboards** — node health, chain health, and a cross-chain message-flow board.

Full technical design: [ARCHITECTURE.md](ARCHITECTURE.md) · rule specifications: [ALERT-RULES.md](ALERT-RULES.md).

## Market analysis

**Who needs it:** every team running a self-hosted Avalanche L1 or ICM relayer — the Avalanche-CLI path that managed platforms don't serve. The population is dozens today and growing with each Retro9000 cohort and Codebase batch; the tool is needed *continuously* from testnet onward, making monitored-chains a compounding metric rather than a one-time download.

**Why now:** ICM adoption is accelerating (token transfers, cross-L1 apps), and each new integration multiplies the surface for silent delivery failures. The relayer's own release notes repeatedly cite "logging and metrics improvements to aid in troubleshooting" — direct evidence operators are struggling in production.

**Positioning:** AvaPulse is ecosystem infrastructure, not a venture-scale consumer product. The comparable is L1Beat — public-good Avalanche tooling sustained through ecosystem funding — but on the operator side of the glass, where no equivalent exists.

## Prior work

AvaPulse's lifecycle tracker derives from [ICM Trace](https://icm-trace.vercel.app/), a cross-chain execution debugger by the same builder that reconstructs Teleporter message lifecycles and decodes destination-chain failures. Post-mortem debugging (ICM Trace) and live alerting (AvaPulse) are two halves of one observability story; the message-correlation core is already validated.

## Milestones & funding

Requested grant: **$8,000**, milestone-gated, ~12 weeks to MVP.

| Milestone | Deliverables | Exit criteria | Amount |
|---|---|---|---|
| **M1** (wk 1–4) | Collector, storage, prebuilt dashboards, live Fuji demo | A stranger points AvaPulse at a Fuji L1 + relayer and sees live dashboards within 10 minutes | $3,000 |
| **M2** (wk 5–8) | Lifecycle tracker, five default rules, notifier, one-command self-host, docs | A deliberately stalled relayer and a drained gas wallet on Fuji both alert correctly (and recover) in under 60 seconds | $3,000 |
| **M3** (wk 9–12) | Hosted beta, 3–5 real L1 teams onboarded, public launch, usage dashboard | Verifiable third-party usage: chains monitored, alerts delivered | $2,000 |

Budget covers development time, server and RPC-provider costs (including archival queries for lifecycle tracking), and testnet operations. Progress is tracked publicly via GitHub milestones: [ROADMAP.md](ROADMAP.md).

## Sustainability

The open-source core stays free and first-class — adoption is the goal. A low-cost hosted tier (same stack, multi-tenant) covers infrastructure for teams that don't want to run it themselves. Once live on mainnet, AvaPulse is a direct candidate for the Retro9000 L1 & Infrastructure Tooling round, making this grant the seed of a funded roadmap rather than a one-off.

## Team

**Pratik Kale** — builder of [ICM Trace](https://icm-trace.vercel.app/) · [GitHub](https://github.com/Pratikkale26)

---

*AvaPulse is open source under the MIT license. Repository: [github.com/Pratikkale26/AvaPulse](https://github.com/Pratikkale26/AvaPulse)*
