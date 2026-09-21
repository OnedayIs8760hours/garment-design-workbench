from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_health_returns_service_status():
  response = client.get("/api/health")

  assert response.status_code == 200
  payload = response.json()
  assert payload["status"] == "ok"
  assert payload["service"] == "sds-design-backend"
  assert "time" in payload
