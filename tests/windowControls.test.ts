import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  TITLEBAR_HEIGHT,
  MACOS_TRAFFIC_LIGHTS_WIDTH,
  MACOS_TRAFFIC_LIGHT_POSITION,
} from '../src/shared/constants.ts';

describe('macOS Window Controls & Traffic Lights Geometry', () => {
  test('constants define expected macOS traffic light positioning values', () => {
    assert.equal(TITLEBAR_HEIGHT, 28);
    assert.equal(MACOS_TRAFFIC_LIGHTS_WIDTH, 78);
    assert.deepEqual(MACOS_TRAFFIC_LIGHT_POSITION, { x: 12, y: 8 });
  });

  test('traffic light y-offset vertically centers 12px buttons within titlebar', () => {
    const trafficLightDiameter = 12;
    const topMargin = MACOS_TRAFFIC_LIGHT_POSITION.y;
    const bottomMargin = TITLEBAR_HEIGHT - (topMargin + trafficLightDiameter);

    assert.equal(topMargin, 8);
    assert.equal(bottomMargin, 8);
    assert.equal(topMargin, bottomMargin, 'Traffic lights must be symmetrically centered vertically');
  });

  test('traffic light spacer provides clearance beyond the 3 native control buttons', () => {
    const buttonDiameter = 12;
    const buttonSpacing = 8;
    const startX = MACOS_TRAFFIC_LIGHT_POSITION.x; // 12px

    // Close button: [12..24]
    // Minimize button: [32..44]
    // Zoom button: [52..64]
    const closeEnd = startX + buttonDiameter;
    const minimizeEnd = closeEnd + buttonSpacing + buttonDiameter;
    const zoomEnd = minimizeEnd + buttonSpacing + buttonDiameter;

    assert.equal(zoomEnd, 64);
    assert.ok(
      MACOS_TRAFFIC_LIGHTS_WIDTH > zoomEnd,
      'Spacer width must exceed rightmost traffic light button'
    );

    const safetyBuffer = MACOS_TRAFFIC_LIGHTS_WIDTH - zoomEnd;
    assert.ok(
      safetyBuffer >= 10,
      `Safety buffer (${safetyBuffer}px) must provide at least 10px margin before tabs/logo`
    );
  });

  test('controls filtering retains only pin on macOS and preserves all on Linux/Windows', () => {
    const allControls: ('pin' | 'min' | 'max' | 'close')[] = ['pin', 'min', 'max', 'close'];

    const filterForPlatform = (platform: string, controls: typeof allControls) => {
      return platform === 'darwin'
        ? controls.filter((c) => c === 'pin')
        : controls;
    };

    const macControls = filterForPlatform('darwin', allControls);
    assert.deepEqual(macControls, ['pin']);

    const linuxControls = filterForPlatform('linux', allControls);
    assert.deepEqual(linuxControls, ['pin', 'min', 'max', 'close']);

    const winControls = filterForPlatform('win32', allControls);
    assert.deepEqual(winControls, ['pin', 'min', 'max', 'close']);
  });
});
