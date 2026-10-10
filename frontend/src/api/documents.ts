import type { Http } from "./http";

export function createDocumentsApi(http: Http) {
  return {
    /**
     * GET /documents/{id}/content: the stored file as a Blob. The endpoint needs the bearer
     * token, so <a href> / <img src> cannot load it directly; use `open` or `download`.
     */
    fetchBlob: (id: string): Promise<Blob> => http.getBlob(`/documents/${id}/content`),

    /** Open the file in a new tab. */
    open: async (id: string): Promise<void> => {
      const url = URL.createObjectURL(await http.getBlob(`/documents/${id}/content`));
      window.open(url, "_blank", "noopener");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    },

    /** Save the file to disk under its original name. */
    download: async (id: string, filename: string): Promise<void> => {
      const url = URL.createObjectURL(await http.getBlob(`/documents/${id}/content?download=1`));
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    },
  };
}

export type DocumentsApi = ReturnType<typeof createDocumentsApi>;
