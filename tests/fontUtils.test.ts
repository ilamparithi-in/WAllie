import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseGnomeFontName } from '../src/shared/fonts.ts';

describe('Font Utilities & Monospace Parsing', () => {
  test('parseGnomeFontName parses standard gnome font strings', () => {
    assert.equal(parseGnomeFontName("'Space Grotesk 10'"), 'Space Grotesk');
    assert.equal(parseGnomeFontName('"Ubuntu 11"'), 'Ubuntu');
    assert.equal(parseGnomeFontName("'Cantarell Bold 12'"), 'Cantarell Bold');
  });

  test('parseGnomeFontName strips bracketed variant tags like [NONE]', () => {
    assert.equal(parseGnomeFontName("'Space Mono [NONE]  10'"), 'Space Mono');
    assert.equal(parseGnomeFontName("'JetBrains Mono [NF] 12'"), 'JetBrains Mono');
  });

  test('parseGnomeFontName handles font names without trailing sizes', () => {
    assert.equal(parseGnomeFontName('Fira Code'), 'Fira Code');
    assert.equal(parseGnomeFontName("'DejaVu Sans Mono'"), 'DejaVu Sans Mono');
  });
});
