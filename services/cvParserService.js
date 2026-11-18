const pdfParse = require('pdf-parse');

async function extractPdfMetadataAndText(pdfBuffer) {
  try {
    const parsed = await pdfParse(pdfBuffer);
    const cleanedText = (parsed.text || '')
      .replace(/\r\n/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    return {
      extractedText: cleanedText,
      pageCount: parsed.numpages || 1,
    };
  } catch (error) {
    console.error('[cvParserService] Gagal mengekstrak teks PDF:', error.message);
    return {
      extractedText: '',
      pageCount: 1,
    };
  }
}

module.exports = { extractPdfMetadataAndText };