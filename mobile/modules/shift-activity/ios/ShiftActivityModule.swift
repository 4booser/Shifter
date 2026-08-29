import ActivityKit
import ExpoModulesCore

/// Starts, updates and ends the lock-screen activity for a running shift.
///
/// Every entry point is defensive in the same way: a clock-in is a fact about
/// somebody's working day and must never fail because a decoration could not
/// be drawn. Nothing here throws at JavaScript.
public class ShiftActivityModule: Module {
    public func definition() -> ModuleDefinition {
        Name("ShiftActivityModule")

        /// False on a phone where the person has switched Live Activities off,
        /// and on every version of iOS before they existed. The app asks
        /// before offering anything.
        Function("isAvailable") { () -> Bool in
            if #available(iOS 16.2, *) {
                return ActivityAuthorizationInfo().areActivitiesEnabled
            }

            return false
        }

        Function("isRunning") { () -> Bool in
            if #available(iOS 16.2, *) {
                return !Activity<ShiftActivityAttributes>.activities.isEmpty
            }

            return false
        }

        AsyncFunction("start") { (state: [String: Any]) -> String? in
            guard #available(iOS 16.2, *) else { return nil }
            guard ActivityAuthorizationInfo().areActivitiesEnabled else { return nil }
            guard let content = Self.contentState(from: state) else { return nil }

            // Two activities for one shift would sit on the lock screen
            // arguing with each other. Whatever is already running is the one
            // this shift owns, so it is updated rather than joined.
            if let running = Activity<ShiftActivityAttributes>.activities.first {
                await running.update(ActivityContent(state: content, staleDate: nil))

                return running.id
            }

            let attributes = ShiftActivityAttributes(
                name: state["name"] as? String ?? "Смена",
                symbol: state["symbol"] as? String,
                currency: state["currency"] as? String)

            return try? Activity.request(
                attributes: attributes,
                content: ActivityContent(state: content, staleDate: nil),
                pushType: nil
            ).id
        }

        AsyncFunction("update") { (state: [String: Any]) in
            guard #available(iOS 16.2, *) else { return }
            guard let content = Self.contentState(from: state) else { return }

            for activity in Activity<ShiftActivityAttributes>.activities {
                await activity.update(ActivityContent(state: content, staleDate: nil))
            }
        }

        AsyncFunction("end") {
            guard #available(iOS 16.2, *) else { return }

            for activity in Activity<ShiftActivityAttributes>.activities {
                // Immediately: the shift is over, and a card that lingers on
                // the lock screen counting a clock that stopped is worse than
                // no card.
                await activity.end(nil, dismissalPolicy: .immediate)
            }
        }
    }

    /// The JavaScript object as a content state, or nothing.
    ///
    /// A missing or unparseable date returns nil rather than defaulting to
    /// now: a lock screen counting from the wrong moment is a wrong number in
    /// the most visible place this app has.
    @available(iOS 16.2, *)
    private static func contentState(from state: [String: Any]) -> ShiftActivityAttributes.ContentState? {
        let formatter = ISO8601DateFormatter()

        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]

        func date(_ key: String) -> Date? {
            guard let text = state[key] as? String else { return nil }

            // Both spellings: JavaScript's toISOString carries milliseconds and
            // a date built by hand often does not.
            if let parsed = formatter.date(from: text) { return parsed }

            let plain = ISO8601DateFormatter()

            plain.formatOptions = [.withInternetDateTime]

            return plain.date(from: text)
        }

        guard let startedAt = date("startedAt"), let endsAt = date("endsAt") else { return nil }

        return ShiftActivityAttributes.ContentState(
            startedAt: startedAt,
            endsAt: endsAt,
            breakSeconds: state["breakSeconds"] as? Double ?? 0,
            onBreak: state["onBreak"] as? Bool ?? false,
            earned: state["earned"] as? Double)
    }
}
