import type {
  AlertNotification,
  AlertRuleId,
  AlertTriggerEvent,
  EngineOptions,
  IncidentRecord,
  NotificationHandler,
} from "./types.js"

export class AlertEngine {
  private incidents = new Map<string, IncidentRecord>()
  private handlers = new Set<NotificationHandler>()
  private defaultCooldownSeconds: number
  private ruleCooldowns: Partial<Record<AlertRuleId, number>>

  constructor(options: EngineOptions = {}) {
    this.defaultCooldownSeconds = options.defaultCooldownSeconds ?? 300
    this.ruleCooldowns = options.ruleCooldowns ?? {}
  }

  /** Subscribe a notification handler (e.g. Telegram, Discord, webhook, or test collector). */
  subscribe(handler: NotificationHandler): () => void {
    this.handlers.add(handler)
    return () => {
      this.handlers.delete(handler)
    }
  }

  /**
   * Process a trigger condition.
   * Creates an incident or updates an existing one, enforcing cooldown windows
   * and notifying only when appropriate (initial firing, severity escalation, or cooldown expiration).
   */
  trigger(event: AlertTriggerEvent): { incident: IncidentRecord; notified: boolean } {
    const now = event.timestamp ?? Math.floor(Date.now() / 1000)
    const existing = this.incidents.get(event.incidentId)

    // Case 1: Fresh incident or re-opening a previously resolved incident
    if (!existing || existing.status === "resolved") {
      const incident: IncidentRecord = {
        id: event.incidentId,
        ruleId: event.ruleId,
        status: "firing",
        severity: event.severity,
        title: event.title,
        message: event.message,
        firstTriggeredAt: now,
        lastTriggeredAt: now,
        lastNotifiedAt: now,
        notificationCount: 1,
        metadata: event.metadata ?? {},
      }
      this.incidents.set(event.incidentId, incident)
      this.dispatch({
        incidentId: incident.id,
        ruleId: incident.ruleId,
        status: "firing",
        severity: incident.severity,
        title: incident.title,
        message: incident.message,
        timestamp: now,
        metadata: incident.metadata,
      })
      return { incident, notified: true }
    }

    // Case 2: Incident is already firing
    existing.lastTriggeredAt = now
    existing.message = event.message
    existing.metadata = { ...existing.metadata, ...(event.metadata ?? {}) }

    // Escalation check: Warning -> Critical bypasses cooldown immediately
    const isEscalation = existing.severity === "warning" && event.severity === "critical"
    if (isEscalation) {
      existing.severity = "critical"
      existing.lastNotifiedAt = now
      existing.notificationCount += 1
      this.dispatch({
        incidentId: existing.id,
        ruleId: existing.ruleId,
        status: "firing",
        severity: "critical",
        title: `[ESCALATED] ${event.title}`,
        message: event.message,
        timestamp: now,
        metadata: existing.metadata,
      })
      return { incident: existing, notified: true }
    }

    // Cooldown check: Has enough time elapsed since last notification?
    const cooldown = this.getCooldown(event.ruleId)
    if (now - existing.lastNotifiedAt >= cooldown) {
      existing.lastNotifiedAt = now
      existing.notificationCount += 1
      this.dispatch({
        incidentId: existing.id,
        ruleId: existing.ruleId,
        status: "firing",
        severity: existing.severity,
        title: `[REMINDER] ${existing.title}`,
        message: event.message,
        timestamp: now,
        metadata: existing.metadata,
      })
      return { incident: existing, notified: true }
    }

    // Suppressed by cooldown window (deduplicated)
    return { incident: existing, notified: false }
  }

  /**
   * Resolve an active incident when normal operation resumes.
   * Dispatches a recovery notification with status="resolved".
   */
  resolve(
    incidentId: string,
    resolutionMessage?: string,
    timestamp?: number,
  ): { incident?: IncidentRecord; notified: boolean } {
    const now = timestamp ?? Math.floor(Date.now() / 1000)
    const existing = this.incidents.get(incidentId)

    if (!existing || existing.status === "resolved") {
      return { notified: false }
    }

    existing.status = "resolved"
    existing.resolvedAt = now
    if (resolutionMessage) {
      existing.message = resolutionMessage
    }

    this.dispatch({
      incidentId: existing.id,
      ruleId: existing.ruleId,
      status: "resolved",
      severity: existing.severity,
      title: `[RESOLVED] ${existing.title}`,
      message: resolutionMessage ?? "Condition cleared. Normal operation resumed.",
      timestamp: now,
      metadata: existing.metadata,
    })

    return { incident: existing, notified: true }
  }

  getIncident(id: string): IncidentRecord | undefined {
    return this.incidents.get(id)
  }

  getActiveIncidents(): IncidentRecord[] {
    return [...this.incidents.values()].filter((i) => i.status === "firing")
  }

  getAllIncidents(): IncidentRecord[] {
    return [...this.incidents.values()]
  }

  clear(): void {
    this.incidents.clear()
  }

  private getCooldown(ruleId: AlertRuleId): number {
    return this.ruleCooldowns[ruleId] ?? this.defaultCooldownSeconds
  }

  private dispatch(notification: AlertNotification): void {
    for (const handler of this.handlers) {
      try {
        void handler(notification)
      } catch (err) {
        console.error(`[AlertEngine] Notification handler error:`, err)
      }
    }
  }
}
