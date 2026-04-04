import { auth } from "@/auth";

export const proxy = auth((req) => {
  if (
    !req.auth &&
    (req.nextUrl.pathname.startsWith("/dashboard") ||
      req.nextUrl.pathname.startsWith("/settings"))
  ) {
    return Response.redirect(new URL("/", req.nextUrl.origin));
  }

  // Protect /admin/* routes — require authenticated admin user
  if (req.nextUrl.pathname.startsWith("/admin")) {
    if (!req.auth || req.auth.user?.role !== "admin") {
      return Response.redirect(new URL("/", req.nextUrl.origin));
    }
  }
});
