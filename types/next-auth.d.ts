import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface User {
    role?: string;
    authSource?: string;
  }
  interface Session {
    user: {
      id?: string;
      role?: string;
      authSource?: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: string;
    userId?: string;
    authSource?: string;
  }
}
