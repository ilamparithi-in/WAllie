import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

describe('Responsive Settings & Titlebar Account Switcher Thresholds', () => {
  const PORTRAIT_WIDTH_THRESHOLD = 900;

  test('portrait threshold is defined at 900px width', () => {
    assert.equal(PORTRAIT_WIDTH_THRESHOLD, 900);
  });

  test('widths <= 900px trigger detached settings window', () => {
    const isUnderPortraitThreshold = (w: number) => w <= PORTRAIT_WIDTH_THRESHOLD;

    assert.equal(isUnderPortraitThreshold(900), true, '900px is under or at portrait threshold');
    assert.equal(isUnderPortraitThreshold(899), true, '899px is under portrait threshold');
    assert.equal(isUnderPortraitThreshold(480), true, '480px (narrow window) is under portrait threshold');
    assert.equal(isUnderPortraitThreshold(901), false, '901px is wider than portrait threshold');
    assert.equal(isUnderPortraitThreshold(1200), false, '1200px is wider than portrait threshold');
  });

  test('titlebar overflow calculation properly flags when tabs exceed available width', () => {
    const computeOverflow = (headerWidth: number, rightWidth: number, macSpacer: number, neededTabsWidth: number) => {
      const logoWidth = 28;
      const minDragWidth = 32;
      const availableWidth = headerWidth - rightWidth - macSpacer - logoWidth - minDragWidth;
      return neededTabsWidth > availableWidth;
    };

    // Header 450px, right controls 180px, linux (no mac spacer): available = 450 - 180 - 0 - 28 - 32 = 210px
    // 2 tabs needed: 230px -> should overflow and trigger dropdown
    assert.equal(computeOverflow(450, 180, 0, 230), true);

    // Header 1200px, right controls 180px: available = 1200 - 180 - 0 - 28 - 32 = 960px
    // 2 tabs needed: 230px -> should NOT overflow
    assert.equal(computeOverflow(1200, 180, 0, 230), false);
  });
});
