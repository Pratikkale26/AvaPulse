#!/usr/bin/env node
// Live Testnet Probe Script: Fuji C-Chain & Echo L1
// Executes real RPC health probes, queries live block numbers, latency,
// checks destination gas wallet balances on-chain, and persists to SQLite.

import {
  CollectorEngine,
  CollectorStorage,
} from "../dist/index.js"

const BOLD = "\x1b[1m"
const RESET = "\x1b[0m"
const RED = "\x1b[31m"
const GREEN = "\x1b[32m"
const YELLOW = "\x1b[33m"
const CYAN = "\x1b[36m"
const DIM = "\x1b[2m"

async function runLiveTestnet() {
  console.log(`\n${BOLD}========================================================================${RESET}`)
  console.log(`${BOLD}       AvaPulse Collector — Live Avalanche Testnet Probe Run           ${RESET}`)
  console.log(`${DIM}       Targeting Fuji C-Chain (43113) & Echo Sovereign L1 (173750)      ${RESET}`)
  console.log(`${BOLD}========================================================================${RESET}\n`)

  const testWallet = "0x07d39793E581bae44Dce4C047A85C5E10234B83b"
  const storage = new CollectorStorage("avapulse.db")

  const engine = new CollectorEngine(
    {
      chains: [
        {
          name: "fuji-c",
          rpcUrl: "https://api.avax-test.network/ext/bc/C/rpc",
          chainId: 43113,
        },
        {
          name: "echo",
          rpcUrl: "https://subnets.avax.network/echo/testnet/rpc",
          chainId: 173750,
        },
      ],
      relayers: [
        {
          name: "fuji-echo-relayer",
          gasWallets: [
            {
              chain: "fuji-c",
              address: testWallet,
              minBalanceAvax: 0.5,
            },
            {
              chain: "echo",
              address: testWallet,
              minBalanceAvax: 0.5,
            },
          ],
        },
      ],
    },
    undefined,
    storage,
  )

  console.log(`[1/3] Executing active RPC health probes...`)
  const report = await engine.runCycle()

  // Display RPC Results
  console.log(`\n${CYAN}--- Live RPC Health Probes ---${RESET}`)
  for (const r of report.rpcResults) {
    const status = r.reachable ? `${GREEN}ONLINE (200 OK)${RESET}` : `${RED}OFFLINE${RESET}`
    console.log(`  Chain: ${BOLD}${r.chain.padEnd(8)}${RESET} Status: ${status} | Head Block: ${BOLD}${r.blockNumber?.toString() ?? "N/A"}${RESET} | Latency: ${BOLD}${r.latencyMs}ms${RESET}`)
  }

  // Display Gas Balances
  console.log(`\n${CYAN}--- Live Relayer Destination Gas Balances ---${RESET}`)
  for (const g of report.gasResults) {
    const level = g.isCritical ? `${RED}${BOLD}CRITICAL${RESET}` : g.isLow ? `${YELLOW}${BOLD}LOW${RESET}` : `${GREEN}HEALTHY${RESET}`
    console.log(`  Chain: ${BOLD}${g.chain.padEnd(8)}${RESET} Balance: ${BOLD}${g.balanceAvax.toFixed(4)} AVAX${RESET} | Status: ${level}`)
    console.log(`  ${DIM}Wallet Address: ${g.address}${RESET}`)
  }

  // Display Generated Alerts
  const activeAlerts = engine.alertEngine.getActiveIncidents()
  console.log(`\n${CYAN}--- Triggered Semantic Alerts (${activeAlerts.length} Active) ---${RESET}`)
  if (activeAlerts.length === 0) {
    console.log(`  ${GREEN}All systems healthy. No alerts triggered.${RESET}`)
  } else {
    for (const alert of activeAlerts) {
      const color = alert.severity === "critical" ? RED : YELLOW
      console.log(`  ${color}${BOLD}[${alert.severity.toUpperCase()} ALERT]${RESET} ${BOLD}${alert.title}${RESET}`)
      console.log(`  ${DIM}Message:${RESET} ${alert.message}\n`)
    }
  }

  // Query SQLite to verify persistence
  console.log(`${CYAN}--- SQLite Persistence Verification (avapulse.db) ---${RESET}`)
  const savedProbes = storage.getRecentProbes("echo", 5)
  const savedBalances = storage.getLatestGasBalances()
  const savedIncidents = storage.getActiveIncidents()
  console.log(`  ${GREEN}✔${RESET} Saved RPC Probes in DB:   ${savedProbes.length}`)
  console.log(`  ${GREEN}✔${RESET} Saved Gas Balances in DB: ${savedBalances.length}`)
  console.log(`  ${GREEN}✔${RESET} Saved Incidents in DB:    ${savedIncidents.length}`)

  console.log(`\n${BOLD}========================================================================${RESET}`)
  console.log(`${GREEN}${BOLD}✔ LIVE AVALANCHE TESTNET INTEGRATION COMPLETED SUCCESSFULLY${RESET}`)
  console.log(`${BOLD}========================================================================\n${RESET}`)

  storage.close()
}

runLiveTestnet().catch(console.error)
