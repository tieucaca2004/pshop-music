import Link from "next/link";
import { LayoutDashboard, Package, Tags, Inbox, LogOut } from "lucide-react";
import { logoutAction } from "@/lib/actions/auth";
import { requireAdminPage } from "@/lib/auth";

const navItems = [
  { href: "/admin", label: "Tổng quan", icon: LayoutDashboard },
  { href: "/admin/products", label: "Sản phẩm", icon: Package },
  { href: "/admin/categories", label: "Danh mục", icon: Tags },
  { href: "/admin/leads", label: "Yêu cầu liên hệ", icon: Inbox },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage();

  return (
    <div className="mx-auto flex max-w-7xl gap-6 px-4 py-8">
      <aside className="w-56 shrink-0">
        <div className="sticky top-20 rounded-xl border border-border bg-card p-3">
          <p className="px-2 py-2 font-heading text-sm font-bold text-foreground">Pshop Admin</p>
          <nav className="mt-2 space-y-1">
            {navItems.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className="flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium text-foreground/90 hover:bg-muted transition-colors duration-200"
              >
                <Icon size={17} />
                {label}
              </Link>
            ))}
          </nav>
          <form action={logoutAction} className="mt-2 border-t border-border pt-2">
            <button
              type="submit"
              className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium text-destructive hover:bg-muted transition-colors duration-200"
            >
              <LogOut size={17} />
              Đăng xuất
            </button>
          </form>
        </div>
      </aside>
      <div className="flex-1">{children}</div>
    </div>
  );
}
