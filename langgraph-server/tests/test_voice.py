"""Tests for voice transcription endpoints.

Test coverage:
- POST /voice/transcribe/{check_in_id} endpoint
- GET /voice/status/{check_in_id} endpoint
- Background transcription processing
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi.testclient import TestClient

# Import the app - adjust path as needed
import sys
from pathlib import Path

# Add both the parent and fastapi-server to path
parent_dir = Path(__file__).parent.parent
sys.path.insert(0, str(parent_dir))
sys.path.insert(0, str(parent_dir / "fastapi-server"))

from main import app


@pytest.fixture
def client():
    """Create test client."""
    return TestClient(app)


@pytest.fixture
def mock_supabase_client():
    """Mock Supabase client for voice endpoints."""
    with patch("routers.voice.get_supabase_client") as mock:
        mock_client = MagicMock()
        mock.return_value = mock_client
        yield mock_client


@pytest.fixture
def mock_elevenlabs():
    """Mock ElevenLabs transcription service."""
    with patch("routers.voice.is_elevenlabs_configured") as mock_config:
        mock_config.return_value = True
        with patch("routers.voice.transcribe_audio") as mock_transcribe:
            mock_transcribe.return_value = "Test transcript"
            yield mock_transcribe


class TestTriggerTranscription:
    """Tests for POST /voice/transcribe/{check_in_id} endpoint."""

    def test_transcribe_requires_auth(self, client):
        """Should return 401 without authentication."""
        response = client.post("/voice/transcribe/test-check-in-id")
        assert response.status_code == 401

    def test_transcribe_returns_503_when_elevenlabs_not_configured(
        self, client, mock_supabase_client
    ):
        """Should return 503 when ElevenLabs is not configured."""
        with patch(
            "routers.voice.is_elevenlabs_configured", return_value=False
        ):
            response = client.post(
                "/voice/transcribe/test-check-in-id",
                headers={"X-User-Id": "test-user-id"},
            )

        assert response.status_code == 503
        data = response.json()
        assert data["detail"]["error"]["code"] == "SERVICE_UNAVAILABLE"

    def test_transcribe_returns_404_when_check_in_not_found(
        self, client, mock_supabase_client, mock_elevenlabs
    ):
        """Should return 404 when check-in doesn't exist."""
        # Mock table query that raises "No rows" error
        mock_table = MagicMock()
        mock_table.select.return_value.eq.return_value.single.return_value.execute.side_effect = (
            Exception("No rows found PGRST116")
        )
        mock_supabase_client.table.return_value = mock_table

        response = client.post(
            "/voice/transcribe/test-check-in-id",
            headers={"X-User-Id": "test-user-id"},
        )

        assert response.status_code == 404
        data = response.json()
        assert data["detail"]["error"]["code"] == "NOT_FOUND"

    def test_transcribe_returns_404_when_user_doesnt_own_check_in(
        self, client, mock_supabase_client, mock_elevenlabs
    ):
        """Should return 404 when user doesn't own the check-in."""
        mock_response = MagicMock()
        mock_response.data = {
            "id": "test-check-in-id",
            "user_id": "different-user-id",  # Different user
            "status": "processing",
        }
        mock_table = MagicMock()
        mock_table.select.return_value.eq.return_value.single.return_value.execute.return_value = (
            mock_response
        )
        mock_supabase_client.table.return_value = mock_table

        response = client.post(
            "/voice/transcribe/test-check-in-id",
            headers={"X-User-Id": "test-user-id"},
        )

        assert response.status_code == 404
        data = response.json()
        assert data["detail"]["error"]["code"] == "NOT_FOUND"

    def test_transcribe_returns_400_when_status_not_processing(
        self, client, mock_supabase_client, mock_elevenlabs
    ):
        """Should return 400 when check-in status is not 'processing'."""
        mock_response = MagicMock()
        mock_response.data = {
            "id": "test-check-in-id",
            "user_id": "test-user-id",
            "status": "completed",  # Already processed
        }
        mock_table = MagicMock()
        mock_table.select.return_value.eq.return_value.single.return_value.execute.return_value = (
            mock_response
        )
        mock_supabase_client.table.return_value = mock_table

        response = client.post(
            "/voice/transcribe/test-check-in-id",
            headers={"X-User-Id": "test-user-id"},
        )

        assert response.status_code == 400
        data = response.json()
        assert data["detail"]["error"]["code"] == "INVALID_STATUS"

    def test_transcribe_queues_background_task(
        self, client, mock_supabase_client, mock_elevenlabs
    ):
        """Should queue background task and return queued status."""
        mock_response = MagicMock()
        mock_response.data = {
            "id": "test-check-in-id",
            "user_id": "test-user-id",
            "status": "processing",
        }
        mock_table = MagicMock()
        mock_table.select.return_value.eq.return_value.single.return_value.execute.return_value = (
            mock_response
        )
        mock_supabase_client.table.return_value = mock_table

        response = client.post(
            "/voice/transcribe/test-check-in-id",
            headers={"X-User-Id": "test-user-id"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "queued"
        assert data["check_in_id"] == "test-check-in-id"


class TestGetCheckInStatus:
    """Tests for GET /voice/status/{check_in_id} endpoint."""

    def test_status_requires_auth(self, client):
        """Should return 401 without authentication."""
        response = client.get("/voice/status/test-check-in-id")
        assert response.status_code == 401

    def test_status_returns_404_when_not_found(self, client, mock_supabase_client):
        """Should return 404 when check-in doesn't exist."""
        mock_table = MagicMock()
        mock_table.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.side_effect = Exception(
            "No rows found PGRST116"
        )
        mock_supabase_client.table.return_value = mock_table

        response = client.get(
            "/voice/status/test-check-in-id",
            headers={"X-User-Id": "test-user-id"},
        )

        assert response.status_code == 404

    def test_status_returns_check_in_data(self, client, mock_supabase_client):
        """Should return check-in status data."""
        mock_response = MagicMock()
        mock_response.data = {
            "id": "test-check-in-id",
            "status": "completed",
            "transcript": "Hello, this is a test transcript.",
            "error_message": None,
            "created_at": "2025-01-01T00:00:00Z",
            "updated_at": "2025-01-01T00:01:00Z",
        }
        mock_table = MagicMock()
        mock_table.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value = (
            mock_response
        )
        mock_supabase_client.table.return_value = mock_table

        response = client.get(
            "/voice/status/test-check-in-id",
            headers={"X-User-Id": "test-user-id"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == "test-check-in-id"
        assert data["status"] == "completed"
        assert data["transcript"] == "Hello, this is a test transcript."

    def test_status_returns_transcribing_state(self, client, mock_supabase_client):
        """Should return transcribing status when in progress."""
        mock_response = MagicMock()
        mock_response.data = {
            "id": "test-check-in-id",
            "status": "transcribing",
            "transcript": None,
            "error_message": None,
            "created_at": "2025-01-01T00:00:00Z",
            "updated_at": "2025-01-01T00:00:30Z",
        }
        mock_table = MagicMock()
        mock_table.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value = (
            mock_response
        )
        mock_supabase_client.table.return_value = mock_table

        response = client.get(
            "/voice/status/test-check-in-id",
            headers={"X-User-Id": "test-user-id"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "transcribing"
        assert data["transcript"] is None

    def test_status_returns_failed_with_error(self, client, mock_supabase_client):
        """Should return failed status with error message."""
        mock_response = MagicMock()
        mock_response.data = {
            "id": "test-check-in-id",
            "status": "failed",
            "transcript": None,
            "error_message": "Transcription failed: Audio too short",
            "created_at": "2025-01-01T00:00:00Z",
            "updated_at": "2025-01-01T00:00:30Z",
        }
        mock_table = MagicMock()
        mock_table.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value = (
            mock_response
        )
        mock_supabase_client.table.return_value = mock_table

        response = client.get(
            "/voice/status/test-check-in-id",
            headers={"X-User-Id": "test-user-id"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "failed"
        assert data["error_message"] == "Transcription failed: Audio too short"


class TestElevenLabsService:
    """Tests for ElevenLabs transcription service."""

    def test_is_elevenlabs_configured_returns_false_when_key_missing(self):
        """Should return False when API key is not set."""
        with patch(
            "src.services.elevenlabs.ELEVENLABS_API_KEY", ""
        ):
            # Re-import to get fresh function with patched constant
            from importlib import reload
            import src.services.elevenlabs as elevenlabs_module
            reload(elevenlabs_module)
            assert elevenlabs_module.is_elevenlabs_configured() is False

    def test_exception_classes_exist(self):
        """Should have proper exception classes defined."""
        from src.services.elevenlabs import TranscriptionError, AudioDownloadError

        # Verify they are proper exception classes
        assert issubclass(TranscriptionError, Exception)
        assert issubclass(AudioDownloadError, Exception)

    def test_transcribe_functions_exist(self):
        """Should export transcribe functions."""
        from src.services.elevenlabs import transcribe_audio, transcribe_audio_bytes

        # Verify functions are callable
        assert callable(transcribe_audio)
        assert callable(transcribe_audio_bytes)
