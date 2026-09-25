import DeviceActivity
import Foundation

class FocusGateDeviceActivityMonitor: DeviceActivityMonitor {
    override func intervalDidStart(for activity: DeviceActivityName) {
        guard activity == FocusGateDeviceActivity.activityName else {
            return
        }

        let state = FocusGateSharedState.advanceExpiredCreatorDayIfNeeded(FocusGateSharedState.loadState())
        FocusGateSharedState.saveState(state)
        FocusGateSharedState.recordDebugEvent(
            source: "monitorExtension",
            message: "interval_started",
            details: [
                "allowedMinutes": "\(state.allowedMinutes)",
                "lastReachedThresholdMinutes": "\(state.lastReachedThresholdMinutes)",
                "shielded": state.shielded ? "true" : "false"
            ]
        )

        guard state.enabled else {
            FocusGateShielding.clearShield()
            return
        }

        let selection = FocusGateSharedState.loadSelection()
        let summary = FocusGateSharedState.selectionSummary(selection)
        if !summary.hasSelection {
            FocusGateShielding.clearShield()
            return
        }

        if state.allowedMinutes <= 0 || state.lastReachedThresholdMinutes >= state.allowedMinutes {
            FocusGateShielding.applyShield(selection: selection)
        } else {
            FocusGateShielding.clearShield()
        }
    }

    override func eventDidReachThreshold(_ event: DeviceActivityEvent.Name, activity: DeviceActivityName) {
        guard activity == FocusGateDeviceActivity.activityName else {
            return
        }

        let currentGeneration = FocusGateSharedState.loadMonitorGeneration()
        guard
            let eventGeneration = FocusGateDeviceActivity.protectedUsageEventGeneration(event),
            eventGeneration == currentGeneration
        else {
            FocusGateSharedState.recordDebugEvent(
                source: "monitorExtension",
                message: "stale_threshold_ignored",
                details: [
                    "eventName": event.rawValue,
                    "currentGeneration": "\(currentGeneration)"
                ]
            )
            return
        }

        var state = FocusGateSharedState.advanceExpiredCreatorDayIfNeeded(FocusGateSharedState.loadState())
        guard state.enabled else {
            FocusGateShielding.clearShield()
            FocusGateSharedState.recordDebugEvent(
                source: "monitorExtension",
                message: "disabled_threshold_ignored",
                details: ["generation": "\(currentGeneration)"]
            )
            return
        }

        let selection = FocusGateSharedState.loadSelection()
        guard FocusGateSharedState.selectionSummary(selection).hasSelection else {
            FocusGateShielding.clearShield()
            return
        }

        state.lastReachedThresholdMinutes = max(state.lastReachedThresholdMinutes, state.allowedMinutes)
        state.shielded = true
        state.lastSyncedAt = FocusGateSharedState.isoString(from: Date())
        FocusGateSharedState.saveState(state)
        FocusGateShielding.applyShield(selection: selection)
        FocusGateSharedState.recordDebugEvent(
            source: "monitorExtension",
            message: "threshold_reached",
            details: [
                "generation": "\(currentGeneration)",
                "allowedMinutes": "\(state.allowedMinutes)",
                "lastReachedThresholdMinutes": "\(state.lastReachedThresholdMinutes)"
            ]
        )
    }

    override func intervalDidEnd(for activity: DeviceActivityName) {
        guard activity == FocusGateDeviceActivity.activityName else {
            return
        }

        let state = FocusGateSharedState.loadState()
        if
            let creatorDayEndsAt = FocusGateSharedState.date(from: state.creatorDayEndsAt),
            Date() < creatorDayEndsAt
        {
            FocusGateSharedState.recordDebugEvent(
                source: "monitorExtension",
                message: "interval_ended_before_creator_day_end",
                details: [
                    "allowedMinutes": "\(state.allowedMinutes)",
                    "lastReachedThresholdMinutes": "\(state.lastReachedThresholdMinutes)",
                    "shielded": state.shielded ? "true" : "false",
                    "creatorDayEndsAt": state.creatorDayEndsAt
                ]
            )
            return
        }

        FocusGateSharedState.recordDebugEvent(
            source: "monitorExtension",
            message: "interval_ended"
        )
        FocusGateDeviceActivity.configureMonitoringFromCachedStateAfterRollover()
    }

    override func intervalWillStartWarning(for activity: DeviceActivityName) {
        guard activity == FocusGateDeviceActivity.activityName else {
            return
        }

        FocusGateSharedState.recordDebugEvent(
            source: "monitorExtension",
            message: "interval_will_start_warning"
        )
    }

    override func intervalWillEndWarning(for activity: DeviceActivityName) {
        guard activity == FocusGateDeviceActivity.activityName else {
            return
        }

        FocusGateSharedState.recordDebugEvent(
            source: "monitorExtension",
            message: "interval_will_end_warning"
        )
    }

    override func eventWillReachThresholdWarning(_ event: DeviceActivityEvent.Name, activity: DeviceActivityName) {
        guard activity == FocusGateDeviceActivity.activityName else {
            return
        }

        let currentGeneration = FocusGateSharedState.loadMonitorGeneration()
        guard
            let eventGeneration = FocusGateDeviceActivity.protectedUsageEventGeneration(event),
            eventGeneration == currentGeneration
        else {
            return
        }

        FocusGateSharedState.recordDebugEvent(
            source: "monitorExtension",
            message: "event_will_reach_threshold_warning",
            details: ["generation": "\(currentGeneration)"]
        )
    }
}
