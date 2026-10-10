// Turns uploads into a list of single pages. Photos stay photos, PDFs are split into
// one-page PDFs, and Word files become text. Each page is read separately, which gives a
// confidence score per page and keeps every AI call small.
//
// Deskew, crop, contrast, and HEIC-to-JPEG happen on the phone at capture time (Section 4),
// so pages arrive here already cleaned up and small.
import { PDFDocument } from 'pdf-lib';
import mammoth from 'mammoth';
import { MAX_PAGES, MAX_UPLOAD_BYTES } from '@scr/shared';
import { UserFacingError } from '../ai/AiClient';

export interface UploadFile {
  name: string;
  mimeType: string;
  dataBase64: string;
}

export type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/webp';

export type Page =
  | { n: number; kind: 'image'; mediaType: ImageMediaType; data: string }
  | { n: number; kind: 'pdf'; data: string }
  | { n: number; kind: 'text'; text: string };

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const IMAGE_TYPES: ImageMediaType[] = ['image/jpeg', 'image/png', 'image/webp'];

const tooMany = () => new UserFacingError(`That's more than ${MAX_PAGES} pages. Please send ${MAX_PAGES} pages or fewer at a time.`);

export async function preprocess(files: UploadFile[]): Promise<Page[]> {
  if (!files.length) throw new UserFacingError('No pages were sent. Please take a photo or pick a file.');

  const decoded = files.map(f => ({ ...f, bytes: Buffer.from(f.dataBase64, 'base64') }));
  const total = decoded.reduce((sum, f) => sum + f.bytes.byteLength, 0);
  if (total > MAX_UPLOAD_BYTES) throw new UserFacingError('These files are too big. Please send less than 20 MB at a time.');

  const pages: Page[] = [];
  const next = () => pages.length + 1;

  for (const f of decoded) {
    if (IMAGE_TYPES.includes(f.mimeType as ImageMediaType)) {
      pages.push({ n: next(), kind: 'image', mediaType: f.mimeType as ImageMediaType, data: f.dataBase64 });
    } else if (f.mimeType === 'application/pdf') {
      for (const data of await splitPdf(f.bytes, MAX_PAGES - pages.length)) pages.push({ n: next(), kind: 'pdf', data });
    } else if (f.mimeType === DOCX) {
      const { value } = await mammoth.extractRawText({ buffer: f.bytes }).catch(() => {
        throw new UserFacingError(`We couldn't open "${f.name}". Try taking a photo of the paper instead.`);
      });
      if (value.trim()) pages.push({ n: next(), kind: 'text', text: value.trim() });
    } else if (f.mimeType === 'image/heic') {
      // The app converts HEIC to JPEG before upload; reaching here means an old client.
      throw new UserFacingError('Please update the app and try again (photo format not supported).');
    } else {
      throw new UserFacingError(`"${f.name}" is not a file type we can read. Use a photo, PDF, or Word file.`);
    }
    if (pages.length > MAX_PAGES) throw tooMany();
  }

  if (!pages.length) throw new UserFacingError('These files look empty. Please try a photo of the paper.');
  return pages;
}

async function splitPdf(bytes: Uint8Array, maxPages: number): Promise<string[]> {
  let src: PDFDocument;
  try {
    src = await PDFDocument.load(bytes);
  } catch {
    throw new UserFacingError("We couldn't open this PDF. If it has a password, take photos of the pages instead.");
  }
  const count = src.getPageCount();
  if (count > maxPages) throw tooMany();

  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const single = await PDFDocument.create();
    const [page] = await single.copyPages(src, [i]);
    single.addPage(page);
    out.push(Buffer.from(await single.save()).toString('base64'));
  }
  return out;
}
