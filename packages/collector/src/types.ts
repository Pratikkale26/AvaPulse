import type { Address } from "viem"

export interface ChainConfig {
  /** Identifier name (e.g. "fuji-c", "echo") */
  name: string
  /** HTTP RPC endpoint */
  rpcUrl: string
  /** Expected EVM chain ID */
  chainId?: number
  /** AvalancheGo Prometheus metrics endpoint (e.g. "http://127.0.0.1:9650/ext/metrics") */
  nodeMetricsUrl?: string
}

export interface RelayerGasWalletConfig {
  /** Target chain where the wallet pays execution gas */
  chain: string
  /** Wallet address */
  address: Address
  /** Minimum balance threshold before alerting (e.g. 0.5 AVAX) */
  minBalanceAvax: number
}

export interface RelayerConfig {
  /** Relayer identifier (e.g. "fuji-echo-relayer") */
  name: string
  /** ICM relayer Prometheus endpoint (e.g. "http://127.0.0.1:9090/metrics") */
  metricsUrl?: string
  /** Destination gas wallets monitored for this relayer */
  gasWallets: RelayerGasWalletConfig[]
}

export interface CollectorConfig {
  chains: ChainConfig[]
  relayers: RelayerConfig[]
  /** Interval in milliseconds between probe cycles (default: 10_000ms) */
  probeIntervalMs?: number
}

export interface RpcProbeResult {
  chain: string
  reachable: boolean
  latencyMs: number
  blockNumber?: bigint
  blockAdvanced: boolean
  chainId?: number
  error?: string
  timestamp: number
}

export interface GasBalanceResult {
  relayerName: string
  chain: string
  address: Address
  balanceWei: bigint
  balanceAvax: number
  minBalanceAvax: number
  isLow: boolean
  isCritical: boolean
  timestamp: number
}

export interface PrometheusMetric {
  name: string
  labels: Record<string, string>
  value: number
}

export interface NodeMetricsSnapshot {
  chain: string
  reachable: boolean
  peerCount?: number
  isHealthy: boolean
  metrics: Record<string, number>
  timestamp: number
  error?: string
}

export interface RelayerMetricsSnapshot {
  relayerName: string
  reachable: boolean
  messagesDelivered: number
  messagesReceived: number
  errorsTotal: number
  metrics: Record<string, number>
  timestamp: number
  error?: string
}
