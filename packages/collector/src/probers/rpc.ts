import { createPublicClient, http, type PublicClient } from "viem"
import type { ChainConfig, RpcProbeResult } from "../types.js"

export interface RpcProberOptions {
  client?: PublicClient
  timeoutMs?: number
}

export class RpcProber {
  private client: PublicClient
  private lastBlockNumber?: bigint

  constructor(
    public readonly config: ChainConfig,
    options: RpcProberOptions = {},
  ) {
    this.client =
      options.client ??
      createPublicClient({
        transport: http(config.rpcUrl, {
          timeout: options.timeoutMs ?? 5000,
        }),
      })
  }

  /**
   * Execute an active health probe against the RPC endpoint.
   * Measures round-trip latency, retrieves the head block and chain ID,
   * and tracks block progression.
   */
  async probe(timestamp = Math.floor(Date.now() / 1000)): Promise<RpcProbeResult> {
    const start = performance.now()
    try {
      const [blockNumber, chainId] = await Promise.all([
        this.client.getBlockNumber(),
        this.client.getChainId(),
      ])
      const latencyMs = Math.round(performance.now() - start)

      const blockAdvanced =
        this.lastBlockNumber !== undefined ? blockNumber > this.lastBlockNumber : true
      this.lastBlockNumber = blockNumber

      return {
        chain: this.config.name,
        reachable: true,
        latencyMs,
        blockNumber,
        blockAdvanced,
        chainId,
        timestamp,
      }
    } catch (err: unknown) {
      const latencyMs = Math.round(performance.now() - start)
      const errorMsg = err instanceof Error ? err.message : String(err)
      return {
        chain: this.config.name,
        reachable: false,
        latencyMs,
        blockAdvanced: false,
        error: errorMsg,
        timestamp,
      }
    }
  }

  getLastBlock(): bigint | undefined {
    return this.lastBlockNumber
  }
}
