import AVFoundation
import ExpoModulesCore
import UIKit

/// Frames (for OCR) and 16 kHz mono PCM WAV audio (for whisper.rn) from a local screen recording.
/// Everything is written to the app's cache directory; nothing leaves the device.
public class MediaExtractModule: Module {
  public func definition() -> ModuleDefinition {
    Name("MediaExtract")

    AsyncFunction("extractFramesAsync") { (uri: String, intervalMs: Int, maxFrames: Int, maxSize: Int) async throws -> [String] in
      let asset = AVURLAsset(url: try fileURL(uri))
      let seconds = try await asset.load(.duration).seconds
      guard seconds.isFinite, seconds > 0 else { return [] }

      let generator = AVAssetImageGenerator(asset: asset)
      generator.appliesPreferredTrackTransform = true
      generator.maximumSize = CGSize(width: maxSize, height: maxSize)
      let tolerance = CMTime(value: 1, timescale: 10)
      generator.requestedTimeToleranceBefore = tolerance
      generator.requestedTimeToleranceAfter = tolerance

      let dir = try outputDir("frames")
      let step = max(Double(intervalMs) / 1000, 0.1)
      var uris: [String] = []
      var t = min(0.5, seconds / 2)
      while t < seconds && uris.count < maxFrames {
        if let frame = try? await generator.image(at: CMTime(seconds: t, preferredTimescale: 600)),
           let data = UIImage(cgImage: frame.image).jpegData(compressionQuality: 0.85) {
          let file = dir.appendingPathComponent("\(UUID().uuidString).jpg")
          try data.write(to: file)
          uris.append(file.absoluteString)
        }
        t += step
      }
      return uris
    }

    AsyncFunction("extractAudioAsync") { (uri: String, maxSeconds: Double) async throws -> String? in
      let asset = AVURLAsset(url: try fileURL(uri))
      guard let track = try await asset.loadTracks(withMediaType: .audio).first else { return nil }
      let duration = try await asset.load(.duration)

      let reader = try AVAssetReader(asset: asset)
      reader.timeRange = CMTimeRange(start: .zero, duration: CMTimeMinimum(duration, CMTime(seconds: maxSeconds, preferredTimescale: 600)))
      // AVAssetReader decodes AAC and resamples/downmixes to these settings.
      let output = AVAssetReaderTrackOutput(track: track, outputSettings: [
        AVFormatIDKey: kAudioFormatLinearPCM,
        AVSampleRateKey: 16000,
        AVNumberOfChannelsKey: 1,
        AVLinearPCMBitDepthKey: 16,
        AVLinearPCMIsFloatKey: false,
        AVLinearPCMIsBigEndianKey: false,
        AVLinearPCMIsNonInterleaved: false,
      ])
      reader.add(output)
      guard reader.startReading() else { throw reader.error ?? MediaExtractError.readFailed }

      var pcm = Data()
      while let buffer = output.copyNextSampleBuffer() {
        guard let block = CMSampleBufferGetDataBuffer(buffer) else { continue }
        let length = CMBlockBufferGetDataLength(block)
        var chunk = Data(count: length)
        chunk.withUnsafeMutableBytes { raw in
          _ = CMBlockBufferCopyDataBytes(block, atOffset: 0, dataLength: length, destination: raw.baseAddress!)
        }
        pcm.append(chunk)
      }
      if reader.status == .failed { throw reader.error ?? MediaExtractError.readFailed }
      if pcm.isEmpty { return nil }

      let file = try outputDir("audio").appendingPathComponent("\(UUID().uuidString).wav")
      try (wavHeader(dataBytes: pcm.count) + pcm).write(to: file)
      return file.absoluteString
    }
  }
}

enum MediaExtractError: Error {
  case badUri
  case readFailed
}

private func fileURL(_ uri: String) throws -> URL {
  if let url = URL(string: uri), url.isFileURL { return url }
  if uri.hasPrefix("/") { return URL(fileURLWithPath: uri) }
  throw MediaExtractError.badUri
}

private func outputDir(_ name: String) throws -> URL {
  let dir = FileManager.default.temporaryDirectory.appendingPathComponent("media-extract/\(name)", isDirectory: true)
  try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
  return dir
}

/// 44-byte RIFF header for 16 kHz, mono, 16-bit little-endian PCM.
private func wavHeader(dataBytes: Int) -> Data {
  var d = Data()
  func u32(_ v: UInt32) { withUnsafeBytes(of: v.littleEndian) { d.append(contentsOf: $0) } }
  func u16(_ v: UInt16) { withUnsafeBytes(of: v.littleEndian) { d.append(contentsOf: $0) } }
  d.append(contentsOf: Array("RIFF".utf8)); u32(UInt32(36 + dataBytes))
  d.append(contentsOf: Array("WAVE".utf8))
  d.append(contentsOf: Array("fmt ".utf8)); u32(16); u16(1); u16(1); u32(16000); u32(32000); u16(2); u16(16)
  d.append(contentsOf: Array("data".utf8)); u32(UInt32(dataBytes))
  return d
}
