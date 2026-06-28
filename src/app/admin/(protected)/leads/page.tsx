import { getAllLeadsAdmin } from "@/lib/admin-data";
import { deleteLead, updateLeadStatus } from "@/lib/actions/leads";
import { DeleteButton } from "@/components/admin/delete-button";
import { LeadStatusSelect } from "@/components/admin/lead-status-select";

export const dynamic = "force-dynamic";

export default async function AdminLeadsPage() {
  const leads = await getAllLeadsAdmin().catch(() => []);

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold">Yêu cầu liên hệ</h1>

      <div className="mt-6 overflow-hidden rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-card text-left text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Khách hàng</th>
              <th className="px-4 py-3 font-medium">Sản phẩm</th>
              <th className="px-4 py-3 font-medium">Lời nhắn</th>
              <th className="px-4 py-3 font-medium">Trạng thái</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {leads.map((lead) => (
              <tr key={lead.id}>
                <td className="px-4 py-3">
                  <p className="font-medium text-foreground">{lead.name}</p>
                  <p className="text-muted-foreground">{lead.phone}{lead.email ? ` · ${lead.email}` : ""}</p>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{lead.product_name ?? "Tư vấn chung"}</td>
                <td className="max-w-xs px-4 py-3 text-muted-foreground">
                  <span className="line-clamp-2">{lead.message ?? "—"}</span>
                </td>
                <td className="px-4 py-3">
                  <LeadStatusSelect leadId={lead.id} status={lead.status} onUpdate={updateLeadStatus} />
                </td>
                <td className="px-4 py-3 text-right">
                  <DeleteButton action={deleteLead.bind(null, lead.id)} confirmText="Xóa yêu cầu này?" />
                </td>
              </tr>
            ))}
            {leads.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  Chưa có yêu cầu liên hệ nào.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
