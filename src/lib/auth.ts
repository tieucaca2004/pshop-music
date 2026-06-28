import jwt from "jsonwebtoken";

export const ADMIN_COOKIE = "admin_token";

export type AdminTokenPayload = {
  id: number;
  email: string;
  name: string;
};

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");
  return secret;
}

export function signAdminToken(payload: AdminTokenPayload): string {
  return jwt.sign(payload, getSecret(), { expiresIn: "7d" });
}

export function verifyAdminToken(token: string): AdminTokenPayload | null {
  try {
    return jwt.verify(token, getSecret()) as AdminTokenPayload;
  } catch {
    return null;
  }
}
