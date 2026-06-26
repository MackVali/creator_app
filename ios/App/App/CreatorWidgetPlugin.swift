import Capacitor
import Foundation
import WidgetKit

@objc(CreatorWidgetPlugin)
public class CreatorWidgetPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "CreatorWidgetPlugin"
    public let jsName = "CreatorWidget"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "writeSchedulePayload", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readSchedulePayload", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "writeFocusPomoPayload", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readFocusPomoPayload", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readFocusPomoLiveActivityActions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "ackFocusPomoLiveActivityActions", returnType: CAPPluginReturnPromise)
    ]

    private let appGroupIdentifier = "group.app.trycreator.creator"
    private let schedulePayloadKey = "creator.schedule.widget.payload"
    private let scheduleWidgetKind = "CreatorScheduleWidget"
    private let focusPomoPayloadKey = "creator.focuspomo.widget.payload"
    private let focusPomoWidgetKind = "CreatorFocusPomoWidget"
    private let focusPomoPendingActionsKey = "creator.focuspomo.liveActivity.pendingActions"

    @objc func writeSchedulePayload(_ call: CAPPluginCall) {
        guard let payload = call.getString("payload"), !payload.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            call.reject("Missing schedule widget payload.")
            return
        }

        guard let sharedDefaults = UserDefaults(suiteName: appGroupIdentifier) else {
            NSLog("[CREATOR_WIDGET_SYNC] native_app_group_open_failed group=%@", appGroupIdentifier)
            call.reject("Unable to open shared widget storage.")
            return
        }

        sharedDefaults.set(payload, forKey: schedulePayloadKey)
        let didSynchronize = sharedDefaults.synchronize()
        WidgetCenter.shared.reloadTimelines(ofKind: scheduleWidgetKind)
        let payloadCounts = readSchedulePayloadCounts(payload)
        NSLog(
            "[CREATOR_WIDGET_SYNC] native_write_succeeded group=\(appGroupIdentifier) key=\(schedulePayloadKey) bytes=\(payload.utf8.count) timeBlocks=\(payloadCounts.timeBlockCount) events=\(payloadCounts.eventCount) synchronized=\(didSynchronize ? "true" : "false") reloadedKind=\(scheduleWidgetKind)"
        )

        call.resolve([
            "ok": true,
            "byteCount": payload.utf8.count,
            "synchronized": didSynchronize
        ])
    }

    @objc func readSchedulePayload(_ call: CAPPluginCall) {
        guard let sharedDefaults = UserDefaults(suiteName: appGroupIdentifier) else {
            NSLog("[CREATOR_WIDGET_SYNC] native_readback_app_group_open_failed group=%@", appGroupIdentifier)
            call.reject("Unable to open shared widget storage.")
            return
        }

        let payload = sharedDefaults.string(forKey: schedulePayloadKey)
        NSLog(
            "[CREATOR_WIDGET_SYNC] native_readback group=\(appGroupIdentifier) key=\(schedulePayloadKey) exists=\(payload == nil ? "false" : "true") bytes=\(payload?.utf8.count ?? 0)"
        )

        call.resolve([
            "ok": true,
            "exists": payload != nil,
            "byteCount": payload?.utf8.count ?? 0,
            "payload": payload ?? ""
        ])
    }

    @objc func writeFocusPomoPayload(_ call: CAPPluginCall) {
        guard let payload = call.getString("payload"), !payload.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            call.reject("Missing Focus Pomo widget payload.")
            return
        }

        guard let sharedDefaults = UserDefaults(suiteName: appGroupIdentifier) else {
            NSLog("[CREATOR_FOCUS_WIDGET] native_app_group_open_failed group=%@", appGroupIdentifier)
            call.reject("Unable to open shared widget storage.")
            return
        }

        sharedDefaults.set(payload, forKey: focusPomoPayloadKey)
        let didSynchronize = sharedDefaults.synchronize()
        WidgetCenter.shared.reloadTimelines(ofKind: focusPomoWidgetKind)
        NSLog(
            "[CREATOR_FOCUS_WIDGET] native_write_succeeded group=\(appGroupIdentifier) key=\(focusPomoPayloadKey) bytes=\(payload.utf8.count) synchronized=\(didSynchronize ? "true" : "false") reloadedKind=\(focusPomoWidgetKind)"
        )

        call.resolve([
            "ok": true,
            "byteCount": payload.utf8.count,
            "synchronized": didSynchronize
        ])
    }

    @objc func readFocusPomoPayload(_ call: CAPPluginCall) {
        guard let sharedDefaults = UserDefaults(suiteName: appGroupIdentifier) else {
            NSLog("[CREATOR_FOCUS_WIDGET] native_readback_app_group_open_failed group=%@", appGroupIdentifier)
            call.reject("Unable to open shared widget storage.")
            return
        }

        let payload = sharedDefaults.string(forKey: focusPomoPayloadKey)
        NSLog(
            "[CREATOR_FOCUS_WIDGET] native_readback group=\(appGroupIdentifier) key=\(focusPomoPayloadKey) exists=\(payload == nil ? "false" : "true") bytes=\(payload?.utf8.count ?? 0)"
        )

        call.resolve([
            "ok": true,
            "exists": payload != nil,
            "byteCount": payload?.utf8.count ?? 0,
            "payload": payload ?? ""
        ])
    }

    @objc func readFocusPomoLiveActivityActions(_ call: CAPPluginCall) {
        guard let sharedDefaults = UserDefaults(suiteName: appGroupIdentifier) else {
            call.reject("Unable to open shared Focus Pomo action storage.")
            return
        }

        let payload = sharedDefaults.string(forKey: focusPomoPendingActionsKey) ?? "[]"
        let actions = parseFocusPomoActions(payload)
        call.resolve([
            "ok": true,
            "payload": payload,
            "actions": actions
        ])
    }

    @objc func ackFocusPomoLiveActivityActions(_ call: CAPPluginCall) {
        guard let sharedDefaults = UserDefaults(suiteName: appGroupIdentifier) else {
            call.reject("Unable to open shared Focus Pomo action storage.")
            return
        }

        let acknowledgedIds = Set(call.getArray("ids", String.self) ?? [])
        guard !acknowledgedIds.isEmpty else {
            call.resolve(["ok": true, "remaining": parseFocusPomoActions(sharedDefaults.string(forKey: focusPomoPendingActionsKey) ?? "[]").count])
            return
        }

        let currentPayload = sharedDefaults.string(forKey: focusPomoPendingActionsKey) ?? "[]"
        let remainingActions = parseFocusPomoActions(currentPayload).filter { action in
            guard let id = action["id"] as? String else {
                return false
            }
            return !acknowledgedIds.contains(id)
        }

        if
            let data = try? JSONSerialization.data(withJSONObject: remainingActions),
            let payload = String(data: data, encoding: .utf8)
        {
            sharedDefaults.set(payload, forKey: focusPomoPendingActionsKey)
        }
        let didSynchronize = sharedDefaults.synchronize()
        call.resolve([
            "ok": true,
            "remaining": remainingActions.count,
            "synchronized": didSynchronize
        ])
    }

    private func readSchedulePayloadCounts(_ payload: String) -> (timeBlockCount: Int, eventCount: Int) {
        guard
            let data = payload.data(using: .utf8),
            let object = try? JSONSerialization.jsonObject(with: data),
            let dictionary = object as? [String: Any]
        else {
            return (0, 0)
        }

        let timeBlockCount = (dictionary["timeBlocks"] as? [Any])?.count ?? 0
        let eventCount = (dictionary["events"] as? [Any])?.count ?? 0
        return (timeBlockCount, eventCount)
    }

    private func parseFocusPomoActions(_ payload: String) -> [[String: Any]] {
        guard
            let data = payload.data(using: .utf8),
            let actions = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]]
        else {
            return []
        }

        return actions
    }
}
