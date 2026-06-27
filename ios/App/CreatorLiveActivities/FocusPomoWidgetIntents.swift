import AppIntents
import Foundation

@available(iOS 17.0, *)
struct FocusPomoCompleteWidgetIntent: AppIntent {
    static var title: LocalizedStringResource = "Complete Focus Pomo"
    static var openAppWhenRun: Bool = false

    @Parameter(title: "Session ID")
    var sessionId: String

    @Parameter(title: "Title")
    var titleText: String

    @Parameter(title: "Item Key")
    var itemKey: String

    @Parameter(title: "Schedule Instance ID")
    var scheduleInstanceId: String

    init() {
        sessionId = ""
        titleText = ""
        itemKey = ""
        scheduleInstanceId = ""
    }

    init(sessionId: String, title: String, itemKey: String, scheduleInstanceId: String) {
        self.sessionId = sessionId
        self.titleText = title
        self.itemKey = itemKey
        self.scheduleInstanceId = scheduleInstanceId
    }

    func perform() async throws -> some IntentResult {
        _ = FocusPomoLiveActivityActionStore.append(
            action: "complete",
            sessionId: sessionId,
            title: titleText,
            itemKey: itemKey,
            itemType: nil,
            sourceType: nil,
            itemId: nil,
            sourceId: nil,
            scheduleInstanceId: scheduleInstanceId
        )
        return .result()
    }
}

@available(iOS 17.0, *)
struct FocusPomoSkipWidgetIntent: AppIntent {
    static var title: LocalizedStringResource = "Skip Focus Pomo"
    static var openAppWhenRun: Bool = false

    @Parameter(title: "Session ID")
    var sessionId: String

    @Parameter(title: "Title")
    var titleText: String

    @Parameter(title: "Item Key")
    var itemKey: String

    @Parameter(title: "Schedule Instance ID")
    var scheduleInstanceId: String

    init() {
        sessionId = ""
        titleText = ""
        itemKey = ""
        scheduleInstanceId = ""
    }

    init(sessionId: String, title: String, itemKey: String, scheduleInstanceId: String) {
        self.sessionId = sessionId
        self.titleText = title
        self.itemKey = itemKey
        self.scheduleInstanceId = scheduleInstanceId
    }

    func perform() async throws -> some IntentResult {
        _ = FocusPomoLiveActivityActionStore.append(
            action: "skip",
            sessionId: sessionId,
            title: titleText,
            itemKey: itemKey,
            itemType: nil,
            sourceType: nil,
            itemId: nil,
            sourceId: nil,
            scheduleInstanceId: scheduleInstanceId
        )
        return .result()
    }
}
