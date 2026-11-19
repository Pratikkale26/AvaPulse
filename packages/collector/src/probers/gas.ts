import { createPublicClient, formatEther, http, type Address, type PublicClient } from "viem"
import type { GasBalanceResult, RelayerGasWalletConfig } from "../types.js"

export interface GasWalletProberOptions {
  client?: PublicClient
  timeoutMs?: number
}

export class GasWalletProber {
  private client: PublicClient

  constructor(
    public readonly relayerName: string,
    public readonly walletConfig: RelayerGasWalletConfig,
    rpcUrl: string,
    options: GasWalletProberOptions = {},
  ) {
    this.client =
      options.client ??
      createPublicClient({
        transport: http(rpcUrl, {
          timeout: options.timeoutMs ?? 5000,
        }),
      })
  }

  /**
   * Check the native gas token balance for this relayer wallet.
   * Compares the balance to warning and critical thresholds.
   */
  async checkBalance(timestamp = Math.floor(Date.now() / 1000)): Promise<GasBalanceResult> {
    const balanceWei = await this.client.getBalance({
      address: this.walletConfig.address,
    })

    const balanceAvax = Number(formatEther(balanceWei))
    const minBalance = this.walletConfig.minBalanceAvax
    const criticalThreshold = minBalance * 0.2

    return {
      relayerName: this.relayerName,
      chain: this.walletConfig.chain,
      address: this.walletConfig.address,
      balanceWei,
      balanceAvax,
      minBalanceAvax: minBalance,
      isLow: balanceAvax <= minBalance,
      isCritical: balanceAvax <= criticalThreshold,
      timestamp,
    }
  }
}
