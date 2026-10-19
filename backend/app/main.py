import json
import re
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from PIL import Image, UnidentifiedImageError

from app.model import predict_image


# Paths and configuration
BASE_DIR = Path(__file__).resolve().parents[2]
UPLOAD_DIR = BASE_DIR / "backend" / "uploads"
DB_PATH = BASE_DIR / "backend" / "visionai.db"

UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH.parent.mkdir(parents=True, exist_ok=True)

MAX_UPLOAD_BYTES = 10 * 1024 * 1024
ALLOWED_FORMATS = {"JPEG": ".jpg", "PNG": ".png", "WEBP": ".webp"}

app = FastAPI(
    title="VisionAI API",
    description="Image classification with a fine-tuned ResNet-50 model.",
    version="1.3.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://visionai-frontend-ybxa.onrender.com",
    ],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Uploaded images are intentionally served as static files for this local demo.
app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")


# Database
def get_connection():
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def init_db():
    with get_connection() as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS predictions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                filename TEXT NOT NULL,
                predicted_class TEXT NOT NULL,
                confidence REAL NOT NULL,
                confidence_percent REAL NOT NULL,
                inference_ms REAL,
                device TEXT,
                created_at TEXT NOT NULL,
                top5 TEXT NOT NULL DEFAULT '[]',
                image_url TEXT
            )
            """
        )

        # Migrate databases created by earlier versions.
        columns = {
            row["name"]
            for row in connection.execute("PRAGMA table_info(predictions)").fetchall()
        }
        migrations = {
            "top5": "ALTER TABLE predictions ADD COLUMN top5 TEXT NOT NULL DEFAULT '[]'",
            "image_url": "ALTER TABLE predictions ADD COLUMN image_url TEXT",
        }
        for column, statement in migrations.items():
            if column not in columns:
                connection.execute(statement)


init_db()


# Helpers
def serialize_prediction(row):
    item = dict(row)
    try:
        item["top5"] = json.loads(item.get("top5") or "[]")
    except (json.JSONDecodeError, TypeError):
        item["top5"] = []
    return item


def safe_filename(original_name):
    """Return a safe display filename without using it as a disk path."""
    name = Path(original_name or "image").name
    name = re.sub(r"[^A-Za-z0-9._ -]", "_", name)
    return name[:200] or "image"


async def read_and_validate_image(file: UploadFile):
    content = await file.read(MAX_UPLOAD_BYTES + 1)
    if not content:
        raise HTTPException(status_code=400, detail="The uploaded file is empty.")
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Image exceeds the 10 MB upload limit.")

    try:
        from io import BytesIO

        # Verify that the content is a real supported image.
        with Image.open(BytesIO(content)) as check:
            image_format = check.format
            check.verify()

        if image_format not in ALLOWED_FORMATS:
            raise HTTPException(
                status_code=415,
                detail="Unsupported image format. Upload JPG, PNG, or WEBP.",
            )

        with Image.open(BytesIO(content)) as source:
            image = source.convert("RGB")
        return content, image, ALLOWED_FORMATS[image_format]

    except HTTPException:
        raise
    except (UnidentifiedImageError, OSError, ValueError):
        raise HTTPException(
            status_code=400,
            detail="The uploaded file is not a valid image.",
        )


# Routes
@app.get("/")
def root():
    return {
        "message": "VisionAI API is running",
        "version": app.version,
        "docs": "/docs",
    }


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/predict")
async def create_prediction(file: UploadFile = File(...)):
    content, image, extension = await read_and_validate_image(file)

    # Use a random disk filename to avoid collisions and path traversal.
    stored_name = f"{uuid.uuid4().hex}{extension}"
    stored_path = UPLOAD_DIR / stored_name
    image_url = f"/uploads/{stored_name}"
    display_name = safe_filename(file.filename)

    try:
        # Run the model before saving the permanent record.
        result = predict_image(image)
        predicted_class = str(result["predicted_class"])
        confidence = float(result["confidence"])
        confidence_percent = float(result["confidence_percent"])
        inference_ms = result.get("inference_ms")
        device = result.get("device")
        top5 = result.get("top5", [])
        if not isinstance(top5, list):
            top5 = []

        created_at = datetime.now(timezone.utc).isoformat()
        # Store the original image bytes on disk.
        stored_path.write_bytes(content)

        with get_connection() as connection:
            cursor = connection.execute(
                """
                INSERT INTO predictions (
                    filename, predicted_class, confidence, confidence_percent,
                    inference_ms, device, created_at, top5, image_url
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    display_name,
                    predicted_class,
                    confidence,
                    confidence_percent,
                    inference_ms,
                    device,
                    created_at,
                    json.dumps(top5),
                    image_url,
                ),
            )
            prediction_id = cursor.lastrowid

        return {
            "id": prediction_id,
            "filename": display_name,
            "predicted_class": predicted_class,
            "confidence": confidence,
            "confidence_percent": confidence_percent,
            "inference_ms": inference_ms,
            "device": device,
            "created_at": created_at,
            "top5": top5,
            "image_url": image_url,
        }

    except HTTPException:
        if stored_path.exists():
            stored_path.unlink()
        raise
    except Exception as exc:
        if stored_path.exists():
            stored_path.unlink()
        raise HTTPException(
            status_code=500,
            detail=f"Prediction failed: {str(exc)}",
        ) from exc


@app.get("/history")
def get_history(limit: int = 10):
    limit = max(1, min(limit, 100))
    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT id, filename, predicted_class, confidence,
                   confidence_percent, inference_ms, device,
                   created_at, top5, image_url
            FROM predictions
            ORDER BY id DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
    return [serialize_prediction(row) for row in rows]


@app.delete("/history/{prediction_id}")
def delete_prediction(prediction_id: int):
    with get_connection() as connection:
        row = connection.execute(
            "SELECT image_url FROM predictions WHERE id = ?",
            (prediction_id,),
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Prediction not found.")
        connection.execute("DELETE FROM predictions WHERE id = ?", (prediction_id,))

    # Delete only files stored inside our uploads directory.
    image_url = row["image_url"]
    if image_url and image_url.startswith("/uploads/"):
        stored_name = image_url.removeprefix("/uploads/")
        candidate = (UPLOAD_DIR / stored_name).resolve()
        if candidate.parent == UPLOAD_DIR.resolve() and candidate.is_file():
            candidate.unlink()

    return {"message": "Prediction deleted", "id": prediction_id}


@app.delete("/history")
def clear_history():
    with get_connection() as connection:
        connection.execute("DELETE FROM predictions")

    # Remove saved images as well as database history.
    for path in UPLOAD_DIR.iterdir():
        if path.is_file():
            path.unlink()
    return {"message": "Prediction history cleared"}
