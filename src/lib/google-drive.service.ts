import path from 'path'; import fs from 'fs';
// ═══════════════════════════════════════════════════════════════════════
// DeltaAI Platform — Google Drive Service
// ═══════════════════════════════════════════════════════════════════════
// Server-side module that authenticates with Google Drive API using a
// service account, searches for files by name in a specified folder,
// downloads and parses them (PDF, DOCX, TXT, CSV, etc.), and returns
// parsed text content for AI analysis.
//
// This module is SERVER-SIDE ONLY. Do not import in client-side code.
// ═══════════════════════════════════════════════════════════════════════

import { google } from 'googleapis';
import { readFileSync, createReadStream } from 'fs';
import { getEmbeddedServiceAccountJson } from './google-drive-credentials';

// ─── Types ────────────────────────────────────────────────────────────

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
  webViewLink?: string;
  iconLink?: string;
}

export interface ParsedFileContent {
  fileId: string;
  fileName: string;
  mimeType: string;
  text: string;
  truncated: boolean;
  sizeBytes?: number;
}

export interface DriveSearchResult {
  files: DriveFile[];
  contents: ParsedFileContent[];
  errors: string[];
}

// ─── Configuration ────────────────────────────────────────────────────

// Embedded credentials fallback — لو الـ env vars مش متاحة، استخدم الـ embedded
const EMBEDDED_SA_JSON = getEmbeddedServiceAccountJson();

// Priority: FILE PATH (raw JSON, correct newlines) → env var → embedded
// The raw JSON file has correct newlines, unlike env vars which can corrupt them.
const SERVICE_ACCOUNT_PATH = process.env.GD_SERVICE_ACCOUNT_PATH || 
  (() => {
    try {
      const filePath = path.join(process.cwd(), 'google-service-account.json');
      if (fs.existsSync(filePath)) return filePath;
    } catch {}
    return '';
  })();
// Only use env var if file path is NOT available
const SERVICE_ACCOUNT_JSON = SERVICE_ACCOUNT_PATH ? '' : (process.env.GD_SERVICE_ACCOUNT_JSON || EMBEDDED_SA_JSON || '');
const WRITE_SA_PATH = process.env.GD_WRITE_SA_PATH || '';
const WRITE_SA_JSON = process.env.GD_WRITE_SA_JSON || ''; // JSON string of write SA key
// SECURITY: No hardcoded folder ID — must be set via GD_FOLDER_ID env var
const FOLDER_ID = process.env.GD_FOLDER_ID || '';
const MAX_TEXT_LENGTH = 100_000; // 100KB max text content per file
const RAG_MAX_TEXT_LENGTH = 3_000; // 3000 chars max for RAG context to avoid context window overflow
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache

// ─── Drive Connection Check ────────────────────────────────────────────

/** Cached Drive connection status to avoid repeated API calls */
let driveConnectionCache: { connected: boolean; timestamp: number } | null = null;
const DRIVE_CHECK_CACHE_TTL = 2 * 60 * 1000; // 2 minutes

/**
 * Check if Google Drive is connected and accessible.
 * Uses a 2-minute cache to avoid hammering the Drive API.
 */
export async function checkDriveConnection(): Promise<{ connected: boolean }> {
  // Return cached status if fresh
  if (driveConnectionCache && Date.now() - driveConnectionCache.timestamp < DRIVE_CHECK_CACHE_TTL) {
    return { connected: driveConnectionCache.connected };
  }

  // Check if service account is configured
  const hasSA = !!(SERVICE_ACCOUNT_JSON || SERVICE_ACCOUNT_PATH);
  if (!hasSA) {
    driveConnectionCache = { connected: false, timestamp: Date.now() };
    return { connected: false };
  }

  // Try to list files to verify connection
  try {
    const files = await listDriveFiles(1);
    driveConnectionCache = { connected: true, timestamp: Date.now() };
    return { connected: true };
  } catch {
    driveConnectionCache = { connected: false, timestamp: Date.now() };
    return { connected: false };
  }
}

// ─── Setup Instructions ──────────────────────────────────────────────

/**
 * Get setup instructions for Google Drive integration.
 * Returns a human-readable guide for configuring the service account.
 * Used by admin UI to show setup guidance when Drive is not connected.
 */
export function getDriveSetupInstructions(): { configured: boolean; instructions: string } {
  const hasSA = !!(SERVICE_ACCOUNT_JSON || SERVICE_ACCOUNT_PATH);
  if (hasSA) {
    return { configured: true, instructions: 'Google Drive is configured.' };
  }
  return {
    configured: false,
    instructions: 'لربط Google Drive، تحتاج إلى:\n1. إنشاء Service Account على Google Cloud Console\n2. تفعيل Google Drive API\n3. إضافة مفتاح JSON كمتغير بيئة GD_SERVICE_ACCOUNT_JSON\n4. مشاركة مجلد Drive مع بريد Service Account',
  };
}

// ─── Cache ────────────────────────────────────────────────────────────

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const searchCache = new Map<string, CacheEntry<DriveSearchResult>>();
const fileContentCache = new Map<string, CacheEntry<ParsedFileContent>>();

function getFromCache<T>(cache: Map<string, CacheEntry<T>>, key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache<T>(cache: Map<string, CacheEntry<T>>, key: string, data: T): void {
  cache.set(key, { data, timestamp: Date.now() });
  // Prune old entries if cache is too large
  if (cache.size > 200) {
    const now = Date.now();
    for (const [k, v] of cache) {
      if (now - v.timestamp > CACHE_TTL_MS) cache.delete(k);
    }
  }
}

// ─── Google Drive Client ─────────────────────────────────────────────

let _driveClient: ReturnType<typeof google.drive> | null = null;

async function getDriveClient() {
  if (_driveClient) return _driveClient;

  try {
    let serviceAccount: { client_email: string; private_key: string };

    // Priority 1: Read from environment variable (GD_SERVICE_ACCOUNT_JSON)
    if (SERVICE_ACCOUNT_JSON) {
      console.log('[Drive] Using service account from GD_SERVICE_ACCOUNT_JSON env var');
      if (typeof SERVICE_ACCOUNT_JSON === 'string') {
        serviceAccount = JSON.parse(SERVICE_ACCOUNT_JSON);
      } else {
        serviceAccount = SERVICE_ACCOUNT_JSON as any;
      }
    }
    // Priority 2: Read from file path (GD_SERVICE_ACCOUNT_PATH)
    else if (SERVICE_ACCOUNT_PATH) {
      console.log('[Drive] Using service account from file:', SERVICE_ACCOUNT_PATH);
      const serviceAccountRaw = readFileSync(SERVICE_ACCOUNT_PATH, 'utf-8');
      serviceAccount = JSON.parse(serviceAccountRaw);
    }
    else {
      throw new Error('Neither GD_SERVICE_ACCOUNT_JSON nor GD_SERVICE_ACCOUNT_PATH is configured');
    }

    // Clean private key: replace literal \n with real newlines
    let privateKey = serviceAccount.private_key.replace(/\\n/g, '\n');
    if (!privateKey.endsWith('\n')) privateKey += '\n';

    const auth = new google.auth.JWT({
      email: serviceAccount.client_email,
      key: privateKey,
      scopes: ['https://www.googleapis.com/auth/drive.readonly'],
    });

    // Force authorizing the client before using it
    await auth.authorize();
    console.log('[Drive] Service account authenticated successfully as:', serviceAccount.client_email);

    _driveClient = google.drive({ version: 'v3', auth });
    console.log('[Drive] Google Drive client initialized successfully — folder:', FOLDER_ID);
    return _driveClient;
  } catch (error) {
    console.error('[Drive] Failed to initialize Google Drive client:', error);
    _driveClient = null; // Reset so we can retry
    throw new Error('Failed to initialize Google Drive client: ' + (error instanceof Error ? error.message : String(error)));
  }
}

// ─── File Type Detection ─────────────────────────────────────────────

type FileCategory = 'google_doc' | 'google_sheet' | 'google_slide' | 'pdf' | 'docx' | 'text' | 'csv' | 'xlsx' | 'unsupported';

function categorizeFile(mimeType: string, fileName: string): FileCategory {
  // Google Workspace MIME types
  if (mimeType === 'application/vnd.google-apps.document') return 'google_doc';
  if (mimeType === 'application/vnd.google-apps.spreadsheet') return 'google_sheet';
  if (mimeType === 'application/vnd.google-apps.presentation') return 'google_slide';

  // Standard file types by extension
  const ext = fileName.split('.').pop()?.toLowerCase() || '';

  if (mimeType === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || ext === 'docx') return 'docx';
  if (mimeType === 'text/plain' || ext === 'txt' || ext === 'md') return 'text';
  if (mimeType === 'text/csv' || ext === 'csv') return 'csv';
  if (mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || ext === 'xlsx') return 'xlsx';

  // Also check MIME type for common text formats
  if (mimeType.startsWith('text/')) return 'text';

  return 'unsupported';
}

/** Get the export MIME type for Google Workspace files */
function getExportMimeType(category: FileCategory): string | null {
  switch (category) {
    case 'google_doc': return 'text/plain';
    case 'google_sheet': return 'text/csv';
    case 'google_slide': return 'text/plain';
    default: return null;
  }
}

// ─── Core Functions ──────────────────────────────────────────────────

/**
 * Search for files by name in the configured Google Drive folder.
 * Uses a "contains" query for flexible matching.
 * Also performs fuzzy matching: tries full query first, then individual words,
 * then partial words (first 3+ chars) for better results.
 */
export async function searchDriveFiles(query: string): Promise<DriveFile[]> {
  // Guard: if no folder ID configured, skip Drive search entirely
  if (!FOLDER_ID) {
    console.warn('[Drive] GD_FOLDER_ID not set — skipping Drive search');
    return [];
  }
  const drive = await getDriveClient();
  const searchQuery = query.trim();

  if (!searchQuery) return [];

  const seenIds = new Set<string>();
  const allFiles: DriveFile[] = [];

  // Helper to execute a Drive search query and add unique results
  async function searchWithQuery(q: string): Promise<void> {
    try {
      const response = await drive.files.list({
        q,
        fields: 'files(id, name, mimeType, size, modifiedTime, webViewLink, iconLink)',
        pageSize: 20,
        spaces: 'drive',
      });

      for (const f of response.data.files || []) {
        const id = f.id || '';
        if (id && !seenIds.has(id)) {
          seenIds.add(id);
          allFiles.push({
            id,
            name: f.name || '',
            mimeType: f.mimeType || '',
            size: f.size || undefined,
            modifiedTime: f.modifiedTime || undefined,
            webViewLink: f.webViewLink || undefined,
            iconLink: f.iconLink || undefined,
          });
        }
      }
    } catch (err) {
      console.warn(`[Drive] Search query failed: "${q}"`, err);
    }
  }

  try {
    // Step 1: Exact full query search
    const escapedQuery = searchQuery.replace(/'/g, "\\'");
    const fullQuery = `'${FOLDER_ID}' in parents and trashed = false and name contains '${escapedQuery}'`;
    await searchWithQuery(fullQuery);

    // If we found results, return them
    if (allFiles.length > 0) {
      console.log(`[Drive] Search "${searchQuery}" found ${allFiles.length} files (exact)`);
      return allFiles;
    }

    // Step 2: Search by individual words (split by spaces, Arabic/English)
    const words = searchQuery.split(/[\s,،.؟?؛;]+/).filter(w => w.length >= 2);
    for (const word of words) {
      const escapedWord = word.replace(/'/g, "\\'");
      const wordQuery = `'${FOLDER_ID}' in parents and trashed = false and name contains '${escapedWord}'`;
      await searchWithQuery(wordQuery);
    }

    // If we found results, return them
    if (allFiles.length > 0) {
      console.log(`[Drive] Search "${searchQuery}" found ${allFiles.length} files (word match)`);
      return allFiles;
    }

    // Step 3: Fuzzy — try partial words (first 3+ characters)
    for (const word of words) {
      if (word.length >= 4) {
        // Try progressively shorter prefixes
        for (let len = Math.min(word.length - 1, 6); len >= 3; len--) {
          const partial = word.slice(0, len).replace(/'/g, "\\'");
          const partialQuery = `'${FOLDER_ID}' in parents and trashed = false and name contains '${partial}'`;
          await searchWithQuery(partialQuery);
          if (allFiles.length > 0) break;
        }
      }
      if (allFiles.length > 0) break;
    }

    console.log(`[Drive] Search "${searchQuery}" found ${allFiles.length} files (fuzzy)`);
    return allFiles;
  } catch (error) {
    console.error('[Drive] Search error:', error);
    return [];
  }
}

/**
 * Download and parse a file from Google Drive.
 * Supports: Google Docs/Sheets/Slides (via export), PDF, DOCX, TXT, CSV, XLSX.
 */
export async function downloadAndParseFile(fileId: string, fileName?: string, mimeType?: string): Promise<ParsedFileContent> {
  // Check cache first
  const cacheKey = `file_${fileId}`;
  const cached = getFromCache(fileContentCache, cacheKey);
  if (cached) return cached;

  const drive = await getDriveClient();

  try {
    // Get file metadata if not provided
    let fileMetadata: { name: string; mimeType: string; size?: string };
    if (fileName && mimeType) {
      fileMetadata = { name: fileName, mimeType, size: undefined };
    } else {
      const metaResponse = await drive.files.get({
        fileId,
        fields: 'name, mimeType, size',
      });
      fileMetadata = {
        name: metaResponse.data.name || 'unknown',
        mimeType: metaResponse.data.mimeType || '',
        size: metaResponse.data.size || undefined,
      };
    }

    const category = categorizeFile(fileMetadata.mimeType, fileMetadata.name);
    let text = '';
    let truncated = false;

    // Skip files larger than 10MB for parsing
    const fileSize = fileMetadata.size ? parseInt(fileMetadata.size) : 0;
    if (fileSize > 10 * 1024 * 1024) {
      text = `[الملف كبير جداً (${(fileSize / 1024 / 1024).toFixed(1)} MB) - تم تخطي التحليل]`;
    } else if (category === 'unsupported') {
      text = `[نوع الملف غير مدعوم: ${fileMetadata.mimeType || 'غير معروف'}]`;
    } else {
      // For Google Workspace files, use the export API
      const exportMime = getExportMimeType(category);
      if (exportMime) {
        const exportResponse = await drive.files.export(
          { fileId, mimeType: exportMime },
          { responseType: 'text' }
        );
        text = typeof exportResponse.data === 'string'
          ? exportResponse.data
          : String(exportResponse.data || '');
      } else {
        // For regular files, download them with a timeout
        try {
          // Use stream-based download to avoid memory issues
          const downloadResponse = await drive.files.get(
            { fileId, alt: 'media' },
            { responseType: 'stream' }
          );

          // Collect stream chunks
          const chunks: Buffer[] = [];
          const stream = downloadResponse.data as unknown as NodeJS.ReadableStream;

          await new Promise<void>((resolve, reject) => {
            stream.on('data', (chunk: Buffer) => chunks.push(chunk));
            stream.on('end', () => resolve());
            stream.on('error', (err: Error) => reject(err));

            // Timeout after 30 seconds
            setTimeout(() => reject(new Error('Download timeout')), 30_000);
          });

          const buffer = Buffer.concat(chunks);

          // Parse based on file type with individual error handling
          text = await parseFileBuffer(buffer, category, fileMetadata.name);
        } catch (downloadError) {
          console.error(`[Drive] Download/parse error for "${fileMetadata.name}":`, downloadError);
          text = `[حدث خطأ أثناء تحميل أو تحليل الملف: ${downloadError instanceof Error ? downloadError.message : String(downloadError)}]`;
        }
      }

      // Validate extracted text quality (catch garbled Arabic PDFs that slip through)
      // Note: parsePdfBuffer already handles Arabic PDF detection and page-by-page
      // salvage internally, so this is a final safety net for edge cases.
      const finalValidation = validateExtractedText(text);
      if (!finalValidation && text.length > 0 && !text.startsWith('[')) {
        console.warn(`[Drive] Final text validation failed for "${fileMetadata.name}" — text appears garbled`);
        if (category === 'pdf') {
          text = '[ملف PDF يحتوي على نص عربي — لم يتم استخراجه بشكل صحيح. يرجى استخدام ملف DOCX أو نص عادي للحصول على نتائج أفضل.\n💡 نصيحة: يمكنك نسخ محتوى PDF ولصقه مباشرة في المحادثة بدلاً من الاعتماد على استخراج النص التلقائي.]';
        } else {
          text = '[لم يتم استخراج النص بشكل صحيح من هذا الملف. يرجى تحويله إلى صيغة أخرى مثل TXT أو DOCX.]';
        }
        truncated = false;
      } else if (finalValidation) {
        text = finalValidation;
      }

      // Truncate if too long
      if (text.length > MAX_TEXT_LENGTH) {
        text = text.slice(0, MAX_TEXT_LENGTH) + '\n\n[... تم اقتطاع المحتوى - الملف كبير جداً]';
        truncated = true;
      }

      // For RAG context, enforce a stricter limit to avoid overflowing the model context window
      if (text.length > RAG_MAX_TEXT_LENGTH && !text.startsWith('[')) {
        text = text.slice(0, RAG_MAX_TEXT_LENGTH) + '\n\n[تم اقتطاع المحتوى - الملف كبير جداً. يتم عرض أول ' + RAG_MAX_TEXT_LENGTH + ' حرف فقط]';
        truncated = true;
      }
    }

    const result: ParsedFileContent = {
      fileId,
      fileName: fileMetadata.name,
      mimeType: fileMetadata.mimeType,
      text,
      truncated,
      sizeBytes: fileMetadata.size ? parseInt(fileMetadata.size) : undefined,
    };

    // Cache the result
    setCache(fileContentCache, cacheKey, result);

    console.log(`[Drive] Parsed file "${fileMetadata.name}" (${category}): ${text.length} chars`);
    return result;
  } catch (error) {
    console.error(`[Drive] Error parsing file ${fileId}:`, error);
    return {
      fileId,
      fileName: fileName || 'unknown',
      mimeType: mimeType || '',
      text: '[حدث خطأ أثناء قراءة الملف من Google Drive]',
      truncated: false,
    };
  }
}

/**
 * Parse a file buffer based on its category.
 */
async function parseFileBuffer(buffer: Buffer, category: FileCategory, fileName: string): Promise<string> {
  switch (category) {
    case 'text':
    case 'csv':
      // Text and CSV files: just decode as UTF-8
      return buffer.toString('utf-8');

    case 'pdf':
      return await parsePdfBuffer(buffer);

    case 'docx':
      return await parseDocxBuffer(buffer);

    case 'xlsx':
      return await parseXlsxBuffer(buffer);

    default:
      return `[نوع الملف غير مدعوم: ${category}]`;
  }
}

/**
 * Validate extracted text quality, especially for Arabic PDFs.
 * Returns null if the text appears garbled/corrupted, otherwise returns the text.
 *
 * Checks:
 * 1. Arabic character ratio — if the doc is Arabic but < 30% Arabic chars, likely garbled
 * 2. Garbled patterns — excessive special chars, no word boundaries, repeated garbage
 * 3. Minimum meaningful content length
 */
function validateExtractedText(text: string): string | null {
  if (!text || text.trim().length === 0) return null;

  const trimmed = text.trim();

  // If it's a known failure marker (starts with '['), pass through as-is
  if (trimmed.startsWith('[')) return trimmed;

  // Count Arabic characters (Unicode range for Arabic)
  const arabicChars = (trimmed.match(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g) || []).length;
  // Count Latin characters
  const latinChars = (trimmed.match(/[a-zA-Z]/g) || []).length;
  // Count total meaningful characters (not whitespace, not control chars)
  const meaningfulChars = trimmed.replace(/[\s\p{P}]/gu, '').length;
  // Count garbled characters (replacement chars, control chars, high-byte latin1 artifacts)
  const garbledChars = (trimmed.match(/[\uFFFD\x00-\x08\x0B\x0E-\x1F]/g) || []).length;
  // Check for lack of word boundaries (very long strings without spaces)
  const wordsWithSpaces = trimmed.split(/\s+/).filter(w => w.length > 0);
  const avgWordLength = wordsWithSpaces.length > 0
    ? wordsWithSpaces.reduce((sum, w) => sum + w.length, 0) / wordsWithSpaces.length
    : 999;

  // If the document appears to be Arabic (has some Arabic chars) but Arabic ratio is too low,
  // it's likely garbled
  if (arabicChars > 0 && meaningfulChars > 0) {
    const arabicRatio = arabicChars / meaningfulChars;
    // If less than 30% Arabic AND we detected some Arabic, extraction is unreliable
    if (arabicRatio < 0.3 && arabicRatio > 0) {
      console.warn(`[Drive] Arabic text validation failed: arabicRatio=${arabicRatio.toFixed(2)} (< 0.3), likely garbled`);
      return null;
    }
  }

  // If garbled characters are more than 10% of meaningful content, it's corrupted
  if (meaningfulChars > 0 && garbledChars / meaningfulChars > 0.1) {
    console.warn(`[Drive] Garbled text detected: garbledRatio=${(garbledChars / meaningfulChars).toFixed(2)}, rejecting`);
    return null;
  }

  // If average word length is > 40 chars, there are no proper word boundaries = garbled
  if (avgWordLength > 40 && wordsWithSpaces.length < 5) {
    console.warn(`[Drive] No word boundaries detected: avgWordLength=${avgWordLength.toFixed(0)}, words=${wordsWithSpaces.length}, likely garbled`);
    return null;
  }

  // If the text is mostly Latin-1 high-byte artifacts (typical of corrupted Arabic PDF)
  const highByteArtifacts = (trimmed.match(/[\x80-\xBF]/g) || []).length;
  if (meaningfulChars > 50 && highByteArtifacts / meaningfulChars > 0.3) {
    console.warn(`[Drive] Latin-1 artifact ratio too high: ${(highByteArtifacts / meaningfulChars).toFixed(2)}, likely corrupted Arabic`);
    return null;
  }

  // Text appears valid
  return trimmed;
}

/**
 * Detect if a PDF likely contains Arabic text by examining its raw bytes
 * for Arabic font names, CIDFont entries, or Arabic Unicode ranges.
 */
function isLikelyArabicPdf(buffer: Buffer): boolean {
  try {
    // Read first 64KB of the PDF to check metadata/fonts
    const header = buffer.slice(0, Math.min(buffer.length, 65536)).toString('latin1');

    // Check for Arabic font name indicators
    const arabicFontIndicators = [
      'Arabic', 'arabic', 'NotoNaskhArabic', 'Amiri', 'Scheherazade',
      'Lateef', 'Geeza', 'STArabic', 'TraditionalArabic',
      'NotoSansArabic', 'Tahoma', 'Arial', // Tahoma/Arial often used for Arabic
      '/CIDFont', '/Identity-H', // CID fonts commonly used for Arabic
    ];
    const hasArabicFont = arabicFontIndicators.some(ind => header.includes(ind));

    // Check for Arabic Unicode text in the raw PDF content
    // Arabic Unicode: U+0600-U+06FF encoded as UTF-16BE in PDF
    // UTF-16BE encoding of Arabic: 0x06 0xXX
    const arabicUtf16Count = (header.match(/\x06[\x00-\xFF]/g) || []).length;
    const hasArabicUtf16 = arabicUtf16Count > 5;

    // Check for ToUnicode CMap with Arabic ranges
    const hasArabicCMap = header.includes('/ToUnicode') && (
      header.includes('<0600>') || header.includes('<06')
    );

    const result = hasArabicFont || hasArabicUtf16 || hasArabicCMap;
    if (result) {
      console.log(`[Drive] PDF detected as likely Arabic (font=${hasArabicFont}, utf16=${hasArabicUtf16}, cmap=${hasArabicCMap})`);
    }
    return result;
  } catch {
    return false;
  }
}

/**
 * Attempt to extract text from a PDF that is likely Arabic using
 * page-by-page extraction with individual page validation.
 * This allows us to salvage pages that extracted correctly even if
 * others failed, producing "partial content" results.
 */
async function extractArabicPdfWithPageValidation(buffer: Buffer): Promise<{ text: string; isPartial: boolean } | null> {
  try {
    const PDFParser = (await import('pdf2json')).default;
    const parser = new PDFParser();

    const pdfData = await new Promise<any>((resolve, reject) => {
      parser.on('pdfParser_dataReady', (data: any) => resolve(data));
      parser.on('pdfParser_dataError', (errData: any) => reject(new Error(errData?.parserError || 'pdf2json parse error')));
      parser.parseBuffer(buffer);
      setTimeout(() => reject(new Error('pdf2json timeout for Arabic extraction')), 20_000);
    });

    const pages = pdfData?.Pages || [];
    if (pages.length === 0) return null;

    const validPageTexts: string[] = [];
    const failedPages: number[] = [];

    for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
      const page = pages[pageIdx];
      const pageText = (page.Texts || [])
        .map((t: any) => (t.R || []).map((r: any) => {
          try {
            return decodeURIComponent(r.T || '');
          } catch {
            return '';
          }
        }).join(''))
        .join(' ')
        .trim();

      if (pageText.length === 0) {
        failedPages.push(pageIdx + 1);
        continue;
      }

      // Validate this individual page's text
      const validated = validateExtractedText(pageText);
      if (validated && validated.length > 10) {
        validPageTexts.push(validated);
      } else {
        // Check if the page has SOME Arabic content even if validation fails
        const arabicChars = (pageText.match(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/g) || []).length;
        const meaningfulChars = pageText.replace(/[\s\p{P}]/gu, '').length;
        if (arabicChars > 5 && meaningfulChars > 20) {
          // There's Arabic but validation failed — likely partial garbling
          // Include it anyway but mark as lower quality
          validPageTexts.push(pageText.trim());
        } else {
          failedPages.push(pageIdx + 1);
        }
      }
    }

    if (validPageTexts.length === 0) return null;

    const isPartial = failedPages.length > 0;
    const combinedText = validPageTexts.join('\n\n');

    console.log(`[Drive] Arabic PDF page-by-page extraction: ${validPageTexts.length}/${pages.length} pages extracted${isPartial ? `, pages ${failedPages.join(',')} failed` : ''}`);

    return { text: combinedText, isPartial };
  } catch (error) {
    console.warn('[Drive] Arabic PDF page-by-page extraction failed:', error instanceof Error ? error.message : String(error));
    return null;
  }
}

/**
 * Parse a PDF buffer using unpdf (primary) with pdf2json as fallback.
 * pdf-parse v2.x requires DOMMatrix which is unavailable in Node.js,
 * so we use unpdf which works natively in server environments.
 * For Arabic PDFs, uses a specialized page-by-page extraction strategy.
 */
async function parsePdfBuffer(buffer: Buffer): Promise<string> {
  // ── Pre-check: Is this likely an Arabic PDF? ──
  const isArabic = isLikelyArabicPdf(buffer);

  // ── Primary: unpdf (works in Node.js without DOM APIs) ──
  try {
    const { extractText } = await import('unpdf');
    const uint8 = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    const result = await extractText(uint8);
    if (result && result.text && Array.isArray(result.text)) {
      const combined = result.text.join('\n\n').trim();
      const validated = validateExtractedText(combined);
      if (validated) {
        console.log(`[Drive] unpdf extracted ${validated.length} chars from PDF (validated)`);
        return validated;
      } else if (isArabic && combined.length > 0) {
        // For Arabic PDFs, even if overall validation fails, try page-by-page extraction
        // to salvage any pages that extracted correctly
        console.warn('[Drive] unpdf extraction failed Arabic validation, trying page-by-page salvage');
        const pageResults = await extractArabicPdfWithPageValidation(buffer);
        if (pageResults) {
          if (pageResults.isPartial) {
            return `[ملف PDF مرفق - محتوى جزئي (بعض الصفحات لم يتم قراءتها بشكل صحيح)]\n${pageResults.text}`;
          }
          return pageResults.text;
        }
      } else {
        console.warn('[Drive] unpdf extraction failed validation (garbled/corrupted text), trying fallback');
      }
    } else if (result && typeof result === 'string' && (result as string).trim().length > 0) {
      const validated = validateExtractedText((result as string).trim());
      if (validated) {
        console.log(`[Drive] unpdf extracted ${validated.length} chars from PDF (validated)`);
        return validated;
      }
    }
  } catch (unpdfError) {
    console.warn('[Drive] unpdf failed, trying pdf2json:', unpdfError instanceof Error ? unpdfError.message : String(unpdfError));
  }

  // ── For Arabic PDFs, try page-by-page extraction before generic pdf2json ──
  if (isArabic) {
    const pageResults = await extractArabicPdfWithPageValidation(buffer);
    if (pageResults) {
      if (pageResults.isPartial) {
        return `[ملف PDF مرفق - محتوى جزئي (بعض الصفحات لم يتم قراءتها بشكل صحيح)]\n${pageResults.text}`;
      }
      return pageResults.text;
    }
  }

  // ── Fallback 1: pdf2json ──
  try {
    const PDFParser = (await import('pdf2json')).default;
    const parser = new PDFParser();
    const text = await new Promise<string>((resolve, reject) => {
      parser.on('pdfParser_dataReady', (pdfData: any) => {
        try {
          const pageTexts: string[] = [];
          for (const page of (pdfData.Pages || [])) {
            const pageText = (page.Texts || [])
              .map((t: any) => (t.R || []).map((r: any) => decodeURIComponent(r.T || '')).join(''))
              .join(' ');
            if (pageText.trim()) pageTexts.push(pageText.trim());
          }
          resolve(pageTexts.join('\n\n'));
        } catch (e) {
          reject(e);
        }
      });
      parser.on('pdfParser_dataError', (errData: any) => {
        reject(new Error(errData?.parserError || 'pdf2json parse error'));
      });
      // pdf2json accepts Buffer directly
      parser.parseBuffer(buffer);
      // Timeout after 15 seconds
      setTimeout(() => reject(new Error('pdf2json timeout')), 15_000);
    });
    const validated = validateExtractedText(text.trim());
    if (validated) {
      console.log(`[Drive] pdf2json extracted ${validated.length} chars from PDF (validated)`);
      return validated;
    } else if (text.trim().length > 0) {
      console.warn('[Drive] pdf2json extraction failed validation (garbled/corrupted text), trying basic extraction');
    }
  } catch (pdf2jsonError) {
    console.warn('[Drive] pdf2json failed, trying basic extraction:', pdf2jsonError instanceof Error ? pdf2jsonError.message : String(pdf2jsonError));
  }

  // ── Fallback 2: Basic regex extraction (last resort, unreliable for non-ASCII) ──
  return extractPdfTextBasic(buffer);
}

/**
 * Basic PDF text extraction using regex (fallback).
 * NOTE: This regex approach is unreliable for Arabic/Unicode text.
 * It uses latin1 encoding which destroys Arabic characters.
 * We only use it as a last resort and detect if the output is garbled.
 */
function extractPdfTextBasic(buffer: Buffer): string {
  const text = buffer.toString('latin1');
  const extractedTexts: string[] = [];

  // Find text between parentheses in text objects
  const tjRegex = /\(([^)]*)\)\s*Tj/g;
  let match;
  while ((match = tjRegex.exec(text)) !== null) {
    const extracted = match[1]
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t')
      .replace(/\\\(/g, '(')
      .replace(/\\\)/g, ')')
      .replace(/\\\\/g, '\\');
    if (extracted.trim()) extractedTexts.push(extracted);
  }

  // Find text arrays in TJ operators
  const tjArrayRegex = /\[(.*?)\]\s*TJ/g;
  while ((match = tjArrayRegex.exec(text)) !== null) {
    const arrayContent = match[1];
    const stringParts = arrayContent.match(/\(([^)]*)\)/g);
    if (stringParts) {
      const combined = stringParts.map((s) => s.slice(1, -1)).join('');
      if (combined.trim()) extractedTexts.push(combined);
    }
  }

  const allText = extractedTexts.join(' ').trim();

  // Detect garbled text: if we extracted text but it contains mostly
  // non-printable or Latin-1 substitution characters, it's likely
  // Arabic/Unicode text that got corrupted by the latin1 encoding.
  if (allText.length > 0) {
    const printableRatio = allText.replace(/[\x00-\x1F\x7F-\xFF]/g, '').length / allText.length;
    // If less than 50% of characters are printable ASCII, the text is garbled
    if (printableRatio < 0.5) {
      return '[ملف PDF يحتوي على نص عربي — لم يتم استخراجه بشكل صحيح. يرجى استخدام ملف DOCX أو نص عادي للحصول على نتائج أفضل.\n💡 نصيحة: يمكنك نسخ محتوى PDF ولصقه مباشرة في المحادثة بدلاً من الاعتماد على استخراج النص التلقائي.]';
    }
  }

  return allText || '[لم يتم استخراج نص من ملف PDF. قد يكون الملف يحتوي على صور أو تنسيق معقد.\n💡 نصيحة: جرّب تحويل الملف إلى DOCX أو TXT أو انسخ المحتوى يدوياً.]';
}

/**
 * Parse a DOCX buffer using mammoth.
 */
async function parseDocxBuffer(buffer: Buffer): Promise<string> {
  try {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    return result.value || '[لم يتم استخراج نص من ملف DOCX]';
  } catch (error) {
    console.error('[Drive] DOCX parsing error:', error);
    return '[حدث خطأ أثناء قراءة ملف DOCX]';
  }
}

/**
 * Parse an XLSX buffer - basic CSV-like extraction.
 */
async function parseXlsxBuffer(buffer: Buffer): Promise<string> {
  try {
    // Try using officeparser for XLSX
    const officeparser = await import('officeparser');
    const parseFn = (officeparser as any).parseOfficeAsync || (officeparser as any).default?.parseOfficeAsync || (officeparser as any).parseOffice;
    const text = await parseFn(buffer);
    return text || '[لم يتم استخراج نص من ملف XLSX]';
  } catch {
    // Fallback: just note that XLSX parsing failed
    return '[ملف Excel - لم يتم استخراج المحتوى. يرجى تحويل الملف إلى CSV أولاً.]';
  }
}

/**
 * Combined search and fetch: search for files by name, then download and parse them.
 */
export async function searchAndFetch(query: string, folderId?: string): Promise<DriveSearchResult> {
  // Check cache first
  const cacheKey = `search_${query}_${folderId || FOLDER_ID}`;
  const cached = getFromCache(searchCache, cacheKey);
  if (cached) {
    console.log(`[Drive] Cache hit for "${query}"`);
    return cached;
  }

  const errors: string[] = [];

  try {
    // Search for files
    const files = await searchDriveFiles(query);

    if (files.length === 0) {
      const result: DriveSearchResult = { files: [], contents: [], errors: [] };
      setCache(searchCache, cacheKey, result);
      return result;
    }

    // Download and parse each file (limit to top 3 for performance)
    const filesToFetch = files.slice(0, 3);
    const contents: ParsedFileContent[] = [];

    for (const file of filesToFetch) {
      try {
        const parsed = await downloadAndParseFile(file.id, file.name, file.mimeType);
        contents.push(parsed);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        errors.push(`خطأ في قراءة الملف "${file.name}": ${errorMsg}`);
        console.error(`[Drive] Error fetching file ${file.name}:`, error);
      }
    }

    const result: DriveSearchResult = { files, contents, errors };
    setCache(searchCache, cacheKey, result);
    return result;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    errors.push(`خطأ في البحث: ${errorMsg}`);
    return { files: [], contents: [], errors };
  }
}

/**
 * List all files in the configured Google Drive folder.
 */
export async function listDriveFiles(pageSize: number = 50): Promise<DriveFile[]> {
  const drive = await getDriveClient();

  try {
    const q = `'${FOLDER_ID}' in parents and trashed = false`;

    const response = await drive.files.list({
      q,
      fields: 'files(id, name, mimeType, size, modifiedTime, webViewLink, iconLink)',
      pageSize,
      spaces: 'drive',
      orderBy: 'modifiedTime desc',
    });

    return (response.data.files || []).map((f) => ({
      id: f.id || '',
      name: f.name || '',
      mimeType: f.mimeType || '',
      size: f.size || undefined,
      modifiedTime: f.modifiedTime || undefined,
      webViewLink: f.webViewLink || undefined,
      iconLink: f.iconLink || undefined,
    }));
  } catch (error) {
    console.error('[Drive] List error:', error);
    return [];
  }
}

/**
 * Get a direct download URL or stream for a file.
 * Returns the file content as a buffer for serving.
 */
export async function getFileBuffer(fileId: string): Promise<{ buffer: Buffer; mimeType: string; fileName: string } | null> {
  const drive = await getDriveClient();

  try {
    // Get file metadata
    const metaResponse = await drive.files.get({
      fileId,
      fields: 'name, mimeType',
    });

    const fileName = metaResponse.data.name || 'download';
    const mimeType = metaResponse.data.mimeType || 'application/octet-stream';
    const category = categorizeFile(mimeType, fileName);

    // For Google Workspace files, export them
    const exportMime = getExportMimeType(category);
    if (exportMime) {
      const exportResponse = await drive.files.export(
        { fileId, mimeType: category === 'google_sheet' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/pdf' },
        { responseType: 'arraybuffer' }
      );
      const buffer = Buffer.from(exportResponse.data as ArrayBuffer);
      return { buffer, mimeType: category === 'google_sheet' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/pdf', fileName };
    }

    // For regular files, download them
    const downloadResponse = await drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'arraybuffer' }
    );

    const buffer = Buffer.from(downloadResponse.data as ArrayBuffer);
    return { buffer, mimeType, fileName };
  } catch (error) {
    console.error(`[Drive] Error getting file ${fileId}:`, error);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// DRIVE WRITE/UPLOAD SUPPORT
// ═══════════════════════════════════════════════════════════════════════
// Uses the vast-fuze service account with write permissions.
// Supports uploading files (PDFs, documents, etc.) to Google Drive.
// ═══════════════════════════════════════════════════════════════════════

let _writeDriveClient: ReturnType<typeof google.drive> | null = null;

/**
 * Get a Drive client with write permissions.
 * Uses the vast-fuze service account (GD_WRITE_SA_PATH).
 * Falls back to the read-only client if write SA is not configured.
 */
async function getWriteDriveClient() {
  if (_writeDriveClient) return _writeDriveClient;

  try {
    let serviceAccount: { client_email: string; private_key: string };

    // Priority 1: Read from environment variable (GD_WRITE_SA_JSON)
    if (WRITE_SA_JSON) {
      console.log('[Drive-Write] Using write SA from GD_WRITE_SA_JSON env var');
      serviceAccount = JSON.parse(WRITE_SA_JSON);
    }
    // Priority 2: Read from file path (GD_WRITE_SA_PATH)
    else if (WRITE_SA_PATH) {
      console.log('[Drive-Write] Using write SA from file:', WRITE_SA_PATH);
      const serviceAccountRaw = readFileSync(WRITE_SA_PATH, 'utf-8');
      serviceAccount = JSON.parse(serviceAccountRaw);
    }
    // Priority 3: Fall back to read-only SA (file or JSON)
    else if (SERVICE_ACCOUNT_JSON) {
      console.log('[Drive-Write] Falling back to read SA JSON for write access');
      if (typeof SERVICE_ACCOUNT_JSON === 'string') { serviceAccount = JSON.parse(SERVICE_ACCOUNT_JSON); } else { serviceAccount = SERVICE_ACCOUNT_JSON as any; }
    }
    else if (SERVICE_ACCOUNT_PATH) {
      console.log('[Drive-Write] Falling back to read SA file for write access:', SERVICE_ACCOUNT_PATH);
      const serviceAccountRaw = readFileSync(SERVICE_ACCOUNT_PATH, 'utf-8');
      serviceAccount = JSON.parse(serviceAccountRaw);
    }
    else {
      throw new Error('No service account configured for Drive write access');
    }

    // Clean private key: replace literal \n with real newlines
    let privateKey = serviceAccount.private_key.replace(/\\n/g, '\n');
    if (!privateKey.endsWith('\n')) privateKey += '\n';

    const auth = new google.auth.JWT({
      email: serviceAccount.client_email,
      key: privateKey,
      scopes: ['https://www.googleapis.com/auth/drive'],
    });

    await auth.authorize();
    console.log('[Drive-Write] Service account authenticated with write access as:', serviceAccount.client_email);

    _writeDriveClient = google.drive({ version: 'v3', auth });
    return _writeDriveClient;
  } catch (error) {
    console.error('[Drive-Write] Failed to initialize write client:', error);
    _writeDriveClient = null; // Reset so we can retry
    throw new Error('Failed to initialize Drive write client: ' + (error instanceof Error ? error.message : String(error)));
  }
}

export interface DriveUploadResult {
  success: boolean;
  fileId?: string;
  fileName?: string;
  webViewLink?: string;
  error?: string;
}

/**
 * Upload a file to the configured Google Drive folder.
 *
 * @param filePath - Local file path to upload
 * @param fileName - Name for the file in Drive (defaults to the local file name)
 * @param mimeType - MIME type of the file
 * @returns Upload result with file ID and link
 */
export async function uploadFileToDrive(
  filePath: string,
  fileName?: string,
  mimeType: string = 'application/octet-stream',
  userAccessToken?: string // V.45: If provided, upload to user's Drive instead of service account
): Promise<DriveUploadResult> {
  try {
    const name = fileName || filePath.split('/').pop() || 'upload';

    // V.45: If user has a Google access token, upload to THEIR Drive
    if (userAccessToken) {
      console.log(`[Drive-Write] Uploading "${name}" to USER's Drive (OAuth token)`);
      const buffer = await import('fs').then(fs => fs.readFileSync(filePath));
      return uploadBufferWithUserToken(buffer, name, mimeType, userAccessToken);
    }

    // Fallback: use service account
    const drive = await getWriteDriveClient();
    const response = await drive.files.create({
      requestBody: {
        name,
        parents: [FOLDER_ID],
      },
      media: {
        mimeType,
        body: createReadStream(filePath),
      },
      fields: 'id, name, webViewLink',
    });

    const fileId = response.data.id || '';
    const webViewLink = response.data.webViewLink || '';

    console.log(`[Drive-Write] ✓ Uploaded "${name}" to service account Drive (ID: ${fileId})`);

    return {
      success: true,
      fileId,
      fileName: name,
      webViewLink,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('[Drive-Write] Upload error:', errorMsg);
    return {
      success: false,
      error: errorMsg,
    };
  }
}

/**
 * V.45: Upload to user's Google Drive using their OAuth access token.
 * Uses the Drive REST API directly (no service account needed).
 */
async function uploadBufferWithUserToken(
  buffer: Buffer,
  fileName: string,
  mimeType: string,
  accessToken: string
): Promise<DriveUploadResult> {
  try {
    // Use Drive REST API with user's token — upload to user's root folder (no parents)
    const boundary = 'anzaro_boundary_' + Date.now();
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: fileName })}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`),
      buffer,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);

    const resp = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
        'Content-Length': body.length.toString(),
      },
      body,
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`Drive API ${resp.status}: ${errText.slice(0, 200)}`);
    }

    const data = await resp.json();
    console.log(`[Drive-Write] ✓ Uploaded "${fileName}" to USER's Drive (ID: ${data.id})`);

    return {
      success: true,
      fileId: data.id || '',
      fileName,
      webViewLink: data.webViewLink || `https://drive.google.com/file/d/${data.id}/view`,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('[Drive-Write] User token upload error:', errorMsg);
    return { success: false, error: errorMsg };
  }
}

/**
 * Upload a buffer directly to Google Drive.
 *
 * @param buffer - File content as Buffer
 * @param fileName - Name for the file in Drive
 * @param mimeType - MIME type of the file
 * @returns Upload result with file ID and link
 */
export async function uploadBufferToDrive(
  buffer: Buffer,
  fileName: string,
  mimeType: string = 'application/octet-stream'
): Promise<DriveUploadResult> {
  try {
    const drive = await getWriteDriveClient();
    const { Readable } = await import('stream');
    const stream = Readable.from(buffer);

    const response = await drive.files.create({
      requestBody: {
        name: fileName,
        parents: [FOLDER_ID],
      },
      media: {
        mimeType,
        body: stream,
      },
      fields: 'id, name, webViewLink',
    });

    const fileId = response.data.id || '';
    const webViewLink = response.data.webViewLink || '';

    console.log(`[Drive-Write] ✓ Uploaded buffer "${fileName}" (ID: ${fileId})`);

    return {
      success: true,
      fileId,
      fileName,
      webViewLink,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('[Drive-Write] Buffer upload error:', errorMsg);
    return {
      success: false,
      error: errorMsg,
    };
  }
}
