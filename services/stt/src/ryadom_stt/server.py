"""Small private HTTP interface with one active transcription at a time."""

import hmac
import json
import socket
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import BinaryIO, Protocol

from .core import (
    MAX_AUDIO_BYTES,
    SUPPORTED_CONTENT_TYPES,
    AudioTooLong,
    InvalidAudio,
    Settings,
    Transcript,
)
from .heavy_lock import HeavyOperationBusy, acquire_heavy_lock, release_heavy_lock


class Transcriber(Protocol):
    """Boundary that permits an isolated fake in tests only."""

    def transcribe(self, audio: bytes) -> Transcript: ...


def create_server(settings: Settings, model: Transcriber) -> ThreadingHTTPServer:
    """Build a server only after the real model has loaded successfully."""
    if settings.heavy_lock:
        # Fail startup rather than silently bypassing a configured POSIX lock.
        import fcntl  # noqa: F401

    inference_lock = threading.Lock()

    class Handler(BaseHTTPRequestHandler):
        """Bound input, redact errors, and keep concurrent health checks available."""

        server_version = "RyadomSTT"
        sys_version = ""
        timeout = 30

        def log_message(self, format: str, *args: object) -> None:
            """Never log request headers, bodies, tokens, paths, or transcriptions."""

        def reply(self, status: int, value: dict[str, object]) -> None:
            """Send a bounded JSON response and close each HTTP connection."""
            payload = json.dumps(value, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(payload)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("Connection", "close")
            self.end_headers()
            self.close_connection = True
            try:
                self.wfile.write(payload)
            except (BrokenPipeError, ConnectionResetError):
                pass

        def do_GET(self) -> None:
            """Report readiness only for the already loaded model."""
            if self.path != "/health":
                self.reply(404, {"error": "not_found"})
                return
            self.reply(200, {"ready": True, "model": settings.model, "language": settings.language})

        def do_POST(self) -> None:
            """Validate raw audio before invoking the serialized model."""
            if self.path != "/transcribe":
                self.reply(404, {"error": "not_found"})
                return
            if settings.auth_token:
                expected = "Bearer " + settings.auth_token.get_secret_value()
                actual = self.headers.get("Authorization", "")
                if not hmac.compare_digest(actual.encode(), expected.encode()):
                    self.reply(401, {"error": "unauthorized"})
                    return
            if self.headers.get("Transfer-Encoding"):
                self.reply(400, {"error": "unsupported_transfer_encoding"})
                return
            if self.headers.get_content_type() not in SUPPORTED_CONTENT_TYPES:
                self.reply(415, {"error": "unsupported_media_type"})
                return
            lengths = self.headers.get_all("Content-Length", [])
            if not lengths:
                self.reply(411, {"error": "content_length_required"})
                return
            try:
                if len(lengths) != 1 or not lengths[0].isascii() or not lengths[0].isdigit():
                    raise ValueError
                length = int(lengths[0])
            except ValueError:
                self.reply(400, {"error": "invalid_content_length"})
                return
            if length > MAX_AUDIO_BYTES:
                self.reply(413, {"error": "audio_too_large"})
                return
            if length == 0:
                self.reply(400, {"error": "empty_audio"})
                return
            try:
                audio = self.rfile.read(length)
                if len(audio) != length:
                    self.reply(400, {"error": "incomplete_audio"})
                    return
            except TimeoutError:
                self.reply(408, {"error": "audio_read_timeout"})
                return
            if not inference_lock.acquire(blocking=False):
                self.reply(503, {"error": "stt_busy"})
                return
            heavy_lock: BinaryIO | None = None
            try:
                heavy_lock = acquire_heavy_lock(settings.heavy_lock)
                result = model.transcribe(audio)
                self.reply(200, result.model_dump())
            except HeavyOperationBusy:
                self.reply(503, {"error": "stt_busy"})
            except InvalidAudio:
                self.reply(422, {"error": "invalid_audio"})
            except AudioTooLong:
                self.reply(413, {"error": "audio_too_long"})
            except Exception:
                self.reply(502, {"error": "transcription_failed"})
            finally:
                release_heavy_lock(heavy_lock)
                inference_lock.release()

    server_class = ThreadingHTTPServer
    if settings.host == "::1":
        class IPv6Server(ThreadingHTTPServer):
            """Permit an explicitly selected IPv6 loopback address."""

            address_family = socket.AF_INET6

        server_class = IPv6Server
    return server_class((settings.host, settings.port), Handler)


def main() -> None:
    """Fail closed on startup errors without printing sensitive config values."""
    try:
        settings = Settings.from_environment()
        from .model import SpeechModel

        model = SpeechModel(settings)
        server = create_server(settings, model)
    except Exception:
        print(
            "STT startup failed: check private configuration, dependencies and model cache",
            file=sys.stderr,
        )
        raise SystemExit(1) from None
    print("STT model ready; private HTTP service started", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
