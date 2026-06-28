import bcrypt from "bcryptjs";
import { query } from "@/lib/db";

type AdminUserRow = {
  id: number;
  email: string;
  password_hash: string;
  name: string;
};

export async function findAdminByEmail(email: string): Promise<AdminUserRow | null> {
  const rows = await query<AdminUserRow[]>(
    "SELECT id, email, password_hash, name FROM admin_users WHERE email = ? LIMIT 1",
    [email]
  );
  return rows[0] ?? null;
}

export async function verifyAdminPassword(email: string, password: string) {
  const admin = await findAdminByEmail(email);
  if (!admin) return null;
  const valid = await bcrypt.compare(password, admin.password_hash);
  return valid ? admin : null;
}
