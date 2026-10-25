"""Validated configuration and transcript boundary conversion."""

import math
import os
from collections.abc import Iterable
from typing import Protocol

from pydantic import BaseModel, ConfigDict, Field, SecretStr, model_validator

MAX_AUDIO_BYTES = 10 * 1024 * 1024
MAX_AUDIO_SECONDS = 120
SUPPORTED_CONTENT_TYPES = frozenset({"audio/wav", "audio/mpeg", "audio/mp4", "audio/webm"})


class Settings(BaseModel):
    """Read only explicitly supported environment variables."""

    host: str = "127.0.0.1"
    port: int = Field(default=19000, ge=0, le=65535)
    model: str = "base"
    language: str = "ru"
    cpu_threads: int = Field(default=2, ge=1, le=16)
    auth_token: SecretStr | None = None
    model_dir: str | None = None
    heavy_lock: str | None = None

    @model_validator(mode="after")
    def require_network_auth(self) -> "Settings":
        """Require a token when listening beyond loopback."""
        if self.host not in {"127.0.0.1", "localhost", "::1"} and not self.auth_token:
            raise ValueError("STT_AUTH_TOKEN is required for a non-loopback bind")
        if self.auth_token and not self.auth_token.get_secret_value().strip():
            raise ValueError("STT_AUTH_TOKEN must not be blank")
        return self

    @classmethod
    def from_environment(cls) -> "Settings":
        """Load config without inspecting unrelated secrets."""
        keys = {
            "host": "STT_HOST", "port": "STT_PORT", "model": "STT_MODEL",
            "language": "STT_LANGUAGE", "cpu_threads": "STT_CPU_THREADS",
            "auth_token": "STT_AUTH_TOKEN", "model_dir": "STT_MODEL_DIR",
            "heavy_lock": "STT_HEAVY_LOCK",
        }
        values = {key: os.environ[env] for key, env in keys.items() if env in os.environ}
        return cls.model_validate(values)


class ModelSegment(Protocol):
    """Subset of faster-whisper output used by the sidecar."""

    @property
    def start(self) -> float: ...

    @property
    def end(self) -> float: ...

    @property
    def text(self) -> str: ...


class Segment(BaseModel):
    """Real model timing and JavaScript UTF-16 transcript boundaries."""

    model_config = ConfigDict(extra="forbid")
    startMs: int = Field(ge=0)
    endMs: int = Field(ge=0)
    textStart: int = Field(ge=0)
    textEnd: int = Field(ge=0)


class Transcript(BaseModel):
    """Exact joined text returned to the context adapter."""

    model_config = ConfigDict(extra="forbid")
    text: str
    segments: list[Segment]


class InvalidAudio(Exception):
    """The submitted bytes cannot be decoded as a supported audio stream."""


class AudioTooLong(Exception):
    """Decoded audio exceeds the hard short-recording duration limit."""


def utf16_length(text: str) -> int:
    """Count JavaScript string units, including supplementary characters."""
    return len(text.encode("utf-16-le")) // 2


def join_segments(segments: Iterable[ModelSegment]) -> Transcript:
    """Join trimmed model segments and calculate exact UTF-16 offsets."""
    parts: list[str] = []
    result: list[Segment] = []
    offset = 0
    for segment in segments:
        text = segment.text.strip()
        if not text:
            continue
        if not math.isfinite(segment.start) or not math.isfinite(segment.end):
            raise ValueError("non-finite model timestamp")
        if segment.start < 0 or segment.end < segment.start:
            raise ValueError("invalid model timestamp")
        start_ms = round(segment.start * 1000)
        end_ms = round(segment.end * 1000)
        if end_ms <= start_ms:
            raise ValueError("model segment has no positive millisecond duration")
        if parts:
            offset += 1
        length = utf16_length(text)
        result.append(Segment(
            startMs=start_ms, endMs=end_ms,
            textStart=offset, textEnd=offset + length,
        ))
        parts.append(text)
        offset += length
    return Transcript(text=" ".join(parts), segments=result)
