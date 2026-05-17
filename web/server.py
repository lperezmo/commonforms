"""CommonForms web GUI - FastAPI backend.

Single-container, in-process job queue. One worker thread runs prepare_form
sequentially; the home use case is one user at a time.
"""

from __future__ import annotations

import os
import secrets
import shutil
import threading
import time
import traceback
import uuid
from collections import OrderedDict
from dataclasses import dataclass, field, asdict
from pathlib import Path
from queue import Queue
from typing import Any

from fastapi import FastAPI, Form, HTTPException, Request, UploadFile, File, Depends
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles

import pypdfium2

from commonforms import prepare_form
from commonforms.exceptions import EncryptedPdfError


WEB_DIR = Path(__file__).resolve().parent
STATIC_DIR = WEB_DIR / "static"
INDEX_HTML = WEB_DIR / "index.html"

DATA_DIR = Path(os.environ.get("CF_DATA_DIR", "/data"))
JOBS_DIR = DATA_DIR / "jobs"
JOBS_DIR.mkdir(parents=True, exist_ok=True)

MAX_UPLOAD_MB = int(os.environ.get("CF_MAX_UPLOAD_MB", "100"))
MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024
JOB_TTL_SECONDS = int(os.environ.get("CF_JOB_TTL_MINUTES", "60")) * 60
DEFAULT_DEVICE = os.environ.get("CF_DEVICE", "cpu")
AUTH_PASSWORD = os.environ.get("CF_AUTH_PASSWORD") or None
COOKIE_NAME = "cf_auth"


STAGES = ["queued", "loading", "rendering", "detecting", "writing", "done"]


@dataclass
class Job:
    id: str
    filename: str
    size: int
    options: dict
    status: str = "queued"      # queued | running | done | failed | expired
    stage: str = "queued"        # one of STAGES
    stage_index: int = 0
    progress: float = 0.0
    created: float = field(default_factory=time.time)
    started: float | None = None
    finished: float | None = None
    error: str | None = None
    pages: int | None = None
    field_counts: dict | None = None

    def public(self) -> dict:
        d = asdict(self)
        d["elapsed"] = (
            (self.finished or time.time()) - (self.started or self.created)
            if self.status != "queued"
            else 0
        )
        return d

    def dir(self) -> Path:
        return JOBS_DIR / self.id

    def input_path(self) -> Path:
        return self.dir() / "input.pdf"

    def output_path(self) -> Path:
        return self.dir() / "output.pdf"


class JobRegistry:
    def __init__(self) -> None:
        self._jobs: "OrderedDict[str, Job]" = OrderedDict()
        self._lock = threading.Lock()

    def add(self, job: Job) -> None:
        with self._lock:
            self._jobs[job.id] = job

    def get(self, job_id: str) -> Job | None:
        with self._lock:
            return self._jobs.get(job_id)

    def all(self) -> list[Job]:
        with self._lock:
            return list(self._jobs.values())

    def remove(self, job_id: str) -> Job | None:
        with self._lock:
            return self._jobs.pop(job_id, None)


registry = JobRegistry()
job_queue: "Queue[str]" = Queue()


def set_stage(job: Job, name: str) -> None:
    if name in STAGES:
        job.stage = name
        job.stage_index = STAGES.index(name)
        job.progress = job.stage_index / (len(STAGES) - 1)


def count_pages(pdf_path: Path) -> int:
    try:
        doc = pypdfium2.PdfDocument(str(pdf_path))
        try:
            return len(doc)
        finally:
            doc.close()
    except Exception:
        return 0


def run_job(job: Job) -> None:
    """Execute prepare_form for a single job. Runs in the worker thread."""
    job.status = "running"
    job.started = time.time()
    set_stage(job, "loading")

    opts = job.options
    try:
        # We bucket the pipeline into the stage names from the design.
        # prepare_form is synchronous so we can't get true mid-call progress;
        # instead we advance the stage in a small helper thread while the
        # blocking call runs. Good enough for UI feedback.
        stop_advance = threading.Event()

        def advance_stages() -> None:
            for nxt in ("rendering", "detecting", "writing"):
                if stop_advance.wait(2.0):
                    return
                if job.stage_index < STAGES.index(nxt):
                    set_stage(job, nxt)

        advance_thread = threading.Thread(target=advance_stages, daemon=True)
        advance_thread.start()

        try:
            prepare_form(
                str(job.input_path()),
                str(job.output_path()),
                model_or_path=opts.get("model", "FFDNet-L"),
                keep_existing_fields=bool(opts.get("keep_existing_fields", False)),
                use_signature_fields=bool(opts.get("use_signature_fields", False)),
                device=opts.get("device", DEFAULT_DEVICE),
                image_size=int(opts.get("image_size", 1600)),
                confidence=float(opts.get("confidence", 0.3)),
                fast=bool(opts.get("fast", False)),
                multiline=bool(opts.get("multiline", False)),
            )
        finally:
            stop_advance.set()

        job.pages = count_pages(job.output_path())
        job.field_counts = count_fields(job.output_path())
        set_stage(job, "done")
        job.status = "done"
    except EncryptedPdfError:
        job.status = "failed"
        job.error = "PDF is encrypted and cannot be processed."
    except Exception as e:
        job.status = "failed"
        job.error = f"{type(e).__name__}: {e}"
        traceback.print_exc()
    finally:
        job.finished = time.time()


def count_fields(pdf_path: Path) -> dict:
    """Count fields by detected type from the produced fillable PDF.

    inference.py names every widget `{widget_type.lower()}_{page}_{i}`, so
    the prefix preserves what was detected even when signatures get rendered
    as text boxes.
    """
    counts = {"text": 0, "checkbox": 0, "signature": 0}
    try:
        from pypdf import PdfReader

        reader = PdfReader(str(pdf_path))
        fields = reader.get_fields() or {}
        for name in fields.keys():
            n = name.lower()
            if n.startswith("signature_"):
                counts["signature"] += 1
            elif n.startswith("choicebutton"):
                counts["checkbox"] += 1
            else:
                counts["text"] += 1
    except Exception:
        pass
    return counts


def worker_loop() -> None:
    while True:
        job_id = job_queue.get()
        job = registry.get(job_id)
        if job is None:
            continue
        try:
            run_job(job)
        except Exception:
            traceback.print_exc()


def janitor_loop() -> None:
    while True:
        time.sleep(60)
        now = time.time()
        for job in list(registry.all()):
            age = now - (job.finished or job.created)
            if age > JOB_TTL_SECONDS:
                job.status = "expired"
                shutil.rmtree(job.dir(), ignore_errors=True)
                registry.remove(job.id)


# ─── auth ─────────────────────────────────────────────────────────────
def require_auth(request: Request) -> None:
    if not AUTH_PASSWORD:
        return
    cookie = request.cookies.get(COOKIE_NAME)
    if cookie and secrets.compare_digest(cookie, AUTH_PASSWORD):
        return
    raise HTTPException(status_code=401, detail="auth required")


# ─── app ──────────────────────────────────────────────────────────────
app = FastAPI(title="CommonForms Web", docs_url=None, redoc_url=None)


@app.on_event("startup")
def _start_workers() -> None:
    threading.Thread(target=worker_loop, daemon=True).start()
    threading.Thread(target=janitor_loop, daemon=True).start()


@app.get("/", response_class=HTMLResponse)
def index() -> HTMLResponse:
    return HTMLResponse(INDEX_HTML.read_text(encoding="utf-8"))


@app.get("/health")
def health() -> dict:
    return {"ok": True, "auth_required": bool(AUTH_PASSWORD)}


@app.get("/api/config")
def get_config() -> dict:
    return {
        "max_upload_mb": MAX_UPLOAD_MB,
        "ttl_minutes": JOB_TTL_SECONDS // 60,
        "device": DEFAULT_DEVICE,
        "auth_required": bool(AUTH_PASSWORD),
    }


@app.post("/api/login")
async def login(request: Request) -> Response:
    if not AUTH_PASSWORD:
        return JSONResponse({"ok": True})
    data = await request.json()
    password = (data or {}).get("password", "")
    if not secrets.compare_digest(password, AUTH_PASSWORD):
        raise HTTPException(status_code=401, detail="bad password")
    resp = JSONResponse({"ok": True})
    resp.set_cookie(
        COOKIE_NAME,
        AUTH_PASSWORD,
        max_age=60 * 60 * 24 * 30,
        httponly=True,
        samesite="lax",
    )
    return resp


@app.post("/api/jobs", dependencies=[Depends(require_auth)])
async def create_job(
    file: UploadFile = File(...),
    model: str = Form("FFDNet-L"),
    fast: bool = Form(False),
    confidence: float = Form(0.3),
    image_size: int = Form(1600),
    keep_existing_fields: bool = Form(False),
    use_signature_fields: bool = Form(False),
    multiline: bool = Form(False),
) -> dict:
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="only .pdf uploads accepted")

    job_id = uuid.uuid4().hex
    job = Job(
        id=job_id,
        filename=file.filename,
        size=0,
        options={
            "model": model,
            "fast": fast,
            "confidence": confidence,
            "image_size": image_size,
            "keep_existing_fields": keep_existing_fields,
            "use_signature_fields": use_signature_fields,
            "multiline": multiline,
            "device": DEFAULT_DEVICE,
        },
    )
    job.dir().mkdir(parents=True, exist_ok=True)

    written = 0
    with job.input_path().open("wb") as out:
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            written += len(chunk)
            if written > MAX_UPLOAD_BYTES:
                shutil.rmtree(job.dir(), ignore_errors=True)
                raise HTTPException(status_code=413, detail=f"file exceeds {MAX_UPLOAD_MB} MB")
            out.write(chunk)
    job.size = written

    registry.add(job)
    job_queue.put(job_id)
    return {"job_id": job_id}


@app.get("/api/jobs/{job_id}", dependencies=[Depends(require_auth)])
def job_status(job_id: str) -> dict:
    job = registry.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="no such job")
    return job.public()


@app.get("/api/jobs/{job_id}/output", dependencies=[Depends(require_auth)])
def job_output(job_id: str) -> FileResponse:
    job = registry.get(job_id)
    if job is None or job.status != "done":
        raise HTTPException(status_code=404, detail="output not ready")
    out = job.output_path()
    if not out.exists():
        raise HTTPException(status_code=404, detail="output missing")
    return FileResponse(
        path=str(out),
        media_type="application/pdf",
        filename=Path(job.filename).stem + ".fillable.pdf",
    )


@app.delete("/api/jobs/{job_id}", dependencies=[Depends(require_auth)])
def job_delete(job_id: str) -> dict:
    job = registry.remove(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="no such job")
    shutil.rmtree(job.dir(), ignore_errors=True)
    return {"ok": True}


if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
