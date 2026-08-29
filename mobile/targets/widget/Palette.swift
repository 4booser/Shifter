import SwiftUI
#if canImport(AppKit)
import AppKit
#endif

/// The colours, with a fallback that cannot quietly disappear or go unreadable.
///
/// A named colour resolves to nothing when its asset is missing, and a SwiftUI
/// shape filled with nothing draws nothing at all — which is how a progress bar
/// ends up reading "70% от цели" beside an entirely empty track.
///
/// The fallbacks answer to the colour scheme, because a single literal would
/// repeat a mistake this project has already made once: the light indigo sits
/// at 2.6 to 1 against a dark surface, below the floor for anything carrying
/// meaning by colour, and nobody notices because whoever picked it was looking
/// at the light theme.
extension Color {
    static var shifterAccent: Color { named("$accent", light: 0x4F46E5, dark: 0x8B8EF7) }

    static var shifterSurface: Color {
        named("$widgetBackground", light: 0xFDFCFA, dark: 0x1F2126)
    }

    private static func named(_ asset: String, light: Int, dark: Int) -> Color {
#if canImport(UIKit)
        if let found = UIColor(named: asset) { return Color(uiColor: found) }

        return Color(uiColor: UIColor { traits in
            traits.userInterfaceStyle == .dark ? UIColor(rgb: dark) : UIColor(rgb: light)
        })
#else
        // The rendering tool runs on macOS. It answers to the scheme too, or a
        // review of the dark widgets would be a review of the light colours on
        // a dark ground — which is the very mistake this is here to prevent.
        return Color(nsColor: NSColor(name: nil) { appearance in
            appearance.bestMatch(from: [.aqua, .darkAqua]) == .darkAqua
                ? NSColor(rgb: dark)
                : NSColor(rgb: light)
        })
#endif
    }
}

#if canImport(UIKit)
private extension UIColor {
    convenience init(rgb: Int) {
        self.init(
            red: CGFloat((rgb >> 16) & 0xFF) / 255,
            green: CGFloat((rgb >> 8) & 0xFF) / 255,
            blue: CGFloat(rgb & 0xFF) / 255,
            alpha: 1)
    }
}
#else
private extension NSColor {
    convenience init(rgb: Int) {
        self.init(
            srgbRed: CGFloat((rgb >> 16) & 0xFF) / 255,
            green: CGFloat((rgb >> 8) & 0xFF) / 255,
            blue: CGFloat(rgb & 0xFF) / 255,
            alpha: 1)
    }
}
#endif
