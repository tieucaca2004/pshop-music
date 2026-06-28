import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyAdminPassword } from "@/lib/admin-users";
import { signAdminToken, ADMIN_COOKIE } from "@/lib/auth";

const schema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(6),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Dữ liệu không hợp lệ." }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Email hoặc mật khẩu không hợp lệ." }, { status: 400 });
  }

  const admin = await verifyAdminPassword(parsed.data.email, parsed.data.password).catch(() => null);
  if (!admin) {
    return NextResponse.json({ error: "Email hoặc mật khẩu không đúng." }, { status: 401 });
  }

  const token = signAdminToken({ id: admin.id, email: admin.email, name: admin.name });

  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}
