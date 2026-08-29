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
    /// The sign the app puts in front of a figure. Optional so a snapshot
    /// written by an older app still decodes — the two ship separately.
    let currency: String?
    let today: Today
    let month: Month
    let money: Money?

    struct Today: Decodable {
        let shift: String?
        let start: String?
        let end: String?
        let worked: Bool
        let earned: Double?
        /// The next shift there is, where today has none. Optional so an
        /// older app's snapshot still decodes.
        let next: Next?
    }

    struct Next: Decodable {
        /// Days from today. One is tomorrow.
        let inDays: Int
        let name: String
        let start: String
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

/// Money as the app spells it: the sign in front, a space between the
/// thousands, no kopecks.
///
/// Grouped by hand rather than through NumberFormatter, which honours the
/// device locale's minimum grouping digits and therefore renders 42 300 with a
/// space and 1 840 without one — on a machine set to the wrong locale, the
/// widget silently disagrees with the app about exactly the four-figure sums a
/// day's work produces.
///
/// The currency sign is deliberately absent. The app knows the currency and the
/// widget would only be guessing at it.
func spellMoney(_ value: Double, _ currency: String? = nil) -> String {
    let whole = abs(value.rounded())
    let digits = String(Int(whole))

    var grouped = ""

    for (offset, digit) in digits.reversed().enumerated() {
        if offset > 0 && offset % 3 == 0 { grouped.append(" ") }

        grouped.append(digit)
    }

    // An older app sent no sign at all. A bare number is better than a wrong
    // one, so the sign is simply absent rather than assumed to be hryvnia.
    return (currency ?? "") + (value < 0 ? "−" : "") + String(grouped.reversed())
}

/// "1 день", "3 дня", "5 дней".
///
/// Russian counts in threes, and getting it wrong is the kind of thing that
/// makes an app feel translated. The teens are the trap: eleven days is "дней"
/// even though one day is "день".
///
/// Beside the money formatter rather than beside the widget that uses it, so
/// the check can compile both without dragging SwiftUI in.
func dayWord(_ count: Int) -> String {
    let hundreds = count % 100

    if hundreds >= 11 && hundreds <= 14 { return "дней" }

    switch count % 10 {
    case 1: return "день"
    case 2, 3, 4: return "дня"
    default: return "дней"
    }
}

/// "1 смена", "3 смены", "17 смен".
func shiftWord(_ count: Int) -> String {
    let hundreds = count % 100

    if hundreds >= 11 && hundreds <= 14 { return "смен" }

    switch count % 10 {
    case 1: return "смена"
    case 2, 3, 4: return "смены"
    default: return "смен"
    }
}

/// "завтра", "через 3 дня" — how far off the next shift is, said the way a
/// person would say it.
func spellWhen(_ days: Int) -> String {
    if days <= 0 { return "сегодня" }
    if days == 1 { return "завтра" }
    if days == 2 { return "послезавтра" }

    return "через \(days) \(dayWord(days))"
}
