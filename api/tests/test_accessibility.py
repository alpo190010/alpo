"""Unit tests for accessibility_scanner, accessibility_detector, and accessibility_rubric.

Covers scanner (axe-core WCAG 2.1 AA integration with Playwright mocks),
detector (axe violation → 6 category groups + severity counts), rubric
(severity-weighted 0–100 scoring), and tip selector (max 3 research-cited
tips with priority ordering).  All scanner tests mock async_playwright —
no real browser is launched.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.accessibility_detector import (
    AccessibilitySignals,
    detect_accessibility,
)
from app.services.accessibility_rubric import (
    get_accessibility_tips,
    score_accessibility,
)
from app.services.accessibility_scanner import (
    _WCAG_RUN_ONLY,
    run_axe_scan,
)


# ---------------------------------------------------------------------------
# Fixture helpers
# ---------------------------------------------------------------------------


def _v(rule_id: str, impact: str = "serious", node_count: int = 1) -> dict:
    """Build a minimal axe-core violation dict."""
    return {
        "id": rule_id,
        "impact": impact,
        "nodes": [{"html": f"<el{i}/>"}  for i in range(node_count)],
    }


def _pw_mocks(*, goto_side_effect=None):
    """Build an async_playwright mock chain → (mock_fn, mock_browser, mock_page)."""
    mock_page = AsyncMock()
    if goto_side_effect is not None:
        mock_page.goto.side_effect = goto_side_effect

    mock_browser = AsyncMock()
    mock_browser.new_page.return_value = mock_page

    mock_pw = MagicMock()
    mock_pw.chromium.launch = AsyncMock(return_value=mock_browser)

    mock_pw_ctx = MagicMock()
    mock_pw_ctx.start = AsyncMock(return_value=mock_pw)
    mock_pw_ctx.__aexit__ = AsyncMock(return_value=None)

    return MagicMock(return_value=mock_pw_ctx), mock_browser, mock_page


# Stand-in error classes — avoids Playwright constructor quirks in tests.
class _PwError(Exception):
    pass


class _PwTimeoutError(_PwError):
    pass


_MOD = "app.services.accessibility_scanner"


# ---------------------------------------------------------------------------
# 1. TestScanner — async Playwright mock tests
# ---------------------------------------------------------------------------


class TestScanner:
    """axe-core scanner with mocked Playwright — no real browser launched."""

    @pytest.mark.asyncio
    async def test_run_axe_scan_returns_violations_on_success(self):
        """Successful scan returns violations list; WCAG 2.1 AA config present."""
        violations = [_v("color-contrast")]
        mock_pw, _, _ = _pw_mocks()

        with patch(f"{_MOD}.async_playwright", mock_pw):
            with patch(f"{_MOD}._run_axe", new_callable=AsyncMock, return_value=violations):
                result = await run_axe_scan("https://example.com")

        assert result == violations
        # Verify WCAG 2.1 AA tag configuration
        assert _WCAG_RUN_ONLY["type"] == "tag"
        assert set(_WCAG_RUN_ONLY["values"]) == {
            "wcag2a", "wcag2aa", "wcag21a", "wcag21aa",
        }

    @pytest.mark.asyncio
    async def test_run_axe_scan_returns_none_on_timeout(self):
        """PlaywrightTimeoutError → None (never raises)."""
        mock_pw, _, _ = _pw_mocks(goto_side_effect=_PwTimeoutError("timeout"))

        with patch(f"{_MOD}.async_playwright", mock_pw):
            with patch(f"{_MOD}.PlaywrightTimeoutError", _PwTimeoutError):
                with patch(f"{_MOD}.PlaywrightError", _PwError):
                    result = await run_axe_scan("https://example.com")

        assert result is None

    @pytest.mark.asyncio
    async def test_run_axe_scan_returns_none_on_error(self):
        """PlaywrightError → None (never raises)."""
        mock_pw, _, _ = _pw_mocks(goto_side_effect=_PwError("crash"))

        with patch(f"{_MOD}.async_playwright", mock_pw):
            with patch(f"{_MOD}.PlaywrightTimeoutError", _PwTimeoutError):
                with patch(f"{_MOD}.PlaywrightError", _PwError):
                    result = await run_axe_scan("https://example.com")

        assert result is None

    @pytest.mark.asyncio
    async def test_run_axe_scan_closes_browser_on_failure(self):
        """browser.close() called even when page.goto fails."""
        mock_pw, mock_browser, _ = _pw_mocks(goto_side_effect=_PwError("crash"))

        with patch(f"{_MOD}.async_playwright", mock_pw):
            with patch(f"{_MOD}.PlaywrightTimeoutError", _PwTimeoutError):
                with patch(f"{_MOD}.PlaywrightError", _PwError):
                    await run_axe_scan("https://example.com")

        mock_browser.close.assert_awaited_once()


# ---------------------------------------------------------------------------
# 2. TestDetector — axe violation → AccessibilitySignals mapping
# ---------------------------------------------------------------------------


class TestDetector:
    """Axe violation dict → AccessibilitySignals extraction."""

    def test_detect_none_input_returns_scan_incomplete(self):
        """None axe_results → scan_completed=False, all zeros."""
        signals = detect_accessibility("", None)
        assert signals.scan_completed is False
        assert signals.total_violations == 0
        assert signals.total_nodes_affected == 0
        assert signals.critical_count == 0

    def test_detect_empty_list_returns_scan_complete(self):
        """Empty violations list → scan_completed=True, all zeros."""
        signals = detect_accessibility("", [])
        assert signals.scan_completed is True
        assert signals.total_violations == 0
        assert signals.total_nodes_affected == 0

    def test_detect_contrast_violations(self):
        """color-contrast rule → contrast_violations counts nodes."""
        signals = detect_accessibility("", [_v("color-contrast", node_count=3)])
        assert signals.contrast_violations == 3
        assert signals.total_violations == 1

    def test_detect_alt_text_violations(self):
        """image-alt rule → alt_text_violations counts nodes."""
        signals = detect_accessibility("", [_v("image-alt", node_count=2)])
        assert signals.alt_text_violations == 2

    def test_detect_form_label_violations(self):
        """label rule → form_label_violations counts nodes."""
        signals = detect_accessibility("", [_v("label")])
        assert signals.form_label_violations == 1

    def test_detect_empty_link_violations(self):
        """link-name rule → empty_link_violations counts nodes."""
        signals = detect_accessibility("", [_v("link-name", node_count=4)])
        assert signals.empty_link_violations == 4

    def test_detect_empty_button_violations(self):
        """button-name rule → empty_button_violations counts nodes."""
        signals = detect_accessibility("", [_v("button-name")])
        assert signals.empty_button_violations == 1

    def test_detect_document_language(self):
        """html-has-lang rule → document_language_violations counts nodes."""
        signals = detect_accessibility("", [_v("html-has-lang")])
        assert signals.document_language_violations == 1

    def test_detect_severity_counting(self):
        """Each violation adds 1 to its severity bucket (rules, not nodes)."""
        violations = [
            _v("color-contrast", impact="critical"),
            _v("image-alt", impact="serious"),
            _v("label", impact="moderate"),
            _v("link-name", impact="minor"),
        ]
        signals = detect_accessibility("", violations)
        assert signals.critical_count == 1
        assert signals.serious_count == 1
        assert signals.moderate_count == 1
        assert signals.minor_count == 1
        assert signals.total_violations == 4

    def test_detect_uncategorized_violation(self):
        """Unknown rule ID counted in totals + 'other' bucket, not in named categories."""
        signals = detect_accessibility(
            "", [_v("some-unknown-rule-xyz", impact="serious", node_count=3)]
        )
        assert signals.total_violations == 1
        assert signals.total_nodes_affected == 3
        # 6 named categories untouched
        assert signals.contrast_violations == 0
        assert signals.alt_text_violations == 0
        assert signals.form_label_violations == 0
        assert signals.empty_link_violations == 0
        assert signals.empty_button_violations == 0
        assert signals.document_language_violations == 0
        # Long-tail bucket populated
        assert signals.other_violations == 1
        assert signals.other_nodes_affected == 3
        assert signals.other_max_severity_weight == 8  # serious

    def test_detect_other_rules_capture_help_and_url(self):
        """other_rules captures id, help, helpUrl, impact, nodeCount per long-tail rule."""
        violation = {
            "id": "heading-order",
            "impact": "moderate",
            "help": "Heading levels should only increase by one",
            "helpUrl": "https://dequeuniversity.com/rules/axe/4.x/heading-order",
            "nodes": [{"html": "<h3/>"}, {"html": "<h4/>"}],
        }
        signals = detect_accessibility("", [violation])
        assert signals.other_rules == [
            {
                "id": "heading-order",
                "help": "Heading levels should only increase by one",
                "helpUrl": "https://dequeuniversity.com/rules/axe/4.x/heading-order",
                "impact": "moderate",
                "nodeCount": 2,
            }
        ]

    def test_detect_other_rules_handle_missing_help_fields(self):
        """help/helpUrl fall back to empty strings when axe omits them."""
        signals = detect_accessibility(
            "", [{"id": "weird-rule", "impact": "minor", "nodes": [{}]}]
        )
        assert len(signals.other_rules) == 1
        assert signals.other_rules[0]["id"] == "weird-rule"
        assert signals.other_rules[0]["help"] == ""
        assert signals.other_rules[0]["helpUrl"] == ""

    def test_detect_other_max_severity_takes_largest(self):
        """other_max_severity_weight reflects the worst long-tail rule."""
        signals = detect_accessibility(
            "",
            [
                _v("foo-rule", impact="minor"),
                _v("bar-rule", impact="critical"),
                _v("baz-rule", impact="moderate"),
            ],
        )
        assert signals.other_violations == 3
        # critical (15) wins
        assert signals.other_max_severity_weight == 15

    def test_detect_categorized_does_not_populate_other(self):
        """Known rule (color-contrast) only updates its category, not 'other'."""
        signals = detect_accessibility("", [_v("color-contrast", node_count=2)])
        assert signals.contrast_violations == 2
        assert signals.other_violations == 0
        assert signals.other_nodes_affected == 0
        assert signals.other_max_severity_weight == 0

    def test_detect_node_counting(self):
        """Multiple nodes per violation → total_nodes_affected and category both sum."""
        signals = detect_accessibility("", [_v("color-contrast", node_count=7)])
        assert signals.total_nodes_affected == 7
        assert signals.contrast_violations == 7
        assert signals.total_violations == 1  # 1 rule


# ---------------------------------------------------------------------------
# 3. TestRubric — severity-weighted 0–100 scoring
# ---------------------------------------------------------------------------


class TestRubric:
    """Deterministic severity-weighted scoring from AccessibilitySignals."""

    def test_score_no_violations_equals_100(self):
        """Completed scan with no violations → 100."""
        assert score_accessibility(AccessibilitySignals(scan_completed=True)) == 100

    def test_score_scan_incomplete_equals_0(self):
        """Incomplete scan → 0 (cannot determine score)."""
        assert score_accessibility(AccessibilitySignals(scan_completed=False)) == 0

    def test_score_critical_deduction(self):
        """1 critical: 100 − 15 = 85."""
        s = AccessibilitySignals(scan_completed=True, critical_count=1)
        assert score_accessibility(s) == 85

    def test_score_serious_deduction(self):
        """1 serious: 100 − 8 = 92."""
        s = AccessibilitySignals(scan_completed=True, serious_count=1)
        assert score_accessibility(s) == 92

    def test_score_floor_at_zero(self):
        """10 critical violations: 100 − 150 clamped to 0, not negative."""
        s = AccessibilitySignals(scan_completed=True, critical_count=10)
        assert score_accessibility(s) == 0

    def test_score_mixed_severities(self):
        """2 crit + 3 serious + 1 moderate + 2 minor = 100−30−24−4−4 = 38."""
        s = AccessibilitySignals(
            scan_completed=True,
            critical_count=2,
            serious_count=3,
            moderate_count=1,
            minor_count=2,
        )
        assert score_accessibility(s) == 38


# ---------------------------------------------------------------------------
# 4. TestTips — research-cited tip selection
# ---------------------------------------------------------------------------


class TestTips:
    """Up to 3 prioritised tips with research citations."""

    def test_tips_max_three(self):
        """All 6 categories violated → exactly 3 tips returned (cap enforced)."""
        signals = AccessibilitySignals(
            scan_completed=True,
            contrast_violations=1,
            alt_text_violations=1,
            form_label_violations=1,
            empty_link_violations=1,
            empty_button_violations=1,
            document_language_violations=1,
            total_violations=6,
            critical_count=6,  # score = 10, well below 85
        )
        tips = get_accessibility_tips(signals)
        assert len(tips) == 3

    def test_tips_priority_order(self):
        """Contrast first, alt text second, form labels third."""
        signals = AccessibilitySignals(
            scan_completed=True,
            contrast_violations=1,
            alt_text_violations=1,
            form_label_violations=1,
            critical_count=3,
            total_violations=3,
        )
        tips = get_accessibility_tips(signals)
        assert len(tips) == 3
        assert "contrast" in tips[0].lower()
        assert "alt text" in tips[1].lower()
        assert "label" in tips[2].lower()

    def test_tips_congratulatory_on_high_score(self):
        """Score ≥ 85 with a minor category issue → congratulatory tip included."""
        signals = AccessibilitySignals(
            scan_completed=True,
            contrast_violations=1,
            minor_count=1,
            total_violations=1,
        )
        # score = 100 − 2 = 98 ≥ 85 → congratulatory rule fires
        tips = get_accessibility_tips(signals)
        assert any("accessibility foundation" in t.lower() for t in tips)

    def test_tips_only_congratulatory_on_no_violations(self):
        """scan_completed=True + zero violations → exactly 1 congratulatory tip."""
        signals = AccessibilitySignals(scan_completed=True)
        tips = get_accessibility_tips(signals)
        assert len(tips) == 1
        assert "accessibility foundation" in tips[0].lower()


# ---------------------------------------------------------------------------
# 5. TestDataclassStructure — AccessibilitySignals invariants
# ---------------------------------------------------------------------------


class TestDataclassStructure:
    """AccessibilitySignals dataclass shape and defaults."""

    def test_signals_is_dataclass(self):
        from dataclasses import is_dataclass
        assert is_dataclass(AccessibilitySignals)

    def test_field_count_is_17(self):
        """17 fields: 6 category + 2 aggregate + 4 severity + 4 'other' + 1 metadata."""
        from dataclasses import fields
        assert len(fields(AccessibilitySignals)) == 17

    def test_defaults_all_zero_or_false(self):
        """Every field defaults to 0, False, or [] (for other_rules)."""
        from dataclasses import fields as dc_fields
        s = AccessibilitySignals()
        for f in dc_fields(s):
            val = getattr(s, f.name)
            if isinstance(val, bool):
                assert val is False, f"{f.name} should default to False"
            elif isinstance(val, int):
                assert val == 0, f"{f.name} should default to 0"
            elif isinstance(val, list):
                assert val == [], f"{f.name} should default to []"
