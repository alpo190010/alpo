"""Scoring rubric and tip selector for accessibility signals.

Converts :class:`AccessibilitySignals` into a deterministic 0–100
score using severity-weighted deductions, and selects up to 3
prioritised improvement tips with research-backed, conversion-first
framing.
"""

from __future__ import annotations

from app.services.accessibility_detector import AccessibilitySignals


# ---------------------------------------------------------------------------
# Severity deduction weights
# ---------------------------------------------------------------------------

_SEVERITY_WEIGHTS: dict[str, int] = {
    "critical": 15,
    "serious": 8,
    "moderate": 4,
    "minor": 2,
}


# ---------------------------------------------------------------------------
# Scoring rubric
# ---------------------------------------------------------------------------


def score_accessibility(signals: AccessibilitySignals) -> int:
    """Compute a 0–100 accessibility score from extracted signals.

    Starts at 100 and deducts points per severity level:

        critical violations × 15
        serious  violations × 8
        moderate violations × 4
        minor    violations × 2

    If ``scan_completed`` is ``False`` (no axe-core data available),
    returns 0 — the score cannot be determined.

    Returns:
        Integer clamped to 0–100.
    """
    if not signals.scan_completed:
        return 0

    score = 100
    score -= signals.critical_count * _SEVERITY_WEIGHTS["critical"]
    score -= signals.serious_count * _SEVERITY_WEIGHTS["serious"]
    score -= signals.moderate_count * _SEVERITY_WEIGHTS["moderate"]
    score -= signals.minor_count * _SEVERITY_WEIGHTS["minor"]

    return max(0, min(100, score))


# ---------------------------------------------------------------------------
# Tip selector
# ---------------------------------------------------------------------------

# Tips ordered by impact priority (highest first).  Each entry is a
# (condition_callable, tip_string) pair.  The condition receives the
# signals *and* the computed score.

_TIP_RULES: list[tuple] = [
    # 1. Contrast — most common WCAG failure
    (
        lambda s, _score: s.contrast_violations > 0,
        (
            "Fix color-contrast issues — low contrast is the #1 "
            "accessibility barrier, found on 79.1% of home pages "
            "(WebAIM Million 2024), and affects purchasing for 300M+ "
            "people with visual impairments worldwide"
        ),
    ),
    # 2. Alt text — second most common
    (
        lambda s, _score: s.alt_text_violations > 0,
        (
            "Add descriptive alt text to images — missing alt text is "
            "detected on 55.5% of home pages (WebAIM Million 2024) and "
            "blocks screen-reader users from understanding your products"
        ),
    ),
    # 3. Form labels — critical for conversions
    (
        lambda s, _score: s.form_label_violations > 0,
        (
            "Associate labels with form inputs — 39% of home pages have "
            "missing form labels (WebAIM Million 2024), causing checkout "
            "abandonment for assistive-technology users"
        ),
    ),
    # 4. Empty links
    (
        lambda s, _score: s.empty_link_violations > 0,
        (
            "Give every link a descriptive accessible name — empty links "
            "confuse keyboard and screen-reader navigation, increasing "
            "bounce rates for the 15% of the population with disabilities"
        ),
    ),
    # 5. Empty buttons
    (
        lambda s, _score: s.empty_button_violations > 0,
        (
            "Label all buttons with accessible text — unnamed buttons "
            "prevent assistive-technology users from completing actions "
            "like Add to Cart, directly reducing conversion"
        ),
    ),
    # 6. Document language
    (
        lambda s, _score: s.document_language_violations > 0,
        (
            "Tell the browser what language your store is in — screen "
            "readers use this to pronounce words correctly, and an audit "
            "found 17.1% of major retail sites were missing it"
        ),
    ),
    # 7. Congratulatory — high score
    (
        lambda _s, score: score >= 85,
        (
            "Strong accessibility foundation — accessible sites reach "
            "the $490B annual spending power of disabled consumers "
            "(American Institutes for Research) and rank higher in search"
        ),
    ),
]


def get_accessibility_tips(signals: AccessibilitySignals) -> list[str]:
    """Return up to 3 research-backed accessibility improvement tips.

    Tips are selected based on which violation categories are present,
    prioritised by prevalence and conversion impact (most impactful
    first).

    Args:
        signals: Extracted accessibility signals.

    Returns:
        A list of 0–3 tip strings.
    """
    score = score_accessibility(signals)
    tips: list[str] = []

    for condition, tip in _TIP_RULES:
        if condition(signals, score):
            tips.append(tip)
            if len(tips) >= 3:
                break

    return tips


# ---------------------------------------------------------------------------
# Per-check breakdown (for UI "What's working / What's missing" lists)
# ---------------------------------------------------------------------------


def list_accessibility_checks(signals: AccessibilitySignals) -> list[dict]:
    """Enumerate accessibility pass/fail checks by violation category.

    Accessibility scoring is deduction-based (starts at 100, subtracts per
    violation). For the UI checklist we expose the violation *categories*
    that map to tip priorities — each check passes when that category has
    zero violations. Weights reflect severity: contrast and alt-text are
    almost always critical (15), form labels / empty interactive elements
    serious (8), document language serious (8).

    Returns an empty list when no axe-core scan was performed, since we
    cannot report pass/fail reliably without data.
    """
    if not signals.scan_completed:
        return []

    return [
        {
            "id": "no_contrast_violations",
            "label": "No color-contrast violations",
            "passed": signals.contrast_violations == 0,
            "weight": 15,
            "remediation": (
                "Make sure text is dark enough to read against its "
                "background. Common offenders: light grey body text, "
                "pale text on gradient buttons, faint placeholder text "
                "in form fields. Use a free tool like the Stark plugin "
                "or your browser's built-in checker to test each section."
            ),
        },
        {
            "id": "no_alt_text_violations",
            "label": "Alt text on all images",
            "passed": signals.alt_text_violations == 0,
            "weight": 15,
            "remediation": (
                "Add a short description to every product image. In "
                "Shopify: Products → edit a product → click an image → "
                "\"Add alt text\". This is what shoppers using screen "
                "readers hear, and it also helps your products show up "
                "in Google Image search and AI shopping tools."
            ),
        },
        {
            "id": "no_form_label_violations",
            "label": "All form inputs labeled",
            "passed": signals.form_label_violations == 0,
            "weight": 8,
            "remediation": (
                "Every form field — email box, search bar, checkout "
                "address, etc. — needs a clear label. When a shopper "
                "with a screen reader taps a field, the screen reader "
                "needs to read out what the field is for. Without "
                "labels, your forms are impossible to fill out for "
                "anyone using assistive tech."
            ),
            "code": (
                "<!-- Prefer explicit label association -->\n"
                "<label for=\"email\">Email</label>\n"
                "<input id=\"email\" type=\"email\" name=\"email\">\n\n"
                "<!-- Or aria-label when a visible label isn't possible -->\n"
                "<input type=\"search\" name=\"q\" aria-label=\"Search\">"
            ),
        },
        {
            "id": "no_empty_link_violations",
            "label": "No empty or unnamed links",
            "passed": signals.empty_link_violations == 0,
            "weight": 8,
            "remediation": (
                "Every link needs readable text. Links that are just "
                "an icon (like the social media icons in your footer) "
                "need a hidden text label so a screen reader can "
                "announce \"Instagram\", \"TikTok\", and so on instead "
                "of saying \"link\" with no context."
            ),
        },
        {
            "id": "no_empty_button_violations",
            "label": "All buttons have accessible names",
            "passed": signals.empty_button_violations == 0,
            "weight": 8,
            "remediation": (
                "Every button needs readable text. Common offenders: "
                "the close-X on popups, the hamburger menu icon, "
                "carousel left/right arrows. Add a hidden label like "
                "\"Close\", \"Open menu\", or \"Previous slide\" so "
                "screen-reader users know what each button does."
            ),
        },
        {
            "id": "document_language_set",
            "label": "Page language set",
            "passed": signals.document_language_violations == 0,
            "weight": 8,
            "remediation": (
                "Tell the browser what language your store is in. "
                "Screen readers use this to pronounce words correctly, "
                "and translation tools (like Google Translate or your "
                "browser's built-in translator) use it to detect when "
                "to offer translation. Most modern Shopify themes set "
                "this automatically — if yours doesn't, your theme "
                "developer or Shopify support can add it in a minute."
            ),
            "code": (
                "<!-- theme.liquid — opening <html> tag -->\n"
                "<html lang=\"{{ request.locale.iso_code }}\">"
            ),
        },
        {
            # Catch-all: the headline score deducts for every axe-core
            # violation, but the 6 named checks above only cover the
            # most common categories.  Without this row, a store can
            # show "all checks pass" while still scoring < 100, which
            # confuses users.  Passes when no uncategorized axe rule
            # failed; when failing, ``rules`` carries the per-rule list
            # the UI renders as clickable disclosures.
            "id": "no_other_violations",
            "label": "No other accessibility problems",
            "passed": signals.other_violations == 0,
            # Badge severity reflects the worst-severity uncategorized
            # rule encountered; default Moderate (4) when the field is
            # zero so the failing-row badge still renders sensibly.
            "weight": signals.other_max_severity_weight or 4,
            "detail": (
                (
                    f"{signals.other_violations} more "
                    f"issue{'s' if signals.other_violations != 1 else ''} "
                    f"found, affecting {signals.other_nodes_affected} "
                    f"place{'s' if signals.other_nodes_affected != 1 else ''} "
                    f"on the page."
                )
                if signals.other_violations > 0
                else None
            ),
            "remediation": (
                "Tap any item below to see what's wrong and how to fix it."
            ),
            "rules": signals.other_rules if signals.other_violations > 0 else None,
        },
    ]
