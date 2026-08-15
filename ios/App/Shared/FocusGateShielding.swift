import FamilyControls
import Foundation
import ManagedSettings

enum FocusGateShielding {
    private static let storeName = "creator.focus-gate"

    private static func store() -> ManagedSettingsStore {
        if #available(iOS 16.0, *) {
            return ManagedSettingsStore(named: ManagedSettingsStore.Name(storeName))
        }

        return ManagedSettingsStore()
    }

    static func applyShield(selection: FamilyActivitySelection) {
        let summary = FocusGateSharedState.selectionSummary(selection)
        guard summary.hasSelection else {
            clearShield()
            return
        }

        let store = store()
        store.shield.applications = selection.applicationTokens.isEmpty ? nil : selection.applicationTokens
        store.shield.applicationCategories = selection.categoryTokens.isEmpty ? nil : .specific(selection.categoryTokens)
        store.shield.webDomains = selection.webDomainTokens.isEmpty ? nil : selection.webDomainTokens
        store.shield.webDomainCategories = selection.categoryTokens.isEmpty ? nil : .specific(selection.categoryTokens)

        FocusGateSharedState.recordDebugEvent(
            source: "shield",
            message: "applied",
            details: [
                "applicationCount": "\(summary.applicationCount)",
                "categoryCount": "\(summary.categoryCount)",
                "webDomainCount": "\(summary.webDomainCount)"
            ]
        )
    }

    static func clearShield() {
        let store = store()
        store.shield.applications = nil
        store.shield.applicationCategories = nil
        store.shield.webDomains = nil
        store.shield.webDomainCategories = nil

        FocusGateSharedState.recordDebugEvent(source: "shield", message: "cleared")
    }
}
