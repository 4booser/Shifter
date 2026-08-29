import AppKit
import SwiftUI
import WidgetKit

/// Renders the widgets to PNG, at the sizes iOS gives them.
///
/// A widget cannot be placed on a simulator's home screen without taps, so the
/// alternative to this is shipping a layout nobody has looked at. The views are
/// plain SwiftUI and WidgetKit builds for macOS, so the same code that runs on
/// the phone can be drawn here and inspected.
///
/// Not part of the gate — it produces pictures, and a picture cannot fail a
/// build. It exists so that a change to a widget can be reviewed.

let sizes: [(String, CGSize)] = [
    ("small", CGSize(width: 170, height: 170)),
    ("medium", CGSize(width: 364, height: 170)),
]

@MainActor
func shoot<V: View>(_ view: V, _ name: String, _ size: CGSize, dark: Bool) {
    // The system gives a widget its margins and its rounded corners through
    // containerBackground, which needs a real widget context — and the colours
    // come from an asset catalog the extension carries and this tool does not.
    // Both are supplied here so the picture is the one the phone draws rather
    // than the same views with the furniture missing.
    let ground = dark
        ? Color(red: 0x1F / 255, green: 0x21 / 255, blue: 0x26 / 255)
        : Color(red: 0xFD / 255, green: 0xFC / 255, blue: 0xFA / 255)

    let renderer = ImageRenderer(
        content: view
            .padding(16)
            .frame(width: size.width, height: size.height)
            .background(ground)
            .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
            .padding(10)
            .background(dark ? Color.black : Color(white: 0.85))
            .environment(\.colorScheme, dark ? .dark : .light))

    renderer.scale = 3

    guard let image = renderer.nsImage,
          let tiff = image.tiffRepresentation,
          let bitmap = NSBitmapImageRep(data: tiff),
          let png = bitmap.representation(using: .png, properties: [:]) else {
        print("could not render \(name)")

        return
    }

    let path = "\(shotDirectory)/\(name)-\(dark ? "dark" : "light").png"

    try? png.write(to: URL(fileURLWithPath: path))

    print("wrote \(path)")
}

let shotDirectory = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "/tmp/widget-shots"

try? FileManager.default.createDirectory(
    atPath: shotDirectory, withIntermediateDirectories: true)

/// The three states worth looking at: an ordinary evening, a day off, and an
/// app whose lock is on. The third is the one nobody remembers to check.
let ordinary = """
{"at":"REPLACED","hidden":false,"currency":"₴",
 "today":{"shift":"Вечер","start":"18:00","end":"02:00","worked":true,"earned":1840,"next":null},
 "month":{"label":"август","earned":42300,"goal":60000,"days":17},
 "money":{"balance":8420,"untilPayday":6,"perDay":1403}}
"""

let dayOff = """
{"at":"REPLACED","hidden":false,"currency":"₴",
 "today":{"shift":null,"start":null,"end":null,"worked":false,"earned":null,
  "next":{"inDays":2,"name":"Вечер","start":"18:00"}},
 "month":{"label":"август","earned":42300,"goal":60000,"days":17},
 "money":{"balance":8420,"untilPayday":6,"perDay":1403}}
"""

let locked = """
{"at":"REPLACED","hidden":true,"currency":"₴",
 "today":{"shift":"Вечер","start":"18:00","end":"02:00","worked":true,"earned":null,"next":null},
 "month":{"label":"август","earned":null,"goal":null,"days":17},
 "money":null}
"""

func snapshot(_ json: String) -> Snapshot? {
    let now = ISO8601DateFormatter().string(from: Date())
    let decoder = JSONDecoder()

    decoder.dateDecodingStrategy = .iso8601

    return try? decoder.decode(
        Snapshot.self, from: Data(json.replacingOccurrences(of: "REPLACED", with: now).utf8))
}

MainActor.assumeIsolated {
    for (label, json) in [("ordinary", ordinary), ("dayoff", dayOff), ("locked", locked)] {
        guard let read = snapshot(json) else {
            print("\(label): did not decode")
            continue
        }

        for dark in [false, true] {
            shoot(TodayView(entry: TodayEntry(date: Date(), snapshot: read)),
                  "today-\(label)", sizes[0].1, dark: dark)
            shoot(MonthView(entry: MonthEntry(date: Date(), snapshot: read)),
                  "month-\(label)", sizes[1].1, dark: dark)
            shoot(MoneyView(entry: MoneyEntry(date: Date(), snapshot: read)),
                  "money-\(label)", sizes[0].1, dark: dark)
        }
    }

    // And the empty state, which is what everybody sees for the first few
    // seconds after adding one.
    shoot(TodayView(entry: TodayEntry(date: Date(), snapshot: nil)), "today-empty", sizes[0].1, dark: false)
}
