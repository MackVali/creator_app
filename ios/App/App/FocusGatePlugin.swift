@preconcurrency import Capacitor
import DeviceActivity
import FamilyControls
import Foundation
import SwiftUI

@objc(FocusGatePlugin)
public class FocusGatePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "FocusGatePlugin"
    public let jsName = "FocusGate"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getAuthorizationStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestAuthorization", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "presentActivityPicker", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getSelectionSummary", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "syncAllowance", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getEnforcementState", returnType: CAPPluginReturnPromise)
    ]

    @MainActor private var activePickerCall: CAPPluginCall?
    @MainActor private var activePickerController: UIViewController?
    @MainActor private var activeAuthorizationCalls: [UUID: CAPPluginCall] = [:]

    @objc func isAvailable(_ call: CAPPluginCall) {
        call.resolve(["available": nativeAvailable()])
    }

    @objc func getAuthorizationStatus(_ call: CAPPluginCall) {
        call.resolve(["status": authorizationStatusString()])
    }

    @MainActor @objc func requestAuthorization(_ call: CAPPluginCall) {
        guard nativeAvailable() else {
            call.resolve(["status": "unavailable"])
            return
        }

        let requestID = UUID()
        activeAuthorizationCalls[requestID] = call

        if #available(iOS 16.0, *) {
            Task { [requestID] in
                do {
                    try await AuthorizationCenter.shared.requestAuthorization(for: .individual)
                } catch {
                    FocusGateSharedState.recordDebugEvent(
                        source: "authorization",
                        message: "request_failed",
                        details: ["error": String(describing: error)]
                    )
                }

                await MainActor.run {
                    self.resolveAuthorizationRequest(requestID)
                }
            }
        } else {
            resolveAuthorizationRequest(requestID)
        }
    }

    @objc func presentActivityPicker(_ call: CAPPluginCall) {
        Self.recordPickerDebugEvent(
            "presentActivityPicker_called",
            mainActorStatus: "entry_not_isolated"
        )
        performSelector(
            onMainThread: #selector(presentActivityPickerOnMainThread(_:)),
            with: call,
            waitUntilDone: Thread.isMainThread
        )
    }

    @MainActor @objc private func presentActivityPickerOnMainThread(_ call: CAPPluginCall) {
        guard nativeAvailable() else {
            rejectPickerCall(call, "Focus Gate requires iOS 17.4 or newer.", reason: "unavailable")
            return
        }

        guard authorizationStatusString() == "approved" else {
            rejectPickerCall(
                call,
                "Screen Time authorization is required before choosing protected apps.",
                reason: "authorization_required"
            )
            return
        }

        guard activePickerCall == nil else {
            rejectPickerCall(call, "Protected app picker is already open.", reason: "already_open")
            return
        }

        guard let presentingController = bridge?.viewController else {
            rejectPickerCall(call, "Unable to present protected app picker.", reason: "missing_presenter")
            return
        }

        activePickerCall = call
        let initialSelection = FocusGateSharedState.loadSelection()
        let pickerView = FocusGateActivityPickerView(
            selection: initialSelection,
            onCancel: { [weak self] in
                self?.cancelPicker()
            },
            onComplete: { [weak self] selection in
                self?.completePicker(selection: selection)
            }
        )

        let hostingController = UIHostingController(rootView: pickerView)
        hostingController.modalPresentationStyle = .formSheet
        activePickerController = hostingController
        Self.recordPickerDebugEvent(
            "before_presenting_hosting_controller",
            mainActorStatus: "main_actor_isolated"
        )
        presentingController.present(hostingController, animated: true) {
            Self.recordPickerDebugEvent("picker_presented", mainActorStatus: "main_actor_isolated")
        }
    }

    @objc func getSelectionSummary(_ call: CAPPluginCall) {
        guard nativeAvailable() else {
            call.resolve([
                "selectionStatus": "unavailable",
                "hasSelection": false,
                "applicationCount": NSNull(),
                "categoryCount": NSNull(),
                "webDomainCount": NSNull(),
                "totalTokenCount": NSNull()
            ])
            return
        }

        call.resolve(FocusGateSharedState.selectionSummary().dictionary())
    }

    @objc func syncAllowance(_ call: CAPPluginCall) {
        FocusGateSharedState.recordDebugEvent(
            source: "sync",
            message: "syncAllowance_entry"
        )

        guard nativeAvailable() else {
            let result = enforcementStateDictionary(nativeAvailable: false)
            FocusGateSharedState.recordDebugEvent(
                source: "sync",
                message: "syncAllowance_resulting_enforcement_state",
                details: Self.enforcementDebugDetails(result)
            )
            call.resolve(result)
            return
        }

        guard
            let enabled = call.getBool("enabled"),
            let xpTodayValue = call.getDouble("xpToday"),
            let allowedMinutesValue = call.getDouble("allowedMinutes"),
            let creatorDayStartsAt = call.getString("creatorDayStartsAt"),
            let creatorDayEndsAt = call.getString("creatorDayEndsAt"),
            let timezone = call.getString("timezone")
        else {
            FocusGateSharedState.recordDebugEvent(
                source: "sync",
                message: "syncAllowance_rejected",
                details: ["reason": "missing_input"]
            )
            call.reject("Missing Focus Gate allowance sync input.")
            return
        }

        let xpToday = max(0, Int(xpTodayValue.rounded(.down)))
        let allowedMinutes = max(0, Int(allowedMinutesValue.rounded(.down)))
        let creatorDayIdentifier = FocusGateSharedState.creatorDayIdentifier(
            startsAt: creatorDayStartsAt,
            timezone: timezone
        )
        let previous = FocusGateSharedState.loadState()
        let dayChanged = previous.creatorDayIdentifier != creatorDayIdentifier
        let previousThreshold = dayChanged ? 0 : previous.lastReachedThresholdMinutes
        var nextState = FocusGateSharedStatePayload(
            enabled: enabled,
            creatorDayIdentifier: creatorDayIdentifier,
            creatorDayStartsAt: creatorDayStartsAt,
            creatorDayEndsAt: creatorDayEndsAt,
            timezone: timezone,
            xpToday: xpToday,
            allowedMinutes: allowedMinutes,
            lastReachedThresholdMinutes: previousThreshold,
            shielded: previous.shielded,
            lastSyncedAt: FocusGateSharedState.isoString(from: Date())
        )

        let selection = FocusGateSharedState.loadSelection()
        let selectionSummary = FocusGateSharedState.selectionSummary(selection)
        let authorizationStatus = authorizationStatusString()
        let baseDebugDetails = [
            "enabled": enabled ? "true" : "false",
            "authorizationStatus": authorizationStatus,
            "applicationCount": "\(selectionSummary.applicationCount)",
            "categoryCount": "\(selectionSummary.categoryCount)",
            "webDomainCount": "\(selectionSummary.webDomainCount)",
            "previousAllowedMinutes": "\(previous.allowedMinutes)",
            "incomingAllowedMinutes": "\(allowedMinutes)",
            "lastReachedThresholdMinutes": "\(previousThreshold)",
            "previousShielded": previous.shielded ? "true" : "false",
            "dayChanged": dayChanged ? "true" : "false"
        ]
        FocusGateSharedState.recordDebugEvent(
            source: "sync",
            message: "syncAllowance_state_loaded",
            details: baseDebugDetails
        )

        if !enabled {
            FocusGateSharedState.recordDebugEvent(
                source: "sync",
                message: "branch_clear_shield",
                details: baseDebugDetails.merging(["reason": "disabled"]) { _, new in new }
            )
            FocusGateShielding.clearShield()
            FocusGateDeviceActivity.stopMonitoring()
            nextState.shielded = false
            FocusGateSharedState.saveState(nextState)
            let result = enforcementStateDictionary(state: nextState)
            FocusGateSharedState.recordDebugEvent(
                source: "sync",
                message: "syncAllowance_resulting_enforcement_state",
                details: Self.enforcementDebugDetails(result)
            )
            call.resolve(result)
            return
        }

        guard authorizationStatus == "approved" else {
            FocusGateSharedState.recordDebugEvent(
                source: "sync",
                message: "branch_clear_shield",
                details: baseDebugDetails.merging(["reason": "authorization_not_approved"]) { _, new in new }
            )
            FocusGateShielding.clearShield()
            FocusGateDeviceActivity.stopMonitoring()
            nextState.shielded = false
            FocusGateSharedState.saveState(nextState)
            let result = enforcementStateDictionary(state: nextState)
            FocusGateSharedState.recordDebugEvent(
                source: "sync",
                message: "syncAllowance_resulting_enforcement_state",
                details: Self.enforcementDebugDetails(result)
            )
            call.resolve(result)
            return
        }

        guard selectionSummary.hasSelection else {
            FocusGateSharedState.recordDebugEvent(
                source: "sync",
                message: "branch_clear_shield",
                details: baseDebugDetails.merging(["reason": "selection_missing"]) { _, new in new }
            )
            FocusGateShielding.clearShield()
            FocusGateDeviceActivity.stopMonitoring()
            nextState.shielded = false
            FocusGateSharedState.saveState(nextState)
            let result = enforcementStateDictionary(state: nextState)
            FocusGateSharedState.recordDebugEvent(
                source: "sync",
                message: "syncAllowance_resulting_enforcement_state",
                details: Self.enforcementDebugDetails(result)
            )
            call.resolve(result)
            return
        }

        let shouldShield = allowedMinutes <= 0 || previousThreshold >= allowedMinutes
        let shouldRegisterUsageEvent = allowedMinutes > 0 && previousThreshold < allowedMinutes

        if shouldShield {
            FocusGateSharedState.recordDebugEvent(
                source: "sync",
                message: "branch_apply_shield",
                details: baseDebugDetails.merging([
                    "reason": allowedMinutes <= 0 ? "no_allowance" : "threshold_already_reached"
                ]) { _, new in new }
            )
            FocusGateShielding.applyShield(selection: selection)
            nextState.shielded = true
        } else {
            FocusGateSharedState.recordDebugEvent(
                source: "sync",
                message: "branch_clear_shield",
                details: baseDebugDetails.merging(["reason": "new_allowance_available"]) { _, new in new }
            )
            FocusGateShielding.clearShield()
            nextState.shielded = false
        }

        FocusGateSharedState.saveState(nextState)
        do {
            try FocusGateDeviceActivity.configureMonitoring(
                state: nextState,
                selection: selection,
                registerUsageEvent: shouldRegisterUsageEvent
            )
        } catch {
            FocusGateSharedState.recordDebugEvent(
                source: "sync",
                message: "monitoring_failed",
                details: ["error": String(describing: error)]
            )
            call.reject("Unable to configure Focus Gate monitoring: \(error)")
            return
        }

        FocusGateSharedState.recordDebugEvent(
            source: "sync",
            message: "allowance_synced",
            details: [
                "enabled": enabled ? "true" : "false",
                "dayChanged": dayChanged ? "true" : "false",
                "xpToday": "\(xpToday)",
                "allowedMinutes": "\(allowedMinutes)",
                "lastReachedThresholdMinutes": "\(nextState.lastReachedThresholdMinutes)",
                "shielded": nextState.shielded ? "true" : "false",
                "usageEventRegistered": shouldRegisterUsageEvent ? "true" : "false"
            ]
        )
        let result = enforcementStateDictionary(state: nextState)
        FocusGateSharedState.recordDebugEvent(
            source: "sync",
            message: "syncAllowance_resulting_enforcement_state",
            details: Self.enforcementDebugDetails(result)
        )
        call.resolve(result)
    }

    @objc func getEnforcementState(_ call: CAPPluginCall) {
        call.resolve(enforcementStateDictionary(nativeAvailable: nativeAvailable()))
    }

    private func nativeAvailable() -> Bool {
        if #available(iOS 17.4, *) {
            return true
        }

        return false
    }

    private func authorizationStatusString() -> String {
        guard nativeAvailable() else {
            return "unavailable"
        }

        let status = AuthorizationCenter.shared.authorizationStatus
        if #available(iOS 26.4, *), status == .approvedWithDataAccess {
            return "approved"
        }

        switch status {
        case .notDetermined:
            return "notDetermined"
        case .denied:
            return "denied"
        case .approved:
            return "approved"
        default:
            return "restricted"
        }
    }

    private func reconcileCachedStateAfterSelectionChange(selection: FamilyActivitySelection) -> FocusGateSharedStatePayload {
        var state = FocusGateSharedState.advanceExpiredCreatorDayIfNeeded(FocusGateSharedState.loadState())
        guard state.enabled, authorizationStatusString() == "approved" else {
            FocusGateShielding.clearShield()
            state.shielded = false
            FocusGateSharedState.saveState(state)
            return state
        }

        let summary = FocusGateSharedState.selectionSummary(selection)
        guard summary.hasSelection else {
            FocusGateShielding.clearShield()
            FocusGateDeviceActivity.stopMonitoring()
            state.shielded = false
            FocusGateSharedState.saveState(state)
            return state
        }

        let shouldShield = state.allowedMinutes <= 0 || state.lastReachedThresholdMinutes >= state.allowedMinutes
        let shouldRegisterUsageEvent = state.allowedMinutes > 0 && state.lastReachedThresholdMinutes < state.allowedMinutes
        if shouldShield {
            FocusGateShielding.applyShield(selection: selection)
            state.shielded = true
        } else {
            FocusGateShielding.clearShield()
            state.shielded = false
        }
        FocusGateSharedState.saveState(state)
        try? FocusGateDeviceActivity.configureMonitoring(
            state: state,
            selection: selection,
            registerUsageEvent: shouldRegisterUsageEvent
        )
        return state
    }

    @MainActor private func resolveAuthorizationRequest(_ requestID: UUID) {
        guard let call = activeAuthorizationCalls.removeValue(forKey: requestID) else {
            return
        }

        call.resolve(["status": authorizationStatusString()])
    }

    @MainActor private func cancelPicker() {
        dismissPicker(resolveWith: FocusGateSharedState.selectionSummary().dictionary())
    }

    @MainActor private func completePicker(selection: FamilyActivitySelection) {
        let didSave = FocusGateSharedState.saveSelection(selection)
        let selectionCounts = [
            "applicationCount": "\(selection.applicationTokens.count)",
            "categoryCount": "\(selection.categoryTokens.count)",
            "webDomainCount": "\(selection.webDomainTokens.count)"
        ]
        var debugSelectionCounts = selectionCounts
        debugSelectionCounts["saved"] = didSave ? "true" : "false"
        Self.recordPickerDebugEvent(
            "selection_saved",
            mainActorStatus: "main_actor_isolated",
            details: debugSelectionCounts
        )
        FocusGateSharedState.recordDebugEvent(
            source: "selection",
            message: "saved",
            details: selectionCounts
        )
        _ = reconcileCachedStateAfterSelectionChange(selection: selection)
        dismissPicker(resolveWith: FocusGateSharedState.selectionSummary(selection).dictionary())
    }

    @MainActor private func rejectPickerCall(_ call: CAPPluginCall, _ message: String, reason: String) {
        Self.recordPickerDebugEvent(
            "capacitor_call_rejected",
            mainActorStatus: "main_actor_isolated",
            details: ["reason": reason]
        )
        call.reject(message)
    }

    @MainActor private func dismissPicker(resolveWith payload: [String: Any]) {
        let call = activePickerCall
        activePickerCall = nil
        let controller = activePickerController
        activePickerController = nil

        let finish = {
            Self.recordPickerDebugEvent("picker_dismissed", mainActorStatus: "main_actor_isolated")
            call?.resolve(payload)
            Self.recordPickerDebugEvent(
                "capacitor_call_resolved",
                mainActorStatus: "main_actor_isolated"
            )
        }

        guard let controller else {
            finish()
            return
        }

        controller.dismiss(animated: true, completion: finish)
    }

    private func enforcementStateDictionary(
        state: FocusGateSharedStatePayload? = nil,
        nativeAvailable: Bool = true
    ) -> [String: Any] {
        let currentState = state ?? FocusGateSharedState.advanceExpiredCreatorDayIfNeeded(FocusGateSharedState.loadState())
        if currentState.creatorDayIdentifier != FocusGateSharedState.loadState().creatorDayIdentifier {
            FocusGateSharedState.saveState(currentState)
        }

        let summary = nativeAvailable
            ? FocusGateSharedState.selectionSummary()
            : FocusGateSelectionSummary(hasSelection: false, applicationCount: 0, categoryCount: 0, webDomainCount: 0)

        let setupStatus: String
        let authorizationStatus = nativeAvailable ? authorizationStatusString() : "unavailable"
        if !nativeAvailable {
            setupStatus = "unavailable"
        } else if !currentState.enabled {
            setupStatus = "disabled"
        } else if authorizationStatus != "approved" {
            setupStatus = "authorizationRequired"
        } else if !summary.hasSelection {
            setupStatus = "selectionRequired"
        } else if currentState.shielded {
            setupStatus = "locked"
        } else {
            setupStatus = "accessAvailable"
        }

        return [
            "nativeAvailable": nativeAvailable,
            "authorizationStatus": authorizationStatus,
            "selectionStatus": nativeAvailable ? summary.selectionStatus : "unavailable",
            "shielded": nativeAvailable ? currentState.shielded : NSNull(),
            "setupStatus": setupStatus,
            "enabled": currentState.enabled,
            "xpToday": currentState.xpToday,
            "allowedMinutes": currentState.allowedMinutes,
            "lastReachedThresholdMinutes": currentState.lastReachedThresholdMinutes,
            "creatorDayStartsAt": currentState.creatorDayStartsAt,
            "creatorDayEndsAt": currentState.creatorDayEndsAt,
            "timezone": currentState.timezone,
            "lastSyncedAt": currentState.lastSyncedAt,
            "applicationCount": nativeAvailable ? summary.applicationCount : NSNull(),
            "categoryCount": nativeAvailable ? summary.categoryCount : NSNull(),
            "webDomainCount": nativeAvailable ? summary.webDomainCount : NSNull(),
            "totalTokenCount": nativeAvailable ? summary.totalTokenCount : NSNull()
        ]
    }

    private static func enforcementDebugDetails(_ state: [String: Any]) -> [String: String] {
        let keys = [
            "nativeAvailable",
            "authorizationStatus",
            "selectionStatus",
            "shielded",
            "setupStatus",
            "enabled",
            "xpToday",
            "allowedMinutes",
            "lastReachedThresholdMinutes",
            "applicationCount",
            "categoryCount",
            "webDomainCount",
            "totalTokenCount"
        ]

        var details: [String: String] = [:]
        for key in keys {
            guard let value = state[key] else {
                continue
            }
            if value is NSNull {
                details[key] = "null"
            } else {
                details[key] = String(describing: value)
            }
        }
        return details
    }

    private static func recordPickerDebugEvent(
        _ message: String,
        mainActorStatus: String,
        details: [String: String] = [:]
    ) {
        #if DEBUG
        var debugDetails = details
        debugDetails["isMainThread"] = Thread.isMainThread ? "true" : "false"
        debugDetails["mainActorStatus"] = mainActorStatus
        FocusGateSharedState.recordDebugEvent(
            source: "picker",
            message: message,
            details: debugDetails
        )
        NSLog(
            "[CREATOR_FOCUS_GATE_PICKER] \(message) isMainThread=\(debugDetails["isMainThread"] ?? "false") mainActorStatus=\(mainActorStatus) details=\(details)"
        )
        #endif
    }
}

@MainActor
private struct FocusGateActivityPickerView: View {
    @State private var selection: FamilyActivitySelection
    let onCancel: @MainActor () -> Void
    let onComplete: @MainActor (FamilyActivitySelection) -> Void

    init(
        selection: FamilyActivitySelection,
        onCancel: @escaping @MainActor () -> Void,
        onComplete: @escaping @MainActor (FamilyActivitySelection) -> Void
    ) {
        _selection = State(initialValue: selection)
        self.onCancel = onCancel
        self.onComplete = onComplete
    }

    var body: some View {
        NavigationView {
            FamilyActivityPicker(selection: $selection)
                .navigationTitle("Protected Apps")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cancel", action: onCancel)
                    }
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Done") {
                            onComplete(selection)
                        }
                    }
                }
        }
    }
}
