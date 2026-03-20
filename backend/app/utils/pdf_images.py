"""Extract large images from PDF files using PyPDF2 + Pillow.

Used to pull out Writing Task 1 chart images (bar charts, line graphs, maps, etc.)
from IELTS study plan PDFs.
"""

from __future__ import annotations

import io
import logging
from typing import List

from PIL import Image
from PyPDF2 import PdfReader
from PyPDF2.generic import ArrayObject, EncodedStreamObject, DecodedStreamObject

logger = logging.getLogger(__name__)


def extract_pdf_images(filepath: str, min_size: int = 200) -> List[bytes]:
    """Return list of PNG-encoded image bytes, in page order, filtered by min dimension.

    Only images where *both* width and height exceed ``min_size`` are kept.
    This filters out small logos/icons while retaining chart images.

    Args:
        filepath: Path to the PDF file on disk.
        min_size: Minimum pixel dimension (both width & height must exceed this).

    Returns:
        Ordered list of PNG bytes for each qualifying image.
    """
    reader = PdfReader(filepath)
    images: List[bytes] = []

    for page_num, page in enumerate(reader.pages):
        resources = page.get("/Resources")
        if not resources:
            continue
        xobjects = resources.get("/XObject")
        if not xobjects:
            continue

        xobj_dict = xobjects.get_object()
        for name in xobj_dict:
            obj = xobj_dict[name].get_object()
            subtype = obj.get("/Subtype")
            if subtype != "/Image":
                continue

            try:
                width = int(obj["/Width"])
                height = int(obj["/Height"])
            except (KeyError, TypeError, ValueError):
                continue

            if width <= min_size or height <= min_size:
                logger.debug(
                    "Page %d: skipping small image %s (%dx%d)", page_num + 1, name, width, height
                )
                continue

            # Try to decode image data
            png_bytes = _decode_image(obj, width, height)
            if png_bytes:
                logger.info(
                    "Page %d: extracted image %s (%dx%d, %d bytes)",
                    page_num + 1, name, width, height, len(png_bytes),
                )
                images.append(png_bytes)

    logger.info("Extracted %d large images from %s", len(images), filepath)
    return images


def _decode_image(obj, width: int, height: int) -> bytes | None:
    """Attempt to decode a PDF image XObject into PNG bytes."""
    try:
        data = obj.get_data()
    except Exception as exc:
        logger.warning("Failed to get image data: %s", exc)
        return None

    if not data:
        return None

    # Check for common compressed formats (JPEG, PNG) embedded directly
    color_space = obj.get("/ColorSpace")
    bits = obj.get("/BitsPerComponent", 8)
    filters = obj.get("/Filter")

    # Normalise filters to a list
    if isinstance(filters, ArrayObject):
        filter_names = [str(f) for f in filters]
    elif filters:
        filter_names = [str(filters)]
    else:
        filter_names = []

    # If DCTDecode (JPEG) or JPXDecode (JPEG2000), data is already a complete image
    if "/DCTDecode" in filter_names or "/JPXDecode" in filter_names:
        try:
            img = Image.open(io.BytesIO(data))
            img = img.convert("RGB")
            buf = io.BytesIO()
            img.save(buf, format="PNG")
            return buf.getvalue()
        except Exception as exc:
            logger.warning("Failed to open JPEG/JP2 image: %s", exc)
            return None

    # Raw pixel data — figure out mode from bytes-per-pixel
    expected_rgb = width * height * 3
    expected_gray = width * height
    expected_rgba = width * height * 4

    try:
        if len(data) == expected_rgba:
            img = Image.frombytes("RGBA", (width, height), data)
        elif len(data) == expected_rgb:
            img = Image.frombytes("RGB", (width, height), data)
        elif len(data) == expected_gray:
            img = Image.frombytes("L", (width, height), data)
        else:
            # Try treating as RGB anyway (some PDFs pad or have palette data)
            logger.debug(
                "Unexpected data length %d for %dx%d image (expected rgb=%d gray=%d rgba=%d), trying RGB",
                len(data), width, height, expected_rgb, expected_gray, expected_rgba,
            )
            img = Image.frombytes("RGB", (width, height), data[:expected_rgb])

        img = img.convert("RGB")
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        return buf.getvalue()
    except Exception as exc:
        logger.warning("Failed to decode raw image (%dx%d, %d bytes): %s", width, height, len(data), exc)
        return None
