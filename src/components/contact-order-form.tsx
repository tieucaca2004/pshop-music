"use client";

import { useState, type FormEvent } from "react";
import { Loader2, CheckCircle2 } from "lucide-react";

export function ContactOrderForm({ productId, productName }: { productId?: number; productName?: string }) {
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("submitting");
    setError(null);

    const form = e.currentTarget;
    const data = new FormData(form);
    const payload = {
      name: String(data.get("name") ?? ""),
      phone: String(data.get("phone") ?? ""),
      email: String(data.get("email") ?? ""),
      message: String(data.get("message") ?? ""),
      productId,
    };

    try {
      const res = await fetch("/api/contact-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Có lỗi xảy ra, vui lòng thử lại.");
      }
      setStatus("success");
      form.reset();
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Có lỗi xảy ra, vui lòng thử lại.");
    }
  }

  if (status === "success") {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-accent/40 bg-accent/10 p-5">
        <CheckCircle2 className="mt-0.5 shrink-0 text-accent" size={22} />
        <div>
          <p className="font-semibold text-foreground">Đã gửi yêu cầu thành công!</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Pshop Music sẽ liên hệ với bạn trong thời gian sớm nhất.
          </p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {productName && (
        <input type="hidden" name="product" value={productName} />
      )}
      <div>
        <label htmlFor="name" className="block text-sm font-medium text-foreground">
          Họ và tên <span className="text-destructive">*</span>
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          minLength={2}
          className="mt-1.5 w-full rounded-lg border border-border bg-background px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-accent"
          placeholder="Nguyễn Văn A"
        />
      </div>
      <div>
        <label htmlFor="phone" className="block text-sm font-medium text-foreground">
          Số điện thoại <span className="text-destructive">*</span>
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          required
          pattern="[0-9+\s]{8,15}"
          className="mt-1.5 w-full rounded-lg border border-border bg-background px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-accent"
          placeholder="09xx xxx xxx"
        />
      </div>
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-foreground">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          className="mt-1.5 w-full rounded-lg border border-border bg-background px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-accent"
          placeholder="email@vidu.com"
        />
      </div>
      <div>
        <label htmlFor="message" className="block text-sm font-medium text-foreground">
          Lời nhắn
        </label>
        <textarea
          id="message"
          name="message"
          rows={3}
          className="mt-1.5 w-full rounded-lg border border-border bg-background px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-accent"
          placeholder={productName ? `Tôi muốn đặt hàng: ${productName}` : "Tôi cần tư vấn về..."}
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <button
        type="submit"
        disabled={status === "submitting"}
        className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-accent px-5 py-3 font-semibold text-accent-foreground transition-colors duration-200 hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {status === "submitting" && <Loader2 className="animate-spin" size={18} />}
        {status === "submitting" ? "Đang gửi..." : "Gửi yêu cầu đặt hàng"}
      </button>
    </form>
  );
}
