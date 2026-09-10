/**
 * useUploads
 * -----------------------------------------------------------------------
 * React Query hooks for the `/api/uploads.php` endpoint that manages
 * admin-uploaded media (images per page section + PDFs).
 *
 * Sections supported by the backend:
 *   - 'eventos'      → poster grid for the Eventos page
 *   - 'avisos'       → poster grid for the Avisos page
 *   - 'menus'        → poster grid for the Menús page
 *   - 'premios'      → poster grid for the Premios page
 *   - 'convocatoria' → reserved poster grid for the Convocatoria page
 *   - 'reglas'       → reserved poster grid for the Reglas page
 *   - 'pdfs'         → PDFs referenced by Convocatoria/Reglas pages
 *   - 'popup'        → images used by the site-wide POP UP overlay
 *
 * The list endpoint is public (read-only). Upload + delete require the
 * shared admin password (`admin2025`) sent in the multipart/JSON body.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from '@/lib/apiClient';
import { getConfigScope, useConfigScope } from '@/lib/configScope';

/** Section identifiers accepted by the uploads endpoint. */
export type UploadSection = 'eventos' | 'avisos' | 'menus' | 'premios' | 'hoteles' | 'convocatoria' | 'reglas' | 'skinrules' | 'banderas' | 'pdfs' | 'popup' | 'heros';

/** Single uploaded file as returned by the listing endpoint. */
export interface UploadedFile {
  /** Sanitized server-side filename (e.g. `01-clima.webp`). */
  name: string;
  /** Public URL relative to the current origin (e.g. `/api/uploads/{domain}/eventos/01-clima.webp`). */
  url: string;
  /** Auto-generated alt label derived from the filename. */
  alt: string;
  /** File size in bytes. */
  size: number;
  /** Last-modified Unix timestamp (seconds). */
  modified: number;
  /**
   * Generated WebP thumbnail URLs keyed by size (images only).
   *  - `small`  ≈480px wide → poster grids
   *  - `medium` ≈1000px wide → lightbox placeholder / small screens
   * Absent (or empty) when the server can't generate thumbnails (no GD) or
   * for non-image files; callers must fall back to `url`.
   */
  thumbs?: Partial<Record<'small' | 'medium', string>>;
  /** Shorthand for `thumbs.small` — the grid-sized variant. */
  thumbUrl?: string | null;
}

/** Response shape of `GET /api/uploads.php?section=...`. */
interface UploadsListResponse {
  section: UploadSection;
  /** Human-readable label: 'imagen' | 'PDF'. */
  kind: string;
  files: UploadedFile[];
}

/** Response shape of `POST /api/uploads.php?action=upload`. */
interface UploadResponse {
  section: UploadSection;
  saved: Array<{ name: string; original: string; url: string; size: number }>;
  errors: Array<{ name: string; error: string }>;
}

/**
 * Multi-torneo: cada torneo guarda sus archivos en su propia carpeta
 * (`scope=<torneoid>`); el alcance `general` conserva la carpeta histórica
 * del dominio, así los sitios de un solo torneo no cambian.
 */
const scopeParam = (scope?: string) => `&scope=${encodeURIComponent(scope ?? getConfigScope())}`;

/** Build the listing endpoint URL for a section. */
const listUrl = (section: UploadSection, scope?: string) =>
  `/api/uploads.php?section=${encodeURIComponent(section)}${scopeParam(scope)}`;

/** Build the upload endpoint URL for a section. */
const uploadUrl = (section: UploadSection, scope?: string) =>
  `/api/uploads.php?section=${encodeURIComponent(section)}&action=upload${scopeParam(scope)}`;

/** Build the delete endpoint URL for a section. */
const deleteUrl = (section: UploadSection, scope?: string) =>
  `/api/uploads.php?section=${encodeURIComponent(section)}&action=delete${scopeParam(scope)}`;

/** React Query key factory. */
export const uploadsQueryKey = (section: UploadSection, scope: string = getConfigScope()) =>
  ['uploads', scope, section] as const;

/**
 * useUploadsList
 * Lists files currently present in the given section folder on the server.
 * Cached for 30 s; invalidated automatically after upload/delete mutations.
 */
export const useUploadsList = (section: UploadSection) => {
  const scope = useConfigScope();
  return useQuery<UploadsListResponse>({
    queryKey: uploadsQueryKey(section, scope),
    queryFn: () => apiFetch<UploadsListResponse>(listUrl(section, scope)),
    staleTime: 30_000,
  });
};

/**
 * useUploadFiles
 * Mutation: upload one or more files (multipart/form-data) to the section.
 * Uses raw `fetch` because the shared `apiFetch` only handles GET/JSON.
 */
export const useUploadFiles = (section: UploadSection) => {
  const queryClient = useQueryClient();
  const scope = useConfigScope();

  return useMutation<UploadResponse, Error, { files: File[]; password: string }>({
    mutationFn: async ({ files, password }) => {
      if (files.length === 0) {
        throw new Error('Selecciona al menos un archivo.');
      }
      const formData = new FormData();
      formData.append('password', password);
      // Backend accepts repeated `files[]` field for multi-file uploads.
      files.forEach((file) => formData.append('files[]', file, file.name));

      const response = await fetch(uploadUrl(section, scope), {
        method: 'POST',
        body: formData,
      });
      const text = await response.text();
      let parsed: any = null;
      try { parsed = text ? JSON.parse(text) : null; } catch { parsed = null; }

      if (!response.ok) {
        const message = parsed?.error || `Error subiendo archivos (HTTP ${response.status})`;
        throw new ApiError(message, response.status, uploadUrl(section, scope), text, parsed);
      }
      if (!parsed) {
        throw new ApiError('Respuesta inválida del servidor', response.status, uploadUrl(section, scope), text);
      }
      return parsed as UploadResponse;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: uploadsQueryKey(section, scope) });
    },
  });
};

/**
 * useDeleteFile
 * Mutation: delete a single file from the section folder by sanitized name.
 */
export const useDeleteFile = (section: UploadSection) => {
  const queryClient = useQueryClient();
  const scope = useConfigScope();

  return useMutation<{ deleted: true; name: string }, Error, { name: string; password: string }>({
    mutationFn: async ({ name, password }) => {
      const response = await fetch(deleteUrl(section, scope), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, password }),
      });
      const text = await response.text();
      let parsed: any = null;
      try { parsed = text ? JSON.parse(text) : null; } catch { parsed = null; }

      if (!response.ok) {
        const message = parsed?.error || `Error eliminando archivo (HTTP ${response.status})`;
        throw new ApiError(message, response.status, deleteUrl(section, scope), text, parsed);
      }
      return parsed as { deleted: true; name: string };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: uploadsQueryKey(section, scope) });
    },
  });
};
