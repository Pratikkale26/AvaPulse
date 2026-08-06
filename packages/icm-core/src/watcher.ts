import type { PublicClient } from "viem"
import { TELEPORTER_MESSENGER_ADDRESS } from "./abi.js"
import { decodeTeleporterLog } from "./decode.js"
import type { TeleporterEventRecord } from "./types.js"

/** Public RPC providers commonly cap eth_getLogs ranges; stay under it. */
const MAX_RANGE = 2000n

export interface FetchEventsOptions {
  client: PublicClient
  /** Caller-assigned chain name recorded on each event (e.g. "c-chain"). */
  chain: string
  fromBlock: bigint
  toBlock: bigint
  /** Resolve block timestamps via eth_getBlockByNumber (default true). */
  withTimestamps?: boolean
  /** Initial getLogs chunk size in blocks (default 2000). */
  maxRange?: bigint
}

/**
 * Fetch and decode all Teleporter events in a block range,
 * transparently chunking ranges public RPCs would reject.
 */
export async function fetchTeleporterEvents(
  opts: FetchEventsOptions,
): Promise<TeleporterEventRecord[]> {
  const { client, chain, fromBlock, toBlock, withTimestamps = true, maxRange = MAX_RANGE } = opts
  const records: TeleporterEventRecord[] = []
  const tsCache = new Map<bigint, number>()

  for (let start = fromBlock; start <= toBlock; start += maxRange) {
    const end = start + maxRange - 1n > toBlock ? toBlock : start + maxRange - 1n
    const logs = await getLogsAdaptive(client, start, end)
    for (const log of logs) {
      let blockTimestamp: number | undefined
      if (withTimestamps && log.blockNumber != null) {
        let ts = tsCache.get(log.blockNumber)
        if (ts === undefined) {
          const block = await client.getBlock({ blockNumber: log.blockNumber })
          ts = Number(block.timestamp)
          tsCache.set(log.blockNumber, ts)
        }
        blockTimestamp = ts
      }
      const rec = decodeTeleporterLog({ chain, blockTimestamp, log })
      if (rec) records.push(rec)
    }
  }
  return records
}

type LogsResult = Awaited<ReturnType<PublicClient["getLogs"]>>

/**
 * getLogs that recursively halves the range when the provider rejects it
 * (oversized response, range cap, timeout) — dense chains like Echo can
 * exceed response limits even on modest block ranges.
 */
async function getLogsAdaptive(
  client: PublicClient,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<LogsResult> {
  try {
    return await client.getLogs({
      address: TELEPORTER_MESSENGER_ADDRESS,
      fromBlock,
      toBlock,
    })
  } catch (error) {
    if (fromBlock >= toBlock) throw error
    const mid = fromBlock + (toBlock - fromBlock) / 2n
    const [a, b] = await Promise.all([
      getLogsAdaptive(client, fromBlock, mid),
      getLogsAdaptive(client, mid + 1n, toBlock),
    ])
    return [...a, ...b]
  }
}

export interface WatcherChain {
  client: PublicClient
  chain: string
  /** Start block; defaults to current head at start(). */
  fromBlock?: bigint
}

export interface TeleporterWatcherOptions {
  chains: WatcherChain[]
  onEvent: (event: TeleporterEventRecord) => void
  onError?: (chain: string, error: unknown) => void
  pollIntervalMs?: number
}

/**
 * Polls Teleporter logs on a set of chains from a per-chain block cursor,
 * emitting decoded events. Poll-based (not websocket) so it works against
 * any plain HTTP RPC, including public endpoints.
 */
export class TeleporterWatcher {
  private cursors = new Map<string, bigint>()
  private timer: ReturnType<typeof setInterval> | undefined
  private ticking = false

  constructor(private readonly opts: TeleporterWatcherOptions) {}

  async start(): Promise<void> {
    for (const { client, chain, fromBlock } of this.opts.chains) {
      this.cursors.set(chain, fromBlock ?? (await client.getBlockNumber()) + 1n)
    }
    const interval = this.opts.pollIntervalMs ?? 5000
    this.timer = setInterval(() => void this.tick(), interval)
    await this.tick()
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = undefined
  }

  private async tick(): Promise<void> {
    if (this.ticking) return
    this.ticking = true
    try {
      await Promise.all(
        this.opts.chains.map(async ({ client, chain }) => {
          try {
            const head = await client.getBlockNumber()
            const cursor = this.cursors.get(chain)!
            if (head < cursor) return
            const events = await fetchTeleporterEvents({
              client,
              chain,
              fromBlock: cursor,
              toBlock: head,
            })
            this.cursors.set(chain, head + 1n)
            for (const e of events) this.opts.onEvent(e)
          } catch (error) {
            this.opts.onError?.(chain, error)
          }
        }),
      )
    } finally {
      this.ticking = false
    }
  }
}
