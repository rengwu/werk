import { parentPort, workerData } from "node:worker_threads";
// Text extraction never renders. PDF.js initializes this otherwise unused rendering matrix.
globalThis.DOMMatrix ||= class DOMMatrix {};
const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');

try {
  const task = getDocument({
    data: new Uint8Array(workerData),
    isEvalSupported: false,
    useSystemFonts: false,
    useWorkerFetch: false,
    disableFontFace: true,
  });
  const pdf = await task.promise;
  try {
    if (pdf.numPages > 80) throw new Error("PDFs must have at most 80 pages.");
    let text = "";
    for (let index = 1; index <= pdf.numPages; index++) {
      const page = await pdf.getPage(index);
      const content = await page.getTextContent();
      text +=
        `\n[Page ${index}]\n` +
        content.items
          .map((item) =>
            "str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "",
          )
          .join("");
      if (text.length > 100000)
        throw new Error(
          "PDF text exceeds 100,000 characters. Attach a smaller document.",
        );
    }
    if (!text.replace(/\[Page \d+\]/g, "").trim())
      throw new Error(
        "This PDF has no extractable text. Attach screenshots of its pages instead.",
      );
    parentPort.postMessage({ text });
  } finally {
    await task.destroy();
  }
} catch (error) {
  parentPort.postMessage({
    error: error instanceof Error ? error.message : "Could not read PDF.",
  });
}
