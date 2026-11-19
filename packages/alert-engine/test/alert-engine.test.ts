import { describe, expect, it } from "vitest"
import type { MessageLifecycle } from "@avapulse/icm-core"
import {
  AlertEngine,
  evaluateGasWallet,
  evaluateRelayerStalled,
  evaluateStuckMessage,
  type AlertNotification,
} from "../src/index.js"

describe("AlertEngine core lifecycle", () => {
  it("fires alert and notifies subscriber on first trigger", () => {
    const engine = new AlertEngine({ defaultCooldownSeconds: 300 })
    const notifications: AlertNotification[] = []
    engine.subscribe((n) => notifications.push(n))

    const result = engine.trigger({
      incidentId: "test:1",
      ruleId: "relayer_stalled_while_up",
      severity: "critical",
      title: "Test Alert",
      message: "Something failed",
      timestamp: 1000,
    })

    expect(result.notified).toBe(true)
    expect(notifications).toHaveLength(1)
    expect(notifications[0].status).toBe("firing")
    expect(notifications[0].severity).toBe("critical")
    expect(notifications[0].incidentId).toBe("test:1")
  })

  it("suppresses repeated alerts within the cooldown window (deduplication)", () => {
    const engine = new AlertEngine({ defaultCooldownSeconds: 300 })
    const notifications: AlertNotification[] = []
    engine.subscribe((n) => notifications.push(n))

    // 1st trigger at t=1000 -> Notified
    const first = engine.trigger({
      incidentId: "test:cooldown",
      ruleId: "relayer_stalled_while_up",
      severity: "critical",
      title: "Test Alert",
      message: "Initial failure",
      timestamp: 1000,
    })
    expect(first.notified).toBe(true)

    // 2nd trigger at t=1100 (100s later, cooldown is 300s) -> Suppressed
    const second = engine.trigger({
      incidentId: "test:cooldown",
      ruleId: "relayer_stalled_while_up",
      severity: "critical",
      title: "Test Alert",
      message: "Still failing",
      timestamp: 1100,
    })
    expect(second.notified).toBe(false)
    expect(notifications).toHaveLength(1)

    // 3rd trigger at t=1305 (305s later, cooldown expired) -> Re-notified
    const third = engine.trigger({
      incidentId: "test:cooldown",
      ruleId: "relayer_stalled_while_up",
      severity: "critical",
      title: "Test Alert",
      message: "Still failing after cooldown",
      timestamp: 1305,
    })
    expect(third.notified).toBe(true)
    expect(notifications).toHaveLength(2)
    expect(notifications[1].title).toContain("[REMINDER]")
  })

  it("bypasses cooldown when severity escalates (warning -> critical)", () => {
    const engine = new AlertEngine({ defaultCooldownSeconds: 300 })
    const notifications: AlertNotification[] = []
    engine.subscribe((n) => notifications.push(n))

    // Trigger Warning at t=1000
    engine.trigger({
      incidentId: "wallet:1",
      ruleId: "relayer_gas_wallet_low",
      severity: "warning",
      title: "Wallet Low",
      message: "Gas is running low",
      timestamp: 1000,
    })
    expect(notifications).toHaveLength(1)

    // Escalate to Critical at t=1050 (only 50s later, well within 300s cooldown)
    const result = engine.trigger({
      incidentId: "wallet:1",
      ruleId: "relayer_gas_wallet_low",
      severity: "critical",
      title: "Wallet Critical",
      message: "Gas is virtually empty",
      timestamp: 1050,
    })
    expect(result.notified).toBe(true)
    expect(notifications).toHaveLength(2)
    expect(notifications[1].severity).toBe("critical")
    expect(notifications[1].title).toContain("[ESCALATED]")
  })

  it("sends recovery notification upon resolution and clears active state", () => {
    const engine = new AlertEngine()
    const notifications: AlertNotification[] = []
    engine.subscribe((n) => notifications.push(n))

    engine.trigger({
      incidentId: "test:rec",
      ruleId: "relayer_stalled_while_up",
      severity: "critical",
      title: "Relayer Stalled",
      message: "Messages stuck",
      timestamp: 1000,
    })
    expect(engine.getActiveIncidents()).toHaveLength(1)

    const resolved = engine.resolve("test:rec", "Delivery resumed", 1060)
    expect(resolved.notified).toBe(true)
    expect(engine.getActiveIncidents()).toHaveLength(0)

    expect(notifications).toHaveLength(2)
    expect(notifications[1].status).toBe("resolved")
    expect(notifications[1].title).toContain("[RESOLVED]")
    expect(notifications[1].message).toBe("Delivery resumed")
  })
})

describe("Rule 1: evaluateRelayerStalled", () => {
  it("fires critical alert when relayer is UP but delivering 0 while source is sending", () => {
    const engine = new AlertEngine()
    const notifications: AlertNotification[] = []
    engine.subscribe((n) => notifications.push(n))

    const res = evaluateRelayerStalled(engine, {
      relayerName: "fuji-relayer",
      route: "c-chain -> echo",
      relayerHealthy: true,
      messagesSent: 15,
      messagesDelivered: 0,
      windowSeconds: 300,
      timestamp: 1000,
    })

    expect(res.status).toBe("firing")
    expect(res.notified).toBe(true)
    expect(notifications[0].severity).toBe("critical")
    expect(notifications[0].message).toContain("0 messages delivered while 15 messages were sent")
  })

  it("resolves when relayer begins delivering messages", () => {
    const engine = new AlertEngine()
    const notifications: AlertNotification[] = []
    engine.subscribe((n) => notifications.push(n))

    // First: stall
    evaluateRelayerStalled(engine, {
      relayerName: "fuji-relayer",
      route: "c-chain -> echo",
      relayerHealthy: true,
      messagesSent: 10,
      messagesDelivered: 0,
      timestamp: 1000,
    })

    // Second: recovery (delivery resumed)
    const rec = evaluateRelayerStalled(engine, {
      relayerName: "fuji-relayer",
      route: "c-chain -> echo",
      relayerHealthy: true,
      messagesSent: 5,
      messagesDelivered: 15,
      timestamp: 1060,
    })

    expect(rec.status).toBe("resolved")
    expect(rec.notified).toBe(true)
    expect(notifications[1].status).toBe("resolved")
    expect(notifications[1].message).toContain("resumed message delivery")
  })
})

describe("Rule 2: evaluateGasWallet", () => {
  it("transitions smoothly: healthy -> warning -> critical -> resolved", () => {
    const engine = new AlertEngine({ defaultCooldownSeconds: 300 })
    const notifications: AlertNotification[] = []
    engine.subscribe((n) => notifications.push(n))

    const wallet = "0x07d39793E581bae44Dce4C047A85C5E10234B83b"
    const minBalance = 0.5 // Warn below 0.5, critical below 0.1 (20%)

    // Step 1: Healthy (1.2 AVAX) -> No alert
    const s1 = evaluateGasWallet(engine, {
      relayerName: "main-relayer",
      chain: "echo",
      walletAddress: wallet,
      balanceAvax: 1.2,
      minBalanceAvax: minBalance,
      timestamp: 1000,
    })
    expect(s1.status).toBe("noop")
    expect(notifications).toHaveLength(0)

    // Step 2: Draining to 0.4 AVAX -> Warning alert
    const s2 = evaluateGasWallet(engine, {
      relayerName: "main-relayer",
      chain: "echo",
      walletAddress: wallet,
      balanceAvax: 0.4,
      minBalanceAvax: minBalance,
      timestamp: 1100,
    })
    expect(s2.status).toBe("firing")
    expect(notifications).toHaveLength(1)
    expect(notifications[0].severity).toBe("warning")

    // Step 3: Draining to 0.05 AVAX (below 0.1 critical threshold) -> Escalates to Critical
    const s3 = evaluateGasWallet(engine, {
      relayerName: "main-relayer",
      chain: "echo",
      walletAddress: wallet,
      balanceAvax: 0.05,
      minBalanceAvax: minBalance,
      timestamp: 1200,
    })
    expect(s3.status).toBe("firing")
    expect(notifications).toHaveLength(2)
    expect(notifications[1].severity).toBe("critical")

    // Step 4: Refilled to 2.0 AVAX -> Resolved
    const s4 = evaluateGasWallet(engine, {
      relayerName: "main-relayer",
      chain: "echo",
      walletAddress: wallet,
      balanceAvax: 2.0,
      minBalanceAvax: minBalance,
      timestamp: 1300,
    })
    expect(s4.status).toBe("resolved")
    expect(notifications).toHaveLength(3)
    expect(notifications[2].status).toBe("resolved")
    expect(notifications[2].message).toContain("restored to 2.0000 AVAX")
  })
})

describe("Rule 3: evaluateStuckMessage", () => {
  it("detects stuck message and resolves when executed", () => {
    const engine = new AlertEngine()
    const notifications: AlertNotification[] = []
    engine.subscribe((n) => notifications.push(n))

    const mockLifecycle: MessageLifecycle = {
      messageID: "0x00000000000000000000000000000000000000000000000000000000000000aa",
      status: "sent",
      sourceChain: "c-chain",
      destinationChain: "echo",
      sentAt: 1000,
      events: [],
      failureCount: 0,
    }

    // At t=1050 (50s elapsed, threshold 120s) -> No alert
    const r1 = evaluateStuckMessage(engine, {
      lifecycle: mockLifecycle,
      maxDeliverySeconds: 120,
      timestamp: 1050,
    })
    expect(r1.status).toBe("noop")

    // At t=1200 (200s elapsed, threshold 120s) -> Fires warning
    const r2 = evaluateStuckMessage(engine, {
      lifecycle: mockLifecycle,
      maxDeliverySeconds: 120,
      timestamp: 1200,
    })
    expect(r2.status).toBe("firing")
    expect(notifications[0].severity).toBe("warning")

    // Destination execution observed at t=1250
    mockLifecycle.status = "executed"
    mockLifecycle.executedAt = 1250

    const r3 = evaluateStuckMessage(engine, {
      lifecycle: mockLifecycle,
      maxDeliverySeconds: 120,
      timestamp: 1255,
    })
    expect(r3.status).toBe("resolved")
    expect(notifications).toHaveLength(2)
    expect(notifications[1].status).toBe("resolved")
  })
})
