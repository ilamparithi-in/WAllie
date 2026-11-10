import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const LARGE_FILE_THRESHOLD = 64 * 1024 * 1024; // 64 MB

/**
 * Computes SHA256 of a file synchronously using fixed chunk buffers
 * to prevent allocating large memory buffers on the Node.js heap.
 */
export function computeFileSha256Sync(filePath: string, bufferSize = 64 * 1024): string {
  const hash = crypto.createHash('sha256');
  const fd = fs.openSync(filePath, 'r');
  try {
    const buffer = Buffer.allocUnsafe(bufferSize);
    let bytesRead = 0;
    while ((bytesRead = fs.readSync(fd, buffer, 0, bufferSize, null)) > 0) {
      hash.update(buffer.subarray(0, bytesRead));
    }
    return hash.digest('hex');
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * Computes SHA256 of a file asynchronously by streaming directly through crypto.
 */
export async function computeFileSha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', (err) => reject(err));
  });
}

/**
 * Validates file content headers and magic numbers to detect executable binaries
 * or dangerous scripts disguised as safe documents or media before launching.
 */
export function validateFileContentSafety(filePath: string): { safe: boolean; reason?: string } {
  try {
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      return { safe: false, reason: 'Target path is a directory' };
    }
    const fd = fs.openSync(filePath, 'r');
    const header = Buffer.alloc(512);
    let bytesRead = 0;
    try {
      bytesRead = fs.readSync(fd, header, 0, 512, 0);
    } finally {
      fs.closeSync(fd);
    }
    if (bytesRead === 0) {
      return { safe: true };
    }

    const ext = path.extname(filePath).toLowerCase();

    // Check for executable signatures (ELF or Windows PE MZ)
    const isElf = bytesRead >= 4 && header[0] === 0x7f && header[1] === 0x45 && header[2] === 0x4c && header[3] === 0x46; // \x7fELF
    const isPe = bytesRead >= 2 && header[0] === 0x4d && header[1] === 0x5a; // MZ
    const isScript = bytesRead >= 2 && header[0] === 0x23 && header[1] === 0x21; // #!

    // If an executable or script is disguised as an image, media, or safe document
    const safeMediaExts = new Set([
      '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.ico', '.svg',
      '.mp3', '.ogg', '.wav', '.m4a', '.flac', '.aac',
      '.mp4', '.mkv', '.webm', '.avi', '.mov',
      '.pdf', '.txt', '.csv', '.json', '.zip', '.tar', '.gz'
    ]);

    if (safeMediaExts.has(ext)) {
      if (isElf || isPe) {
        return { safe: false, reason: 'Executable binary signature found in media file' };
      }
    }

    // Direct execution of raw desktop entry or script files
    const dangerousExecutableExts = new Set(['.desktop', '.sh', '.bash', '.run', '.bin', '.elf', '.exe']);
    if (dangerousExecutableExts.has(ext) && (isScript || isElf || isPe)) {
      return { safe: false, reason: 'Potentially dangerous executable file; please open from folder' };
    }

    return { safe: true };
  } catch (err: any) {
    return { safe: false, reason: err.message };
  }
}

