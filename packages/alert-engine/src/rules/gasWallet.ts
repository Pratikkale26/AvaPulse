import type { AlertEngine } from "../engine.js"
import type { AlertSeverity, AlertTriggerEvent } from "../types.js"

export interface RelayerGasWalletInput {
  relayerName: string
  chain: string
  walletAddress: string
  /** Balance in native token units (e.g. AVAX) */
  balanceAvax: number
  /** Minimum balance threshold before warning (e.g. 0.5 AVAX) */
  minBalanceAvax: number
  /** Critical threshold ratio relative to minBalanceAvax (default: 0.2 = 20%) */
  criticalRatio?: number
  /** Estimated burn rate in AVAX per hour for time-to-empty projection */
  burnRatePerHour?: number
  timestamp?: number
}

/**
 * Rule 2: Relayer gas wallet low
 * Severity: Warning (below min_balance) / Critical (below 20% of min_balance)
 *
 * Catches the silent killer of ICM relayers: destination-chain gas exhaustion.
 * When the destination gas wallet empties, transactions cease with no error in relayer process logs.
 */
export function evaluateGasWallet(
  engine: AlertEngine,
  input: RelayerGasWalletInput,
): { status: "firing" | "resolved" | "noop"; notified: boolean } {
  const incidentId = `relayer_gas_wallet_low:${input.chain}:${input.walletAddress.toLowerCase()}`
  const now = input.timestamp ?? Math.floor(Date.now() / 1000)
  const criticalRatio = input.criticalRatio ?? 0.2
  const criticalThreshold = input.minBalanceAvax * criticalRatio

  const isCritical = input.balanceAvax <= criticalThreshold
  const isWarning = input.balanceAvax <= input.minBalanceAvax

  if (isCritical || isWarning) {
    const severity: AlertSeverity = isCritical ? "critical" : "warning"
    let timeToEmptyStr = ""
    if (input.burnRatePerHour && input.burnRatePerHour > 0) {
      const hoursRemaining = input.balanceAvax / input.burnRatePerHour
      timeToEmptyStr = ` Projected time-to-empty: ~${hoursRemaining.toFixed(1)}h at current burn rate.`
    }

    const triggerEvent: AlertTriggerEvent = {
      incidentId,
      ruleId: "relayer_gas_wallet_low",
      severity,
      title: `Relayer Gas Wallet ${isCritical ? "CRITICAL" : "LOW"}: ${input.chain} (${input.relayerName})`,
      message: `Destination gas wallet for ${input.relayerName} on ${input.chain} (${input.walletAddress}) has dropped to ${input.balanceAvax.toFixed(4)} AVAX (threshold: ${input.minBalanceAvax.toFixed(4)} AVAX).${timeToEmptyStr}`,
      timestamp: now,
      metadata: {
        relayerName: input.relayerName,
        chain: input.chain,
        walletAddress: input.walletAddress,
        balanceAvax: input.balanceAvax,
        minBalanceAvax: input.minBalanceAvax,
        criticalThreshold,
        burnRatePerHour: input.burnRatePerHour,
      },
    }

    const result = engine.trigger(triggerEvent)
    return { status: "firing", notified: result.notified }
  }

  // Recovery: Balance is restored above minBalanceAvax
  const result = engine.resolve(
    incidentId,
    `Gas wallet on ${input.chain} (${input.walletAddress}) restored to ${input.balanceAvax.toFixed(4)} AVAX. Balance safely above threshold (${input.minBalanceAvax.toFixed(4)} AVAX).`,
    now,
  )

  if (result.notified) {
    return { status: "resolved", notified: true }
  }

  return { status: "noop", notified: false }
}
