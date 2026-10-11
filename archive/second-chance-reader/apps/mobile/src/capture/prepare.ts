// Gets pages ready to send: photos are shrunk and re-saved as JPEG (this also converts
// iPhone HEIC photos), which saves data on pay-as-you-go plans. PDFs and Word files are
// sent as they are.
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { ACCEPTED_MIME_TYPES, MAX_UPLOAD_BYTES } from '@scr/shared';
import type { UploadPage } from '../api/processStream';
import { readAsBase64 } from './readFile';

/** Long edge in pixels: enough to read small print, small enough for cheap data plans. */
const MAX_EDGE = 2000;
const JPEG_QUALITY = 0.7;

export interface PreparedPage extends UploadPage {
  /** Something an <Image> can show: the saved photo, or null for PDFs and Word files. */
  previewUri: string | null;
}

export async function preparePhoto(uri: string, name: string): Promise<PreparedPage> {
  const original = await ImageManipulator.manipulate(uri).renderAsync();
  const ctx = ImageManipulator.manipulate(uri);
  if (Math.max(original.width, original.height) > MAX_EDGE) {
    ctx.resize(original.width >= original.height ? { width: MAX_EDGE } : { height: MAX_EDGE });
  }
  const saved = await (await ctx.renderAsync()).saveAsync({ format: SaveFormat.JPEG, compress: JPEG_QUALITY, base64: true });
  if (!saved.base64) throw new Error('Could not read the photo');
  return { name: name.replace(/\.\w+$/, '') + '.jpg', mimeType: 'image/jpeg', dataBase64: saved.base64, previewUri: saved.uri };
}

export interface PickedFile {
  uri: string;
  name: string;
  mimeType?: string | null;
  size?: number | null;
  /** Web only: the browser File object. */
  file?: File;
}

export class UnsupportedFileError extends Error {}

export async function prepareFile(f: PickedFile): Promise<PreparedPage> {
  const mime = (f.mimeType ?? '').toLowerCase();
  if (mime.startsWith('image/')) return preparePhoto(f.uri, f.name);
  if (!(ACCEPTED_MIME_TYPES as readonly string[]).includes(mime)) {
    throw new UnsupportedFileError(`"${f.name}" is not a file we can read. Use a photo, PDF, or Word file.`);
  }
  if (f.size && f.size > MAX_UPLOAD_BYTES) {
    throw new UnsupportedFileError(`"${f.name}" is too big. Files must be under 20 MB.`);
  }
  return { name: f.name, mimeType: mime, dataBase64: await readAsBase64(f), previewUri: null };
}
