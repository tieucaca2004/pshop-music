import Link from "next/link";
import {
  Package,
  Tags,
  Inbox,
  FileText,
  Megaphone,
  GalleryHorizontal,
  Bot,
  Images,
  Plus,
  Wand2,
  Database,
  HeartPulse,
  Cloud,
  CircleCheck,
  CircleAlert,
  CircleDot,
  type LucideIcon,
} from "lucide-react";
import {
  checkDatabaseHealth,
  getAllLeadsAdmin,
  getDashboardOverview,
  getRecentlyUpdatedProducts,
} from "@/lib/admin-data";
import { formatRelativeTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  const [overview, recentProducts, leads, dbHealthy] = await Promise.all([
    getDashboardOverview().catch(() => ({
      productsTotal: 0,
      productsInStock: 0,
      categoriesTotal: 0,
      leadsTotal: 0,
      leadsNew: 0,
      mediaTotal: 0,
    })),
    getRecentlyUpdatedProducts(5).catch(() => []),
    getAllLeadsAdmin().catch(() => []),
    checkDatabaseHealth().catch(() => false),
  ]);

  const recentLeads = leads.slice(0, 5);

  const moduleCards: ModuleCard[] = [
    {
      id: "products",
      label: "Sản phẩm",
      icon: Package,
      href: "/admin/products",
      total: overview.productsTotal,
      status: `${overview.productsInStock} còn hàng`,
    },
    {
      id: "categories",
      label: "Danh mục",
      icon: Tags,
      href: "/admin/categories",
      total: overview.categoriesTotal,
      status: "Đang hoạt động",
    },
    { id: "blogs", label: "Blog", icon: FileText, status: "Chưa triển khai" },
    { id: "banners", label: "Banner", icon: Megaphone, status: "Chưa triển khai" },
    { id: "sliders", label: "Slider", icon: GalleryHorizontal, status: "Chưa triển khai" },
    {
      id: "orders",
      label: "Yêu cầu liên hệ",
      icon: Inbox,
      href: "/admin/leads",
      total: overview.leadsTotal,
      status: `${overview.leadsNew} mới`,
    },
    { id: "ai", label: "AI", icon: Bot, status: "Chưa cấu hình" },
    {
      id: "media",
      label: "Thư viện ảnh",
      icon: Images,
      href: "/admin/media",
      total: overview.mediaTotal,
      status: "Dùng chung mọi sản phẩm",
    },
  ];

  const quickActions: QuickAction[] = [
    { label: "Thêm sản phẩm", icon: Plus, href: "/admin/products/new" },
    { label: "Thêm Blog", icon: FileText },
    { label: "Thêm Banner", icon: Megaphone },
    { label: "Mở Media Library", icon: Images, href: "/admin/media" },
    { label: "AI Assistant", icon: Wand2 },
  ];

  const statusItems: StatusItem[] = [
    { label: "Database", ok: dbHealthy, detail: dbHealthy ? "Kết nối tốt" : "Không thể kết nối" },
    { label: "AI Provider", ok: null, detail: "Chưa cấu hình" },
    { label: "Queue", ok: null, detail: "Chưa cấu hình" },
    { label: "Storage", ok: null, detail: "Chưa cấu hình (ảnh chỉ lưu dạng URL)" },
    { label: "Health", ok: dbHealthy, detail: dbHealthy ? "Bình thường" : "Cần chú ý" },
  ];

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold">Tổng quan</h1>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {moduleCards.map((card) => (
          <DashboardCard key={card.id} {...card} />
        ))}
      </div>

      <div className="mt-8 rounded-xl border border-border bg-card p-5">
        <h2 className="font-heading text-lg font-bold">Quick Actions</h2>
        <div className="mt-3 flex flex-wrap gap-3">
          {quickActions.map((action) => (
            <QuickActionButton key={action.label} {...action} />
          ))}
        </div>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <div className="rounded-xl border border-border bg-card p-5">
            <h2 className="font-heading text-lg font-bold">Recent Activity</h2>
            <div className="mt-3 space-y-4">
              <ActivityGroup label="Sản phẩm vừa sửa">
                {recentProducts.length === 0 ? (
                  <EmptyActivity text="Chưa có sản phẩm nào được sửa." />
                ) : (
                  recentProducts.map((p) => (
                    <ActivityRow key={p.id} title={p.name} meta={formatRelativeTime(p.updated_at)} href={`/admin/products/${p.id}`} />
                  ))
                )}
              </ActivityGroup>
              <ActivityGroup label="Blog vừa tạo">
                <EmptyActivity text="Chưa có module Blog." />
              </ActivityGroup>
              <ActivityGroup label="Banner vừa cập nhật">
                <EmptyActivity text="Chưa có module Banner." />
              </ActivityGroup>
              <ActivityGroup label="AI Draft gần nhất">
                <EmptyActivity text="AI Provider chưa được cấu hình." />
              </ActivityGroup>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-5">
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

        <div className="rounded-xl border border-border bg-card p-5 lg:self-start">
          <h2 className="font-heading text-lg font-bold">System Status</h2>
          <p className="mt-1 text-xs text-muted-foreground">Chỉ đọc dữ liệu, không thay đổi cấu hình.</p>
          <div className="mt-3 divide-y divide-border">
            {statusItems.map((item) => (
              <StatusRow key={item.label} {...item} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

type ModuleCard = {
  id: string;
  label: string;
  icon: LucideIcon;
  href?: string;
  total?: number;
  status: string;
};

function DashboardCard({ label, icon: Icon, href, total, status }: ModuleCard) {
  const content = (
    <>
      <div className="flex items-center justify-between">
        <Icon className="text-accent" size={20} />
        {!href && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Sắp có
          </span>
        )}
      </div>
      <p className="mt-3 text-2xl font-bold">{total ?? "—"}</p>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-xs text-muted-foreground">{status}</p>
    </>
  );

  if (href) {
    return (
      <Link href={href} className="block cursor-pointer rounded-xl border border-border bg-card p-5 hover:border-accent transition-colors duration-200">
        {content}
      </Link>
    );
  }

  return <div className="rounded-xl border border-border bg-card/60 p-5 opacity-60">{content}</div>;
}

type QuickAction = { label: string; icon: LucideIcon; href?: string };

function QuickActionButton({ label, icon: Icon, href }: QuickAction) {
  if (href) {
    return (
      <Link
        href={href}
        className="flex cursor-pointer items-center gap-2 rounded-lg border border-accent px-4 py-2.5 text-sm font-semibold text-accent transition-colors duration-200 hover:bg-accent hover:text-accent-foreground"
      >
        <Icon size={16} />
        {label}
      </Link>
    );
  }

  return (
    <span
      aria-disabled="true"
      title="Chưa triển khai trong Sprint này"
      className="flex cursor-not-allowed items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-semibold text-muted-foreground opacity-60"
    >
      <Icon size={16} />
      {label}
    </span>
  );
}

function ActivityGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-2 space-y-1.5">{children}</div>
    </div>
  );
}

function ActivityRow({ title, meta, href }: { title: string; meta: string; href: string }) {
  return (
    <Link href={href} className="flex cursor-pointer items-center justify-between rounded-lg px-2 py-1.5 text-sm hover:bg-muted transition-colors duration-200">
      <span className="truncate text-foreground">{title}</span>
      <span className="shrink-0 pl-3 text-xs text-muted-foreground">{meta}</span>
    </Link>
  );
}

function EmptyActivity({ text }: { text: string }) {
  return <p className="px-2 text-sm text-muted-foreground">{text}</p>;
}

type StatusItem = { label: string; ok: boolean | null; detail: string };

const statusMeta: Record<string, { icon: LucideIcon; className: string }> = {
  Database: { icon: Database, className: "" },
  "AI Provider": { icon: Bot, className: "" },
  Queue: { icon: Cloud, className: "" },
  Storage: { icon: Cloud, className: "" },
  Health: { icon: HeartPulse, className: "" },
};

function StatusRow({ label, ok, detail }: StatusItem) {
  const StatusIcon = ok === true ? CircleCheck : ok === false ? CircleAlert : CircleDot;
  const colorClass = ok === true ? "text-emerald-500" : ok === false ? "text-destructive" : "text-muted-foreground";
  const LabelIcon = statusMeta[label]?.icon ?? Database;

  return (
    <div className="flex items-center justify-between gap-3 py-3 text-sm">
      <span className="flex items-center gap-2 font-medium text-foreground">
        <LabelIcon size={15} className="text-muted-foreground" />
        {label}
      </span>
      <span className={`flex items-center gap-1.5 text-xs ${colorClass}`}>
        <StatusIcon size={14} />
        {detail}
      </span>
    </div>
  );
}
