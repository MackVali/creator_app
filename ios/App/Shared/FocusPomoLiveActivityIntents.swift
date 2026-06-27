import ActivityKit
import AppIntents
import Foundation

let focusPomoActionAppGroup = "group.app.trycreator.creator"
let focusPomoPendingActionsKey = "creator.focuspomo.liveActivity.pendingActions"
// TEMP_FOCUS_POMO_DIAGNOSTICS: remove after one device test.
let focusPomoLiveActivityActionLog = "[CREATOR_FOCUS_LIVE_ACTIVITY_ACTION]"

struct FocusPomoPendingAction: Codable, Hashable {
    let id: String
    let action: String
    let sessionId: String
    let itemKey: String?
    let itemType: String?
    let sourceType: String?
    let itemId: String?
    let sourceId: String?
    let title: String
    let scheduleInstanceId: String?
    let requestedAt: String
}

enum FocusPomoLiveActivityActionStore {
    static func append(action: String, sessionId: String, title: String, itemKey: String?, itemType: String?, sourceType: String?, itemId: String?, sourceId: String?, scheduleInstanceId: String?) -> Bool {
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
            itemKey: normalized(itemKey),
            itemType: normalized(itemType),
            sourceType: normalized(sourceType),
            itemId: normalized(itemId),
            sourceId: normalized(sourceId),
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
private struct FocusPomoLiveActionResponse: Decodable {
    struct NextState: Decodable {
        let shouldEnd: Bool
        let sessionId: String
        let title: String
        let itemKey: String?
        let itemType: String?
        let sourceType: String?
        let itemId: String?
        let sourceId: String?
        let scheduleInstanceId: String?
        let skillIcon: String?
        let mode: String
        let startedAt: String?
        let endsAt: String?
        let status: String
        let plannedDurationSeconds: Int
        let completeActionId: String?
        let completeActionToken: String?
        let skipActionId: String?
        let skipActionToken: String?
    }

    let ok: Bool
    let next: NextState
}

@available(iOS 17.0, *)
private enum FocusPomoLiveActivityStateUpdater {
    static func updateInProgress(sessionId: String, title: String, action: String) async {
        await updateCurrentActivity(sessionId: sessionId) { values in
            values["sessionId"] = sessionId
            values["title"] = title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "Focus Pomo" : title
            values["status"] = action == "complete" ? "completing" : "skipping"
            values["queuedAction"] = ""
        }
    }

    static func updateFailed(sessionId: String, title: String, action: String) async {
        await updateCurrentActivity(sessionId: sessionId) { values in
            values["sessionId"] = sessionId
            values["title"] = title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "Focus Pomo" : title
            values["status"] = "action_failed"
            values["queuedAction"] = action
        }
    }

    static func applySuccess(sessionId: String, next: FocusPomoLiveActionResponse.NextState) async {
        var didUpdateActivity = false

        for activity in Activity<GenericAttributes>.activities {
            var values = activity.attributes.staticValues.merging(activity.content.state.values) { _, stateValue in
                stateValue
            }
            guard values["sessionId"] == sessionId else {
                continue
            }

            if next.shouldEnd {
                values["sessionId"] = next.sessionId
                values["title"] = next.title
                values["status"] = next.status
                let content = GenericAttributes.ContentState(values: values)
                await activity.end(ActivityContent(state: content, staleDate: nil), dismissalPolicy: .immediate)
                didUpdateActivity = true
                NSLog("\(focusPomoLiveActivityActionLog) activity_ended sessionId=\(sessionId) status=\(next.status)")
                continue
            }

            values["sessionId"] = next.sessionId
            values["title"] = next.title
            values["status"] = next.status
            values["queuedAction"] = ""
            values["itemKey"] = next.itemKey ?? ""
            values["itemType"] = next.itemType ?? ""
            values["sourceType"] = next.sourceType ?? ""
            values["itemId"] = next.itemId ?? ""
            values["sourceId"] = next.sourceId ?? ""
            values["skillIcon"] = next.skillIcon ?? ""
            values["mode"] = next.mode
            values["startedAt"] = next.startedAt ?? ""
            values["endsAt"] = next.endsAt ?? ""
            values["targetEndAt"] = next.endsAt ?? ""
            values["plannedDurationSeconds"] = String(next.plannedDurationSeconds)
            values["scheduleInstanceId"] = next.scheduleInstanceId ?? ""
            values["completeActionId"] = next.completeActionId ?? ""
            values["completeActionToken"] = next.completeActionToken ?? ""
            values["skipActionId"] = next.skipActionId ?? ""
            values["skipActionToken"] = next.skipActionToken ?? ""

            let content = GenericAttributes.ContentState(values: values)
            await activity.update(ActivityContent(state: content, staleDate: nil))
            didUpdateActivity = true
            NSLog("\(focusPomoLiveActivityActionLog) activity_updated_to_next sessionId=\(sessionId) nextScheduleInstanceId=\(next.scheduleInstanceId ?? "") status=\(next.status)")
        }

        if !didUpdateActivity {
            NSLog("\(focusPomoLiveActivityActionLog) activity_update_skipped reason=activity_not_found sessionId=\(sessionId)")
        }
    }

    private static func updateCurrentActivity(sessionId: String, mutate: (inout [String: String]) -> Void) async {
        var didUpdateActivity = false

        for activity in Activity<GenericAttributes>.activities {
            var values = activity.attributes.staticValues.merging(activity.content.state.values) { _, stateValue in
                stateValue
            }
            guard values["sessionId"] == sessionId else {
                continue
            }

            mutate(&values)
            let content = GenericAttributes.ContentState(values: values)
            await activity.update(ActivityContent(state: content, staleDate: nil))
            didUpdateActivity = true
        }

        if !didUpdateActivity {
            NSLog("\(focusPomoLiveActivityActionLog) activity_update_skipped reason=activity_not_found sessionId=\(sessionId)")
        }
    }
}

@available(iOS 17.0, *)
private enum FocusPomoLiveActivityActionClient {
    static func perform(
        action: String,
        sessionId: String,
        title: String,
        itemKey: String,
        itemType: String,
        sourceType: String,
        itemId: String,
        sourceId: String,
        scheduleInstanceId: String,
        backendUrl: String,
        actionId: String,
        actionToken: String
    ) async -> Bool {
        let normalizedBackendUrl = backendUrl.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedActionId = actionId.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedActionToken = actionToken.trimmingCharacters(in: .whitespacesAndNewlines)

        guard
            let url = URL(string: normalizedBackendUrl),
            !normalizedActionId.isEmpty,
            !normalizedActionToken.isEmpty
        else {
            NSLog("\(focusPomoLiveActivityActionLog) request_skipped reason=missing_backend_or_token action=\(action) sessionId=\(sessionId)")
            return false
        }

        do {
            var request = URLRequest(url: url, timeoutInterval: 15)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: [
                "action": action,
                "sessionId": sessionId,
                "itemKey": itemKey,
                "itemType": itemType,
                "sourceType": sourceType,
                "itemId": itemId,
                "sourceId": sourceId,
                "scheduleInstanceId": scheduleInstanceId,
                "actionId": normalizedActionId,
                "token": normalizedActionToken,
            ])

            let (data, response) = try await URLSession.shared.data(for: request)
            guard let httpResponse = response as? HTTPURLResponse else {
                throw URLError(.badServerResponse)
            }
            guard (200..<300).contains(httpResponse.statusCode) else {
                let body = String(data: data, encoding: .utf8) ?? ""
                NSLog("\(focusPomoLiveActivityActionLog) request_failed action=\(action) sessionId=\(sessionId) status=\(httpResponse.statusCode) body=\(body)")
                return false
            }

            let decoded = try JSONDecoder().decode(FocusPomoLiveActionResponse.self, from: data)
            guard decoded.ok else {
                NSLog("\(focusPomoLiveActivityActionLog) request_failed action=\(action) sessionId=\(sessionId) reason=response_not_ok")
                return false
            }

            await FocusPomoLiveActivityStateUpdater.applySuccess(sessionId: sessionId, next: decoded.next)
            NSLog("\(focusPomoLiveActivityActionLog) request_succeeded action=\(action) sessionId=\(sessionId) shouldEnd=\(decoded.next.shouldEnd ? "true" : "false")")
            return true
        } catch {
            NSLog("\(focusPomoLiveActivityActionLog) request_failed action=\(action) sessionId=\(sessionId) error=\(error.localizedDescription)")
            return false
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

    @Parameter(title: "Item Key")
    var itemKey: String

    @Parameter(title: "Item Type")
    var itemType: String

    @Parameter(title: "Source Type")
    var sourceType: String

    @Parameter(title: "Item ID")
    var itemId: String

    @Parameter(title: "Source ID")
    var sourceId: String

    @Parameter(title: "Schedule Instance ID")
    var scheduleInstanceId: String

    @Parameter(title: "Backend URL")
    var backendUrl: String

    @Parameter(title: "Action ID")
    var actionId: String

    @Parameter(title: "Action Token")
    var actionToken: String

    init() {
        sessionId = ""
        titleText = ""
        itemKey = ""
        itemType = ""
        sourceType = ""
        itemId = ""
        sourceId = ""
        scheduleInstanceId = ""
        backendUrl = ""
        actionId = ""
        actionToken = ""
    }

    init(sessionId: String, title: String, itemKey: String, itemType: String, sourceType: String, itemId: String, sourceId: String, scheduleInstanceId: String, backendUrl: String, actionId: String, actionToken: String) {
        self.sessionId = sessionId
        self.titleText = title
        self.itemKey = itemKey
        self.itemType = itemType
        self.sourceType = sourceType
        self.itemId = itemId
        self.sourceId = sourceId
        self.scheduleInstanceId = scheduleInstanceId
        self.backendUrl = backendUrl
        self.actionId = actionId
        self.actionToken = actionToken
    }

    func perform() async throws -> some IntentResult {
        await FocusPomoLiveActivityStateUpdater.updateInProgress(sessionId: sessionId, title: titleText, action: "complete")

        let didSucceed = await FocusPomoLiveActivityActionClient.perform(
            action: "complete",
            sessionId: sessionId,
            title: titleText,
            itemKey: itemKey,
            itemType: itemType,
            sourceType: sourceType,
            itemId: itemId,
            sourceId: sourceId,
            scheduleInstanceId: scheduleInstanceId,
            backendUrl: backendUrl,
            actionId: actionId,
            actionToken: actionToken
        )
        if !didSucceed {
            await FocusPomoLiveActivityStateUpdater.updateFailed(sessionId: sessionId, title: titleText, action: "complete")
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

    @Parameter(title: "Item Key")
    var itemKey: String

    @Parameter(title: "Item Type")
    var itemType: String

    @Parameter(title: "Source Type")
    var sourceType: String

    @Parameter(title: "Item ID")
    var itemId: String

    @Parameter(title: "Source ID")
    var sourceId: String

    @Parameter(title: "Schedule Instance ID")
    var scheduleInstanceId: String

    @Parameter(title: "Backend URL")
    var backendUrl: String

    @Parameter(title: "Action ID")
    var actionId: String

    @Parameter(title: "Action Token")
    var actionToken: String

    init() {
        sessionId = ""
        titleText = ""
        itemKey = ""
        itemType = ""
        sourceType = ""
        itemId = ""
        sourceId = ""
        scheduleInstanceId = ""
        backendUrl = ""
        actionId = ""
        actionToken = ""
    }

    init(sessionId: String, title: String, itemKey: String, itemType: String, sourceType: String, itemId: String, sourceId: String, scheduleInstanceId: String, backendUrl: String, actionId: String, actionToken: String) {
        self.sessionId = sessionId
        self.titleText = title
        self.itemKey = itemKey
        self.itemType = itemType
        self.sourceType = sourceType
        self.itemId = itemId
        self.sourceId = sourceId
        self.scheduleInstanceId = scheduleInstanceId
        self.backendUrl = backendUrl
        self.actionId = actionId
        self.actionToken = actionToken
    }

    func perform() async throws -> some IntentResult {
        await FocusPomoLiveActivityStateUpdater.updateInProgress(sessionId: sessionId, title: titleText, action: "skip")

        let didSucceed = await FocusPomoLiveActivityActionClient.perform(
            action: "skip",
            sessionId: sessionId,
            title: titleText,
            itemKey: itemKey,
            itemType: itemType,
            sourceType: sourceType,
            itemId: itemId,
            sourceId: sourceId,
            scheduleInstanceId: scheduleInstanceId,
            backendUrl: backendUrl,
            actionId: actionId,
            actionToken: actionToken
        )
        if !didSucceed {
            await FocusPomoLiveActivityStateUpdater.updateFailed(sessionId: sessionId, title: titleText, action: "skip")
        }

        return .result()
    }
}
