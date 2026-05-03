import "next-auth";

export type PlanTier = "free" | "insights" | "fixes";

declare module "next-auth" {
  interface User {
    role?: string;
    plan_tier?: PlanTier;
  }
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      image?: string;
      role?: string;
      plan_tier?: PlanTier;
    };
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    role?: string;
    plan_tier?: "free" | "insights" | "fixes";
  }
}
