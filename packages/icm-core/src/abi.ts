import { parseAbi } from "viem"

/**
 * Canonical TeleporterMessenger deployment address — identical on every
 * EVM Avalanche chain (deployed via Nick's method).
 */
export const TELEPORTER_MESSENGER_ADDRESS =
  "0x253b2784c75e510dD0fF1da844684a1aC0aa5fcf" as const

/**
 * Event fragments of TeleporterMessenger (ava-labs/icm-contracts v1.x).
 * Struct tuples are spelled out so viem can decode without the full ABI.
 */
export const teleporterAbi = parseAbi([
  "struct TeleporterMessageReceipt { uint256 receivedMessageNonce; address relayerRewardAddress; }",
  "struct TeleporterFeeInfo { address feeTokenAddress; uint256 amount; }",
  "struct TeleporterMessage { uint256 messageNonce; address originSenderAddress; bytes32 destinationBlockchainID; address destinationAddress; uint256 requiredGasLimit; address[] allowedRelayerAddresses; TeleporterMessageReceipt[] receipts; bytes message; }",
  "event SendCrossChainMessage(bytes32 indexed messageID, bytes32 indexed destinationBlockchainID, TeleporterMessage message, TeleporterFeeInfo feeInfo)",
  "event ReceiveCrossChainMessage(bytes32 indexed messageID, bytes32 indexed sourceBlockchainID, address indexed deliverer, address rewardRedeemer, TeleporterMessage message)",
  "event MessageExecuted(bytes32 indexed messageID, bytes32 indexed sourceBlockchainID)",
  "event MessageExecutionFailed(bytes32 indexed messageID, bytes32 indexed sourceBlockchainID, TeleporterMessage message)",
  "event ReceiptReceived(bytes32 indexed messageID, bytes32 indexed destinationBlockchainID, address indexed relayerRewardAddress, TeleporterFeeInfo feeInfo)",
])

export const TELEPORTER_EVENT_NAMES = [
  "SendCrossChainMessage",
  "ReceiveCrossChainMessage",
  "MessageExecuted",
  "MessageExecutionFailed",
  "ReceiptReceived",
] as const

export type TeleporterEventName = (typeof TELEPORTER_EVENT_NAMES)[number]
