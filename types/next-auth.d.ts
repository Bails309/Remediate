import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface User {
    roles?: string[];
    authSource?: string;
  }
  interface Session {
    user: {
      id?: string;
      roles?: string[];
      authSource?: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    roles?: string[];
    userId?: string;
    authSource?: string;
  }
}
