import type { Address, Hex } from "viem"
import type { LifecycleStatus, MessageLifecycle, TeleporterEventRecord } from "./types.js"

/**
 * Assembles Teleporter events into per-message lifecycles, keyed by messageID.
 * Events may arrive in any order and from multiple chains; the store is
 * idempotent (re-applying an already-seen event is a no-op).
 */
export class LifecycleStore {
  private lifecycles = new Map<Hex, MessageLifecycle>()
  private seen = new Set<string>()

  /** Apply one decoded event; returns the updated lifecycle. */
  apply(event: TeleporterEventRecord): MessageLifecycle {
    const dedupeKey = `${event.chain}:${event.transactionHash}:${event.logIndex}`
    const existing = this.lifecycles.get(event.messageID)
    if (this.seen.has(dedupeKey) && existing) return existing
    this.seen.add(dedupeKey)

    const lc: MessageLifecycle = existing ?? {
      messageID: event.messageID,
      status: "orphaned",
      events: [],
      failureCount: 0,
    }

    lc.events.push(event)
    lc.events.sort((a, b) =>
      a.blockTimestamp !== undefined && b.blockTimestamp !== undefined
        ? a.blockTimestamp - b.blockTimestamp || a.logIndex - b.logIndex
        : STAGE_ORDER[a.eventName] - STAGE_ORDER[b.eventName],
    )

    switch (event.eventName) {
      case "SendCrossChainMessage": {
        lc.sourceChain = event.chain
        lc.sentAt = event.blockTimestamp
        const msg = event.args.message as { originSenderAddress?: Address; destinationAddress?: Address } | undefined
        lc.originSender = msg?.originSenderAddress
        lc.destinationAddress = msg?.destinationAddress
        break
      }
      case "ReceiveCrossChainMessage":
        lc.destinationChain = event.chain
        lc.deliveredAt = event.blockTimestamp
        break
      case "MessageExecuted":
        lc.destinationChain ??= event.chain
        lc.executedAt = event.blockTimestamp
        break
      case "MessageExecutionFailed":
        lc.destinationChain ??= event.chain
        lc.failedAt = event.blockTimestamp
        lc.failureCount += 1
        break
      case "ReceiptReceived":
        lc.receiptedAt = event.blockTimestamp
        break
    }

    lc.status = deriveStatus(lc)
    if (lc.sentAt !== undefined && lc.deliveredAt !== undefined) {
      lc.deliveryLatencySeconds = lc.deliveredAt - lc.sentAt
    }

    this.lifecycles.set(event.messageID, lc)
    return lc
  }

  get(messageID: Hex): MessageLifecycle | undefined {
    return this.lifecycles.get(messageID)
  }

  all(): MessageLifecycle[] {
    return [...this.lifecycles.values()]
  }

  /**
   * Messages sent but not yet executed/failed whose age exceeds the
   * threshold — the primitive behind stuck-message and stalled-relayer alerts.
   */
  stuck(nowSeconds: number, maxDeliverySeconds: number): MessageLifecycle[] {
    return this.all().filter(
      (lc) =>
        lc.sentAt !== undefined &&
        lc.executedAt === undefined &&
        lc.failedAt === undefined &&
        nowSeconds - lc.sentAt > maxDeliverySeconds,
    )
  }
}

const STAGE_ORDER: Record<TeleporterEventRecord["eventName"], number> = {
  SendCrossChainMessage: 0,
  ReceiveCrossChainMessage: 1,
  MessageExecuted: 2,
  MessageExecutionFailed: 2,
  ReceiptReceived: 3,
}

function deriveStatus(lc: MessageLifecycle): LifecycleStatus {
  const hasSend = lc.sentAt !== undefined || lc.sourceChain !== undefined
  if (lc.receiptedAt !== undefined && lc.executedAt !== undefined) return "receipted"
  if (lc.executedAt !== undefined) return "executed"
  if (lc.failedAt !== undefined) return "execution_failed"
  if (lc.deliveredAt !== undefined) return hasSend ? "delivered" : "orphaned"
  if (hasSend) return "sent"
  return "orphaned"
}
