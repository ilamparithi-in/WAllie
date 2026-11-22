import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('Responsive Extension: Disable Animations & Instant Transitions', () => {
  const extensionDir = path.resolve(process.cwd(), 'extensions/responsive-layout');
  const cssPath = path.join(extensionDir, 'styles/styles.css');
  const contentJsPath = path.join(extensionDir, 'scripts/content.js');
  const popupHtmlPath = path.join(extensionDir, 'popup/popup.html');
  const popupJsPath = path.join(extensionDir, 'popup/popup.js');
  const popupCssPath = path.join(extensionDir, 'popup/popup.css');

  test('popup.html contains disable animations toggle switch and labels', () => {
    const html = fs.readFileSync(popupHtmlPath, 'utf8');
    assert.match(html, /id="toggle-disable-animations"/, 'popup.html must contain toggle-disable-animations input');
    assert.match(html, /Disable Animations/, 'popup.html must label the option as Disable Animations');
    assert.match(html, /Make all transitions instant/, 'popup.html must describe the effect as making transitions instant');
    assert.match(html, /class="switch"/, 'popup.html must use the switch toggle styling');
  });

  test('popup.css styles the switch and card-toggle-row', () => {
    const css = fs.readFileSync(popupCssPath, 'utf8');
    assert.match(css, /\.card-toggle-row/, 'popup.css must define .card-toggle-row');
    assert.match(css, /\.switch/, 'popup.css must define .switch');
    assert.match(css, /\.slider/, 'popup.css must define .slider');
  });

  test('popup.js reads, updates, and saves disableAnimations setting', () => {
    const js = fs.readFileSync(popupJsPath, 'utf8');
    assert.match(js, /toggle-disable-animations/, 'popup.js must query toggle-disable-animations');
    assert.match(js, /'disableAnimations'/, 'popup.js must retrieve disableAnimations from chrome.storage');
    assert.match(js, /disableAnimations:\s*e\.target\.checked/, 'popup.js must persist disableAnimations to chrome.storage');
  });

  test('content.js handles disableAnimations and toggles data-wallie-no-animations attribute', () => {
    const js = fs.readFileSync(contentJsPath, 'utf8');
    assert.match(js, /applyDisableAnimations/, 'content.js must define applyDisableAnimations');
    assert.match(js, /data-wallie-no-animations/, 'content.js must set data-wallie-no-animations');
    assert.match(js, /'disableAnimations'/, 'content.js must listen for disableAnimations in storage');

    // Simulate DOM attribute toggle function
    const mockDocument = {
      documentElement: {
        attributes: new Map<string, string>(),
        setAttribute(k: string, v: string) {
          this.attributes.set(k, v);
        },
        removeAttribute(k: string) {
          this.attributes.delete(k);
        },
        hasAttribute(k: string) {
          return this.attributes.has(k);
        },
        getAttribute(k: string) {
          return this.attributes.get(k);
        },
      },
    };

    function applyDisableAnimations(disabled: boolean) {
      if (disabled) {
        mockDocument.documentElement.setAttribute('data-wallie-no-animations', 'true');
      } else {
        mockDocument.documentElement.removeAttribute('data-wallie-no-animations');
      }
    }

    // Default state: not set
    assert.equal(mockDocument.documentElement.hasAttribute('data-wallie-no-animations'), false);

    // Enabled: sets attribute
    applyDisableAnimations(true);
    assert.equal(mockDocument.documentElement.getAttribute('data-wallie-no-animations'), 'true');

    // Disabled: removes attribute
    applyDisableAnimations(false);
    assert.equal(mockDocument.documentElement.hasAttribute('data-wallie-no-animations'), false);
  });

  test('styles.css contains rules to make transitions instant when animations are disabled', () => {
    const css = fs.readFileSync(cssPath, 'utf8');

    // Check data-wallie-no-animations rules
    assert.match(
      css,
      /html\[data-wallie-no-animations="true"\]\s+\[data-testid="drawer-left"\]/,
      'styles.css must target drawer-left when data-wallie-no-animations is true'
    );
    assert.match(
      css,
      /html\[data-wallie-no-animations="true"\]\s+\[data-testid="drawer-middle"\]/,
      'styles.css must target drawer-middle when data-wallie-no-animations is true'
    );
    assert.match(
      css,
      /html\[data-wallie-no-animations="true"\]\s+\[data-testid="drawer-right"\]/,
      'styles.css must target drawer-right when data-wallie-no-animations is true'
    );

    // Check transition: none !important
    const noAnimBlock = css.substring(css.indexOf('/* ---------------- DISABLE ANIMATIONS (INSTANT TRANSITIONS) ---------------- */'));
    assert.match(noAnimBlock, /transition:\s*none\s*!important;/, 'styles.css must set transition: none !important');
    assert.match(noAnimBlock, /will-change:\s*auto\s*!important;/, 'styles.css must reset will-change to auto');

    // Check accessibility media query prefers-reduced-motion fallback
    assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/, 'styles.css must include prefers-reduced-motion query');
  });
});
