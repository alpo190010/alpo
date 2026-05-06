import "next-auth";

export type PlanTier = "free" | "insights" | "fixes";

declare module "next-auth" {
  interface User {
    role?: string;
  }
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      image?: string;
      role?: string;
    };
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    role?: string;
  }
}
