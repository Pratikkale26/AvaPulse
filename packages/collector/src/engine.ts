import {
  AlertEngine,
  evaluateGasWallet,
  evaluateRelayerStalled,
} from "@avapulse/alert-engine"
import { GasWalletProber } from "./probers/gas.js"
import { RpcProber } from "./probers/rpc.js"
import { NodeMetricsScraper, RelayerMetricsScraper } from "./scrapers/prometheus.js"
import type {
  CollectorConfig,
  GasBalanceResult,
  NodeMetricsSnapshot,
  RelayerMetricsSnapshot,
  RpcProbeResult,
} from "./types.js"

export interface CollectorCycleReport {
  rpcResults: RpcProbeResult[]
  gasResults: GasBalanceResult[]
  nodeSnapshots: NodeMetricsSnapshot[]
  relayerSnapshots: RelayerMetricsSnapshot[]
  activeAlertsCount: number
  timestamp: number
}

export class CollectorEngine {
  public readonly alertEngine: AlertEngine
  private rpcProbers: Map<string, RpcProber> = new Map()
  private gasProbers: GasWalletProber[] = []
  private nodeScrapers: NodeMetricsScraper[] = []
  private relayerScrapers: RelayerMetricsScraper[] = []
  private timer?: ReturnType<typeof setInterval>
  private isPolling = false

  constructor(
    public readonly config: CollectorConfig,
    alertEngine?: AlertEngine,
  ) {
    this.alertEngine = alertEngine ?? new AlertEngine()

    // 1. Initialize RPC Probers per chain
    for (const chain of config.chains) {
      this.rpcProbers.set(chain.name, new RpcProber(chain))
      if (chain.nodeMetricsUrl) {
        this.nodeScrapers.push(new NodeMetricsScraper(chain.name, chain.nodeMetricsUrl))
      }
    }

    // 2. Initialize Relayer Gas Wallet Probers and Scrapers
    for (const relayer of config.relayers) {
      if (relayer.metricsUrl) {
        this.relayerScrapers.push(new RelayerMetricsScraper(relayer.name, relayer.metricsUrl))
      }

      for (const wallet of relayer.gasWallets) {
        const chainConfig = config.chains.find((c) => c.name === wallet.chain)
        if (chainConfig) {
          this.gasProbers.push(
            new GasWalletProber(relayer.name, wallet, chainConfig.rpcUrl),
          )
        }
      }
    }
  }

  /**
   * Run one complete monitoring cycle across all chains, nodes, and relayers.
   * Feeds observations directly into the semantic AlertEngine.
   */
  async runCycle(timestamp = Math.floor(Date.now() / 1000)): Promise<CollectorCycleReport> {
    // 1. Run RPC Probes
    const rpcPromises = [...this.rpcProbers.values()].map((p) => p.probe(timestamp))
    const rpcResults = await Promise.all(rpcPromises)

    // 2. Check Relayer Gas Balances
    const gasPromises = this.gasProbers.map((p) => p.checkBalance(timestamp))
    const gasResults = await Promise.all(gasPromises)

    // Evaluate Gas Wallet Alerts
    for (const gas of gasResults) {
      evaluateGasWallet(this.alertEngine, {
        relayerName: gas.relayerName,
        chain: gas.chain,
        walletAddress: gas.address,
        balanceAvax: gas.balanceAvax,
        minBalanceAvax: gas.minBalanceAvax,
        timestamp,
      })
    }

    // 3. Scrape Node Metrics
    const nodePromises = this.nodeScrapers.map((s) => s.scrape(timestamp))
    const nodeSnapshots = await Promise.all(nodePromises)

    // 4. Scrape Relayer Metrics
    const relayerPromises = this.relayerScrapers.map((s) => s.scrape(timestamp))
    const relayerSnapshots = await Promise.all(relayerPromises)

    // Evaluate Relayer Metrics
    for (const relayer of relayerSnapshots) {
      if (relayer.reachable) {
        // Relayer is reachable (200 OK)
        evaluateRelayerStalled(this.alertEngine, {
          relayerName: relayer.relayerName,
          route: "icm-all",
          relayerHealthy: true,
          messagesSent: 0, // In full M1 integration, read from icm-core watcher
          messagesDelivered: relayer.messagesDelivered,
          timestamp,
        })
      }
    }

    return {
      rpcResults,
      gasResults,
      nodeSnapshots,
      relayerSnapshots,
      activeAlertsCount: this.alertEngine.getActiveIncidents().length,
      timestamp,
    }
  }

  start(intervalMs = this.config.probeIntervalMs ?? 10_000): void {
    if (this.isPolling) return
    this.isPolling = true
    this.timer = setInterval(() => void this.runCycle(), intervalMs)
    void this.runCycle()
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = undefined
    }
    this.isPolling = false
  }
}
