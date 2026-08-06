import { describe, expect, it } from "vitest"
import { encodeEventTopics, encodeAbiParameters, type Hex } from "viem"
import { decodeTeleporterLog, LifecycleStore, teleporterAbi } from "../src/index.js"

const MSG_ID = "0x00000000000000000000000000000000000000000000000000000000000000aa" as Hex
const BLOCKCHAIN_ID = "0x00000000000000000000000000000000000000000000000000000000000000bb" as Hex
const SENDER = "0x1111111111111111111111111111111111111111"
const DEST = "0x2222222222222222222222222222222222222222"
const RELAYER = "0x3333333333333333333333333333333333333333"

const teleporterMessageAbi = {
  type: "tuple",
  components: [
    { name: "messageNonce", type: "uint256" },
    { name: "originSenderAddress", type: "address" },
    { name: "destinationBlockchainID", type: "bytes32" },
    { name: "destinationAddress", type: "address" },
    { name: "requiredGasLimit", type: "uint256" },
    { name: "allowedRelayerAddresses", type: "address[]" },
    {
      name: "receipts",
      type: "tuple[]",
      components: [
        { name: "receivedMessageNonce", type: "uint256" },
        { name: "relayerRewardAddress", type: "address" },
      ],
    },
    { name: "message", type: "bytes" },
  ],
} as const

const feeInfoAbi = {
  type: "tuple",
  components: [
    { name: "feeTokenAddress", type: "address" },
    { name: "amount", type: "uint256" },
  ],
} as const

const sampleMessage = {
  messageNonce: 1n,
  originSenderAddress: SENDER,
  destinationBlockchainID: BLOCKCHAIN_ID,
  destinationAddress: DEST,
  requiredGasLimit: 100_000n,
  allowedRelayerAddresses: [],
  receipts: [],
  message: "0x" as Hex,
} as const

const sampleFee = { feeTokenAddress: SENDER, amount: 0n } as const

function makeLog(
  eventName: string,
  chain: string,
  blockTimestamp: number,
  topics: Hex[],
  data: Hex,
  logIndex = 0,
) {
  return {
    chain,
    blockTimestamp,
    log: {
      data,
      topics,
      blockNumber: 100n,
      transactionHash: ("0x" + "ab".repeat(31) + logIndex.toString(16).padStart(2, "0")) as Hex,
      logIndex,
    },
  }
}

function sendLog(ts = 1000) {
  const topics = encodeEventTopics({
    abi: teleporterAbi,
    eventName: "SendCrossChainMessage",
    args: { messageID: MSG_ID, destinationBlockchainID: BLOCKCHAIN_ID },
  }) as Hex[]
  const data = encodeAbiParameters([teleporterMessageAbi, feeInfoAbi], [sampleMessage, sampleFee])
  return makeLog("SendCrossChainMessage", "c-chain", ts, topics, data, 0)
}

function receiveLog(ts = 1010) {
  const topics = encodeEventTopics({
    abi: teleporterAbi,
    eventName: "ReceiveCrossChainMessage",
    args: { messageID: MSG_ID, sourceBlockchainID: BLOCKCHAIN_ID, deliverer: RELAYER },
  }) as Hex[]
  const data = encodeAbiParameters(
    [{ name: "rewardRedeemer", type: "address" }, teleporterMessageAbi],
    [RELAYER, sampleMessage],
  )
  return makeLog("ReceiveCrossChainMessage", "my-l1", ts, topics, data, 1)
}

function executedLog(ts = 1011) {
  const topics = encodeEventTopics({
    abi: teleporterAbi,
    eventName: "MessageExecuted",
    args: { messageID: MSG_ID, sourceBlockchainID: BLOCKCHAIN_ID },
  }) as Hex[]
  return makeLog("MessageExecuted", "my-l1", ts, topics, "0x", 2)
}

function failedLog(ts = 1011) {
  const topics = encodeEventTopics({
    abi: teleporterAbi,
    eventName: "MessageExecutionFailed",
    args: { messageID: MSG_ID, sourceBlockchainID: BLOCKCHAIN_ID },
  }) as Hex[]
  const data = encodeAbiParameters([teleporterMessageAbi], [sampleMessage])
  return makeLog("MessageExecutionFailed", "my-l1", ts, topics, data, 3)
}

describe("decodeTeleporterLog", () => {
  it("decodes SendCrossChainMessage with struct args", () => {
    const rec = decodeTeleporterLog(sendLog())
    expect(rec).not.toBeNull()
    expect(rec!.eventName).toBe("SendCrossChainMessage")
    expect(rec!.messageID).toBe(MSG_ID)
    const msg = rec!.args.message as typeof sampleMessage
    expect(msg.originSenderAddress).toBe(SENDER)
    expect(msg.destinationAddress).toBe(DEST)
  })

  it("returns null for non-Teleporter logs", () => {
    const rec = decodeTeleporterLog(
      makeLog("Transfer", "c-chain", 0, ["0x" + "11".repeat(32)] as Hex[], "0x"),
    )
    expect(rec).toBeNull()
  })
})

describe("LifecycleStore", () => {
  it("assembles the happy path: sent → delivered → executed", () => {
    const store = new LifecycleStore()
    store.apply(decodeTeleporterLog(sendLog())!)
    store.apply(decodeTeleporterLog(receiveLog())!)
    const lc = store.apply(decodeTeleporterLog(executedLog())!)

    expect(lc.status).toBe("executed")
    expect(lc.sourceChain).toBe("c-chain")
    expect(lc.destinationChain).toBe("my-l1")
    expect(lc.originSender).toBe(SENDER)
    expect(lc.deliveryLatencySeconds).toBe(10)
    expect(lc.events.map((e) => e.eventName)).toEqual([
      "SendCrossChainMessage",
      "ReceiveCrossChainMessage",
      "MessageExecuted",
    ])
  })

  it("tracks execution failure and retry count", () => {
    const store = new LifecycleStore()
    store.apply(decodeTeleporterLog(sendLog())!)
    store.apply(decodeTeleporterLog(receiveLog())!)
    const lc = store.apply(decodeTeleporterLog(failedLog())!)
    expect(lc.status).toBe("execution_failed")
    expect(lc.failureCount).toBe(1)
  })

  it("handles out-of-order arrival (destination before source)", () => {
    const store = new LifecycleStore()
    store.apply(decodeTeleporterLog(receiveLog())!)
    let lc = store.get(MSG_ID)!
    expect(lc.status).toBe("orphaned")
    lc = store.apply(decodeTeleporterLog(sendLog())!)
    expect(lc.status).toBe("delivered")
    expect(lc.events[0]!.eventName).toBe("SendCrossChainMessage")
  })

  it("is idempotent on duplicate events", () => {
    const store = new LifecycleStore()
    store.apply(decodeTeleporterLog(sendLog())!)
    store.apply(decodeTeleporterLog(sendLog())!)
    expect(store.get(MSG_ID)!.events).toHaveLength(1)
  })

  it("flags stuck messages past the delivery threshold", () => {
    const store = new LifecycleStore()
    store.apply(decodeTeleporterLog(sendLog(1000))!)
    expect(store.stuck(1050, 120)).toHaveLength(0)
    expect(store.stuck(1200, 120)).toHaveLength(1)
    store.apply(decodeTeleporterLog(receiveLog(1210))!)
    store.apply(decodeTeleporterLog(executedLog(1211))!)
    expect(store.stuck(1300, 120)).toHaveLength(0)
  })
})
