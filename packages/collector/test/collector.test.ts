import { describe, expect, it, vi } from "vitest"
import { parseEther, type PublicClient } from "viem"
import {
  CollectorEngine,
  GasWalletProber,
  NodeMetricsScraper,
  parsePrometheusText,
  RelayerMetricsScraper,
  RpcProber,
} from "../src/index.js"

describe("RpcProber", () => {
  it("probes RPC endpoint, measures latency and tracks block progression", async () => {
    let currentBlock = 100n
    const mockClient = {
      getBlockNumber: vi.fn(async () => currentBlock),
      getChainId: vi.fn(async () => 173750),
    } as unknown as PublicClient

    const prober = new RpcProber(
      { name: "echo", rpcUrl: "http://mock-rpc" },
      { client: mockClient },
    )

    // First probe: baseline
    const res1 = await prober.probe(1000)
    expect(res1.reachable).toBe(true)
    expect(res1.chain).toBe("echo")
    expect(res1.blockNumber).toBe(100n)
    expect(res1.chainId).toBe(173750)
    expect(res1.blockAdvanced).toBe(true)
    expect(res1.latencyMs).toBeGreaterThanOrEqual(0)

    // Second probe: block hasn't advanced
    const res2 = await prober.probe(1010)
    expect(res2.blockAdvanced).toBe(false)

    // Third probe: block advanced
    currentBlock = 105n
    const res3 = await prober.probe(1020)
    expect(res3.blockAdvanced).toBe(true)
    expect(res3.blockNumber).toBe(105n)
  })

  it("handles RPC failure gracefully without throwing", async () => {
    const mockClient = {
      getBlockNumber: vi.fn(async () => {
        throw new Error("Connection refused (ECONNREFUSED)")
      }),
      getChainId: vi.fn(async () => 173750),
    } as unknown as PublicClient

    const prober = new RpcProber(
      { name: "echo", rpcUrl: "http://dead-rpc" },
      { client: mockClient },
    )

    const res = await prober.probe(1000)
    expect(res.reachable).toBe(false)
    expect(res.blockAdvanced).toBe(false)
    expect(res.error).toContain("ECONNREFUSED")
  })
})

describe("GasWalletProber", () => {
  it("formats balance from wei to AVAX and evaluates warning and critical thresholds", async () => {
    let currentBalance = parseEther("1.5")
    const mockClient = {
      getBalance: vi.fn(async () => currentBalance),
    } as unknown as PublicClient

    const prober = new GasWalletProber(
      "fuji-relayer",
      {
        chain: "echo",
        address: "0x07d39793E581bae44Dce4C047A85C5E10234B83b",
        minBalanceAvax: 0.5,
      },
      "http://mock-rpc",
      { client: mockClient },
    )

    // 1. Healthy (1.5 AVAX)
    const r1 = await prober.checkBalance(1000)
    expect(r1.balanceAvax).toBe(1.5)
    expect(r1.isLow).toBe(false)
    expect(r1.isCritical).toBe(false)

    // 2. Low balance (0.4 AVAX, below min 0.5)
    currentBalance = parseEther("0.4")
    const r2 = await prober.checkBalance(1010)
    expect(r2.balanceAvax).toBeCloseTo(0.4)
    expect(r2.isLow).toBe(true)
    expect(r2.isCritical).toBe(false)

    // 3. Critical balance (0.05 AVAX, below 20% critical floor of 0.1)
    currentBalance = parseEther("0.05")
    const r3 = await prober.checkBalance(1020)
    expect(r3.balanceAvax).toBeCloseTo(0.05)
    expect(r3.isLow).toBe(true)
    expect(r3.isCritical).toBe(true)
  })
})

describe("Prometheus Text Parser", () => {
  it("parses metrics with labels, floats, exponents, and skips comments", () => {
    const rawMetrics = `
# HELP network_peers Number of peers
# TYPE network_peers gauge
network_peers 18

# HELP messages_delivered_total Total messages delivered by relayer
# TYPE messages_delivered_total counter
messages_delivered_total{source="c-chain",dest="echo"} 142
messages_delivered_total{source="echo",dest="c-chain"} 89

# Exponential notation and float
consensus_latency_seconds 1.25e-01
`
    const parsed = parsePrometheusText(rawMetrics)
    expect(parsed).toHaveLength(4)

    expect(parsed[0]).toEqual({
      name: "network_peers",
      labels: {},
      value: 18,
    })

    expect(parsed[1]).toEqual({
      name: "messages_delivered_total",
      labels: { source: "c-chain", dest: "echo" },
      value: 142,
    })

    expect(parsed[3].name).toBe("consensus_latency_seconds")
    expect(parsed[3].value).toBe(0.125)
  })
})

describe("NodeMetricsScraper & RelayerMetricsScraper", () => {
  it("scrapes AvalancheGo metrics successfully", async () => {
    const mockText = `
network_peers 24
health_healthy 1
avalanche_uptime_percentage 99.8
`
    const mockFetch = vi.fn(async () => ({
      ok: true,
      text: async () => mockText,
    })) as unknown as typeof fetch

    const scraper = new NodeMetricsScraper("echo", "http://mock:9650/ext/metrics", mockFetch)
    const snapshot = await scraper.scrape(1000)

    expect(snapshot.reachable).toBe(true)
    expect(snapshot.peerCount).toBe(24)
    expect(snapshot.isHealthy).toBe(true)
    expect(snapshot.metrics["network_peers"]).toBe(24)
  })

  it("scrapes ICM Relayer metrics and aggregates delivery counters", async () => {
    const mockText = `
messages_delivered_total{route="c-chain->echo"} 45
messages_delivered_total{route="echo->c-chain"} 25
messages_received_total 80
relayer_errors_total 2
`
    const mockFetch = vi.fn(async () => ({
      ok: true,
      text: async () => mockText,
    })) as unknown as typeof fetch

    const scraper = new RelayerMetricsScraper("fuji-relayer", "http://mock:9090/metrics", mockFetch)
    const snapshot = await scraper.scrape(1000)

    expect(snapshot.reachable).toBe(true)
    expect(snapshot.messagesDelivered).toBe(70) // 45 + 25
    expect(snapshot.messagesReceived).toBe(80)
    expect(snapshot.errorsTotal).toBe(2)
  })
})

describe("CollectorEngine", () => {
  it("runs a full cycle collecting RPC, gas and metrics", async () => {
    const engine = new CollectorEngine({
      chains: [
        { name: "fuji-c", rpcUrl: "http://mock-fuji" },
      ],
      relayers: [],
    })

    const report = await engine.runCycle(1000)
    expect(report.rpcResults).toHaveLength(1)
    expect(report.rpcResults[0].chain).toBe("fuji-c")
    expect(report.activeAlertsCount).toBe(0)
  })
})
