import { decodeEventLog, type Hex, type Log } from "viem"
import { teleporterAbi, TELEPORTER_EVENT_NAMES, type TeleporterEventName } from "./abi.js"
import type { TeleporterEventRecord } from "./types.js"

export interface RawLogInput {
  chain: string
  blockTimestamp?: number
  log: Pick<Log, "data" | "topics" | "blockNumber" | "transactionHash" | "logIndex">
}

/**
 * Decode a raw EVM log into a TeleporterEventRecord.
 * Returns null for logs that are not Teleporter events we track
 * (unknown topic, or decode failure on a colliding signature).
 */
export function decodeTeleporterLog(input: RawLogInput): TeleporterEventRecord | null {
  const { log, chain, blockTimestamp } = input
  if (log.blockNumber == null || log.transactionHash == null || log.logIndex == null) {
    return null
  }
  let decoded
  try {
    decoded = decodeEventLog({
      abi: teleporterAbi,
      data: log.data,
      topics: log.topics as [Hex, ...Hex[]],
    })
  } catch {
    return null
  }
  const eventName = decoded.eventName as TeleporterEventName
  if (!TELEPORTER_EVENT_NAMES.includes(eventName)) return null

  const args = decoded.args as unknown as Record<string, unknown>
  const messageID = args.messageID as Hex | undefined
  if (!messageID) return null

  return {
    eventName,
    messageID,
    chain,
    blockNumber: log.blockNumber,
    blockTimestamp,
    transactionHash: log.transactionHash,
    logIndex: log.logIndex,
    args,
  }
}
