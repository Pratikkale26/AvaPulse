import type {
  NodeMetricsSnapshot,
  PrometheusMetric,
  RelayerMetricsSnapshot,
} from "../types.js"

/**
 * Fast, zero-dependency parser for standard Prometheus text exposition format.
 * Parses metrics, labels, and floating-point values.
 */
export function parsePrometheusText(rawText: string): PrometheusMetric[] {
  const metrics: PrometheusMetric[] = []
  const lines = rawText.split("\n")

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line || line.startsWith("#")) continue

    // Format: name{labels} value [timestamp] OR name value [timestamp]
    const braceOpen = line.indexOf("{")
    let name: string
    let labels: Record<string, string> = {}
    let valueStr: string

    if (braceOpen !== -1) {
      name = line.slice(0, braceOpen).trim()
      const braceClose = line.indexOf("}", braceOpen)
      if (braceClose === -1) continue

      const rawLabels = line.slice(braceOpen + 1, braceClose)
      labels = parseLabels(rawLabels)
      valueStr = line.slice(braceClose + 1).trim()
    } else {
      const firstSpace = line.indexOf(" ")
      const firstTab = line.indexOf("\t")
      const sep =
        firstSpace === -1
          ? firstTab
          : firstTab === -1
            ? firstSpace
            : Math.min(firstSpace, firstTab)

      if (sep === -1) continue
      name = line.slice(0, sep).trim()
      valueStr = line.slice(sep + 1).trim()
    }

    // Split value and optional timestamp
    const parts = valueStr.split(/\s+/)
    const num = Number(parts[0])
    if (!Number.isNaN(num)) {
      metrics.push({ name, labels, value: num })
    }
  }

  return metrics
}

function parseLabels(rawLabels: string): Record<string, string> {
  const labels: Record<string, string> = {}
  // Matches key="value" pairs
  const regex = /([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*"([^"\\]*(?:\\.[^"\\]*)*)"/g
  let match: RegExpExecArray | null

  while ((match = regex.exec(rawLabels)) !== null) {
    labels[match[1]] = match[2]
  }

  return labels
}

/**
 * Scraper for AvalancheGo node metrics endpoint (/ext/metrics).
 */
export class NodeMetricsScraper {
  constructor(
    public readonly chain: string,
    public readonly metricsUrl: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async scrape(timestamp = Math.floor(Date.now() / 1000)): Promise<NodeMetricsSnapshot> {
    try {
      const res = await this.fetchFn(this.metricsUrl, {
        headers: { Accept: "text/plain" },
        signal: AbortSignal.timeout(5000),
      })

      if (!res.ok) {
        return {
          chain: this.chain,
          reachable: false,
          isHealthy: false,
          metrics: {},
          timestamp,
          error: `HTTP ${res.status} ${res.statusText}`,
        }
      }

      const text = await res.text()
      const parsed = parsePrometheusText(text)
      const metricsMap: Record<string, number> = {}

      for (const m of parsed) {
        metricsMap[m.name] = m.value
      }

      // Extract peer count: commonly network_peers or avalanche_peers
      const peerCount =
        metricsMap["network_peers"] ??
        metricsMap["avalanchego_network_peers"] ??
        metricsMap["gecko_network_peers"]

      // Health status: 1 for healthy, 0 for degraded
      const isHealthy = (metricsMap["health_healthy"] ?? 1) === 1

      return {
        chain: this.chain,
        reachable: true,
        peerCount,
        isHealthy,
        metrics: metricsMap,
        timestamp,
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      return {
        chain: this.chain,
        reachable: false,
        isHealthy: false,
        metrics: {},
        timestamp,
        error: errorMsg,
      }
    }
  }
}

/**
 * Scraper for ICM Relayer metrics endpoint (:9090/metrics).
 */
export class RelayerMetricsScraper {
  constructor(
    public readonly relayerName: string,
    public readonly metricsUrl: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async scrape(timestamp = Math.floor(Date.now() / 1000)): Promise<RelayerMetricsSnapshot> {
    try {
      const res = await this.fetchFn(this.metricsUrl, {
        headers: { Accept: "text/plain" },
        signal: AbortSignal.timeout(5000),
      })

      if (!res.ok) {
        return {
          relayerName: this.relayerName,
          reachable: false,
          messagesDelivered: 0,
          messagesReceived: 0,
          errorsTotal: 0,
          metrics: {},
          timestamp,
          error: `HTTP ${res.status} ${res.statusText}`,
        }
      }

      const text = await res.text()
      const parsed = parsePrometheusText(text)
      const metricsMap: Record<string, number> = {}

      let messagesDelivered = 0
      let messagesReceived = 0
      let errorsTotal = 0

      for (const m of parsed) {
        metricsMap[m.name] = m.value

        if (m.name.includes("delivered") || m.name.includes("messages_delivered_total")) {
          messagesDelivered += m.value
        } else if (m.name.includes("received") || m.name.includes("messages_received_total")) {
          messagesReceived += m.value
        } else if (m.name.includes("error") || m.name.includes("failed")) {
          errorsTotal += m.value
        }
      }

      return {
        relayerName: this.relayerName,
        reachable: true,
        messagesDelivered,
        messagesReceived,
        errorsTotal,
        metrics: metricsMap,
        timestamp,
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      return {
        relayerName: this.relayerName,
        reachable: false,
        messagesDelivered: 0,
        messagesReceived: 0,
        errorsTotal: 0,
        metrics: {},
        timestamp,
        error: errorMsg,
      }
    }
  }
}
