/**
 * Turn an uploaded study file into plain text, in the browser.
 * PDF (pdf.js) and Word (mammoth) parsers are loaded on demand so they never
 * weigh down the rest of the app.
 */

export const ACCEPTED_FILES = '.pdf,.docx,.txt,.md,.markdown,text/plain,application/pdf'

function tidy(text: string): string {
  return text
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

async function fromPdf(file: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist')
  // Let Vite bundle the worker as a .js chunk. A `?url` import ships the raw
  // .mjs file, which the host serves as application/octet-stream; with
  // `X-Content-Type-Options: nosniff` the browser then refuses to run it.
  if (!pdfjs.GlobalWorkerOptions.workerPort) {
    const { default: PdfWorker } = await import('pdfjs-dist/build/pdf.worker.min.mjs?worker')
    pdfjs.GlobalWorkerOptions.workerPort = new PdfWorker()
  }
  const task = pdfjs.getDocument({ data: await file.arrayBuffer() })
  const doc = await task.promise
  const pages: string[] = []
  const maxPages = Math.min(doc.numPages, 80)
  for (let i = 1; i <= maxPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    const line = content.items
      .map((item) => ('str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : ''))
      .join('')
    pages.push(line)
  }
  await task.destroy()
  return pages.join('\n\n')
}

async function fromDocx(file: File): Promise<string> {
  const mammoth = await import('mammoth')
  const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })
  return result.value
}

export async function extractText(file: File): Promise<string> {
  const name = file.name.toLowerCase()
  let text: string
  if (name.endsWith('.pdf') || file.type === 'application/pdf') text = await fromPdf(file)
  else if (name.endsWith('.docx')) text = await fromDocx(file)
  else if (name.endsWith('.doc')) throw new Error('Old .doc files aren’t supported — save as .docx or PDF.')
  else text = await file.text()
  const out = tidy(text)
  if (!out) {
    throw new Error(
      name.endsWith('.pdf')
        ? 'No text found in that PDF — it may be scanned images. Try pasting the text instead.'
        : 'That file has no readable text.',
    )
  }
  return out
}
