import Capacitor
import Foundation
import WidgetKit

@objc(CreatorWidgetPlugin)
public class CreatorWidgetPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "CreatorWidgetPlugin"
    public let jsName = "CreatorWidget"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "writeSchedulePayload", returnType: CAPPluginReturnPromise)
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
            call.reject("Unable to open shared widget storage.")
            return
        }

        sharedDefaults.set(payload, forKey: schedulePayloadKey)
        sharedDefaults.synchronize()
        WidgetCenter.shared.reloadTimelines(ofKind: scheduleWidgetKind)

        call.resolve([
            "ok": true
        ])
    }
}
