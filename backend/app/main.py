from datetime import UTC, datetime

from fastapi import FastAPI

from app.api.router import router


app = FastAPI(title="SDS Design Backend", version="0.1.0")
app.include_router(router, prefix="/api")


@app.get("/api/health")
def health() -> dict[str, str]:
  return {
    "status": "ok",
    "service": "sds-design-backend",
    "time": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
  }
