# Alert Rules

The rules AvaPulse ships by default. The first three are **semantic** rules — they require ICM lifecycle awareness and cannot be expressed as generic Prometheus Alertmanager rules. All rules fire a recovery notification when the condition clears, and all thresholds are overridable in `avapulse.yaml`.

## Semantic rules (the moat)

### 1. Relayer stalled while "up"
**Severity: critical.** The relayer process is healthy (metrics endpoint responding, no error logs), but the delivered-message counter has not advanced while the source chain keeps emitting `SendCrossChainMessage` events.

- **Detection:** `messages_sent(source) > 0` over window *W* AND `messages_delivered(relayer) == 0` over *W*, with relayer scrape succeeding.
- **Why generic monitoring misses it:** every individual signal looks fine — the failure only exists in the *relationship* between chain events and relayer throughput.
- **Default window:** 5 minutes.

### 2. Relayer gas wallet low
**Severity: critical (empty) / warning (low).** The relayer's account on a destination chain is approaching zero. When it empties, message delivery halts with no error surfaced anywhere — the classic silent killer of ICM setups.

- **Detection:** balance probe per configured `(chain, address)` against `min_balance`; a projected time-to-empty is computed from recent spend rate and included in the alert.
- **Default:** warn at `min_balance`, critical at 20% of it.

### 3. Stuck ICM message
**Severity: warning, escalating.** A tracked message has passed `SendCrossChainMessage` but not reached `MessageExecuted` / `MessageExecutionFailed` within the pair's `max_delivery_seconds`.

- **Detection:** lifecycle tracker's per-message timers; the alert carries the `messageID`, chain pair, and elapsed time, and links to the message's lifecycle view.
- **Escalation:** re-fires at 2× and 5× the threshold with raised severity.

## Infrastructure rules

### 4. Validator offline / uptime dipping
**Severity: warning (dipping) / critical (offline).** Fires *before* the uptime threshold is breached, not after — the point is preserving rewards and L1 health, not documenting the failure.

- **Detection:** node liveness via metrics scrape + peer-reported uptime trending toward the configured floor.

### 5. Chain degraded
**Severity: critical.** An L1's RPC endpoint is unresponsive, or block height has not advanced within the expected window.

- **Detection:** RPC probe latency/failure and block-progression checks per chain.

## Delivery & noise control

- **Channels:** Telegram, Discord, Slack, email, generic webhook — routed per severity.
- **Cooldowns:** identical alerts are deduplicated within a cooldown window; escalations bypass cooldown.
- **Recovery:** every firing alert has a matching recovery notification, so a quiet channel means "healthy," not "unknown."
