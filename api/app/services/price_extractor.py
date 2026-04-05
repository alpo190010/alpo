"""
Price extractor — deterministic product price extraction from HTML.

Tries multiple strategies in order of reliability:
1. JSON-LD structured data (via StructuredDataSignals.price_amount)
2. og:price:amount / product:price:amount meta tags
3. Shopify product JSON ("price" in cents → divide by 100)
4. Common price CSS selectors / itemprop="price"
5. First prominent dollar amount in the page

Returns float | None.
"""

import re
from bs4 import BeautifulSoup


def extract_price(html: str, sd_price: float | None = None) -> float | None:
    """Extract product price from HTML. sd_price is the structured-data price if already known."""

    # 1. Structured data price (already extracted by detector)
    if sd_price is not None and sd_price > 0:
        return sd_price

    soup = BeautifulSoup(html, "html.parser")

    # 2. og:price:amount or product:price:amount meta tags
    for prop in ("og:price:amount", "product:price:amount"):
        tag = soup.find("meta", attrs={"property": prop})
        if tag and tag.get("content"):
            try:
                val = float(tag["content"].replace(",", ""))
                if val > 0:
                    return val
            except (ValueError, TypeError):
                pass

    # 3. Shopify product JSON — "price" in cents (integer)
    for script in soup.find_all("script", type="application/json"):
        text = script.string or ""
        m = re.search(r'"price"\s*:\s*(\d{3,})', text)
        if m:
            cents = int(m.group(1))
            if 100 <= cents <= 10_000_00:  # $1 – $10,000
                return cents / 100

    # 4. itemprop="price" or common price selectors
    for selector in [
        {"itemprop": "price"},
        {"class_": re.compile(r"product[-_]?price|price[-_]?current|sale[-_]?price", re.I)},
    ]:
        el = soup.find(attrs=selector)
        if el:
            content = el.get("content") or el.get_text(strip=True)
            price = _parse_dollar(content)
            if price:
                return price

    # 5. First prominent dollar amount ($XX.XX or $XX)
    # Search visible text, skip tiny amounts (<$1) and huge amounts (>$10k)
    body_text = soup.get_text(" ", strip=True)
    for m in re.finditer(r"\$\s?(\d{1,5}(?:[.,]\d{2})?)", body_text):
        try:
            val = float(m.group(1).replace(",", ""))
            if 1.0 <= val <= 10_000:
                return val
        except (ValueError, TypeError):
            pass

    return None


def _parse_dollar(text: str) -> float | None:
    """Parse a dollar amount from text like '$49.99', '49.99', 'USD 49.99'."""
    if not text:
        return None
    m = re.search(r"(\d{1,5}(?:[.,]\d{2})?)", text.replace(",", ""))
    if m:
        try:
            val = float(m.group(1))
            if val > 0:
                return val
        except (ValueError, TypeError):
            pass
    return None
