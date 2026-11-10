import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  computeFileSha256Sync,
  computeFileSha256,
  validateFileContentSafety,
} from '../src/main/downloadSafety.ts';

describe('Downloads Utilities & Safety Checks', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wallie-test-'));

  test('computeFileSha256Sync and computeFileSha256 produce matching digests', async () => {
    const testFile = path.join(tmpDir, 'sample.txt');
    fs.writeFileSync(testFile, 'Hello WAllie Linux Client!', 'utf8');

    const syncHash = computeFileSha256Sync(testFile);
    const asyncHash = await computeFileSha256(testFile);

    assert.equal(syncHash, asyncHash);
    assert.equal(syncHash.length, 64);
  });

  test('validateFileContentSafety identifies safe documents', () => {
    const safeTxt = path.join(tmpDir, 'document.txt');
    fs.writeFileSync(safeTxt, 'Just a regular text file', 'utf8');
    const res = validateFileContentSafety(safeTxt);
    assert.equal(res.safe, true);
  });

  test('validateFileContentSafety detects executable binary disguised as media', () => {
    const fakeImage = path.join(tmpDir, 'photo.jpg');
    // ELF header: 0x7f, 'E', 'L', 'F'
    const elfHeader = Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00]);
    fs.writeFileSync(fakeImage, elfHeader);

    const res = validateFileContentSafety(fakeImage);
    assert.equal(res.safe, false);
    assert.match(res.reason || '', /executable/i);
  });

  test('validateFileContentSafety detects script disguised as safe document', () => {
    const fakeDoc = path.join(tmpDir, 'script.sh');
    fs.writeFileSync(fakeDoc, '#!/bin/bash\nrm -rf /', 'utf8');

    const res = validateFileContentSafety(fakeDoc);
    assert.equal(res.safe, false);
    assert.match(res.reason || '', /executable/i);
  });
});
