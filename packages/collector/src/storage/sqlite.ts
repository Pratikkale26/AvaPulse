import { DatabaseSync } from "node:sqlite"
import type { IncidentRecord } from "@avapulse/alert-engine"
import type { LifecycleStatus, MessageLifecycle } from "@avapulse/icm-core"
import type {
  GasBalanceResult,
  RelayerMetricsSnapshot,
  RpcProbeResult,
} from "../types.js"
import { INIT_SCHEMA_SQL } from "./schema.js"

export class CollectorStorage {
  private db: DatabaseSync

  constructor(dbPath: string = "avapulse.db") {
    this.db = new DatabaseSync(dbPath)
    this.init()
  }

  private init(): void {
    this.db.exec(INIT_SCHEMA_SQL)
  }

  /** Record an RPC health probe result. */
  recordRpcProbe(probe: RpcProbeResult): void {
    const stmt = this.db.prepare(`
      INSERT INTO rpc_probes (
        chain, reachable, latency_ms, block_number, block_advanced, chain_id, error, timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)

    stmt.run(
      probe.chain,
      probe.reachable ? 1 : 0,
      probe.latencyMs,
      probe.blockNumber !== undefined ? probe.blockNumber.toString() : null,
      probe.blockAdvanced ? 1 : 0,
      probe.chainId ?? null,
      probe.error ?? null,
      probe.timestamp,
    )
  }

  /** Record a gas wallet balance observation. */
  recordGasBalance(gas: GasBalanceResult): void {
    const stmt = this.db.prepare(`
      INSERT INTO gas_balances (
        relayer_name, chain, address, balance_wei, balance_avax, min_balance_avax, is_low, is_critical, timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    stmt.run(
      gas.relayerName,
      gas.chain,
      gas.address.toLowerCase(),
      gas.balanceWei.toString(),
      gas.balanceAvax,
      gas.minBalanceAvax,
      gas.isLow ? 1 : 0,
      gas.isCritical ? 1 : 0,
      gas.timestamp,
    )
  }

  /** Record a relayer metrics scrape snapshot. */
  recordRelayerSnapshot(snapshot: RelayerMetricsSnapshot): void {
    const stmt = this.db.prepare(`
      INSERT INTO relayer_snapshots (
        relayer_name, reachable, delivered_total, received_total, errors_total, timestamp
      ) VALUES (?, ?, ?, ?, ?, ?)
    `)

    stmt.run(
      snapshot.relayerName,
      snapshot.reachable ? 1 : 0,
      snapshot.messagesDelivered,
      snapshot.messagesReceived,
      snapshot.errorsTotal,
      snapshot.timestamp,
    )
  }

  /** Record or update a Teleporter message lifecycle. */
  recordMessageLifecycle(lc: MessageLifecycle, updatedAt = Math.floor(Date.now() / 1000)): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO messages (
        message_id, status, source_chain, destination_chain, origin_sender, destination_address,
        sent_at, delivered_at, executed_at, failed_at, receipted_at, latency_seconds, failure_count, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    stmt.run(
      lc.messageID,
      lc.status,
      lc.sourceChain ?? null,
      lc.destinationChain ?? null,
      lc.originSender ?? null,
      lc.destinationAddress ?? null,
      lc.sentAt ?? null,
      lc.deliveredAt ?? null,
      lc.executedAt ?? null,
      lc.failedAt ?? null,
      lc.receiptedAt ?? null,
      lc.deliveryLatencySeconds ?? null,
      lc.failureCount,
      updatedAt,
    )
  }

  /** Record or update an alert incident. */
  recordIncident(incident: IncidentRecord): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO incidents (
        id, rule_id, status, severity, title, message,
        first_triggered_at, last_triggered_at, last_notified_at, resolved_at,
        notification_count, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    stmt.run(
      incident.id,
      incident.ruleId,
      incident.status,
      incident.severity,
      incident.title,
      incident.message,
      incident.firstTriggeredAt,
      incident.lastTriggeredAt,
      incident.lastNotifiedAt,
      incident.resolvedAt ?? null,
      incident.notificationCount,
      JSON.stringify(incident.metadata),
    )
  }

  /** Query recent RPC probes for a chain. */
  getRecentProbes(chain: string, limit = 50): RpcProbeResult[] {
    const stmt = this.db.prepare(`
      SELECT chain, reachable, latency_ms, block_number, block_advanced, chain_id, error, timestamp
      FROM rpc_probes
      WHERE chain = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `)

    const rows = stmt.all(chain, limit) as Array<{
      chain: string
      reachable: number
      latency_ms: number
      block_number: string | null
      block_advanced: number
      chain_id: number | null
      error: string | null
      timestamp: number
    }>

    return rows.map((r) => ({
      chain: r.chain,
      reachable: r.reachable === 1,
      latencyMs: r.latency_ms,
      blockNumber: r.block_number ? BigInt(r.block_number) : undefined,
      blockAdvanced: r.block_advanced === 1,
      chainId: r.chain_id ?? undefined,
      error: r.error ?? undefined,
      timestamp: r.timestamp,
    }))
  }

  /** Query the latest balance for all monitored wallets. */
  getLatestGasBalances(): GasBalanceResult[] {
    const stmt = this.db.prepare(`
      SELECT g.* FROM gas_balances g
      INNER JOIN (
        SELECT chain, address, MAX(timestamp) as max_ts
        FROM gas_balances
        GROUP BY chain, address
      ) latest ON g.chain = latest.chain AND g.address = latest.address AND g.timestamp = latest.max_ts
    `)

    const rows = stmt.all() as Array<{
      relayer_name: string
      chain: string
      address: string
      balance_wei: string
      balance_avax: number
      min_balance_avax: number
      is_low: number
      is_critical: number
      timestamp: number
    }>

    return rows.map((r) => ({
      relayerName: r.relayer_name,
      chain: r.chain,
      address: r.address as `0x${string}`,
      balanceWei: BigInt(r.balance_wei),
      balanceAvax: r.balance_avax,
      minBalanceAvax: r.min_balance_avax,
      isLow: r.is_low === 1,
      isCritical: r.is_critical === 1,
      timestamp: r.timestamp,
    }))
  }

  /**
   * Calculate burn rate in AVAX per hour for a destination wallet based on historical observations.
   */
  calculateBurnRate(
    chain: string,
    address: string,
    windowSeconds = 3600,
    now = Math.floor(Date.now() / 1000),
  ): number {
    const windowStart = now - windowSeconds

    const stmt = this.db.prepare(`
      SELECT balance_avax, timestamp
      FROM gas_balances
      WHERE chain = ? AND address = ? AND timestamp >= ?
      ORDER BY timestamp ASC
    `)

    const rows = stmt.all(chain, address.toLowerCase(), windowStart) as Array<{
      balance_avax: number
      timestamp: number
    }>

    if (rows.length < 2) return 0

    const oldest = rows[0]
    const newest = rows[rows.length - 1]
    const timeDelta = newest.timestamp - oldest.timestamp
    if (timeDelta <= 0) return 0

    const spent = oldest.balance_avax - newest.balance_avax
    if (spent <= 0) return 0 // Balance increased or remained flat

    const ratePerSecond = spent / timeDelta
    return ratePerSecond * 3600
  }

  /** Query tracked Teleporter messages by status. */
  getMessages(status?: LifecycleStatus, limit = 50): MessageLifecycle[] {
    let stmt
    let rows: unknown[]

    if (status) {
      stmt = this.db.prepare(`
        SELECT * FROM messages WHERE status = ? ORDER BY updated_at DESC LIMIT ?
      `)
      rows = stmt.all(status, limit)
    } else {
      stmt = this.db.prepare(`
        SELECT * FROM messages ORDER BY updated_at DESC LIMIT ?
      `)
      rows = stmt.all(limit)
    }

    return (
      rows as Array<{
        message_id: string
        status: LifecycleStatus
        source_chain: string | null
        destination_chain: string | null
        origin_sender: string | null
        destination_address: string | null
        sent_at: number | null
        delivered_at: number | null
        executed_at: number | null
        failed_at: number | null
        receipted_at: number | null
        latency_seconds: number | null
        failure_count: number
      }>
    ).map((r) => ({
      messageID: r.message_id as `0x${string}`,
      status: r.status,
      sourceChain: r.source_chain ?? undefined,
      destinationChain: r.destination_chain ?? undefined,
      originSender: (r.origin_sender as `0x${string}`) ?? undefined,
      destinationAddress: (r.destination_address as `0x${string}`) ?? undefined,
      sentAt: r.sent_at ?? undefined,
      deliveredAt: r.delivered_at ?? undefined,
      executedAt: r.executed_at ?? undefined,
      failedAt: r.failed_at ?? undefined,
      receiptedAt: r.receipted_at ?? undefined,
      deliveryLatencySeconds: r.latency_seconds ?? undefined,
      failureCount: r.failure_count,
      events: [],
    }))
  }

  /** Query active alert incidents. */
  getActiveIncidents(): IncidentRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM incidents WHERE status = 'firing' ORDER BY last_triggered_at DESC
    `)

    const rows = stmt.all() as Array<{
      id: string
      rule_id: string
      status: "firing" | "resolved"
      severity: "warning" | "critical"
      title: string
      message: string
      first_triggered_at: number
      last_triggered_at: number
      last_notified_at: number
      resolved_at: number | null
      notification_count: number
      metadata_json: string | null
    }>

    return rows.map((r) => ({
      id: r.id,
      ruleId: r.rule_id as IncidentRecord["ruleId"],
      status: r.status,
      severity: r.severity,
      title: r.title,
      message: r.message,
      firstTriggeredAt: r.first_triggered_at,
      lastTriggeredAt: r.last_triggered_at,
      lastNotifiedAt: r.last_notified_at,
      resolvedAt: r.resolved_at ?? undefined,
      notificationCount: r.notification_count,
      metadata: r.metadata_json ? JSON.parse(r.metadata_json) : {},
    }))
  }

  close(): void {
    this.db.close()
  }
}
