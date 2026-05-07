// Storage helpers backed by Supabase Storage

import { supabase } from "./supabase";

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

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  const bucket = getBucketName();
  const key = normalizeKey(relKey);
  const uploadBody = toUploadBody(data);

  const { error } = await supabase.storage
    .from(bucket)
    .upload(key, uploadBody, { contentType, upsert: false });

  if (error) {
    throw new Error(`Storage upload failed: ${error.message}`);
  }

  const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(key);

  return { key, url: urlData.publicUrl };
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string; }> {
  const bucket = getBucketName();
  const key = normalizeKey(relKey);
  const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(key);

  return {
    key,
    url: urlData.publicUrl,
  };
}
