// Live smoke test: pull recent Teleporter events from Fuji C-Chain and the
// Dispatch test L1, decode them, and assemble lifecycles across both chains.
// Usage: node scripts/fuji-smoke.mjs (after npm run build)
import { createPublicClient, http } from "viem"
import { fetchTeleporterEvents, LifecycleStore } from "../dist/index.js"

const CHAINS = [
  { chain: "fuji-c", rpc: "https://api.avax-test.network/ext/bc/C/rpc", lookback: 4000n },
  { chain: "echo", rpc: "https://subnets.avax.network/echo/testnet/rpc", lookback: 4000n },
  { chain: "dispatch", rpc: "https://subnets.avax.network/dispatch/testnet/rpc", lookback: 4000n },
]

const store = new LifecycleStore()
let total = 0

for (const { chain, rpc, lookback } of CHAINS) {
  const client = createPublicClient({ transport: http(rpc) })
  let head
  try {
    head = await client.getBlockNumber()
  } catch (err) {
    console.log(`${chain}: RPC unreachable (${err.shortMessage ?? err.message}), skipping`)
    continue
  }
  if (head === 0n) {
    console.log(`${chain}: head=0, endpoint not serving chain data, skipping`)
    continue
  }
  const events = await fetchTeleporterEvents({
    client,
    chain,
    fromBlock: head > lookback ? head - lookback : 0n,
    toBlock: head,
  })
  total += events.length
  for (const e of events) store.apply(e)
  console.log(`${chain}: head=${head}, ${events.length} Teleporter events`)
}

const lifecycles = store.all()
console.log(`\n${total} events → ${lifecycles.length} message lifecycles`)
const byStatus = {}
for (const lc of lifecycles) byStatus[lc.status] = (byStatus[lc.status] ?? 0) + 1
console.log("status breakdown:", byStatus)

const complete = lifecycles.find((lc) => lc.status === "executed" || lc.status === "receipted")
if (complete) {
  console.log("\nsample complete lifecycle:")
  console.log({
    messageID: complete.messageID,
    status: complete.status,
    route: `${complete.sourceChain} -> ${complete.destinationChain}`,
    latencySeconds: complete.deliveryLatencySeconds,
    stages: complete.events.map((e) => `${e.eventName}@${e.chain}`),
  })
}
