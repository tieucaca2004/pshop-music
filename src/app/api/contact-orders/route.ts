import { NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/db";

const schema = z.object({
  name: z.string().trim().min(2, "Vui lòng nhập họ tên hợp lệ.").max(150),
  phone: z
    .string()
    .trim()
    .regex(/^[0-9+\s]{8,15}$/, "Số điện thoại không hợp lệ."),
  email: z.string().trim().email().optional().or(z.literal("")),
  message: z.string().trim().max(2000).optional().or(z.literal("")),
  productId: z.number().int().positive().optional(),
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
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." },
      { status: 400 }
    );
  }

  const { name, phone, email, message, productId } = parsed.data;

  try {
    await query(
      "INSERT INTO contact_orders (name, phone, email, message, product_id) VALUES (?, ?, ?, ?, ?)",
      [name, phone, email || null, message || null, productId ?? null]
    );
  } catch (err) {
    console.error("Failed to save contact order", err);
    return NextResponse.json({ error: "Không thể gửi yêu cầu, vui lòng thử lại sau." }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
