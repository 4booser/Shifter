import AVFoundation
import ExpoModulesCore
import Speech

/// Dictation, for hands that are busy.
///
/// "Записал тысячу двести чаевых" is faster than any form, and in this trade
/// the hands holding the phone have just put down a tray. The recognised text
/// goes to the app's own parser, which already reads spoken numbers — nothing
/// here decides what a sentence meant.
///
/// On the device wherever the device can. Speech about somebody's wages is
/// the kind of thing that ought not to leave the phone, and iOS will do it
/// locally for most languages on most hardware. Where it cannot, recognition
/// falls back to Apple's servers, which is what every dictation key on the
/// keyboard already does — and the permission string says so.
public class DictationModule: Module {
    private var recognizer: SFSpeechRecognizer?
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?
    private let engine = AVAudioEngine()

    public func definition() -> ModuleDefinition {
        Name("DictationModule")

        Events("onPartial", "onResult", "onError")

        /// Whether this phone can do it at all, for this language. Asked
        /// before the button is offered rather than after it fails.
        Function("isAvailable") { (language: String) -> Bool in
            SFSpeechRecognizer(locale: Locale(identifier: language))?.isAvailable ?? false
        }

        /// True where recognition happens on the phone. Worth saying out loud
        /// once: it is the difference between a private sentence and one that
        /// travels.
        Function("isOnDevice") { (language: String) -> Bool in
            if #available(iOS 13.0, *) {
                return SFSpeechRecognizer(locale: Locale(identifier: language))?
                    .supportsOnDeviceRecognition ?? false
            }

            return false
        }

        AsyncFunction("permission") { () -> String in
            await withCheckedContinuation { continuation in
                SFSpeechRecognizer.requestAuthorization { status in
                    switch status {
                    case .authorized: continuation.resume(returning: "granted")
                    case .denied, .restricted: continuation.resume(returning: "denied")
                    default: continuation.resume(returning: "undetermined")
                    }
                }
            }
        }

        AsyncFunction("start") { (language: String) in
            try self.begin(language: language)
        }

        AsyncFunction("stop") {
            self.finish()
        }

        OnDestroy {
            self.finish()
        }
    }

    private func begin(language: String) throws {
        // Two sessions at once would fight over the microphone and produce two
        // half-sentences. Whatever is running is stopped first.
        finish()

        guard SFSpeechRecognizer.authorizationStatus() == .authorized else {
            throw Exception(name: "speech", description: "Not allowed to listen.")
        }

        let recognizer = SFSpeechRecognizer(locale: Locale(identifier: language))

        guard let recognizer, recognizer.isAvailable else {
            throw Exception(name: "speech", description: "Recognition is unavailable.")
        }

        self.recognizer = recognizer

        let session = AVAudioSession.sharedInstance()

        try session.setCategory(.record, mode: .measurement, options: .duckOthers)
        try session.setActive(true, options: .notifyOthersOnDeactivation)

        let request = SFSpeechAudioBufferRecognitionRequest()

        request.shouldReportPartialResults = true

        // Preferred, not required: asking for on-device where it is
        // unsupported makes recognition fail outright rather than fall back,
        // and a dictation button that does nothing is worse than one that
        // works the way the keyboard's own already does.
        if #available(iOS 13.0, *), recognizer.supportsOnDeviceRecognition {
            request.requiresOnDeviceRecognition = true
        }

        self.request = request

        let input = engine.inputNode

        input.removeTap(onBus: 0)
        input.installTap(onBus: 0, bufferSize: 1024, format: input.outputFormat(forBus: 0)) { buffer, _ in
            request.append(buffer)
        }

        engine.prepare()

        try engine.start()

        task = recognizer.recognitionTask(with: request) { [weak self] result, error in
            guard let self else { return }

            if let result {
                let text = result.bestTranscription.formattedString

                // Partials are what makes dictation feel alive — the words
                // appear as they are said, and the person can see the app
                // mishear them before they commit anything.
                self.sendEvent(result.isFinal ? "onResult" : "onPartial", ["text": text])

                if result.isFinal { self.finish() }

                return
            }

            if error != nil {
                // Silence and a cancelled session both arrive as errors here.
                // Neither is worth an alarm: the app simply stops listening.
                self.sendEvent("onError", ["message": "stopped"])
                self.finish()
            }
        }
    }

    private func finish() {
        if engine.isRunning {
            engine.stop()
            engine.inputNode.removeTap(onBus: 0)
        }

        request?.endAudio()
        task?.cancel()

        request = nil
        task = nil

        // Handed back so music, a podcast, or a call resumes. A dictation
        // button that leaves the phone deaf afterwards gets used once.
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
}
