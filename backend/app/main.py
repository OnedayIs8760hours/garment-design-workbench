import os
from datetime import UTC, datetime

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import router


app = FastAPI(title="SDS Design Backend", version="0.1.0")
cors_origins = [
  origin.strip()
  for origin in os.getenv(
    "CORS_ORIGINS",
    "http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:5000,http://localhost:5000",
  ).split(",")
  if origin.strip()
]
app.add_middleware(
  CORSMiddleware,
  allow_origins=cors_origins,
  allow_credentials=True,
  allow_methods=["*"],
  allow_headers=["*"],
)
app.include_router(router, prefix="/api")


@app.get("/api/health")
def health() -> dict[str, str]:
  return {
    "status": "ok",
    "service": "sds-design-backend",
    "time": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
  }
