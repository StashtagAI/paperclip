package expo.modules.mediaextract

import android.content.Context
import android.graphics.Bitmap
import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.MediaMetadataRetriever
import android.net.Uri
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.BufferedOutputStream
import java.io.File
import java.io.FileOutputStream
import java.io.RandomAccessFile
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.UUID
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/** Frames (for OCR) and 16 kHz mono PCM WAV audio (for whisper.rn) from a local screen recording. */
class MediaExtractModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("MediaExtract")

    AsyncFunction("extractFramesAsync") { uri: String, intervalMs: Int, maxFrames: Int, maxSize: Int ->
      val retriever = MediaMetadataRetriever()
      try {
        retriever.setDataSource(context, Uri.parse(uri))
        val durationMs = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull() ?: 0L
        val dir = outputDir("frames")
        val step = max(intervalMs.toLong(), 100L)
        val uris = mutableListOf<String>()
        var t = min(500L, durationMs / 2)
        while (t < durationMs && uris.size < maxFrames) {
          retriever.getFrameAtTime(t * 1000, MediaMetadataRetriever.OPTION_CLOSEST)?.let { frame ->
            val scaled = scaleDown(frame, maxSize)
            val file = File(dir, "${UUID.randomUUID()}.jpg")
            FileOutputStream(file).use { scaled.compress(Bitmap.CompressFormat.JPEG, 85, it) }
            if (scaled !== frame) scaled.recycle()
            frame.recycle()
            uris.add(Uri.fromFile(file).toString())
          }
          t += step
        }
        uris
      } finally {
        retriever.release()
      }
    }

    AsyncFunction("extractAudioAsync") { uri: String, maxSeconds: Double ->
      decodeToWav(Uri.parse(uri), maxSeconds)
    }
  }

  private fun outputDir(name: String): File =
    File(context.cacheDir, "media-extract/$name").apply { mkdirs() }

  private fun scaleDown(bitmap: Bitmap, maxSize: Int): Bitmap {
    val longest = max(bitmap.width, bitmap.height)
    if (longest <= maxSize) return bitmap
    val ratio = maxSize.toFloat() / longest
    return Bitmap.createScaledBitmap(bitmap, (bitmap.width * ratio).roundToInt(), (bitmap.height * ratio).roundToInt(), true)
  }

  /** Decodes the first audio track, downmixes to mono and linearly resamples to 16 kHz. Null if there is no audio. */
  private fun decodeToWav(uri: Uri, maxSeconds: Double): String? {
    val extractor = MediaExtractor()
    var codec: MediaCodec? = null
    try {
      extractor.setDataSource(context, uri, null)
      val track = (0 until extractor.trackCount).firstOrNull {
        extractor.getTrackFormat(it).getString(MediaFormat.KEY_MIME)?.startsWith("audio/") == true
      } ?: return null
      extractor.selectTrack(track)
      val format = extractor.getTrackFormat(track)
      val decoder = MediaCodec.createDecoderByType(format.getString(MediaFormat.KEY_MIME)!!)
      codec = decoder
      decoder.configure(format, null, null, 0)
      decoder.start()

      val file = File(outputDir("audio"), "${UUID.randomUUID()}.wav")
      val out = BufferedOutputStream(FileOutputStream(file))
      out.write(ByteArray(44)) // header is patched once the length is known
      var sampleRate = format.getInteger(MediaFormat.KEY_SAMPLE_RATE)
      var channels = format.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
      val maxUs = (maxSeconds * 1_000_000).toLong()
      val resampler = Resampler()
      val info = MediaCodec.BufferInfo()
      var inputDone = false
      var outputDone = false
      var bytes = 0L

      while (!outputDone) {
        if (!inputDone) {
          val inIndex = decoder.dequeueInputBuffer(10_000)
          if (inIndex >= 0) {
            val buffer = decoder.getInputBuffer(inIndex)!!
            val size = extractor.readSampleData(buffer, 0)
            if (size < 0 || extractor.sampleTime > maxUs) {
              decoder.queueInputBuffer(inIndex, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
              inputDone = true
            } else {
              decoder.queueInputBuffer(inIndex, 0, size, extractor.sampleTime, 0)
              extractor.advance()
            }
          }
        }
        val outIndex = decoder.dequeueOutputBuffer(info, 10_000)
        when {
          outIndex == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
            sampleRate = decoder.outputFormat.getInteger(MediaFormat.KEY_SAMPLE_RATE)
            channels = decoder.outputFormat.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
          }
          outIndex >= 0 -> {
            val buffer = decoder.getOutputBuffer(outIndex)!!
            buffer.position(info.offset)
            buffer.limit(info.offset + info.size)
            bytes += resampler.feed(buffer.order(ByteOrder.LITTLE_ENDIAN).asShortBuffer(), channels, sampleRate, out)
            decoder.releaseOutputBuffer(outIndex, false)
            if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) outputDone = true
          }
        }
      }
      out.close()
      if (bytes == 0L) {
        file.delete()
        return null
      }
      RandomAccessFile(file, "rw").use { it.write(wavHeader(bytes.toInt())) }
      return Uri.fromFile(file).toString()
    } finally {
      codec?.run { stop(); release() }
      extractor.release()
    }
  }

  private class Resampler {
    private var srcIndex = 0L
    private var nextOut = 0.0
    private var prev = 0f

    /** Writes 16 kHz mono 16-bit samples for one interleaved PCM chunk; returns bytes written. */
    fun feed(pcm: java.nio.ShortBuffer, channels: Int, sampleRate: Int, out: BufferedOutputStream): Long {
      val ratio = sampleRate / 16000.0
      var written = 0L
      val frames = pcm.remaining() / channels
      for (f in 0 until frames) {
        var sum = 0f
        for (c in 0 until channels) sum += pcm.get()
        val s = sum / channels
        while (nextOut <= srcIndex) {
          val frac = (nextOut - (srcIndex - 1)).toFloat()
          val v = (prev + (s - prev) * frac).roundToInt().coerceIn(-32768, 32767)
          out.write(v and 0xff)
          out.write((v shr 8) and 0xff)
          written += 2
          nextOut += ratio
        }
        prev = s
        srcIndex++
      }
      return written
    }
  }

  private fun wavHeader(dataBytes: Int): ByteArray =
    ByteBuffer.allocate(44).order(ByteOrder.LITTLE_ENDIAN).apply {
      put("RIFF".toByteArray()); putInt(36 + dataBytes); put("WAVE".toByteArray())
      put("fmt ".toByteArray()); putInt(16); putShort(1); putShort(1); putInt(16000); putInt(32000); putShort(2); putShort(16)
      put("data".toByteArray()); putInt(dataBytes)
    }.array()
}
