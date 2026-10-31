from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.world_compiler import WORLDS_DIR
from app.worlds_router import router as worlds_router

app = FastAPI(title="Orbit Worldbuilder", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/healthz", tags=["ops"])
async def healthz():
    return {"status": "ok"}


app.include_router(worlds_router)

# Serve world assets (GLBs, roads JSON, manifest) as static files.
# This mount must come after route definitions so POST /worlds is not shadowed.
WORLDS_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/worlds", StaticFiles(directory=str(WORLDS_DIR)), name="worlds-static")
