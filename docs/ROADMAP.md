# Roadmap

Three milestones to MVP (~12 weeks), then a sustainability path. Progress is tracked in public via GitHub issues and milestones.

## M1 — Collector & dashboards (weeks 1–4)

- [ ] Collector: AvalancheGo node metrics, ICM relayer Prometheus metrics, RPC health probes
- [ ] Storage layer (SQLite default)
- [ ] Prebuilt dashboards: node health, chain health, cross-chain message-flow view
- [ ] Live demo monitoring Fuji testnet L1s
- [ ] Repo public under MIT (done)

**Exit criteria:** a stranger can point AvaPulse at a Fuji L1 + relayer and see live dashboards within 10 minutes.

## M2 — Semantic alert engine (weeks 5–8)

- [ ] ICM lifecycle tracker (Teleporter event correlation by `messageID`)
- [ ] Alert engine with the five default rules ([ALERT-RULES.md](ALERT-RULES.md))
- [ ] Notifier: Telegram, Discord, Slack, email, generic webhooks
- [ ] One-command self-hosting via `docker-compose up`
- [ ] Documentation: quickstart, configuration reference

**Exit criteria:** a deliberately stalled relayer and a drained gas wallet on Fuji both produce correct alerts (and recoveries) in under 60 seconds.

## M3 — Hosted beta & adoption (weeks 9–12)

- [ ] Hosted version (same stack, multi-tenant)
- [ ] Onboard 3–5 real L1/relayer teams from the Avalanche community
- [ ] Public launch post + usage dashboard (chains monitored, alerts delivered)

**Exit criteria:** verifiable third-party usage — the metric that matters.

## Post-MVP

- Mainnet hardening and archival-query optimization
- Alert rule marketplace / community-contributed rules
- Retro9000 L1 & Infrastructure Tooling round application once live on mainnet
- Hosted tier pricing (open-source core stays free and first-class)
