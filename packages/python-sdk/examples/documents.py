"""
Documents API examples.

Run with:
    CENCORI_API_KEY=csk_... python3 examples/documents.py
"""

import base64
import os

from cencori import Cencori


def main() -> None:
    cencori = Cencori()

    pdf_url = "https://www.orimi.com/pdf-test.pdf"

    # 1. Extract — native PDF text (free, no LLM)
    print("== extract ==")
    extracted = cencori.documents.extract(document_url=pdf_url)
    print(f"method: {extracted['method']}")
    print(f"pages:  {extracted['pageCount']}")
    print(f"chars:  {len(extracted['text'])}")
    if extracted.get("cost"):
        print(f"cost:   ${extracted['cost']['cencoriChargeUsd']:.6f}")
    else:
        print("cost:   $0 (native extraction, no LLM call)")

    # 2. Summarize
    print("\n== summarize ==")
    summary = cencori.documents.summarize(document_url=pdf_url)
    print(summary["summary"])

    # 3. Query
    print("\n== query ==")
    answer = cencori.documents.query(
        document_url=pdf_url,
        question="What is the main topic of this document?",
    )
    print(answer["answer"])

    # 4. From a local file
    if os.path.exists("sample.pdf"):
        with open("sample.pdf", "rb") as f:
            b64 = base64.b64encode(f.read()).decode()
        local = cencori.documents.extract(
            document_base64=b64,
            mime_type="application/pdf",
        )
        print(f"\n== local file ==\nextracted {len(local['text'])} chars via {local['method']}")


if __name__ == "__main__":
    main()
