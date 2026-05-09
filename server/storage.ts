// Storage helpers backed by Supabase Storage

import { createClient } from "@supabase/supabase-js";

function getBucketName(): string {
  return process.env.SUPABASE_STORAGE_BUCKET || "documents";
}

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

function toUploadBody(data: Buffer | Uint8Array | string): Buffer {
  if (typeof data === "string") {
    return Buffer.from(data);
  }

  if (Buffer.isBuffer(data)) {
    return data;
  }

  return Buffer.from(data);
}

function getStorageAdminClient() {
  const url = process.env.SUPABASE_URL ?? "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

  if (!url || !serviceKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for storage uploads");
  }

  return createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${serviceKey}`,
      },
    },
  });
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  const bucket = getBucketName();
  const key = normalizeKey(relKey);
  const uploadBody = toUploadBody(data);
  const storageClient = getStorageAdminClient();

  const { error } = await storageClient.storage
    .from(bucket)
    .upload(key, uploadBody, { contentType, upsert: false });

  if (error) {
    throw new Error(`Storage upload failed: ${error.message}`);
  }

  const { data: urlData } = storageClient.storage.from(bucket).getPublicUrl(key);

  return { key, url: urlData.publicUrl };
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string; }> {
  const bucket = getBucketName();
  const key = normalizeKey(relKey);
  const storageClient = getStorageAdminClient();
  const { data: urlData } = storageClient.storage.from(bucket).getPublicUrl(key);

  return {
    key,
    url: urlData.publicUrl,
  };
}
