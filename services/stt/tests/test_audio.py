"""Native codec checks with generated WAV data, never a private recording."""

import unittest
import wave
from io import BytesIO

import numpy as np

from ryadom_stt.audio import MAX_SAMPLES, SAMPLE_RATE, decode_audio
from ryadom_stt.core import AudioTooLong, InvalidAudio


def wav_bytes(seconds: float, rate: int = SAMPLE_RATE, channels: int = 1) -> bytes:
    """Generate deterministic PCM silence in memory."""
    buffer = BytesIO()
    with wave.open(buffer, "wb") as output:
        output.setnchannels(channels)
        output.setsampwidth(2)
        output.setframerate(rate)
        output.writeframes(b"\x00\x00" * (round(seconds * rate) * channels))
    return buffer.getvalue()


class AudioTests(unittest.TestCase):
    """Verify native resampling and hard duration bounds without loading STT."""

    def test_resamples_stereo_48k_to_mono_16k(self) -> None:
        result = decode_audio(wav_bytes(1, rate=48000, channels=2))
        self.assertEqual(result.shape, (16000,))
        self.assertEqual(result.dtype, np.float32)
        self.assertTrue(result.flags.c_contiguous)
        self.assertEqual(float(np.max(np.abs(result))), 0.0)

    def test_exact_maximum_is_accepted(self) -> None:
        self.assertEqual(decode_audio(wav_bytes(120)).shape, (MAX_SAMPLES,))

    def test_long_recording_under_byte_limit_rejected(self) -> None:
        # 240 s PCM is below the 10 MiB request cap, but exceeds decoded duration.
        with self.assertRaises(AudioTooLong):
            decode_audio(wav_bytes(240))

    def test_non_audio_and_empty_wave_rejected(self) -> None:
        for audio in [b"synthetic invalid data", wav_bytes(0)]:
            with self.subTest(size=len(audio)), self.assertRaises(InvalidAudio):
                decode_audio(audio)


if __name__ == "__main__":
    unittest.main()
