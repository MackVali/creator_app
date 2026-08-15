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

    private var activePickerCall: CAPPluginCall?
    private var activePickerController: UIViewController?
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

    @MainActor @objc func presentActivityPicker(_ call: CAPPluginCall) {
        guard nativeAvailable() else {
            call.reject("Focus Gate requires iOS 17.4 or newer.")
            return
        }

        guard authorizationStatusString() == "approved" else {
            call.reject("Screen Time authorization is required before choosing protected apps.")
            return
        }

        guard activePickerCall == nil else {
            call.reject("Protected app picker is already open.")
            return
        }

        guard let presentingController = bridge?.viewController else {
            call.reject("Unable to present protected app picker.")
            return
        }

        activePickerCall = call
        let initialSelection = FocusGateSharedState.loadSelection()
        let pickerView = FocusGateActivityPickerView(
            selection: initialSelection,
            onCancel: { [weak self] in
                self?.dismissPicker(resolveWith: FocusGateSharedState.selectionSummary().dictionary())
            },
            onComplete: { [weak self] selection in
                guard let self else { return }
                FocusGateSharedState.saveSelection(selection)
                FocusGateSharedState.recordDebugEvent(
                    source: "selection",
                    message: "saved",
                    details: [
                        "applicationCount": "\(selection.applicationTokens.count)",
                        "categoryCount": "\(selection.categoryTokens.count)",
                        "webDomainCount": "\(selection.webDomainTokens.count)"
                    ]
                )
                _ = self.reconcileCachedStateAfterSelectionChange(selection: selection)
                self.dismissPicker(resolveWith: FocusGateSharedState.selectionSummary(selection).dictionary())
            }
        )

        let hostingController = UIHostingController(rootView: pickerView)
        hostingController.modalPresentationStyle = .formSheet
        activePickerController = hostingController
        presentingController.present(hostingController, animated: true)
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
        guard nativeAvailable() else {
            call.resolve(enforcementStateDictionary(nativeAvailable: false))
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

        if !enabled {
            FocusGateShielding.clearShield()
            FocusGateDeviceActivity.stopMonitoring()
            nextState.shielded = false
            FocusGateSharedState.saveState(nextState)
            call.resolve(enforcementStateDictionary(state: nextState))
            return
        }

        guard authorizationStatus == "approved" else {
            FocusGateDeviceActivity.stopMonitoring()
            nextState.shielded = false
            FocusGateSharedState.saveState(nextState)
            call.resolve(enforcementStateDictionary(state: nextState))
            return
        }

        guard selectionSummary.hasSelection else {
            FocusGateShielding.clearShield()
            FocusGateDeviceActivity.stopMonitoring()
            nextState.shielded = false
            FocusGateSharedState.saveState(nextState)
            call.resolve(enforcementStateDictionary(state: nextState))
            return
        }

        let shouldShield = allowedMinutes <= 0 || previousThreshold >= allowedMinutes
        let shouldRegisterUsageEvent = allowedMinutes > 0 && previousThreshold < allowedMinutes

        if shouldShield {
            FocusGateShielding.applyShield(selection: selection)
            nextState.shielded = true
        } else {
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
        call.resolve(enforcementStateDictionary(state: nextState))
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

    private func dismissPicker(resolveWith payload: [String: Any]) {
        let call = activePickerCall
        activePickerCall = nil

        let finish = { [weak self] in
            self?.activePickerController = nil
            call?.resolve(payload)
        }

        guard let controller = activePickerController else {
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
}

private struct FocusGateActivityPickerView: View {
    @State private var selection: FamilyActivitySelection
    let onCancel: () -> Void
    let onComplete: (FamilyActivitySelection) -> Void

    init(
        selection: FamilyActivitySelection,
        onCancel: @escaping () -> Void,
        onComplete: @escaping (FamilyActivitySelection) -> Void
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
