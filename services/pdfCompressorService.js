const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { PDFDocument } = require('pdf-lib');

const execFileAsync = promisify(execFile);
const TARGET_MAX_BYTES = 2 * 1024 * 1024; // 2 MB (2.097.152 bytes)

async function tryGhostscriptCompress(inputPath, outputPath, preset = '/ebook') {
  const gsBin = process.platform === 'win32' ? 'gswin64c' : 'gs';
  const args = [
    '-sDEVICE=pdfwrite',
    '-dCompatibilityLevel=1.4',
    `-dPDFSETTINGS=${preset}`, // /ebook = 150 DPI downsample raster tanpa merusak teks vektor
    '-dNOPAUSE',
    '-dQUIET',
    '-dBATCH',
    '-dDetectDuplicateImages=true',
    '-dCompressFonts=true',
    '-dSubsetFonts=true',
    `-sOutputFile=${outputPath}`,
    inputPath,
  ];
  await execFileAsync(gsBin, args, { timeout: 30000 });
}

async function tryQpdfOptimize(inputPath, outputPath) {
  await execFileAsync(
    'qpdf',
    ['--linearize', '--object-streams=generate', '--compress-streams=y', inputPath, outputPath],
    { timeout: 25000 }
  );
}

async function compressPdfBuffer(rawPdfBuffer) {
  const originalBytes = rawPdfBuffer.length;
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'autoapply-pdf-'));
  const inputPath = path.join(tmpDir, 'input.pdf');
  const gsOutPath = path.join(tmpDir, 'gs_out.pdf');
  const gsScreenOutPath = path.join(tmpDir, 'gs_screen_out.pdf');
  const qpdfOutPath = path.join(tmpDir, 'qpdf_out.pdf');

  try {
    await fs.writeFile(inputPath, rawPdfBuffer);
    let bestBuffer = rawPdfBuffer;
    let methodUsed = 'raw';

    // 1. Jalankan Ghostscript /ebook (150 DPI) untuk menekan resolusi scan KTP/Ijazah/Sertifikat
    try {
      await tryGhostscriptCompress(inputPath, gsOutPath, '/ebook');
      const gsBuffer = await fs.readFile(gsOutPath);
      if (gsBuffer.length > 0 && gsBuffer.length < bestBuffer.length) {
        bestBuffer = gsBuffer;
        methodUsed = 'ghostscript_150dpi';
      }

      // Jika masih > 2 MB, lakukan pass kedua /screen (100-120 DPI) agar tetap di bawah batas 2 MB
      if (bestBuffer.length > TARGET_MAX_BYTES) {
        await tryGhostscriptCompress(inputPath, gsScreenOutPath, '/screen');
        const gsScreenBuffer = await fs.readFile(gsScreenOutPath);
        if (gsScreenBuffer.length > 0 && gsScreenBuffer.length < bestBuffer.length) {
          bestBuffer = gsScreenBuffer;
          methodUsed = 'ghostscript_compact';
        }
      }
    } catch (_) {
      // Ghostscript tidak tersedia di host; lanjut ke qpdf / pdf-lib
    }

    // 2. Jalankan qpdf stream deduplication & linearization bila tersedia
    try {
      const sourceForQpdf = bestBuffer === rawPdfBuffer ? inputPath : gsOutPath;
      await tryQpdfOptimize(sourceForQpdf, qpdfOutPath);
      const qpdfBuffer = await fs.readFile(qpdfOutPath);
      if (qpdfBuffer.length > 0 && qpdfBuffer.length < bestBuffer.length) {
        bestBuffer = qpdfBuffer;
        methodUsed = methodUsed === 'raw' ? 'qpdf_optimized' : `${methodUsed}+qpdf`;
      }
    } catch (_) {
      // qpdf tidak tersedia di host; lanjut ke pdf-lib object streams
    }

    // 3. Fallback / Final Pass: pdf-lib object stream packing & metadata cleanup
    const pdfDoc = await PDFDocument.load(bestBuffer, { ignoreEncryption: true });
    pdfDoc.setProducer('AutoApply AI PDF Engine v3.0');
    pdfDoc.setCreator('AutoApply AI');
    const finalBytes = await pdfDoc.save({
      useObjectStreams: true,
      addDefaultPage: false,
      objectsPerTick: 100,
    });
    const finalBuffer = Buffer.from(finalBytes);

    if (finalBuffer.length < bestBuffer.length) {
      bestBuffer = finalBuffer;
      methodUsed = methodUsed === 'raw' ? 'pdflib_object_streams' : `${methodUsed}+pdflib`;
    }

    return {
      buffer: bestBuffer,
      originalBytes,
      compressedBytes: bestBuffer.length,
      isUnder2MB: bestBuffer.length <= TARGET_MAX_BYTES,
      method: methodUsed,
    };
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

module.exports = {
  compressPdfBuffer,
  TARGET_MAX_BYTES,
};