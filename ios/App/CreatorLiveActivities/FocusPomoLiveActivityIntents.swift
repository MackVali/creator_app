import ActivityKit
import AppIntents
import Foundation

private let focusPomoActionAppGroup = "group.app.trycreator.creator"
private let focusPomoPendingActionsKey = "creator.focuspomo.liveActivity.pendingActions"
// TEMP_FOCUS_POMO_DIAGNOSTICS: remove after one device test.
private let focusPomoLiveActivityActionLog = "[CREATOR_FOCUS_LIVE_ACTIVITY_ACTION]"

private struct FocusPomoPendingAction: Codable, Hashable {
    let id: String
    let action: String
    let sessionId: String
    let title: String
    let scheduleInstanceId: String?
    let requestedAt: String
}

private enum FocusPomoLiveActivityActionStore {
    static func append(action: String, sessionId: String, title: String, scheduleInstanceId: String?) -> Bool {
        let normalizedSessionId = sessionId.trimmingCharacters(in: .whitespacesAndNewlines)

        guard
            !normalizedSessionId.isEmpty
        else {
            NSLog("\(focusPomoLiveActivityActionLog) write_failed reason=missing_session_id action=\(action)")
            return false
        }

        guard let defaults = UserDefaults(suiteName: focusPomoActionAppGroup) else {
            NSLog("\(focusPomoLiveActivityActionLog) write_failed reason=app_group_unavailable group=\(focusPomoActionAppGroup) action=\(action) sessionId=\(normalizedSessionId)")
            return false
        }

        var actions = readActions(defaults: defaults)
        let normalizedScheduleInstanceId = normalized(scheduleInstanceId)
        let request = FocusPomoPendingAction(
            id: UUID().uuidString,
            action: action,
            sessionId: normalizedSessionId,
            title: title.trimmingCharacters(in: .whitespacesAndNewlines),
            scheduleInstanceId: normalizedScheduleInstanceId,
            requestedAt: ISO8601DateFormatter().string(from: Date())
        )
        actions.append(request)
        let limitedActions = Array(actions.suffix(12))

        if let data = try? JSONEncoder().encode(limitedActions),
           let payload = String(data: data, encoding: .utf8) {
            defaults.set(payload, forKey: focusPomoPendingActionsKey)
            let didSynchronize = defaults.synchronize()
            NSLog("\(focusPomoLiveActivityActionLog) write_succeeded action=\(action) sessionId=\(normalizedSessionId) scheduleInstanceId=\(normalizedScheduleInstanceId ?? "") pendingCount=\(limitedActions.count) synchronized=\(didSynchronize ? "true" : "false")")
            return true
        }

        NSLog("\(focusPomoLiveActivityActionLog) write_failed reason=encode_failed action=\(action) sessionId=\(normalizedSessionId) scheduleInstanceId=\(normalizedScheduleInstanceId ?? "")")
        return false
    }

    private static func readActions(defaults: UserDefaults) -> [FocusPomoPendingAction] {
        guard
            let payload = defaults.string(forKey: focusPomoPendingActionsKey),
            let data = payload.data(using: .utf8),
            let actions = try? JSONDecoder().decode([FocusPomoPendingAction].self, from: data)
        else {
            return []
        }

        return actions
    }

    private static func normalized(_ value: String?) -> String? {
        let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return trimmed.isEmpty ? nil : trimmed
    }
}

@available(iOS 17.0, *)
private enum FocusPomoLiveActivityQueuedStateUpdater {
    static func update(sessionId: String, title: String, status: String, queuedAction: String) async {
        var didUpdateActivity = false

        for activity in Activity<GenericAttributes>.activities {
            var values = activity.attributes.staticValues.merging(activity.content.state.values) { _, stateValue in
                stateValue
            }
            guard values["sessionId"] == sessionId else {
                continue
            }

            values["sessionId"] = sessionId
            values["title"] = title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "Focus Pomo" : title
            values["status"] = status
            values["queuedAction"] = queuedAction

            let content = GenericAttributes.ContentState(values: values)
            await activity.update(ActivityContent(state: content, staleDate: nil))
            didUpdateActivity = true
            NSLog("\(focusPomoLiveActivityActionLog) queued_state_updated action=\(queuedAction) sessionId=\(sessionId) status=\(status)")
        }

        if !didUpdateActivity {
            NSLog("\(focusPomoLiveActivityActionLog) queued_state_update_skipped reason=activity_not_found action=\(queuedAction) sessionId=\(sessionId) status=\(status)")
        }
    }
}

@available(iOS 17.0, *)
struct FocusPomoCompleteLiveActivityIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Complete Focus Pomo"

    @Parameter(title: "Session ID")
    var sessionId: String

    @Parameter(title: "Title")
    var titleText: String

    @Parameter(title: "Schedule Instance ID")
    var scheduleInstanceId: String

    init() {
        sessionId = ""
        titleText = ""
        scheduleInstanceId = ""
    }

    init(sessionId: String, title: String, scheduleInstanceId: String) {
        self.sessionId = sessionId
        self.titleText = title
        self.scheduleInstanceId = scheduleInstanceId
    }

    func perform() async throws -> some IntentResult {
        let didWrite = FocusPomoLiveActivityActionStore.append(
            action: "complete",
            sessionId: sessionId,
            title: titleText,
            scheduleInstanceId: scheduleInstanceId
        )

        if didWrite {
            await FocusPomoLiveActivityQueuedStateUpdater.update(
                sessionId: sessionId,
                title: titleText,
                status: "queued_complete",
                queuedAction: "complete"
            )
        }

        return .result()
    }
}

@available(iOS 17.0, *)
struct FocusPomoSkipLiveActivityIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Skip Focus Pomo"

    @Parameter(title: "Session ID")
    var sessionId: String

    @Parameter(title: "Title")
    var titleText: String

    @Parameter(title: "Schedule Instance ID")
    var scheduleInstanceId: String

    init() {
        sessionId = ""
        titleText = ""
        scheduleInstanceId = ""
    }

    init(sessionId: String, title: String, scheduleInstanceId: String) {
        self.sessionId = sessionId
        self.titleText = title
        self.scheduleInstanceId = scheduleInstanceId
    }

    func perform() async throws -> some IntentResult {
        let didWrite = FocusPomoLiveActivityActionStore.append(
            action: "skip",
            sessionId: sessionId,
            title: titleText,
            scheduleInstanceId: scheduleInstanceId
        )

        if didWrite {
            await FocusPomoLiveActivityQueuedStateUpdater.update(
                sessionId: sessionId,
                title: titleText,
                status: "queued_skip",
                queuedAction: "skip"
            )
        }

        return .result()
    }
}

@available(iOS 17.0, *)
struct FocusPomoCompleteWidgetIntent: AppIntent {
    static var title: LocalizedStringResource = "Complete Focus Pomo"
    static var openAppWhenRun: Bool = true

    @Parameter(title: "Session ID")
    var sessionId: String

    @Parameter(title: "Title")
    var titleText: String

    @Parameter(title: "Schedule Instance ID")
    var scheduleInstanceId: String

    init() {
        sessionId = ""
        titleText = ""
        scheduleInstanceId = ""
    }

    init(sessionId: String, title: String, scheduleInstanceId: String) {
        self.sessionId = sessionId
        self.titleText = title
        self.scheduleInstanceId = scheduleInstanceId
    }

    func perform() async throws -> some IntentResult {
        _ = FocusPomoLiveActivityActionStore.append(
            action: "complete",
            sessionId: sessionId,
            title: titleText,
            scheduleInstanceId: scheduleInstanceId
        )
        return .result()
    }
}

@available(iOS 17.0, *)
struct FocusPomoSkipWidgetIntent: AppIntent {
    static var title: LocalizedStringResource = "Skip Focus Pomo"
    static var openAppWhenRun: Bool = true

    @Parameter(title: "Session ID")
    var sessionId: String

    @Parameter(title: "Title")
    var titleText: String

    @Parameter(title: "Schedule Instance ID")
    var scheduleInstanceId: String

    init() {
        sessionId = ""
        titleText = ""
        scheduleInstanceId = ""
    }

    init(sessionId: String, title: String, scheduleInstanceId: String) {
        self.sessionId = sessionId
        self.titleText = title
        self.scheduleInstanceId = scheduleInstanceId
    }

    func perform() async throws -> some IntentResult {
        _ = FocusPomoLiveActivityActionStore.append(
            action: "skip",
            sessionId: sessionId,
            title: titleText,
            scheduleInstanceId: scheduleInstanceId
        )
        return .result()
    }
}
