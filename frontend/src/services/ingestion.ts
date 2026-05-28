/**
 * Ingestion API: the demo scenario catalogue and the file-upload entry point.
 */
import { api } from "./api";
import type { ScenariosResponse, UploadResponse } from "@/types/invoice";

export const ingestionService = {
  /** Available demo upload scenarios. */
  scenarios: () =>
    api.get<ScenariosResponse>("/api/v1/ingestion/scenarios"),

  /** Upload a source document (multipart). */
  upload: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return api.postForm<UploadResponse>("/api/v1/ingestion/upload", fd);
  },
};
