// Web: read a picked file through the browser's File object.
import { toBase64 } from '../storage/crypto';
import type { PickedFile } from './prepare';

export async function readAsBase64(f: PickedFile): Promise<string> {
  const blob = f.file ?? await (await fetch(f.uri)).blob();
  return toBase64(new Uint8Array(await blob.arrayBuffer()));
}
