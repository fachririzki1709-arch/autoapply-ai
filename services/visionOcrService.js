const { GoogleGenerativeAI } = require('@google/generative-ai');

function getGeminiClient() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY belum dikonfigurasi di environment variables.');
  }
  return new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
}

/**
 * STAGE 0: Multimodal Poster Vision OCR Agent
 * Mengekstrak teks lengkap, alamat email HRD, dan aturan format subjek dari gambar poster/flyer lowongan.
 */
async function extractPosterTextWithVision(imageBuffer, mimeType = 'image/jpeg') {
  const genAI = getGeminiClient();
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: {
      temperature: 0.05,
    },
  });

  const prompt = `Anda adalah Agen OCR Poster Lowongan Kerja Presisi (AutoApply AI Stage 0).
Tugas Anda: Baca seluruh teks yang terlihat pada gambar poster/flyer lowongan kerja ini secara akurat tanpa melewatkan detail apa pun.

Ekstrak dan susun dalam format teks terstruktur berikut:
- Posisi Jabatan: [tulis posisi]
- Nama Perusahaan / Instansi: [tulis nama perusahaan]
- Lokasi Penempatan: [tulis kota/area]
- Kualifikasi & Persyaratan: [tulis poin kualifikasi]
- Alamat Email HRD / Kontak Rekrutmen: [tulis email persis jika ada, atau tulis Tidak Tercantum]
- Aturan Wajib Format Subjek Email: [tulis aturan subjek persis jika ada instruksi khusus seperti Subject: Posisi_Nama, atau tulis Tidak Ada]
- Batas Waktu & Catatan Tambahan: [tulis catatan lain pada poster]

Jangan mengarang informasi yang tidak tertulis pada gambar.`;

  const imagePart = {
    inlineData: {
      data: imageBuffer.toString('base64'),
      mimeType,
    },
  };

  const result = await model.generateContent([prompt, imagePart]);
  const response = await result.response;
  return (response.text() || '').trim();
}

module.exports = { extractPosterTextWithVision };