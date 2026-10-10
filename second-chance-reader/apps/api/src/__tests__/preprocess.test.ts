import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { preprocess } from '../pipeline/preprocess';
import { UserFacingError } from '../ai/AiClient';

async function pdfWithPages(n: number) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < n; i++) doc.addPage();
  return Buffer.from(await doc.save()).toString('base64');
}

const jpeg = { name: 'p.jpg', mimeType: 'image/jpeg', dataBase64: Buffer.from('fake jpeg').toString('base64') };

describe('preprocess', () => {
  it('splits a PDF into single pages and numbers everything in order', async () => {
    const pages = await preprocess([jpeg, { name: 'a.pdf', mimeType: 'application/pdf', dataBase64: await pdfWithPages(3) }, jpeg]);
    expect(pages.map(p => [p.n, p.kind])).toEqual([[1, 'image'], [2, 'pdf'], [3, 'pdf'], [4, 'pdf'], [5, 'image']]);
    const one = await PDFDocument.load(Buffer.from((pages[1] as { data: string }).data, 'base64'));
    expect(one.getPageCount()).toBe(1);
  });

  it('refuses more than 30 pages', async () => {
    await expect(preprocess([{ name: 'big.pdf', mimeType: 'application/pdf', dataBase64: await pdfWithPages(31) }]))
      .rejects.toThrow(/more than 30 pages/);
  });

  it('refuses unknown file types and damaged PDFs with a plain message', async () => {
    await expect(preprocess([{ name: 'x.zip', mimeType: 'application/zip', dataBase64: 'AA==' }]))
      .rejects.toBeInstanceOf(UserFacingError);
    await expect(preprocess([{ name: 'x.pdf', mimeType: 'application/pdf', dataBase64: 'AA==' }]))
      .rejects.toThrow(/couldn't open this PDF/);
  });

  it('refuses uploads over 20 MB', async () => {
    const big = Buffer.alloc(21 * 1024 * 1024).toString('base64');
    await expect(preprocess([{ ...jpeg, dataBase64: big }])).rejects.toThrow(/too big/);
  });
});
