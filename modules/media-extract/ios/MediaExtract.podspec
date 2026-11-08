Pod::Spec.new do |s|
  s.name           = 'MediaExtract'
  s.version        = '1.0.0'
  s.summary        = 'Frames and 16 kHz audio from local videos'
  s.description    = 'Frames (for OCR) and 16 kHz mono WAV audio (for whisper.rn) from a local screen recording'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = {
    :ios => '16.4'
  }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
