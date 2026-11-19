import type { AlertEngine } from "../engine.js"
import type { AlertTriggerEvent } from "../types.js"

export interface RelayerStalledInput {
  relayerName: string
  route: string // e.g. "c-chain -> echo"
  /** Whether the relayer's Prometheus endpoint is responding with 200 OK */
  relayerHealthy: boolean
  /** Number of SendCrossChainMessage events on the source chain during the window */
  messagesSent: number
  /** Number of messages successfully delivered by the relayer during the window */
  messagesDelivered: number
  /** Evaluation window in seconds (default: 300s / 5 minutes) */
  windowSeconds?: number
  timestamp?: number
}

/**
 * Rule 1: Relayer stalled while "up"
 * Severity: Critical
 *
 * Fires when the relayer process is healthy (metrics endpoint responding, no errors),
 * but message delivery has halted while the source chain continues emitting cross-chain messages.
 */
export function evaluateRelayerStalled(
  engine: AlertEngine,
  input: RelayerStalledInput,
): { status: "firing" | "resolved" | "noop"; notified: boolean } {
  const windowSec = input.windowSeconds ?? 300
  const incidentId = `relayer_stalled_while_up:${input.relayerName}:${input.route}`
  const now = input.timestamp ?? Math.floor(Date.now() / 1000)

  // Failure condition: Relayer reports UP, messages are accumulating on source, 0 delivered.
  const isStalled = input.relayerHealthy && input.messagesSent > 0 && input.messagesDelivered === 0

  if (isStalled) {
    const triggerEvent: AlertTriggerEvent = {
      incidentId,
      ruleId: "relayer_stalled_while_up",
      severity: "critical",
      title: `Relayer Stalled While Up: ${input.relayerName} (${input.route})`,
      message: `Relayer process is UP and responding to metrics probes, but 0 messages delivered while ${input.messagesSent} messages were sent on ${input.route} over the last ${windowSec}s. Cross-chain operations are silently stalled.`,
      timestamp: now,
      metadata: {
        relayerName: input.relayerName,
        route: input.route,
        messagesSent: input.messagesSent,
        messagesDelivered: input.messagesDelivered,
        windowSeconds: windowSec,
      },
    }
    const result = engine.trigger(triggerEvent)
    return { status: "firing", notified: result.notified }
  }

  // Recovery condition: Messages are now being delivered again.
  if (input.messagesDelivered > 0) {
    const result = engine.resolve(
      incidentId,
      `Relayer ${input.relayerName} resumed message delivery on ${input.route} (${input.messagesDelivered} delivered). Delivery pipeline restored.`,
      now,
    )
    if (result.notified) {
      return { status: "resolved", notified: true }
    }
  }

  return { status: "noop", notified: false }
}
