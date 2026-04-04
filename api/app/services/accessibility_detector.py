"""Accessibility signal detector for axe-core WCAG 2.1 AA results.

Maps axe-core violations to 6 category groups (D050) and tallies
severity counts.  The :func:`detect_accessibility` function accepts
raw HTML (unused — kept for pipeline signature consistency) and the
violations list returned by :func:`run_axe_scan`, producing an
:class:`AccessibilitySignals` dataclass consumed downstream by
:func:`score_accessibility` and :func:`get_accessibility_tips`.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Signals dataclass
# ---------------------------------------------------------------------------


@dataclass
class AccessibilitySignals:
    """Accessibility signals extracted from an axe-core WCAG 2.1 AA scan.

    13 fields total:
      • 6 category violation counts
      • 2 aggregate totals (total_violations, total_nodes_affected)
      • 4 severity counts
      • 1 metadata flag (scan_completed)
    """

    # --- Category violation counts (6) --------------------------------
    contrast_violations: int = 0
    """Color-contrast and color-contrast-enhanced rule failures."""

    alt_text_violations: int = 0
    """Image-alt, input-image-alt, area-alt, object-alt, svg-img-alt
    rule failures."""

    form_label_violations: int = 0
    """Label, select-name, input-button-name rule failures."""

    empty_link_violations: int = 0
    """Link-name rule failures (links with no accessible name)."""

    empty_button_violations: int = 0
    """Button-name rule failures (buttons with no accessible name)."""

    document_language_violations: int = 0
    """html-has-lang, html-lang-valid, html-xml-lang-mismatch, valid-lang
    rule failures."""

    # --- Aggregates (2) -----------------------------------------------
    total_violations: int = 0
    """Number of distinct violated axe-core rules."""

    total_nodes_affected: int = 0
    """Sum of affected DOM nodes across all violations."""

    # --- Severity counts (4) ------------------------------------------
    critical_count: int = 0
    """Violations with ``impact: "critical"``."""

    serious_count: int = 0
    """Violations with ``impact: "serious"``."""

    moderate_count: int = 0
    """Violations with ``impact: "moderate"``."""

    minor_count: int = 0
    """Violations with ``impact: "minor"``."""

    # --- Metadata (1) -------------------------------------------------
    scan_completed: bool = False
    """Whether an axe-core scan completed successfully."""


# ---------------------------------------------------------------------------
# Category mapping — axe rule ID → AccessibilitySignals field name
# ---------------------------------------------------------------------------

_CATEGORY_MAP: dict[str, str] = {
    # Contrast
    "color-contrast": "contrast_violations",
    "color-contrast-enhanced": "contrast_violations",
    # Alt text
    "image-alt": "alt_text_violations",
    "input-image-alt": "alt_text_violations",
    "area-alt": "alt_text_violations",
    "object-alt": "alt_text_violations",
    "svg-img-alt": "alt_text_violations",
    # Form labels
    "label": "form_label_violations",
    "select-name": "form_label_violations",
    "input-button-name": "form_label_violations",
    # Empty links
    "link-name": "empty_link_violations",
    # Empty buttons
    "button-name": "empty_button_violations",
    # Document language
    "html-has-lang": "document_language_violations",
    "html-lang-valid": "document_language_violations",
    "html-xml-lang-mismatch": "document_language_violations",
    "valid-lang": "document_language_violations",
}

# Valid axe-core severity levels.
_SEVERITY_FIELDS: dict[str, str] = {
    "critical": "critical_count",
    "serious": "serious_count",
    "moderate": "moderate_count",
    "minor": "minor_count",
}


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def detect_accessibility(
    html: str,
    axe_results: list[dict] | None = None,
) -> AccessibilitySignals:
    """Detect accessibility signals from axe-core violation results.

    Args:
        html: Rendered page HTML (kept for pipeline signature parity;
            not inspected by this detector — all signals come from
            axe-core output).
        axe_results: List of axe-core violation dicts as returned by
            :func:`run_axe_scan`.  Each dict must have ``id``,
            ``impact``, and ``nodes`` keys.  Pass ``None`` when the
            scan was skipped or failed.

    Returns:
        Populated :class:`AccessibilitySignals` instance.
    """
    signals = AccessibilitySignals()

    if axe_results is None:
        # Scan didn't run — return defaults with scan_completed=False.
        return signals

    signals.scan_completed = True

    for violation in axe_results:
        rule_id: str = violation.get("id", "")
        impact: str = violation.get("impact", "")
        nodes: list = violation.get("nodes", [])
        node_count = len(nodes)

        # --- Category mapping ---
        category_field = _CATEGORY_MAP.get(rule_id)
        if category_field is not None:
            current = getattr(signals, category_field)
            setattr(signals, category_field, current + node_count)

        # --- Severity tallying ---
        severity_field = _SEVERITY_FIELDS.get(impact)
        if severity_field is not None:
            current = getattr(signals, severity_field)
            setattr(signals, severity_field, current + 1)

        # --- Aggregates ---
        signals.total_violations += 1
        signals.total_nodes_affected += node_count

    logger.info(
        "Accessibility detected: violations=%d nodes=%d "
        "critical=%d serious=%d moderate=%d minor=%d "
        "contrast=%d alt=%d labels=%d links=%d buttons=%d lang=%d",
        signals.total_violations,
        signals.total_nodes_affected,
        signals.critical_count,
        signals.serious_count,
        signals.moderate_count,
        signals.minor_count,
        signals.contrast_violations,
        signals.alt_text_violations,
        signals.form_label_violations,
        signals.empty_link_violations,
        signals.empty_button_violations,
        signals.document_language_violations,
    )

    return signals
