import Link from "next/link";
import { Package, Tags, Inbox } from "lucide-react";
import { getAdminStats, getAllLeadsAdmin } from "@/lib/admin-data";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  const [stats, leads] = await Promise.all([
    getAdminStats().catch(() => ({ products: 0, categories: 0, newLeads: 0 })),
    getAllLeadsAdmin().catch(() => []),
  ]);

  const recentLeads = leads.slice(0, 5);

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold">Tổng quan</h1>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <StatCard icon={Package} label="Sản phẩm" value={stats.products} href="/admin/products" />
        <StatCard icon={Tags} label="Danh mục" value={stats.categories} href="/admin/categories" />
        <StatCard icon={Inbox} label="Yêu cầu mới" value={stats.newLeads} href="/admin/leads" />
      </div>

      <div className="mt-8 rounded-xl border border-border bg-card p-5">
        <h2 className="font-heading text-lg font-bold">Yêu cầu liên hệ gần đây</h2>
        {recentLeads.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">Chưa có yêu cầu nào.</p>
        ) : (
          <div className="mt-3 divide-y divide-border">
            {recentLeads.map((lead) => (
              <div key={lead.id} className="flex items-center justify-between py-3 text-sm">
                <div>
                  <p className="font-medium text-foreground">{lead.name} · {lead.phone}</p>
                  <p className="text-muted-foreground">{lead.product_name ?? "Tư vấn chung"}</p>
                </div>
                <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                  {lead.status}
                </span>
              </div>
            ))}
          </div>
        )}
        <Link href="/admin/leads" className="mt-3 inline-block cursor-pointer text-sm font-semibold text-accent hover:underline">
          Xem tất cả →
        </Link>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: typeof Package;
  label: string;
  value: number;
  href: string;
}) {
  return (
    <Link href={href} className="block cursor-pointer rounded-xl border border-border bg-card p-5 hover:border-accent transition-colors duration-200">
      <Icon className="text-accent" size={22} />
      <p className="mt-3 text-2xl font-bold">{value}</p>
      <p className="text-sm text-muted-foreground">{label}</p>
    </Link>
  );
}
