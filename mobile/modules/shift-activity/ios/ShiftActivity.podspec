Pod::Spec.new do |s|
  s.name           = 'ShiftActivity'
  s.version        = '1.0.0'
  s.summary        = 'The running shift on the lock screen.'
  s.description    = 'Starts, updates and ends a Live Activity for a shift in progress.'
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
