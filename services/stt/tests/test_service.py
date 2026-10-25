"""Pure contract tests: no real model, network service, or private recording."""

import http.client
import json
import threading
import unittest
from dataclasses import dataclass
from typing import Any
from unittest.mock import patch

from pydantic import SecretStr, ValidationError

from ryadom_stt.core import (
    MAX_AUDIO_BYTES,
    AudioTooLong,
    InvalidAudio,
    Settings,
    Transcript,
    join_segments,
)
from ryadom_stt.heavy_lock import HeavyOperationBusy
from ryadom_stt.server import create_server


@dataclass
class FakeSegment:
    """Synthetic faster-whisper segment shape."""

    start: float
    end: float
    text: str


class FakeModel:
    """Keep the fake strictly within test code."""

    def __init__(self) -> None:
        self.calls = 0
        self.failure: Exception | None = None

    def transcribe(self, audio: bytes) -> Transcript:
        """Return a synthetic transcript only when called by tests."""
        self.calls += 1
        if self.failure:
            raise self.failure
        return join_segments([FakeSegment(0.2, 1.4, " Проверка 😀 ")])


class TranscriptTests(unittest.TestCase):
    """Verify exact text slicing and real timestamp conversion."""

    def test_utf16_offsets_match_joined_transcript(self) -> None:
        result = join_segments([
            FakeSegment(0.125, 0.999, " Привет 😀 "),
            FakeSegment(1.0, 1.1, "  "),
            FakeSegment(1.25, 2.5, "мир!"),
        ])
        self.assertEqual(result.text, "Привет 😀 мир!")
        self.assertEqual(result.model_dump()["segments"], [
            {"startMs": 125, "endMs": 999, "textStart": 0, "textEnd": 9},
            {"startMs": 1250, "endMs": 2500, "textStart": 10, "textEnd": 14},
        ])
        encoded = result.text.encode("utf-16-le")
        for segment, expected in zip(result.segments, ["Привет 😀", "мир!"], strict=True):
            sliced = encoded[segment.textStart * 2:segment.textEnd * 2].decode("utf-16-le")
            self.assertEqual(sliced, expected)

    def test_empty_segments_are_a_real_empty_result(self) -> None:
        self.assertEqual(join_segments([]).model_dump(), {"text": "", "segments": []})

    def test_invalid_timestamps_are_rejected(self) -> None:
        for start, end in [(float("nan"), 1), (0, float("inf")), (-1, 1), (2, 1)]:
            with self.subTest(start=start, end=end), self.assertRaises(ValueError):
                join_segments([FakeSegment(start, end, "text")])

    def test_zero_or_rounded_zero_duration_rejected(self) -> None:
        for start, end in [(1.0, 1.0), (1.0001, 1.0004)]:
            with self.subTest(start=start, end=end), self.assertRaises(ValueError):
                join_segments([FakeSegment(start, end, "text")])

    def test_no_partial_response_after_lazy_model_error(self) -> None:
        def failing_segments() -> Any:
            yield FakeSegment(0, 1, "partial")
            raise RuntimeError("synthetic model failure")

        with self.assertRaises(RuntimeError):
            join_segments(failing_segments())

    def test_network_bind_requires_private_token(self) -> None:
        with self.assertRaises(ValidationError):
            Settings(host="0.0.0.0")
        with self.assertRaises(ValidationError):
            Settings(auth_token=SecretStr("  "))
        self.assertEqual(Settings().host, "127.0.0.1")


class HttpTests(unittest.TestCase):
    """Exercise real loopback HTTP with only a test-owned transcriber."""

    def setUp(self) -> None:
        self.model = FakeModel()
        self.server = create_server(Settings(port=0, auth_token=SecretStr("test-only")), self.model)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self) -> None:
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)

    def request(
        self, method: str = "POST", path: str = "/transcribe", body: bytes = b"synthetic",
        headers: dict[str, str] | None = None,
    ) -> tuple[int, dict[str, Any]]:
        """Send one request without automatically adding a Content-Length."""
        connection = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=2)
        connection.putrequest(method, path)
        for key, value in (headers if headers is not None else {
            "Content-Type": "audio/wav", "Content-Length": str(len(body)),
            "Authorization": "Bearer test-only",
        }).items():
            connection.putheader(key, value)
        connection.endheaders(body)
        response = connection.getresponse()
        result = response.status, json.loads(response.read())
        connection.close()
        return result

    def test_health_and_transcription_contract(self) -> None:
        status, health = self.request("GET", "/health", body=b"", headers={})
        self.assertEqual(status, 200)
        self.assertEqual(health, {"ready": True, "model": "base", "language": "ru"})
        status, result = self.request()
        self.assertEqual(status, 200)
        self.assertEqual(result["text"], "Проверка 😀")
        self.assertEqual(result["segments"][0]["textEnd"], 11)

    def test_auth_before_body_or_model(self) -> None:
        status, result = self.request(headers={})
        self.assertEqual((status, result), (401, {"error": "unauthorized"}))
        self.assertEqual(self.model.calls, 0)

    def test_size_mime_length_and_transfer_validation(self) -> None:
        cases = [
            ({"Content-Type": "text/plain", "Content-Length": "9"}, 415),
            ({"Content-Type": "audio/wav"}, 411),
            ({"Content-Type": "audio/wav", "Content-Length": "-1"}, 400),
            ({"Content-Type": "audio/wav", "Content-Length": str(MAX_AUDIO_BYTES + 1)}, 413),
            ({"Content-Type": "audio/wav", "Content-Length": "0"}, 400),
            ({"Content-Type": "audio/wav", "Transfer-Encoding": "chunked"}, 400),
        ]
        for headers, expected in cases:
            with self.subTest(headers=headers):
                headers["Authorization"] = "Bearer test-only"
                status, _ = self.request(body=b"", headers=headers)
                self.assertEqual(status, expected)
        self.assertEqual(self.model.calls, 0)

    def test_all_accepted_content_types(self) -> None:
        for mime in ["audio/wav", "audio/mpeg", "audio/mp4", "audio/webm;codecs=opus"]:
            with self.subTest(mime=mime):
                status, _ = self.request(headers={
                    "Authorization": "Bearer test-only", "Content-Type": mime,
                    "Content-Length": "9",
                })
                self.assertEqual(status, 200)

    def test_model_errors_are_redacted(self) -> None:
        for failure, status, code in [
            (InvalidAudio("private diagnostic"), 422, "invalid_audio"),
            (AudioTooLong("private diagnostic"), 413, "audio_too_long"),
            (RuntimeError("private diagnostic"), 502, "transcription_failed"),
        ]:
            with self.subTest(status=status):
                self.model.failure = failure
                self.assertEqual(self.request(), (status, {"error": code}))

    def test_shared_heavy_operation_returns_busy_without_model_call(self) -> None:
        with patch("ryadom_stt.server.acquire_heavy_lock", side_effect=HeavyOperationBusy):
            self.assertEqual(self.request(), (503, {"error": "stt_busy"}))
        self.assertEqual(self.model.calls, 0)
        self.assertEqual(self.request()[0], 200)

    def test_concurrent_inference_rejected_but_health_available(self) -> None:
        entered, release = threading.Event(), threading.Event()

        class BlockingModel:
            """Hold one synthetic inference until the test releases it."""

            def transcribe(self, audio: bytes) -> Transcript:
                entered.set()
                release.wait(timeout=3)
                return Transcript(text="", segments=[])

        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)
        self.server = create_server(Settings(port=0), BlockingModel())
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        first_result: list[tuple[int, dict[str, Any]]] = []
        first = threading.Thread(target=lambda: first_result.append(self.request()))
        first.start()
        try:
            self.assertTrue(entered.wait(timeout=2))
            self.assertEqual(self.request(), (503, {"error": "stt_busy"}))
            self.assertEqual(self.request("GET", "/health", b"", {})[0], 200)
        finally:
            release.set()
            first.join(timeout=3)
        self.assertEqual(first_result[0][0], 200)


if __name__ == "__main__":
    unittest.main()
