"""
Lightweight FastAPI OCR home service (Tesseract CPU).
"""
from __future__ import annotations

import logging
import os
import secrets
from typing import Optional

from fastapi import Depends, FastAPI, File, Header, HTTPException, UploadFile
from fastapi.responses import JSONResponse

from src.ocr import extract_card_title, extract_raw_text, is_ocr_available

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ocr_service")

OCR_API_TOKEN = os.getenv("OCR_API_TOKEN", "").strip()

app = FastAPI(title="OCR Home", version="0.1.0")


async def require_token(x_ocr_token: Optional[str] = Header(default=None, alias="X-OCR-Token")) -> None:
    if not OCR_API_TOKEN:
        return
    if not x_ocr_token or not secrets.compare_digest(x_ocr_token, OCR_API_TOKEN):
        raise HTTPException(status_code=401, detail="Invalid or missing X-OCR-Token")


@app.get("/health")
async def health() -> JSONResponse:
    return JSONResponse(
        {
            "status": "ok",
            "tesseract": is_ocr_available(),
            "auth_required": bool(OCR_API_TOKEN),
        }
    )


@app.post("/ocr", dependencies=[Depends(require_token)])
async def ocr_raw(file: UploadFile = File(...)) -> JSONResponse:
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty image")
    try:
        text = extract_raw_text(data)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("OCR failed")
        raise HTTPException(status_code=500, detail=f"OCR failed: {exc}") from exc
    return JSONResponse({"text": text})


@app.post("/ocr/card-title", dependencies=[Depends(require_token)])
async def ocr_card_title(file: UploadFile = File(...)) -> JSONResponse:
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty image")
    try:
        title = extract_card_title(data)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Card-title OCR failed")
        raise HTTPException(status_code=500, detail=f"OCR failed: {exc}") from exc
    return JSONResponse({"title": title})
