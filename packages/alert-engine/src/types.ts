export type AlertSeverity = "info" | "warning" | "critical"

export type AlertStatus = "firing" | "resolved"

export type AlertRuleId =
  | "relayer_stalled_while_up"
  | "relayer_gas_wallet_low"
  | "icm_message_stuck"
  | "validator_uptime_dipping"
  | "chain_degraded"

export interface AlertNotification {
  incidentId: string
  ruleId: AlertRuleId
  status: AlertStatus
  severity: AlertSeverity
  title: string
  message: string
  timestamp: number
  metadata: Record<string, unknown>
}

export interface IncidentRecord {
  id: string
  ruleId: AlertRuleId
  status: AlertStatus
  severity: AlertSeverity
  title: string
  message: string
  firstTriggeredAt: number
  lastTriggeredAt: number
  lastNotifiedAt: number
  resolvedAt?: number
  notificationCount: number
  metadata: Record<string, unknown>
}

export interface AlertTriggerEvent {
  incidentId: string
  ruleId: AlertRuleId
  severity: AlertSeverity
  title: string
  message: string
  timestamp?: number
  metadata?: Record<string, unknown>
}

export type NotificationHandler = (notification: AlertNotification) => Promise<void> | void

export interface EngineOptions {
  /** Default cooldown in seconds before re-notifying an existing firing incident (default: 300s). */
  defaultCooldownSeconds?: number
  /** Per-rule override for cooldown window in seconds. */
  ruleCooldowns?: Partial<Record<AlertRuleId, number>>
}
