// Phones: read a picked file from the app's cache directory.
import { File } from 'expo-file-system';
import type { PickedFile } from './prepare';

export function readAsBase64(f: PickedFile): Promise<string> {
  return new File(f.uri).base64();
}
