import Foundation
import FamilyControls

struct FocusGateSelectionSummary {
    let hasSelection: Bool
    let applicationCount: Int
    let categoryCount: Int
    let webDomainCount: Int

    var totalTokenCount: Int {
        applicationCount + categoryCount + webDomainCount
    }

    var selectionStatus: String {
        hasSelection ? "configured" : "notConfigured"
    }

    func dictionary() -> [String: Any] {
        [
            "selectionStatus": selectionStatus,
            "hasSelection": hasSelection,
            "applicationCount": applicationCount,
            "categoryCount": categoryCount,
            "webDomainCount": webDomainCount,
            "totalTokenCount": totalTokenCount
        ]
    }
}

struct FocusGateSharedStatePayload: Codable {
    var enabled: Bool
    var creatorDayIdentifier: String
    var creatorDayStartsAt: String
    var creatorDayEndsAt: String
    var timezone: String
    var xpToday: Int
    var allowedMinutes: Int
    var lastReachedThresholdMinutes: Int
    var shielded: Bool
    var lastSyncedAt: String

    static func disabled() -> FocusGateSharedStatePayload {
        FocusGateSharedStatePayload(
            enabled: false,
            creatorDayIdentifier: "",
            creatorDayStartsAt: "",
            creatorDayEndsAt: "",
            timezone: "UTC",
            xpToday: 0,
            allowedMinutes: 0,
            lastReachedThresholdMinutes: 0,
            shielded: false,
            lastSyncedAt: FocusGateSharedState.isoString(from: Date())
        )
    }
}

struct FocusGateDebugEvent: Codable {
    let at: String
    let source: String
    let message: String
    let details: [String: String]
}

enum FocusGateSharedState {
    static let appGroupIdentifier = "group.app.trycreator.creator"
    static let stateKey = "creator.focusGate.state.v1"
    static let selectionKey = "creator.focusGate.familyActivitySelection.v1"
    static let debugEventsKey = "creator.focusGate.debugEvents.v1"
    static let debugEventLimit = 30

    static func userDefaults() -> UserDefaults? {
        UserDefaults(suiteName: appGroupIdentifier)
    }

    static func loadState() -> FocusGateSharedStatePayload {
        guard
            let defaults = userDefaults(),
            let data = defaults.data(forKey: stateKey),
            let state = try? JSONDecoder().decode(FocusGateSharedStatePayload.self, from: data)
        else {
            return .disabled()
        }

        return state
    }

    @discardableResult
    static func saveState(_ state: FocusGateSharedStatePayload) -> Bool {
        guard
            let defaults = userDefaults(),
            let data = try? JSONEncoder().encode(state)
        else {
            return false
        }

        defaults.set(data, forKey: stateKey)
        return defaults.synchronize()
    }

    static func loadSelection() -> FamilyActivitySelection {
        guard
            let defaults = userDefaults(),
            let data = defaults.data(forKey: selectionKey),
            let selection = try? JSONDecoder().decode(FamilyActivitySelection.self, from: data)
        else {
            return FamilyActivitySelection()
        }

        return selection
    }

    @discardableResult
    static func saveSelection(_ selection: FamilyActivitySelection) -> Bool {
        guard
            let defaults = userDefaults(),
            let data = try? JSONEncoder().encode(selection)
        else {
            return false
        }

        defaults.set(data, forKey: selectionKey)
        return defaults.synchronize()
    }

    static func selectionSummary(_ selection: FamilyActivitySelection? = nil) -> FocusGateSelectionSummary {
        let value = selection ?? loadSelection()
        let applicationCount = value.applicationTokens.count
        let categoryCount = value.categoryTokens.count
        let webDomainCount = value.webDomainTokens.count

        return FocusGateSelectionSummary(
            hasSelection: applicationCount + categoryCount + webDomainCount > 0,
            applicationCount: applicationCount,
            categoryCount: categoryCount,
            webDomainCount: webDomainCount
        )
    }

    static func recordDebugEvent(
        source: String,
        message: String,
        details: [String: String] = [:]
    ) {
        guard let defaults = userDefaults() else {
            return
        }

        let current: [FocusGateDebugEvent]
        if
            let data = defaults.data(forKey: debugEventsKey),
            let decoded = try? JSONDecoder().decode([FocusGateDebugEvent].self, from: data)
        {
            current = decoded
        } else {
            current = []
        }

        let event = FocusGateDebugEvent(
            at: isoString(from: Date()),
            source: source,
            message: message,
            details: details
        )
        #if DEBUG
        NSLog("[CREATOR_FOCUS_GATE] \(source).\(message) details=\(details)")
        #endif
        let next = Array((current + [event]).suffix(debugEventLimit))
        guard let data = try? JSONEncoder().encode(next) else {
            return
        }
        defaults.set(data, forKey: debugEventsKey)
        defaults.synchronize()
    }

    static func isoString(from date: Date) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.string(from: date)
    }

    static func date(from value: String) -> Date? {
        let fractionalFormatter = ISO8601DateFormatter()
        fractionalFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = fractionalFormatter.date(from: value) {
            return date
        }

        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.date(from: value)
    }

    static func creatorDayIdentifier(startsAt: String, timezone: String) -> String {
        "\(timezone)|\(startsAt)"
    }

    static func advanceExpiredCreatorDayIfNeeded(
        _ state: FocusGateSharedStatePayload,
        now: Date = Date()
    ) -> FocusGateSharedStatePayload {
        guard
            state.enabled,
            let startDate = date(from: state.creatorDayStartsAt),
            let endDate = date(from: state.creatorDayEndsAt),
            now >= endDate
        else {
            return state
        }

        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: state.timezone) ?? .current

        var nextStart = startDate
        var nextEnd = endDate
        while now >= nextEnd {
            guard
                let advancedStart = calendar.date(byAdding: .day, value: 1, to: nextStart),
                let advancedEnd = calendar.date(byAdding: .day, value: 1, to: nextEnd)
            else {
                break
            }
            nextStart = advancedStart
            nextEnd = advancedEnd
        }

        let startsAt = isoString(from: nextStart)
        let endsAt = isoString(from: nextEnd)
        return FocusGateSharedStatePayload(
            enabled: state.enabled,
            creatorDayIdentifier: creatorDayIdentifier(startsAt: startsAt, timezone: state.timezone),
            creatorDayStartsAt: startsAt,
            creatorDayEndsAt: endsAt,
            timezone: state.timezone,
            xpToday: 0,
            allowedMinutes: 0,
            lastReachedThresholdMinutes: 0,
            shielded: true,
            lastSyncedAt: isoString(from: now)
        )
    }
}
