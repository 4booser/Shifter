import Foundation

/// What the app left for the widget.
///
/// The mirror of `WidgetSnapshot` in `src/lib/widget.ts`. Every figure is
/// optional on both sides and for the same reason: a widget that draws a
/// confident zero where it was told nothing is worse than one that draws
/// nothing at all.
struct Snapshot: Decodable {
    let at: Date
    let hidden: Bool
    let today: Today
    let month: Month
    let money: Money?

    struct Today: Decodable {
        let shift: String?
        let start: String?
        let end: String?
        let worked: Bool
        let earned: Double?
    }

    struct Month: Decodable {
        let label: String
        let earned: Double?
        let goal: Double?
        let days: Int
    }

    struct Money: Decodable {
        let balance: Double?
        let untilPayday: Int?
        let perDay: Double?
    }

    /// Hours since the app last wrote. A widget is a photograph of a moment
    /// that has passed, and this is how it admits it.
    var age: Int { max(0, Int(Date().timeIntervalSince(at) / 3600)) }

    /// Beyond six hours the age is said out loud. Long enough that an ordinary
    /// evening carries no warning, short enough that yesterday's figure never
    /// passes as today's.
    var stale: Bool { age >= 6 }
}

enum SharedStore {
    /// The same group named in app.json and in expo-target.config.js. All
    /// three have to agree or the widget reads an empty container.
    static let group = "group.ink.shifter.app"
    static let key = "snapshot"

    /// The snapshot, or nothing.
    ///
    /// Nothing means the app has not run since the widget was added, which is
    /// a state the widget has to draw rather than crash on — it is what
    /// everybody sees for the first few seconds after they add it.
    static func read() -> Snapshot? {
        guard let defaults = UserDefaults(suiteName: group),
              let raw = defaults.string(forKey: key),
              let data = raw.data(using: .utf8) else { return nil }

        let decoder = JSONDecoder()

        decoder.dateDecodingStrategy = .iso8601

        return try? decoder.decode(Snapshot.self, from: data)
    }
}

/// Money as the app spells it: a space between the thousands, no kopecks.
///
/// Grouped by hand rather than through NumberFormatter, which honours the
/// device locale's minimum grouping digits and therefore renders 42 300 with a
/// space and 1 840 without one — on a machine set to the wrong locale, the
/// widget silently disagrees with the app about exactly the four-figure sums a
/// day's work produces.
///
/// The currency sign is deliberately absent. The app knows the currency and the
/// widget would only be guessing at it.
func spellMoney(_ value: Double) -> String {
    let whole = abs(value.rounded())
    let digits = String(Int(whole))

    var grouped = ""

    for (offset, digit) in digits.reversed().enumerated() {
        if offset > 0 && offset % 3 == 0 { grouped.append(" ") }

        grouped.append(digit)
    }

    return (value < 0 ? "−" : "") + String(grouped.reversed())
}
