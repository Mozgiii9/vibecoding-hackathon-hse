"""Single loaded CPU model; recordings stay in memory."""

from faster_whisper import WhisperModel

from .audio import decode_audio
from .core import Settings, Transcript, join_segments


class SpeechModel:
    """Load the real model once and consume its lazy segments in the request."""

    def __init__(self, settings: Settings) -> None:
        self.language = settings.language
        self.model = WhisperModel(
            settings.model, device="cpu", compute_type="int8",
            cpu_threads=settings.cpu_threads, num_workers=1, download_root=settings.model_dir,
        )

    def transcribe(self, audio: bytes) -> Transcript:
        """Decode bytes directly without a recording file or subprocess."""
        waveform = decode_audio(audio)
        segments, _ = self.model.transcribe(
            waveform, language=self.language, beam_size=5,
            vad_filter=True, condition_on_previous_text=False,
        )
        return join_segments(segments)
