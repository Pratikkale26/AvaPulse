import type { Address, Hex } from "viem"
import type { TeleporterEventName } from "./abi.js"

/** A decoded Teleporter event, annotated with where it was observed. */
export interface TeleporterEventRecord {
  eventName: TeleporterEventName
  messageID: Hex
  /** Chain the log was emitted on (caller-assigned name, e.g. "c-chain"). */
  chain: string
  blockNumber: bigint
  /** Unix seconds of the containing block, when known. */
  blockTimestamp?: number
  transactionHash: Hex
  logIndex: number
  /** Event-specific decoded args (structs included when present). */
  args: Record<string, unknown>
}

export type LifecycleStatus =
  | "sent" // SendCrossChainMessage seen on source
  | "delivered" // ReceiveCrossChainMessage seen on destination
  | "executed" // MessageExecuted — success
  | "execution_failed" // MessageExecutionFailed — delivered but destination call reverted
  | "receipted" // ReceiptReceived back on source
  /** Destination events seen without a matching send (partial observation). */
  | "orphaned"

export interface MessageLifecycle {
  messageID: Hex
  status: LifecycleStatus
  sourceChain?: string
  destinationChain?: string
  originSender?: Address
  destinationAddress?: Address
  /** Ordered as observed: send, receive, execute/fail (possibly retries), receipt. */
  events: TeleporterEventRecord[]
  sentAt?: number
  deliveredAt?: number
  executedAt?: number
  failedAt?: number
  receiptedAt?: number
  /** deliveredAt - sentAt, seconds (when both known). */
  deliveryLatencySeconds?: number
  /** Number of MessageExecutionFailed events observed (retry attempts). */
  failureCount: number
}
