import type { Metadata } from "next";
import { Rubik, Nunito_Sans } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";

const rubik = Rubik({
  variable: "--font-rubik",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

const nunitoSans = Nunito_Sans({
  variable: "--font-nunito",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://pshopmusic.vn"),
  title: {
    default: "Pshop Music - Thiết bị DJ, Loa kiểm âm, Tai nghe chuyên nghiệp",
    template: "%s | Pshop Music",
  },
  description:
    "Pshop Music chuyên cung cấp thiết bị DJ, bàn DJ, loa kiểm âm, tai nghe và phụ kiện âm thanh chính hãng cho DJ, producer và phòng thu tại Việt Nam.",
  openGraph: {
    type: "website",
    locale: "vi_VN",
    siteName: "Pshop Music",
    title: "Pshop Music - Thiết bị DJ, Loa kiểm âm, Tai nghe chuyên nghiệp",
    description:
      "Thiết bị DJ, bàn DJ, loa kiểm âm, tai nghe và phụ kiện âm thanh chính hãng cho DJ, producer và phòng thu.",
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="vi"
      className={`${rubik.variable} ${nunitoSans.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground font-sans">
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
