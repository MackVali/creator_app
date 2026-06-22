//
//  CreatorLiveActivitiesLiveActivity.swift
//  CreatorLiveActivities
//
//  Created by Valí DTali on 6/22/26.
//

import ActivityKit
import WidgetKit
import SwiftUI

@available(iOS 16.2, *)
private extension GenericAttributes {
    var values: [String: String] {
        staticValues
    }
}

@available(iOS 16.2, *)
struct CreatorLiveActivitiesLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: GenericAttributes.self) { context in
            FocusPomoLockScreenView(
                title: context.state.values["title"],
                status: context.state.values["status"],
                remainingSeconds: context.state.values["remainingSeconds"],
                elapsedSeconds: context.state.values["elapsedSeconds"],
                mode: context.attributes.values["mode"]
            )
            .activityBackgroundTint(Color(red: 0.04, green: 0.045, blue: 0.06))
            .activitySystemActionForegroundColor(Color.white)
        } dynamicIsland: { context in
            let taskTitle = Self.taskTitle(context.state.values["title"])
            let timeText = Self.timeText(
                remainingSeconds: context.state.values["remainingSeconds"],
                elapsedSeconds: context.state.values["elapsedSeconds"],
                mode: context.attributes.values["mode"],
                status: context.state.values["status"]
            )
            let shortTimeText = Self.shortTimeText(
                remainingSeconds: context.state.values["remainingSeconds"],
                elapsedSeconds: context.state.values["elapsedSeconds"]
            )

            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Text("FocusPomo")
                        .font(.headline)
                        .foregroundStyle(.white)
                }

                DynamicIslandExpandedRegion(.trailing) {
                    Text(timeText)
                        .font(.subheadline.monospacedDigit())
                        .foregroundStyle(Color(red: 0.78, green: 0.88, blue: 1.0))
                }

                DynamicIslandExpandedRegion(.bottom) {
                    Text(taskTitle)
                        .font(.body.weight(.semibold))
                        .lineLimit(2)
                        .foregroundStyle(.white)
                }
            } compactLeading: {
                Image(systemName: "timer")
                    .foregroundStyle(Color(red: 0.78, green: 0.88, blue: 1.0))
            } compactTrailing: {
                Text(shortTimeText)
                    .font(.caption2.monospacedDigit().weight(.semibold))
                    .foregroundStyle(.white)
            } minimal: {
                Image(systemName: "timer")
                    .foregroundStyle(Color(red: 0.78, green: 0.88, blue: 1.0))
            }
            .keylineTint(Color(red: 0.78, green: 0.88, blue: 1.0))
        }
    }

    private static func taskTitle(_ title: String?) -> String {
        let trimmedTitle = title?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return trimmedTitle.isEmpty ? "Focus session" : trimmedTitle
    }

    private static func statusText(_ status: String?) -> String {
        switch status?.lowercased() {
        case "completed", "complete", "done", "finished":
            return "Completed"
        case "canceled", "cancelled", "cancel":
            return "Canceled"
        default:
            return "Running"
        }
    }

    private static func timeText(
        remainingSeconds: String?,
        elapsedSeconds: String?,
        mode: String?,
        status: String?
    ) -> String {
        if let remainingSeconds = seconds(from: remainingSeconds) {
            return "\(format(seconds: remainingSeconds)) left"
        }

        if let elapsedSeconds = seconds(from: elapsedSeconds) {
            return "\(format(seconds: elapsedSeconds)) elapsed"
        }

        let fallbackMode = mode?.trimmingCharacters(in: .whitespacesAndNewlines)
        if let fallbackMode, !fallbackMode.isEmpty {
            return fallbackMode
        }

        return statusText(status)
    }

    private static func shortTimeText(remainingSeconds: String?, elapsedSeconds: String?) -> String {
        if let remainingSeconds = seconds(from: remainingSeconds) {
            return format(seconds: remainingSeconds)
        }

        if let elapsedSeconds = seconds(from: elapsedSeconds) {
            return format(seconds: elapsedSeconds)
        }

        return "FP"
    }

    private static func seconds(from value: String?) -> Int? {
        guard let value, let seconds = Int(value) else {
            return nil
        }

        return max(seconds, 0)
    }

    private static func format(seconds: Int) -> String {
        let minutes = seconds / 60
        let remainingSeconds = seconds % 60
        return String(format: "%02d:%02d", minutes, remainingSeconds)
    }
}

@available(iOS 16.2, *)
private struct FocusPomoLockScreenView: View {
    let title: String?
    let status: String?
    let remainingSeconds: String?
    let elapsedSeconds: String?
    let mode: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .center, spacing: 10) {
                Image(systemName: "timer")
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(Color(red: 0.78, green: 0.88, blue: 1.0))

                Text("FocusPomo")
                    .font(.headline.weight(.semibold))
                    .foregroundStyle(.white)

                Spacer(minLength: 8)

                Text(statusText)
                    .font(.caption.weight(.semibold))
                    .padding(.horizontal, 10)
                    .padding(.vertical, 5)
                    .foregroundStyle(.white)
                    .background(statusColor.opacity(0.24), in: Capsule())
            }

            VStack(alignment: .leading, spacing: 6) {
                Text(taskTitle)
                    .font(.title3.weight(.semibold))
                    .lineLimit(2)
                    .foregroundStyle(.white)

                Text(statusText)
                    .font(.subheadline)
                    .foregroundStyle(Color.white.opacity(0.72))
            }

            Text(timeText)
                .font(.system(.title2, design: .rounded, weight: .bold).monospacedDigit())
                .foregroundStyle(Color(red: 0.78, green: 0.88, blue: 1.0))
        }
        .padding(18)
    }

    private var taskTitle: String {
        let trimmedTitle = title?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return trimmedTitle.isEmpty ? "Focus session" : trimmedTitle
    }

    private var statusText: String {
        switch status?.lowercased() {
        case "completed", "complete", "done", "finished":
            return "Completed"
        case "canceled", "cancelled", "cancel":
            return "Canceled"
        default:
            return "Running"
        }
    }

    private var statusColor: Color {
        switch statusText {
        case "Completed":
            return Color(red: 0.16, green: 0.68, blue: 0.42)
        case "Canceled":
            return Color(red: 0.82, green: 0.28, blue: 0.32)
        default:
            return Color(red: 0.18, green: 0.42, blue: 0.82)
        }
    }

    private var timeText: String {
        if let remainingSeconds = seconds(from: remainingSeconds) {
            return "\(format(seconds: remainingSeconds)) left"
        }

        if let elapsedSeconds = seconds(from: elapsedSeconds) {
            return "\(format(seconds: elapsedSeconds)) elapsed"
        }

        let fallbackMode = mode?.trimmingCharacters(in: .whitespacesAndNewlines)
        if let fallbackMode, !fallbackMode.isEmpty {
            return fallbackMode
        }

        return statusText
    }

    private func seconds(from value: String?) -> Int? {
        guard let value, let seconds = Int(value) else {
            return nil
        }

        return max(seconds, 0)
    }

    private func format(seconds: Int) -> String {
        let minutes = seconds / 60
        let remainingSeconds = seconds % 60
        return String(format: "%02d:%02d", minutes, remainingSeconds)
    }
}

@available(iOS 16.2, *)
#Preview("Notification", as: .content, using: GenericAttributes(
    id: "focuspomo-preview",
    staticValues: ["mode": "focus"]
)) {
    CreatorLiveActivitiesLiveActivity()
} contentStates: {
    GenericAttributes.ContentState(values: [
        "title": "Deep work sprint",
        "status": "running",
        "remainingSeconds": "1495",
        "elapsedSeconds": "5"
    ])
}
