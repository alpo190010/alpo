/** Map HTTP status codes to user-friendly error messages. */
export function getUserFriendlyError(
  status: number,
  detail?: string,
): string {
  if (typeof navigator !== "undefined" && !navigator.onLine)
    return "You appear to be offline. Check your connection and try again.";
  if (status === 401)
    return "Your session has expired. Please sign in again.";
  if (status === 403)
    return "You don't have permission to do that.";
  if (status === 404) return "That resource wasn't found.";
  if (status === 429)
    return "Too many requests. Please wait a moment and try again.";
  if (status >= 500)
    return "Our servers are having trouble. Please try again shortly.";
  return detail || "Something went wrong. Please try again.";
}
