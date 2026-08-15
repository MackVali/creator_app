import DeviceActivity
import FamilyControls
import Foundation

enum FocusGateDeviceActivity {
    static let activityName = DeviceActivityName("creator.focusGate.protectedUsage")
    static let protectedUsageEventName = DeviceActivityEvent.Name("creator.focusGate.protectedUsage.threshold")

    static func stopMonitoring() {
        DeviceActivityCenter().stopMonitoring([activityName])
        FocusGateSharedState.recordDebugEvent(source: "deviceActivity", message: "monitoring_stopped")
    }

    static func configureMonitoring(
        state: FocusGateSharedStatePayload,
        selection: FamilyActivitySelection,
        registerUsageEvent: Bool
    ) throws {
        guard state.enabled else {
            stopMonitoring()
            return
        }

        let schedule = try makeSchedule(state: state)
        var events: [DeviceActivityEvent.Name: DeviceActivityEvent] = [:]
        if registerUsageEvent {
            guard state.allowedMinutes > 0 else {
                throw FocusGateDeviceActivityError.invalidThreshold
            }
            events[protectedUsageEventName] = makeEvent(
                selection: selection,
                thresholdMinutes: state.allowedMinutes
            )
            FocusGateSharedState.recordDebugEvent(
                source: "deviceActivity",
                message: "monitoring_threshold_registered",
                details: [
                    "thresholdMinutes": "\(state.allowedMinutes)",
                    "includesPastActivity": "true"
                ]
            )
        }

        let center = DeviceActivityCenter()
        FocusGateSharedState.recordDebugEvent(
            source: "deviceActivity",
            message: "monitoring_reconfigure_started",
            details: [
                "allowedMinutes": "\(state.allowedMinutes)",
                "lastReachedThresholdMinutes": "\(state.lastReachedThresholdMinutes)",
                "eventRegistered": registerUsageEvent ? "true" : "false"
            ]
        )
        center.stopMonitoring([activityName])
        try center.startMonitoring(activityName, during: schedule, events: events)

        FocusGateSharedState.recordDebugEvent(
            source: "deviceActivity",
            message: "monitoring_started",
            details: [
                "startsAt": state.creatorDayStartsAt,
                "endsAt": state.creatorDayEndsAt,
                "allowedMinutes": "\(state.allowedMinutes)",
                "lastReachedThresholdMinutes": "\(state.lastReachedThresholdMinutes)",
                "eventRegistered": registerUsageEvent ? "true" : "false",
                "includesPastActivity": registerUsageEvent ? "true" : "false"
            ]
        )
    }

    static func configureFailClosedMonitoringFromCachedState() {
        let loaded = FocusGateSharedState.loadState()
        var state = FocusGateSharedState.advanceExpiredCreatorDayIfNeeded(loaded)
        state.allowedMinutes = 0
        state.xpToday = 0
        state.lastReachedThresholdMinutes = 0
        state.shielded = true
        state.lastSyncedAt = FocusGateSharedState.isoString(from: Date())
        FocusGateSharedState.saveState(state)

        let selection = FocusGateSharedState.loadSelection()
        FocusGateShielding.applyShield(selection: selection)
        do {
            try configureMonitoring(state: state, selection: selection, registerUsageEvent: false)
        } catch {
            FocusGateSharedState.recordDebugEvent(
                source: "deviceActivity",
                message: "fail_closed_monitoring_failed",
                details: ["error": String(describing: error)]
            )
        }
    }

    private static func makeSchedule(state: FocusGateSharedStatePayload) throws -> DeviceActivitySchedule {
        guard
            let startsAt = FocusGateSharedState.date(from: state.creatorDayStartsAt),
            let endsAt = FocusGateSharedState.date(from: state.creatorDayEndsAt)
        else {
            throw FocusGateDeviceActivityError.invalidDate
        }

        var calendar = Calendar(identifier: .gregorian)
        let timeZone = TimeZone(identifier: state.timezone) ?? .current
        calendar.timeZone = timeZone

        var intervalStart = calendar.dateComponents(
            [.era, .year, .month, .day, .hour, .minute, .second, .nanosecond],
            from: startsAt
        )
        intervalStart.calendar = calendar
        intervalStart.timeZone = timeZone

        var intervalEnd = calendar.dateComponents(
            [.era, .year, .month, .day, .hour, .minute, .second, .nanosecond],
            from: endsAt
        )
        intervalEnd.calendar = calendar
        intervalEnd.timeZone = timeZone

        return DeviceActivitySchedule(
            intervalStart: intervalStart,
            intervalEnd: intervalEnd,
            repeats: false
        )
    }

    private static func makeEvent(
        selection: FamilyActivitySelection,
        thresholdMinutes: Int
    ) -> DeviceActivityEvent {
        let threshold = DateComponents(
            hour: thresholdMinutes / 60,
            minute: thresholdMinutes % 60
        )

        if #available(iOS 17.4, *) {
            return DeviceActivityEvent(
                applications: selection.applicationTokens,
                categories: selection.categoryTokens,
                webDomains: selection.webDomainTokens,
                threshold: threshold,
                includesPastActivity: true
            )
        }

        return DeviceActivityEvent(
            applications: selection.applicationTokens,
            categories: selection.categoryTokens,
            webDomains: selection.webDomainTokens,
            threshold: threshold
        )
    }
}

enum FocusGateDeviceActivityError: Error {
    case invalidDate
    case invalidThreshold
}
