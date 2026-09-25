"""
Tesseract OCR helpers for generic text and MTG card titles.
"""
from __future__ import annotations

import io
import logging
import re
import shutil
from typing import Optional, Union

from PIL import Image, ImageEnhance, ImageOps

logger = logging.getLogger("ocr_service")

# Trailing mana / OCR junk: digits, braces, WUBRG, and common misreads like "4e" / "42)".
_CLEAN_MANA_RE = re.compile(r"[\s\d\{\}\(\)\[\]WUBRGXwubrgxeXE/_,\.:;\-|\\©]+$")
_LEADING_NOISE_RE = re.compile(r"^[^\w]+")
_UI_CHROME_RE = re.compile(
    r"^(?:\d{1,2}:\d{2}|inicio|buscar|colecci[oó]n|mazos|escanear|trend|commander\s+\d|"
    r"sin etiquetas|final fantasy|en venta|hago precio|interesados|bracket\s+\d|"
    r"~.*|\+?\d[\d\s]{6,})",
    re.IGNORECASE,
)
_SKIP_LINE_RE = re.compile(
    r"^(double strike|legendary|creature|instant|sorcery|enchantment|artifact|land|"
    r"blitz|you may|r\s+\d|fic\s|™|control|reanimator|sultai|graveyard|"
    r"ping\s*\+?\s*sacrifice)",
    re.IGNORECASE,
)
_RULES_TEXT_RE = re.compile(
    r"\b(you may|cast this|discard|gains?|dies?|draw a card|graveyard|end step|"
    r"haste|sacrifice|creature|from your|ability|when this)\b",
    re.IGNORECASE,
)
_TITLE_HINT_RE = re.compile(r"[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]{3,}")
_LISTING_HINT_RE = re.compile(
    r"(en venta|hago precio|interesados|mazos?\s*:|bracket\s+\d|por privado|"
    r"precio por cantidad)",
    re.IGNORECASE,
)
# Garbage like "ae 4 Cope *" or leftover WhatsApp chrome ("Carlos Santana +").
_JUNK_TITLE_RE = re.compile(
    r"[\*\+\|#@~]|^\d+\s|\s\d+\s|\b[a-z]{1,2}\s+\d|\d\s+[A-Za-z]{1,4}\b"
)
_MIN_TITLE_SCORE = 1
_MULTI_CARD_CANDIDATE_THRESHOLD = 3


def is_ocr_available() -> bool:
    return shutil.which("tesseract") is not None


def _normalize_line(line: str) -> str:
    cleaned = _CLEAN_MANA_RE.sub("", line).strip()
    cleaned = _LEADING_NOISE_RE.sub("", cleaned).strip()
    cleaned = re.sub(r"\s+[0-9]+[A-Za-z]?$", "", cleaned).strip()
    cleaned = cleaned.rstrip("©").strip()
    return cleaned


def _strip_stray_prefix(cand: str) -> str:
    # OCR sometimes prefixes a stray letter before a comma-name (e.g. "A Sabin, Master Monk").
    stray = re.match(r"^[A-Za-z0-9]\s+(.+,.+)$", cand)
    if stray:
        return stray.group(1).strip()
    return cand


def collect_title_candidates(text: str) -> list[str]:
    """Collect normalized title-like lines from OCR output (no ranking)."""
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    candidates: list[str] = []
    seen: set[str] = set()
    for line in lines:
        if _UI_CHROME_RE.match(line):
            continue
        if not _TITLE_HINT_RE.search(line):
            continue
        if _SKIP_LINE_RE.match(line):
            continue
        if "©" in line and len(line) < 24:
            continue

        qty = re.match(r"^(\d+)x\s+(.+)$", line, re.IGNORECASE)
        raw = qty.group(2) if qty else line
        cand = _strip_stray_prefix(_normalize_line(raw))
        if not cand or len(cand) < 2 or _UI_CHROME_RE.match(cand):
            continue
        key = cand.casefold()
        if key in seen:
            continue
        seen.add(key)
        candidates.append(cand)
    return candidates


def is_plausible_card_title(title: str) -> bool:
    """
    True when a string looks like a single MTG card name, not OCR noise,
    sale captions, rules text, or WhatsApp chrome.
    """
    if not title or len(title) < 3 or len(title) > 48:
        return False
    if _UI_CHROME_RE.match(title) or _LISTING_HINT_RE.search(title):
        return False
    if _JUNK_TITLE_RE.search(title) or _RULES_TEXT_RE.search(title):
        return False
    if not _TITLE_HINT_RE.search(title):
        return False

    words = title.split()
    if not words or len(words) > 7:
        return False

    # Card names are Title Case-ish; long lowercase runs are usually rules OCR.
    lower_runs = sum(1 for w in words if len(w) >= 4 and w.islower())
    if lower_runs >= 2:
        return False

    alpha_words = [w for w in words if re.search(r"[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]{3,}", w)]
    if not alpha_words:
        return False

    # At least one substantial word that starts with a letter (prefer Title Case).
    if not any(w[0].isalpha() and len(w) >= 4 for w in alpha_words):
        # Allow short iconic names like "Sol Ring" / "Negate".
        if not (len(alpha_words) >= 2 and all(len(w) >= 3 for w in alpha_words)):
            return False

    letters = sum(1 for c in title if c.isalpha())
    if letters < 4:
        return False
    nonspace = [c for c in title if not c.isspace()]
    if nonspace and letters / len(nonspace) < 0.75:
        return False

    return True


def clean_card_title(text: str) -> str:
    """
    Pick the best card-title line from OCR output and strip mana/UI noise.
    Prefers lines that look like English card names over status-bar chrome.
    Returns empty string when nothing looks like a single card title.
    """
    for cand in collect_title_candidates(text):
        if is_plausible_card_title(cand):
            return cand
    return ""


def _load_image(image_input: Union[str, bytes, Image.Image]) -> Image.Image:
    if isinstance(image_input, Image.Image):
        return image_input.copy()
    if isinstance(image_input, bytes):
        return Image.open(io.BytesIO(image_input))
    return Image.open(image_input)


def _run_tesseract(img: Image.Image, config: str = "") -> str:
    import pytesseract

    if config:
        return pytesseract.image_to_string(img, config=config)
    return pytesseract.image_to_string(img)


def extract_raw_text(image_input: Union[str, bytes, Image.Image]) -> str:
    if not is_ocr_available():
        raise RuntimeError("Tesseract is not installed or not on PATH")
    img = _load_image(image_input)
    try:
        return _run_tesseract(img)
    finally:
        img.close()


def _center_crop(img: Image.Image) -> Image.Image:
    w, h = img.size
    return img.crop((int(w * 0.12), int(h * 0.18), int(w * 0.88), int(h * 0.72)))


def _contrast_gray(img: Image.Image, factor: float = 1.8) -> Image.Image:
    gray = ImageOps.grayscale(img)
    return ImageEnhance.Contrast(gray).enhance(factor)


def _is_portrait_screenshot(img: Image.Image) -> bool:
    """Tall phone-sized frames (not small cropped card photos)."""
    w, h = img.size
    return h >= 800 and h > w * 1.2


def _score_title(title: str) -> int:
    """Higher is better. Used to pick among multiple OCR attempts."""
    if not is_plausible_card_title(title):
        return -100
    score = 0
    if "," in title:
        score += 3  # Legendary names often have commas
    words = title.split()
    if 2 <= len(words) <= 6:
        score += 2
    if title[0].isupper():
        score += 1
    if all(w[:1].isupper() for w in words if w[:1].isalpha()):
        score += 1
    if _UI_CHROME_RE.match(title):
        score -= 10
    if "©" in title:
        score -= 5
    # Prefer ASCII-ish English card names for catalog matching
    if re.search(r"[áéíóúñüÁÉÍÓÚÑÜ]", title):
        score -= 1
    return score


def _looks_like_sale_listing(raw_text: str) -> bool:
    """Deck-sale / WhatsApp listing captions (not a single card photo)."""
    return bool(_LISTING_HINT_RE.search(raw_text))


def _looks_like_multi_card_names(raw_text: str) -> bool:
    """Several distinct name-like lines → lot / collage, not one card."""
    plausible = [c for c in collect_title_candidates(raw_text) if is_plausible_card_title(c)]
    return len(plausible) >= _MULTI_CARD_CANDIDATE_THRESHOLD


def extract_card_title(image_input: Union[str, bytes, Image.Image]) -> Optional[str]:
    """
    Extract an MTG card title. On portrait screenshots, prefer a center crop
    (card overlay) before the full frame to avoid deck/UI chrome.
    Returns None for multi-card lots, sale listings, or low-confidence OCR.
    """
    if not is_ocr_available():
        raise RuntimeError("Tesseract is not installed or not on PATH")

    img = _load_image(image_input)
    try:
        center = _center_crop(img)
        portrait = _is_portrait_screenshot(img)
        if portrait:
            attempts: list[tuple[str, Image.Image, str]] = [
                ("center_contrast", _contrast_gray(center), ""),
                ("center", center, ""),
                ("full", img, ""),
                ("header", img.crop((0, 0, img.size[0], int(img.size[1] * 0.20))), "--psm 6"),
            ]
        else:
            attempts = [
                ("full", img, ""),
                ("header", img.crop((0, 0, img.size[0], int(img.size[1] * 0.20))), "--psm 6"),
                ("center", center, ""),
                ("center_contrast", _contrast_gray(center), ""),
            ]

        scored: list[tuple[int, str, str]] = []
        for label, variant, config in attempts:
            try:
                raw = _run_tesseract(variant, config=config)
            except Exception as exc:
                logger.warning("OCR attempt %s failed: %s", label, exc)
                continue

            # Sale listings / multi-card lots: abort only when we have no better
            # center-crop hit yet (portrait apps still OCR rules text in full frame).
            if label == "full":
                if _looks_like_sale_listing(raw):
                    if not scored:
                        logger.info("OCR skipped: sale listing text detected")
                        return None
                    logger.info("OCR ignoring full-frame sale listing; keeping prior crop")
                    continue
                if not portrait and _looks_like_multi_card_names(raw):
                    logger.info("OCR skipped: multi-card lot detected")
                    return None

            title = clean_card_title(raw)
            if not title:
                continue
            score = _score_title(title)
            scored.append((score, title, label))
            logger.info("OCR candidate %s score=%s title=%r", label, score, title)

        if not scored:
            return None

        scored.sort(key=lambda item: item[0], reverse=True)
        best_score, best_title, best_label = scored[0]
        if best_score < _MIN_TITLE_SCORE:
            logger.info(
                "OCR rejected low-confidence title score=%s title=%r",
                best_score,
                best_title,
            )
            return None
        logger.info("OCR card title via %s: %r", best_label, best_title)
        return best_title
    finally:
        img.close()
