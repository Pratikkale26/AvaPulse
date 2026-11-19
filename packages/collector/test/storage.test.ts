import { describe, expect, it } from "vitest"
import type { MessageLifecycle } from "@avapulse/icm-core"
import { CollectorEngine, CollectorStorage } from "../src/index.js"

describe("CollectorStorage (SQLite Persistence)", () => {
  it("initializes SQLite schema and records RPC probes", () => {
    const storage = new CollectorStorage(":memory:")

    storage.recordRpcProbe({
      chain: "echo",
      reachable: true,
      latencyMs: 42,
      blockNumber: 12345678n,
      blockAdvanced: true,
      chainId: 173750,
      timestamp: 1000,
    })

    storage.recordRpcProbe({
      chain: "echo",
      reachable: false,
      latencyMs: 150,
      blockAdvanced: false,
      error: "Timeout",
      timestamp: 1010,
    })

    const probes = storage.getRecentProbes("echo")
    expect(probes).toHaveLength(2)
    expect(probes[0].timestamp).toBe(1010) // newest first
    expect(probes[0].reachable).toBe(false)
    expect(probes[0].error).toBe("Timeout")

    expect(probes[1].timestamp).toBe(1000)
    expect(probes[1].blockNumber).toBe(12345678n)
    expect(probes[1].latencyMs).toBe(42)

    storage.close()
  })

  it("records gas wallet balances and calculates burn rate over time", () => {
    const storage = new CollectorStorage(":memory:")
    const addr = "0x07d39793E581bae44Dce4C047A85C5E10234B83b" as const

    // Baseline: 1.8 AVAX at t=1000
    storage.recordGasBalance({
      relayerName: "fuji-relayer",
      chain: "echo",
      address: addr,
      balanceWei: 1800000000000000000n,
      balanceAvax: 1.8,
      minBalanceAvax: 0.5,
      isLow: false,
      isCritical: false,
      timestamp: 1000,
    })

    // Drained: 1.4 AVAX at t=4600 (3600 seconds = 1 hour later)
    storage.recordGasBalance({
      relayerName: "fuji-relayer",
      chain: "echo",
      address: addr,
      balanceWei: 1400000000000000000n,
      balanceAvax: 1.4,
      minBalanceAvax: 0.5,
      isLow: false,
      isCritical: false,
      timestamp: 4600,
    })

    const latest = storage.getLatestGasBalances()
    expect(latest).toHaveLength(1)
    expect(latest[0].balanceAvax).toBe(1.4)
    expect(latest[0].timestamp).toBe(4600)

    // Calculate burn rate: 0.4 AVAX spent over 3600s = 0.4 AVAX/hour
    const burnRate = storage.calculateBurnRate("echo", addr, 7200, 4600)
    expect(burnRate).toBeCloseTo(0.4, 2)

    storage.close()
  })

  it("persists Teleporter message lifecycles and query by status", () => {
    const storage = new CollectorStorage(":memory:")

    const msg1: MessageLifecycle = {
      messageID: "0x00000000000000000000000000000000000000000000000000000000000000aa",
      status: "sent",
      sourceChain: "c-chain",
      destinationChain: "echo",
      sentAt: 1000,
      events: [],
      failureCount: 0,
    }

    const msg2: MessageLifecycle = {
      messageID: "0x00000000000000000000000000000000000000000000000000000000000000bb",
      status: "executed",
      sourceChain: "c-chain",
      destinationChain: "echo",
      sentAt: 950,
      deliveredAt: 960,
      executedAt: 961,
      deliveryLatencySeconds: 10,
      events: [],
      failureCount: 0,
    }

    storage.recordMessageLifecycle(msg1, 1000)
    storage.recordMessageLifecycle(msg2, 1010)

    const all = storage.getMessages()
    expect(all).toHaveLength(2)

    const executedOnly = storage.getMessages("executed")
    expect(executedOnly).toHaveLength(1)
    expect(executedOnly[0].messageID).toBe(msg2.messageID)
    expect(executedOnly[0].deliveryLatencySeconds).toBe(10)

    storage.close()
  })

  it("persists alert incidents and tracks active vs resolved state", () => {
    const storage = new CollectorStorage(":memory:")

    storage.recordIncident({
      id: "relayer:stall:1",
      ruleId: "relayer_stalled_while_up",
      status: "firing",
      severity: "critical",
      title: "Relayer Stalled",
      message: "0 delivered",
      firstTriggeredAt: 1000,
      lastTriggeredAt: 1060,
      lastNotifiedAt: 1000,
      notificationCount: 1,
      metadata: { route: "c-chain -> echo" },
    })

    expect(storage.getActiveIncidents()).toHaveLength(1)

    // Mark as resolved
    storage.recordIncident({
      id: "relayer:stall:1",
      ruleId: "relayer_stalled_while_up",
      status: "resolved",
      severity: "critical",
      title: "Relayer Stalled",
      message: "Resumed delivery",
      firstTriggeredAt: 1000,
      lastTriggeredAt: 1060,
      lastNotifiedAt: 1000,
      resolvedAt: 1100,
      notificationCount: 1,
      metadata: { route: "c-chain -> echo" },
    })

    expect(storage.getActiveIncidents()).toHaveLength(0)

    storage.close()
  })

  it("automatically persists engine cycle observations when storage is attached", async () => {
    const storage = new CollectorStorage(":memory:")
    const engine = new CollectorEngine(
      {
        chains: [{ name: "fuji-c", rpcUrl: "http://mock-rpc" }],
        relayers: [],
      },
      undefined,
      storage,
    )

    await engine.runCycle(1000)

    const probes = storage.getRecentProbes("fuji-c")
    expect(probes).toHaveLength(1)
    expect(probes[0].chain).toBe("fuji-c")

    storage.close()
  })
})
