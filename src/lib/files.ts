import { useEffect, useState } from "react";
import { sb } from "./supabase";
import type { SubmissionFile } from "../types";

const BUCKET = "task-files";
export const MAX_FILE = 10 * 1024 * 1024;
export const FILE_ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,.csv,.ppt,.pptx,.txt,.zip,image/jpeg,image/png,image/webp";

/** Upload a file for a task; returns the stored reference. */
export async function uploadTaskFile(taskId: string, file: File, folder = ""): Promise<SubmissionFile> {
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = taskId + "/" + (folder ? folder + "/" : "") + Date.now() + "-" + safe;
  const up = await sb.storage.from(BUCKET).upload(path, file, { contentType: file.type || "application/octet-stream" });
  if (up.error) throw up.error;
  const url = sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  return { url, name: file.name, type: file.type || "", size: file.size };
}

/** Extract the storage path from a stored task-files URL (public or signed form). */
function pathFromUrl(url: string): string | null {
  const m = url.match(/\/storage\/v1\/object\/(?:public|sign)\/task-files\/([^?]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

const cache = new Map<string, { url: string; exp: number }>();

/**
 * Resolve a stored file URL to one the signed-in user can open.
 * Works whether the bucket is public or private (signed URLs, 1h).
 */
export async function resolveFileUrl(url: string): Promise<string> {
  const path = pathFromUrl(url);
  if (!path) return url;
  const hit = cache.get(path);
  if (hit && hit.exp > Date.now()) return hit.url;
  const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) return url; // fall back to the stored URL
  cache.set(path, { url: data.signedUrl, exp: Date.now() + 50 * 60 * 1000 });
  return data.signedUrl;
}

export function useFileUrl(url: string | null | undefined): string | null {
  const [resolved, setResolved] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setResolved(null);
    if (url) resolveFileUrl(url).then((u) => alive && setResolved(u));
    return () => {
      alive = false;
    };
  }, [url]);
  return resolved;
}

export function fmtBytes(n: number): string {
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(0) + " KB";
  return (n / 1024 / 1024).toFixed(1) + " MB";
}
