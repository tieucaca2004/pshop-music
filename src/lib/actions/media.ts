"use server";

import { requireAdminAction } from "@/lib/auth";
import { getMediaLibrary } from "@/lib/admin-data";

/** Backs the admin Media Library picker. Reuses product_images as the image store — no new schema. */
export async function fetchMediaLibrary(): Promise<string[]> {
  await requireAdminAction();
  return getMediaLibrary();
}
