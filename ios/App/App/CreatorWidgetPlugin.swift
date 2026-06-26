import Capacitor
import Foundation
import WidgetKit

@objc(CreatorWidgetPlugin)
public class CreatorWidgetPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "CreatorWidgetPlugin"
    public let jsName = "CreatorWidget"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "writeSchedulePayload", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readSchedulePayload", returnType: CAPPluginReturnPromise)
    ]

    private let appGroupIdentifier = "group.app.trycreator.creator"
    private let schedulePayloadKey = "creator.schedule.widget.payload"
    private let scheduleWidgetKind = "CreatorScheduleWidget"

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
        NSLog(
            "[CREATOR_WIDGET_SYNC] native_write_succeeded group=\(appGroupIdentifier) key=\(schedulePayloadKey) bytes=\(payload.utf8.count) synchronized=\(didSynchronize ? "true" : "false") reloadedKind=\(scheduleWidgetKind)"
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
}
