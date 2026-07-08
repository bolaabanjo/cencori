"""
Vision API examples.

Run with:
    CENCORI_API_KEY=csk_... python examples/vision.py
"""

import base64
import os

from cencori import Cencori


def main() -> None:
    cencori = Cencori()

    image_url = "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Cat03.jpg/1200px-Cat03.jpg"

    # 1. Analyze from a URL with a custom prompt
    analysis = cencori.vision.analyze(
        image_url=image_url,
        prompt="Describe this animal and estimate its age.",
    )
    print("== analyze ==")
    print(analysis["analysis"])
    print(f"cost: ${analysis['cost']['cencoriChargeUsd']:.6f}")

    # 2. Describe (preset prompt)
    described = cencori.vision.describe(image_url=image_url)
    print("\n== describe ==")
    print(described["description"])

    # 3. OCR from a local file (if present)
    if os.path.exists("sample_receipt.png"):
        with open("sample_receipt.png", "rb") as f:
            b64 = base64.b64encode(f.read()).decode()
        ocr = cencori.vision.ocr(image_base64=b64, mime_type="image/png")
        print("\n== ocr ==")
        print(ocr["text"])

    # 4. Classify — structured JSON output
    classified = cencori.vision.classify(image_url=image_url)
    print("\n== classify ==")
    print(classified["classification"])


if __name__ == "__main__":
    main()
