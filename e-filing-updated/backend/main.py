from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import drafting

app = FastAPI(title="Live Compilation Engine Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(drafting.router, prefix="/drafting", tags=["Drafting"])

@app.get("/health")
def health_check():
    return {"status": "ok", "mode": "Live Compilation Engine"}
