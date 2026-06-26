import ActivityKit
import AppIntents
import Foundation

private let focusPomoActionAppGroup = "group.app.trycreator.creator"
private let focusPomoPendingActionsKey = "creator.focuspomo.liveActivity.pendingActions"

private struct FocusPomoPendingAction: Codable, Hashable {
    let id: String
    let action: String
    let sessionId: String
    let title: String
    let scheduleInstanceId: String?
    let requestedAt: String
}

private enum FocusPomoLiveActivityActionStore {
    static func append(action: String, sessionId: String, title: String, scheduleInstanceId: String?) {
        guard
            !sessionId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
            let defaults = UserDefaults(suiteName: focusPomoActionAppGroup)
        else {
            return
        }

        var actions = readActions(defaults: defaults)
        let request = FocusPomoPendingAction(
            id: UUID().uuidString,
            action: action,
            sessionId: sessionId,
            title: title.trimmingCharacters(in: .whitespacesAndNewlines),
            scheduleInstanceId: normalized(scheduleInstanceId),
            requestedAt: ISO8601DateFormatter().string(from: Date())
        )
        actions.append(request)
        let limitedActions = Array(actions.suffix(12))

        if let data = try? JSONEncoder().encode(limitedActions),
           let payload = String(data: data, encoding: .utf8) {
            defaults.set(payload, forKey: focusPomoPendingActionsKey)
            defaults.synchronize()
        }
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
private enum FocusPomoLiveActivityEnder {
    static func end(sessionId: String, title: String, status: String) async {
        for activity in Activity<GenericAttributes>.activities {
            let values = activity.attributes.staticValues.merging(activity.content.state.values) { _, stateValue in
                stateValue
            }
            guard values["sessionId"] == sessionId else {
                continue
            }

            let content = GenericAttributes.ContentState(values: [
                "sessionId": sessionId,
                "title": title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "Focus Pomo" : title,
                "status": status
            ])
            await activity.end(ActivityContent(state: content, staleDate: nil), dismissalPolicy: .immediate)
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
        FocusPomoLiveActivityActionStore.append(
            action: "complete",
            sessionId: sessionId,
            title: titleText,
            scheduleInstanceId: scheduleInstanceId
        )
        await FocusPomoLiveActivityEnder.end(sessionId: sessionId, title: titleText, status: "completed")
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
        FocusPomoLiveActivityActionStore.append(
            action: "skip",
            sessionId: sessionId,
            title: titleText,
            scheduleInstanceId: scheduleInstanceId
        )
        await FocusPomoLiveActivityEnder.end(sessionId: sessionId, title: titleText, status: "canceled")
        return .result()
    }
}
