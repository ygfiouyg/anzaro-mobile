import type { MCPTool } from "../types";
import { getGoogleAuth, formatGoogleError, NOT_CONNECTED_ERROR } from "./google-auth";
interface DriveFileRaw { id: string; name?: string; mimeType?: string; size?: string; modifiedTime?: string; webViewLink?: string; iconLink?: string; }
interface DriveListResponse { files?: DriveFileRaw[]; }
const MIME_PRESETS: Record<string,string> = { pdf:"application/pdf", doc:"application/vnd.openxmlformats-officedocument.wordprocessingml.document", sheet:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", slide:"application/vnd.openxmlformats-officedocument.presentationml.presentation", folder:"application/vnd.google-apps.folder", gdoc:"application/vnd.google-apps.document", gsheet:"application/vnd.google-apps.spreadsheet" };

export const googleDriveFileSearchTool: MCPTool = {
  name: "google_drive_file_search",
  description: "ابحث في Google Drive عن ملفات بالاسم أو النوع (drive.readonly scope). استخدمها لما المستخدم يقول 'دورلي على ملف الـ X' أو 'عندي PDF اسمه كذا؟'. بترجع قائمة الملفات (id, name, link) جاهزة لتمريرها لـ google_drive_pdf_reader.",
  parameters: { type: "object", properties: {
    name: { type: "string", description: "الاسم أو جزء منه" },
    file_type: { type: "string", enum: ["pdf","doc","docx","sheet","xlsx","slide","folder","gdoc","gsheet"], description: "نوع الملف" },
    folder_id: { type: "string", description: "البحث داخل مجلد بـ ID" },
    max_results: { type: "number", description: "أقصى نتائج (افتراضي 10)" },
    include_trashed: { type: "boolean", description: "تضمين المحذوفات؟ (افتراضي false)" },
    shared_with_me: { type: "boolean", description: "الملفات المشتركة معاك بس؟ (افتراضي false)" },
  }, required: [] },
  async execute(params) {
    const name = String(params.name || "").trim();
    const fileType = String(params.file_type || "").trim();
    const folderId = String(params.folder_id || "").trim();
    const max = Number(params.max_results) > 0 ? Math.min(Number(params.max_results), 100) : 10;
    if (!name && !fileType && !folderId && params.shared_with_me !== true) return { success: false, error: "لازم تدي name أو file_type أو folder_id أو shared_with_me." };
    const mimeType = fileType ? (MIME_PRESETS[fileType] ?? fileType) : undefined;
    const auth = await getGoogleAuth();
    if (!auth) return { success: false, error: NOT_CONNECTED_ERROR };
    const parts = [`trashed = ${params.include_trashed === true ? "true" : "false"}`];
    if (params.shared_with_me === true) parts.push("sharedWithMe = true");
    if (name) parts.push(`name contains '${name.replace(/'/g,"\\'")}'`);
    if (mimeType) parts.push(`mimeType = '${mimeType}'`);
    if (folderId) parts.push(`'${folderId}' in parents`);
    const url = new URL("https://www.googleapis.com/drive/v3/files");
    url.searchParams.set("q", parts.join(" and "));
    url.searchParams.set("pageSize", String(max));
    url.searchParams.set("fields", "files(id,name,mimeType,size,modifiedTime,webViewLink,iconLink),nextPageToken,incompleteSearch");
    url.searchParams.set("orderBy", "modifiedTime desc");
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${auth.accessToken}` } });
    if (!resp.ok) return { success: false, error: await formatGoogleError(resp, "drive.files.list") };
    const data = (await resp.json()) as DriveListResponse;
    const files = (data.files ?? []).map((f) => ({ id: f.id, name: f.name ?? "(بدون اسم)", mime_type: f.mimeType ?? "unknown", size_bytes: f.size ? Number(f.size) : null, modified_time: f.modifiedTime ?? null, link: f.webViewLink ?? `https://drive.google.com/file/d/${f.id}/view`, is_folder: f.mimeType === "application/vnd.google-apps.folder" }));
    return { success: true, data: { query: { name, file_type: fileType, folder_id: folderId, include_trashed: params.include_trashed === true, shared_with_me: params.shared_with_me === true }, count: files.length, files, searched_by: auth.user?.email ?? null } };
  },
};
export default googleDriveFileSearchTool;
