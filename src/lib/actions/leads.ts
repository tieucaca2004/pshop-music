"use server";

import { revalidatePath } from "next/cache";
import { query } from "@/lib/db";
import { requireAdminAction } from "@/lib/auth";

export async function updateLeadStatus(leadId: number, status: string) {
  await requireAdminAction();
  await query("UPDATE contact_orders SET status = ? WHERE id = ?", [status, leadId]);
  revalidatePath("/admin/leads");
}

export async function deleteLead(leadId: number) {
  await requireAdminAction();
  await query("DELETE FROM contact_orders WHERE id = ?", [leadId]);
  revalidatePath("/admin/leads");
}
