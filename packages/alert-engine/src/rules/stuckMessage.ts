import type { MessageLifecycle } from "@avapulse/icm-core"
import type { AlertEngine } from "../engine.js"
import type { AlertSeverity, AlertTriggerEvent } from "../types.js"

export interface StuckMessageInput {
  lifecycle: MessageLifecycle
  /** Maximum expected delivery time in seconds (e.g. 120s) */
  maxDeliverySeconds: number
  timestamp?: number
}

/**
 * Rule 3: Stuck ICM message
 * Severity: Warning (exceeds max_delivery_seconds) / Escalating to Critical (exceeds 5x threshold)
 *
 * Catches individual cross-chain messages that have been emitted on the source chain
 * but haven't reached execution/failure on the destination chain within the SLA window.
 */
export function evaluateStuckMessage(
  engine: AlertEngine,
  input: StuckMessageInput,
): { status: "firing" | "resolved" | "noop"; notified: boolean } {
  const { lifecycle, maxDeliverySeconds } = input
  const now = input.timestamp ?? Math.floor(Date.now() / 1000)
  const incidentId = `icm_message_stuck:${lifecycle.messageID}`

  // Check if message is executed or failed (resolved)
  const isCompleted = lifecycle.executedAt !== undefined || lifecycle.failedAt !== undefined

  if (isCompleted) {
    const result = engine.resolve(
      incidentId,
      `Cross-chain message ${lifecycle.messageID} concluded on destination chain with status: ${lifecycle.status}. Incident resolved.`,
      now,
    )
    if (result.notified) {
      return { status: "resolved", notified: true }
    }
    return { status: "noop", notified: false }
  }

  // Check if message has been sent and is past delivery threshold
  if (lifecycle.sentAt !== undefined) {
    const elapsedSeconds = now - lifecycle.sentAt
    if (elapsedSeconds > maxDeliverySeconds) {
      // Escalation: 5x threshold promotes from warning to critical
      const isCritical = elapsedSeconds >= 5 * maxDeliverySeconds || lifecycle.failureCount > 0
      const severity: AlertSeverity = isCritical ? "critical" : "warning"

      const triggerEvent: AlertTriggerEvent = {
        incidentId,
        ruleId: "icm_message_stuck",
        severity,
        title: `Stuck ICM Message: ${lifecycle.sourceChain ?? "source"} -> ${lifecycle.destinationChain ?? "dest"}`,
        message: `Teleporter message ${lifecycle.messageID} was sent ${elapsedSeconds}s ago and has not executed (SLA threshold: ${maxDeliverySeconds}s). Current lifecycle status: ${lifecycle.status}.`,
        timestamp: now,
        metadata: {
          messageID: lifecycle.messageID,
          sourceChain: lifecycle.sourceChain,
          destinationChain: lifecycle.destinationChain,
          sentAt: lifecycle.sentAt,
          elapsedSeconds,
          maxDeliverySeconds,
          failureCount: lifecycle.failureCount,
        },
      }

      const result = engine.trigger(triggerEvent)
      return { status: "firing", notified: result.notified }
    }
  }

  return { status: "noop", notified: false }
}
