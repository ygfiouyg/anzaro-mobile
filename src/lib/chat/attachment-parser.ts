// ─── File Content Parsing ────────────────────────────────────────────

export interface ParsedAttachment {
  type: 'image' | 'pdf' | 'docx' | 'text' | 'other';
  name: string;
  size: string;
  content?: string; // base64 data URL for images/PDFs/DOCX, text content for text files
  textContent?: string; // extracted text from PDFs
}

/**
 * Parse the message to extract embedded file content.
 * The ChatInput component embeds file content using these markers:
 * - [DELTA_IMAGE:data:image/...;base64,...] for images
 * - [DELTA_PDF:data:application/pdf;base64,...] for PDFs
 * - [DELTA_DOCX:data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,...] for DOCX (Word)
 * - 📎 ملف مرفق: ... / --- محتوى الملف --- / --- نهاية الملف --- for text files
 */
export async function parseFileAttachments(message: string): Promise<{
  cleanedMessage: string;
  attachments: ParsedAttachment[];
  hasAttachments: boolean;
}> {
  const attachments: ParsedAttachment[] = [];
  let cleanedMessage = message;

  // Extract image attachments: [DELTA_IMAGE:data:image/...;base64,...]
  // CRITICAL: Use non-greedy match with explicit end marker to prevent
  // infinite loop on large base64 strings (Maximum call stack size exceeded)
  const imageRegex = /\[DELTA_IMAGE:(data:image\/[^;]+;base64,[^\]]+)\]/g;
  let match;
  while ((match = imageRegex.exec(message)) !== null) {
    // Prevent infinite loop — advance lastIndex if no progress
    if (match[0].length === 0) {
      imageRegex.lastIndex++;
      continue;
    }
    // Extract name/size from the preceding text (if present)
    const precedingText = message.slice(Math.max(0, match.index - 200), match.index);
    const nameMatch = precedingText.match(/📷 صورة مرفقة: (.+?) \((.+?)\)/);
    attachments.push({
      type: 'image',
      name: nameMatch?.[1] || 'image',
      size: nameMatch?.[2] || 'unknown',
      content: match[1],
    });
    // Remove from cleaned message
    cleanedMessage = cleanedMessage.replace(match[0], '[📷 صورة: ' + (nameMatch?.[1] || 'image') + ']');
  }

  // Extract PDF attachments: [DELTA_PDF:data:application/pdf;base64,...]
  const pdfRegex = /\[DELTA_PDF:(data:application\/pdf;base64,[^\]]+)\]/g;
  while ((match = pdfRegex.exec(message)) !== null) {
    if (match[0].length === 0) { pdfRegex.lastIndex++; continue; }
    const precedingText = message.slice(Math.max(0, match.index - 200), match.index);
    const nameMatch = precedingText.match(/📄 ملف PDF مرفق: (.+?) \((.+?)\)/);
    attachments.push({
      type: 'pdf',
      name: nameMatch?.[1] || 'document',
      size: nameMatch?.[2] || 'unknown',
      content: match[1],
    });
    // Remove from cleaned message - we'll add extracted text later
    cleanedMessage = cleanedMessage.replace(match[0], '[📄 PDF: ' + match[1] + ']');
  }

  // V.44: Extract PDF REFERENCE attachments: [DELTA_PDF_REF:fileId:filename:size]
  // These are uploaded separately via /api/chat/upload-pdf to avoid
  // sending 5MB+ base64 inline in the chat request.
  const pdfRefRegex = /\[DELTA_PDF_REF:([^:]+):([^:]+):([^\]]+)\]/g;
  while ((match = pdfRefRegex.exec(message)) !== null) {
    if (match[0].length === 0) { pdfRefRegex.lastIndex++; continue; }
    const [, fileId, fileName, fileSize] = match;
    // Read the PDF from disk
    try {
      const fs = await import('fs');
      const path = await import('path');
      const filePath = path.join(process.cwd(), 'upload-temp', `${fileId}.pdf`);
      if (fs.existsSync(filePath)) {
        const buffer = fs.readFileSync(filePath);
        const base64 = buffer.toString('base64');
        const dataUrl = `data:application/pdf;base64,${base64}`;
        attachments.push({
          type: 'pdf',
          name: fileName,
          size: fileSize,
          content: dataUrl,
        });
        console.log(`[AttachmentParser] Loaded PDF ref ${fileId} (${(buffer.length / 1024 / 1024).toFixed(1)}MB)`);
      } else {
        console.warn(`[AttachmentParser] PDF ref ${fileId} not found at ${filePath}`);
      }
    } catch (err) {
      console.error(`[AttachmentParser] Error loading PDF ref ${fileId}:`, err);
    }
    // Remove from cleaned message
    cleanedMessage = cleanedMessage.replace(match[0], `[📄 PDF: ${fileName}]`);
  }

  // Extract DOCX (Word) attachments: [DELTA_DOCX:data:application/vnd.openxmlformats...;base64,...]
  const docxRegex = /📄 ملف Word مرفق: (.+?) \((.+?)\)\n\[DELTA_DOCX:(data:application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document;base64,[^\]]+)\]/g;
  while ((match = docxRegex.exec(message)) !== null) {
    attachments.push({
      type: 'docx',
      name: match[1],
      size: match[2],
      content: match[3],
    });
    cleanedMessage = cleanedMessage.replace(match[0], '[📄 Word: ' + match[1] + ']');
  }

  // Text file attachments are already inline in the message between
  // 📎 ملف مرفق: ... / --- محتوى الملف --- / --- نهاية الملف ---
  // We detect them but leave them in the message since they're already readable text
  const textFileRegex = /📎 ملف مرفق: (.+?) \((.+?)\)\n--- محتوى الملف ---\n([\s\S]*?)\n--- نهاية الملف ---/g;
  while ((match = textFileRegex.exec(message)) !== null) {
    attachments.push({
      type: 'text',
      name: match[1],
      size: match[2],
      textContent: match[3],
    });
    // Keep text file content in the message - it's already readable
  }

  // Unsupported file attachments
  const otherFileRegex = /📁 ملف مرفق: (.+?) \((.+?)\)(?:\n\((.+?)\)|\n\(نوع الملف غير مدعوم للقراءة المباشرة\))/g;
  while ((match = otherFileRegex.exec(message)) !== null) {
    attachments.push({
      type: 'other',
      name: match[1],
      size: match[2],
    });
  }

  return {
    cleanedMessage: cleanedMessage.trim(),
    attachments,
    hasAttachments: attachments.length > 0,
  };
}
