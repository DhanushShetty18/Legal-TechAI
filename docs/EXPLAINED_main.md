# EXPLAINED: backend/main.py

> **One-line summary:** This is the front door of the entire application. It creates the FastAPI app, wires up all the routers, adds middleware, and defines a handful of core endpoints.

---

## What This File Does

`main.py` is the **entry point**. When you run `uvicorn main:app`, Python loads this file, and the `app` object here is the running web server. Everything else in the codebase exists to serve endpoints defined here or in routers registered here.

---

## Section-by-Section Walkthrough

### Imports (lines 1–12)

```python
from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Form, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import time
import logging
from sqlalchemy.orm import Session
from typing import List, Optional
import shutil, os, hashlib, sys

import crud, models, schemas
from database import SessionLocal, engine
```

**What each import does:**
- `FastAPI` — the main class. `app = FastAPI(...)` creates your web server.
- `Depends` — tells FastAPI "call this function and pass the result as an argument." Used for `get_db()` — every endpoint that needs the database gets a fresh session injected this way.
- `HTTPException` — how you send error responses: `raise HTTPException(status_code=404, detail="Not found")`.
- `UploadFile`, `File`, `Form` — tell FastAPI how to handle multipart form uploads.
- `Request` — gives you access to the raw HTTP request object (used in middleware).
- `CORSMiddleware` — allows the browser frontend to call this API (explained below).
- `hashlib` — used to compute SHA-256 fingerprint of uploaded documents.
- `crud`, `models`, `schemas` — your own files: database operations, table definitions, data shapes.
- `SessionLocal`, `engine` — the database connection factory and engine from `database.py`.

**Why these imports are at the top-level (not inside functions):** Python runs imports once when the module loads. This makes them fast. If you put `import hashlib` inside every function call, Python would look it up every time.

---

### Database Initialization (lines 14–17)

```python
models.Base.metadata.create_all(bind=engine)
```

**What this does:** On startup, SQLAlchemy looks at every class in `models.py` that inherits from `Base`, and for each one, creates the corresponding table in SQLite if it doesn't already exist. If the table already exists, it's left alone (no data is deleted).

**What breaks if removed:** The database tables would never be created. The first database query would crash with `sqlite3.OperationalError: no such table: users`.

**Why it's here and not in database.py:** `database.py` shouldn't know about `models.py` — that would be a circular import (database.py imports Base, models.py imports Base from database.py). So the table creation call goes in main.py, which imports both.

---

### App Creation (lines 20–27)

```python
app = FastAPI(
    title="Legal-TechAI API",
    description="...",
    version="0.1.0",
)
```

**What this does:** Creates the FastAPI application object. The `title`, `description`, and `version` appear automatically at `http://localhost:8000/docs` — the interactive Swagger documentation page that FastAPI generates for free.

**Why FastAPI instead of Flask:** FastAPI gives you automatic documentation, async support, and Pydantic validation built in. Flask doesn't.

---

### Router Registration (lines 29–42)

```python
from routers import demo, ai, rag, inconsistency, ingest, summarizer, ocr_extract
import ingestion

app.include_router(demo.router)
app.include_router(ai.router)
app.include_router(ingestion.router)
app.include_router(rag.router)
app.include_router(inconsistency.router, prefix="/inconsistency")
app.include_router(ingest.router)
app.include_router(summarizer.router)
app.include_router(ocr_extract.router, prefix="/ocr-extract")
```

**What this does:** Each router is a group of related endpoints defined in a separate file. `include_router()` adds all of a router's endpoints to the app. The `prefix` argument prepends a path segment — so `inconsistency.router`'s endpoint `/detect-inconsistencies` becomes `/inconsistency/detect-inconsistencies`.

**What breaks if you remove a router:** All endpoints in that router return 404. The app still starts — there's no crash from removing a router.

**Why split into routers?** If everything was in main.py, it would be thousands of lines. Routers let you reason about one feature at a time.

---

### CORS Middleware (lines 44–52)

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

**What CORS is:** Browsers enforce a security rule called Same-Origin Policy — JavaScript on `legaltechai.in` is not allowed to call `api.legaltechai.in` unless the API explicitly grants permission. CORS (Cross-Origin Resource Sharing) is the mechanism for granting that permission.

**What this middleware does:** It adds HTTP headers like `Access-Control-Allow-Origin: *` to every response, telling the browser "this API allows calls from any origin."

**`allow_origins=["*"]` is dangerous in production** because it means ANYONE's website can call your API. In production, change this to your actual frontend domain: `allow_origins=["https://legaltechai.in"]`.

**What breaks if removed:** The frontend JavaScript gets a CORS error and the API call fails silently. The backend works fine when called from Postman or curl — CORS only affects browsers.

---

### Request Logging Middleware (lines 54–60)

```python
@app.middleware("http")
async def log_requests(request: Request, call_next):
    start_time = time.time()
    response = await call_next(request)
    process_time = time.time() - start_time
    logger.info(f"[...] {request.method} {request.url.path} - {process_time:.4f}s")
    return response
```

**What this does:** Wraps every HTTP request. `call_next(request)` runs the actual endpoint. The middleware measures how long it took and logs it.

**Why async:** FastAPI is async — the server can handle multiple requests simultaneously. `await call_next(request)` means "wait for the response, but let other requests run while waiting."

**`async def` vs `def`:** Regular `def` blocks the entire server while running. `async def` lets the server do other work while waiting for I/O (database queries, API calls). All middleware and any endpoint that calls an external API should be `async`.

---

### Global Exception Handler (lines 62–69)

```python
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    if isinstance(exc, HTTPException):
        raise exc
    return JSONResponse(
        status_code=500,
        content={"success": False, "data": None, "error": str(exc)}
    )
```

**What this does:** Catches any exception that wasn't caught by an endpoint's own `try/except`. Instead of the server returning an ugly HTML error page, it returns a clean JSON response.

**The `HTTPException` check is critical:** `HTTPException` is FastAPI's own mechanism for returning specific error codes (404, 400, etc.). If you catch and re-wrap it here, you'd accidentally convert a 404 into a 500. Re-raising it lets FastAPI handle it normally.

---

### `get_db()` Dependency (lines 72–77)

```python
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

**What this does:** Creates a database session, gives it to the endpoint function, and guarantees it's closed when the endpoint finishes — even if the endpoint raises an exception. The `yield` makes this a Python generator, which is how FastAPI's dependency injection works.

**How it's used:**
```python
def my_endpoint(db: Session = Depends(get_db)):
    # db is a live SQLAlchemy session
    users = db.query(models.User).all()
```

**What breaks if you forget `db.close()`:** Database connections accumulate. SQLite handles this tolerably, but a production PostgreSQL database would run out of connection slots.

---

### Core Endpoints (lines 79–end)

```python
@app.get("/")          # Health check
@app.get("/health")    # Version info
@app.post("/users/")   # Create a user
@app.post("/users/{user_id}/verify")   # Identity verification
@app.get("/cases/search")              # Search by case number
@app.get("/cases/{case_id}/summary")   # AI summary of a case
@app.post("/cases/")   # Create a case
@app.get("/cases/")    # List cases
@app.post("/documents/")  # Upload a document with hash
```

**Notable: `@app.get("/cases/search")` must appear BEFORE `@app.get("/cases/{case_id}/summary")`**

FastAPI matches routes in order. If `{case_id}` was first, the path `/cases/search` would match `{case_id}="search"` instead of the search endpoint. Order matters.

**The document upload endpoint (`/documents/`) computes SHA-256:**
```python
sha256_hash = hashlib.sha256()
content = file.file.read()
sha256_hash.update(content)
file_hash = sha256_hash.hexdigest()
```
This fingerprint is stored in the database. Later, you can recompute the hash and compare — if the hashes differ, the file was tampered with after upload.

---

## What Breaks If This File Is Removed

Everything. `main.py` is the entry point. Without it, there is no server.

---

## Two Exercises

**Exercise 1:** Add a new endpoint `GET /version` that returns `{"version": "0.1.0", "model": "gemini-2.5-flash"}`. Use what you learned about `@app.get()` decorators. Don't put it in a router — put it directly in main.py.

**Exercise 2:** The CORS middleware currently uses `allow_origins=["*"]`. Change it to only allow requests from `https://legaltechai.in` and `http://localhost:3000`. Test by opening the `/docs` page and making a request — it should still work because `/docs` is same-origin.
