import ActivityKit
import Foundation

/// What the lock screen is told about a running shift.
///
/// Shared between the app, which starts and updates the activity, and the
/// widget extension, which draws it. Both compile this same file — the plugin
/// links it into the widget target and the module links it into the app — so
/// there is one definition and no chance of the two drifting into a decode
/// failure nobody can see.
public struct ShiftActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        /// The instant the clock started. The lock screen counts up from it by
        /// itself, so the timer stays right without a single update.
        public var startedAt: Date

        /// When it is meant to end. Only the bar uses it, and a shift that
        /// runs over simply fills the bar — it is not turned into a warning.
        public var endsAt: Date

        /// Seconds of break so far, which the elapsed clock does not include.
        public var breakSeconds: Double

        public var onBreak: Bool

        /// Earned as of the last update, or nothing.
        ///
        /// Never interpolated. A lock screen can count time by itself and
        /// cannot count money, so a figure that appeared to rise second by
        /// second would be one the phone was inventing between updates.
        public var earned: Double?

        public init(
            startedAt: Date,
            endsAt: Date,
            breakSeconds: Double,
            onBreak: Bool,
            earned: Double?
        ) {
            self.startedAt = startedAt
            self.endsAt = endsAt
            self.breakSeconds = breakSeconds
            self.onBreak = onBreak
            self.earned = earned
        }
    }

    /// The shift's name as the person calls it, which never changes mid-shift.
    public var name: String
    public var symbol: String?

    /// The sign the app puts in front of a figure, so the lock screen does not
    /// have to guess at somebody's currency.
    public var currency: String?

    public init(name: String, symbol: String?, currency: String?) {
        self.name = name
        self.symbol = symbol
        self.currency = currency
    }
}
