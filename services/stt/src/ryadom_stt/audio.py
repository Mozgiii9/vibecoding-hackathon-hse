"""Decode only a bounded amount of audio in memory before inference."""

from io import BytesIO
from typing import Any

import av
import numpy as np
from av.error import FFmpegError
from numpy.typing import NDArray

from .core import MAX_AUDIO_SECONDS, AudioTooLong, InvalidAudio

SAMPLE_RATE = 16000
MAX_SAMPLES = SAMPLE_RATE * MAX_AUDIO_SECONDS


def decode_audio(audio: bytes) -> NDArray[np.float32]:
    """Stop at the first frame over 120 seconds, without decoding the full file."""
    # This fixed allocation bounds the accumulated mono waveform to 7.68 MB.
    waveform = np.empty(MAX_SAMPLES, dtype=np.float32)
    total = 0
    source_seconds = 0.0
    resampler = av.audio.resampler.AudioResampler(format="fltp", layout="mono", rate=SAMPLE_RATE)

    def append(frame: Any) -> None:
        """Copy one resampled frame only after checking its sample bound."""
        nonlocal total
        if total + frame.samples > MAX_SAMPLES:
            raise AudioTooLong
        samples = frame.to_ndarray().reshape(-1)
        waveform[total:total + frame.samples] = samples
        total += frame.samples

    try:
        with av.open(BytesIO(audio), mode="r") as container:
            if not container.streams.audio:
                raise InvalidAudio
            stream = container.streams.audio[0]
            stream.codec_context.thread_count = 1
            for frame in container.decode(stream):
                if frame.sample_rate <= 0:
                    raise InvalidAudio
                source_seconds += frame.samples / frame.sample_rate
                if source_seconds > MAX_AUDIO_SECONDS + 1 / SAMPLE_RATE:
                    raise AudioTooLong
                # Ignore container timestamp discontinuities just as upstream decoding does.
                frame.pts = None
                for converted in resampler.resample(frame):
                    append(converted)
            for converted in resampler.resample(None):
                append(converted)
    except (FFmpegError, ValueError) as error:
        raise InvalidAudio from error
    if total == 0:
        raise InvalidAudio
    return waveform[:total]
