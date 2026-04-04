"""Async HTTP client for fetching robots.txt and /llms.txt from a store's domain."""

import asyncio
import logging
import urllib.parse

import httpx

logger = logging.getLogger(__name__)

_AI_SEARCH_BOTS = ["OAI-SearchBot", "PerplexityBot", "Claude-SearchBot"]
_AI_TRAINING_BOTS = ["GPTBot", "Google-Extended", "ClaudeBot", "CCBot"]

_HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; AlpoBot/1.0)",
    "Accept": "text/plain, */*",
}


def _parse_robots_txt(body: str) -> dict:
    """Parse robots.txt and return per-bot allow/block status.

    Returns a dict with:
      robots_txt_exists: True
      ai_search_bots: {bot_name: True/False}  (True = allowed)
      ai_training_bots: {bot_name: True/False}  (True = blocked)
      has_wildcard_block: bool
    """
    # Build a map of user-agent -> list of rules
    blocks: dict[str, list[str]] = {}
    current_agents: list[str] = []

    for raw_line in body.splitlines():
        line = raw_line.split("#", 1)[0].strip()
        if not line:
            continue

        if line.lower().startswith("user-agent:"):
            agent = line.split(":", 1)[1].strip().lower()
            if not current_agents or (current_agents and blocks.get(current_agents[0]) is not None
                                       and len(blocks[current_agents[0]]) > 0):
                current_agents = [agent]
            else:
                current_agents.append(agent)
            blocks.setdefault(agent, [])
        elif ":" in line:
            directive = line.split(":", 1)[0].strip().lower()
            value = line.split(":", 1)[1].strip()
            for agent in current_agents:
                blocks.setdefault(agent, []).append(f"{directive}:{value}")

    def _is_blocked(bot_name: str) -> bool:
        """Check if a bot is blocked (has Disallow: / without a counteracting Allow: /)."""
        rules = blocks.get(bot_name.lower(), [])
        if not rules:
            # Fall back to wildcard rules
            rules = blocks.get("*", [])
        has_disallow_root = any(r == "disallow:/" for r in rules)
        has_allow_root = any(r == "allow:/" for r in rules)
        return has_disallow_root and not has_allow_root

    # Wildcard block: User-agent: * with Disallow: /
    wildcard_rules = blocks.get("*", [])
    has_wildcard_block = (
        any(r == "disallow:/" for r in wildcard_rules)
        and not any(r == "allow:/" for r in wildcard_rules)
    )

    # AI search bots: should be ALLOWED (not blocked)
    ai_search_status = {}
    for bot in _AI_SEARCH_BOTS:
        ai_search_status[bot] = not _is_blocked(bot)

    # AI training bots: should be BLOCKED
    ai_training_status = {}
    for bot in _AI_TRAINING_BOTS:
        ai_training_status[bot] = _is_blocked(bot)

    return {
        "robots_txt_exists": True,
        "ai_search_bots": ai_search_status,
        "ai_training_bots": ai_training_status,
        "has_wildcard_block": has_wildcard_block,
    }


async def fetch_ai_discoverability_data(
    product_url: str,
    timeout: float = 8.0,
) -> dict | None:
    """Fetch robots.txt and /llms.txt from the store's domain root.

    Returns a flat dict with parsed robots.txt data and llms.txt existence,
    or None on total failure.
    """
    parsed = urllib.parse.urlparse(product_url)
    if not parsed.scheme or not parsed.hostname:
        return None

    base = f"{parsed.scheme}://{parsed.hostname}"
    robots_url = f"{base}/robots.txt"
    llms_url = f"{base}/llms.txt"

    try:
        async with httpx.AsyncClient(
            timeout=timeout,
            headers=_HEADERS,
            follow_redirects=True,
        ) as client:
            robots_coro = client.get(robots_url)
            llms_coro = client.get(llms_url)
            robots_resp, llms_resp = await asyncio.gather(
                robots_coro, llms_coro, return_exceptions=True,
            )

        result: dict = {}

        # Parse robots.txt
        if isinstance(robots_resp, Exception):
            logger.warning("robots.txt fetch failed for %s: %s", product_url, robots_resp)
            result["robots_txt_exists"] = None
            result["ai_search_bots"] = {}
            result["ai_training_bots"] = {}
            result["has_wildcard_block"] = False
        elif robots_resp.status_code == 200:
            parsed_robots = _parse_robots_txt(robots_resp.text)
            result.update(parsed_robots)
        else:
            result["robots_txt_exists"] = False
            result["ai_search_bots"] = {}
            result["ai_training_bots"] = {}
            result["has_wildcard_block"] = False

        # Check llms.txt
        if isinstance(llms_resp, Exception):
            logger.warning("llms.txt fetch failed for %s: %s", product_url, llms_resp)
            result["llms_txt_exists"] = None
        elif llms_resp.status_code == 200 and len(llms_resp.text.strip()) > 0:
            result["llms_txt_exists"] = True
        else:
            result["llms_txt_exists"] = False

        return result

    except httpx.TimeoutException:
        logger.warning("AI discoverability fetch timed out for %s", product_url)
        return None
    except httpx.HTTPStatusError as exc:
        logger.warning(
            "AI discoverability HTTP error for %s: %s %s",
            product_url, exc.response.status_code, exc.response.text[:200],
        )
        return None
    except Exception:
        logger.exception("AI discoverability fetch error for %s", product_url)
        return None
