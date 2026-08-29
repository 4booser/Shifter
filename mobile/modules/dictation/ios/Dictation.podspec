Pod::Spec.new do |s|
  # Not 'Speech': a pod by that name shadows Apple's own framework and the
  # module can no longer see SFSpeechRecognizer at all.
  s.name           = 'Dictation'
  s.version        = '1.0.0'
  s.summary        = 'Dictation, for hands that are busy.'
  s.description    = 'Turns speech into text with SFSpeechRecognizer, on the device where the device can.'
  s.author         = 'Shifter'
  s.homepage       = 'https://shifter.ink'
  s.platforms      = { :ios => '15.1' }
  s.source         = { :git => '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
