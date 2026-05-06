import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import * as jwt from "jsonwebtoken";
import type { JWT } from "@auth/core/jwt";
import { API_URL } from "@/lib/api";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google,
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const res = await fetch(`${API_URL}/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: credentials?.email,
            password: credentials?.password,
          }),
        });
        if (res.status === 403) {
          throw new Error("EmailNotVerified");
        }
        if (!res.ok) return null;
        const data = await res.json();
        return {
          id: data.id,
          email: data.email,
          name: data.name,
          image: data.picture, // Map picture → image for Auth.js
          role: data.role,
        };
      },
    }),
  ],
  session: { strategy: "jwt" },
  jwt: {
    async encode({ token, secret }) {
      const signingSecret = Array.isArray(secret) ? secret[0] : secret;
      return jwt.sign(token as object, signingSecret, { algorithm: "HS256" });
    },
    async decode({ token, secret }) {
      if (!token) return null;
      try {
        const signingSecret = Array.isArray(secret) ? secret[0] : secret;
        return jwt.verify(token, signingSecret, {
          algorithms: ["HS256"],
        }) as JWT;
      } catch {
        return null;
      }
    },
  },
  callbacks: {
    async jwt({ token, account, profile, user }) {
      if (account?.provider === "google" && profile) {
        // Call FastAPI to resolve/create/link user and get Postgres UUID
        try {
          const res = await fetch(`${API_URL}/auth/google-signin`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              google_sub: profile.sub,
              email: profile.email,
              name: profile.name,
              picture: profile.picture,
            }),
          });
          if (res.ok) {
            const data = await res.json();
            token.sub = data.id; // Postgres UUID
            token.email = data.email;
            token.name = data.name;
            token.picture = data.picture;
            token.role = data.role;
          } else {
            // Fallback: use Google profile directly (legacy behavior)
            console.warn(
              `[auth] /auth/google-signin returned ${res.status}, falling back to Google profile`
            );
            token.sub = profile.sub ?? undefined;
            token.email = profile.email ?? undefined;
            token.name = profile.name ?? undefined;
            token.picture = profile.picture ?? undefined;
            token.role = "user";
          }
        } catch (err) {
          // Network error — fall back to Google profile
          console.warn("[auth] /auth/google-signin unreachable, falling back to Google profile", err);
          token.sub = profile.sub ?? undefined;
          token.email = profile.email ?? undefined;
          token.name = profile.name ?? undefined;
          token.picture = profile.picture ?? undefined;
          token.role = "user";
        }
      }
      if (account?.provider === "credentials" && user) {
        // authorize() already returned {id: uuid, email, name, image}
        token.sub = user.id;
        token.email = user.email;
        token.name = user.name;
        token.picture = user.image;
        token.role = user.role ?? "user";
      }
      return token;
    },
    session({ session, token }) {
      // Expose token fields on the session object for client access
      if (session.user) {
        session.user.id = token.sub ?? "";
        session.user.email = token.email ?? "";
        session.user.name = token.name ?? "";
        session.user.image = token.picture as string | undefined;
        session.user.role = token.role ?? "user";
      }
      return session;
    },
  },
});
