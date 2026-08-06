# @avapulse/icm-core

Teleporter/ICM message lifecycle engine for Avalanche: typed event decoding, cross-chain correlation by `messageID`, and stuck-message detection. The shared core behind [AvaPulse](https://ava-pulse.vercel.app) (live monitoring) and [ICM Trace](https://icm-trace.vercel.app) (post-mortem debugging).

```bash
npm install @avapulse/icm-core viem
```

## What it does

- **Decode** TeleporterMessenger event logs (`SendCrossChainMessage`, `ReceiveCrossChainMessage`, `MessageExecuted`, `MessageExecutionFailed`, `ReceiptReceived`) into typed records.
- **Correlate** events from any number of chains into per-message lifecycles — idempotent, order-independent, retry-aware.
- **Detect** stuck messages: sent but not executed within a delivery threshold.
- **Ingest** via `fetchTeleporterEvents` (range fetch with public-RPC-safe chunking) or the polling `TeleporterWatcher`.

## Quick start

```ts
import { createPublicClient, http } from "viem"
import { fetchTeleporterEvents, LifecycleStore } from "@avapulse/icm-core"

const client = createPublicClient({
  transport: http("https://api.avax-test.network/ext/bc/C/rpc"),
})

const head = await client.getBlockNumber()
const events = await fetchTeleporterEvents({
  client,
  chain: "fuji-c",
  fromBlock: head - 2000n,
  toBlock: head,
})

const store = new LifecycleStore()
for (const e of events) store.apply(e)

console.log(store.all().map((lc) => `${lc.messageID} ${lc.status}`))
console.log("stuck:", store.stuck(Date.now() / 1000, 120))
```

Live watching across a chain pair:

```ts
import { TeleporterWatcher, LifecycleStore } from "@avapulse/icm-core"

const store = new LifecycleStore()
const watcher = new TeleporterWatcher({
  chains: [
    { chain: "c-chain", client: cChainClient },
    { chain: "my-l1", client: myL1Client },
  ],
  onEvent: (e) => {
    const lc = store.apply(e)
    if (lc.status === "execution_failed") notifySomeone(lc)
  },
})
await watcher.start()
```

## License

MIT — part of the [AvaPulse](https://github.com/Pratikkale26/AvaPulse) project.
