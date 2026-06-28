import type { Metadata } from "next";
import { Phone, Mail, MapPin, Clock } from "lucide-react";
import { ContactOrderForm } from "@/components/contact-order-form";

export const metadata: Metadata = {
  title: "Liên hệ đặt hàng",
  description: "Liên hệ Pshop Music để được tư vấn và đặt mua thiết bị DJ, loa kiểm âm, tai nghe chính hãng.",
};

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-12">
      <h1 className="font-heading text-3xl font-bold">Liên hệ đặt hàng</h1>
      <p className="mt-2 max-w-xl text-muted-foreground">
        Gửi thông tin cho chúng tôi hoặc liên hệ trực tiếp, Pshop Music sẽ phản hồi trong vòng 30 phút
        trong giờ làm việc.
      </p>

      <div className="mt-10 grid gap-10 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-6">
          <ContactOrderForm />
        </div>

        <div className="space-y-6">
          <div className="flex items-start gap-3">
            <Phone className="mt-1 shrink-0 text-accent" size={20} />
            <div>
              <p className="font-semibold text-foreground">Hotline</p>
              <a href="tel:0900000000" className="cursor-pointer text-muted-foreground hover:text-accent transition-colors duration-200">
                0900 000 000
              </a>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Mail className="mt-1 shrink-0 text-accent" size={20} />
            <div>
              <p className="font-semibold text-foreground">Email</p>
              <a href="mailto:hello@pshopmusic.vn" className="cursor-pointer text-muted-foreground hover:text-accent transition-colors duration-200">
                hello@pshopmusic.vn
              </a>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <MapPin className="mt-1 shrink-0 text-accent" size={20} />
            <div>
              <p className="font-semibold text-foreground">Showroom</p>
              <p className="text-muted-foreground">123 Đường Âm Nhạc, Quận 1, TP. Hồ Chí Minh</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Clock className="mt-1 shrink-0 text-accent" size={20} />
            <div>
              <p className="font-semibold text-foreground">Giờ làm việc</p>
              <p className="text-muted-foreground">8:00 - 21:00, tất cả các ngày trong tuần</p>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-border">
            <iframe
              title="Bản đồ Pshop Music"
              src="https://www.google.com/maps?q=Ho+Chi+Minh+City&output=embed"
              className="h-64 w-full"
              loading="lazy"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
