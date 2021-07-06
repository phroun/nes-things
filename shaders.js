/*!
 * shaders.js, v0.1
 * https://github.com/phroun/nes-things
 *
 * Copyright Jeffrey R. Day and other contributors
 * Released under the MIT license
 * https://github.com/phroun/nes-things/blob/main/LICENSE
 *
 * First Release: 2021-07-05 20:14:00
 * Last Updated:  2021-07-05
 */
 
'use strict';

export const Shaders = function() {

  var settings = {
    spectral: {
      fxDither: false,     // Set fxDither to true to turn on global dither.
      fxTransparency: true // Set to true to allow background priority peeking in some cases.
    }
  }

  var fxSpectralState = { // State that must be tracked during pipeline processing.
    spShadow: 0,
    bgShadow: 0,
    lastColor: 0,
    phase: 0
  }
  var fxCache;

  function initialize() {
    fxCache = [[],[],[],[],[],[],[]];  // Allocate an 8x128 array of bytes.
    for (var level=0; level <= 6; level++) {
      for (var i=0; i < 64; i++) {
        var brightColor = i;
        var l = level - 3;
        while (l > 0) {
          if (brightColor + 0x10 < 0x3F) {
            brightColor += 0x10;
          }
          l--;
        }
        var shadowColor = brightColor;
        while (l < 0) {
          if (brightColor - 0x10 >= 0x00) {
            brightColor -= 0x10;
            shadowColor -= 0x10;
          } else {
            shadowColor = 0x2D; break;
          }
          l++;
        }
        fxCache[level][i] = brightColor;
        fxCache[level][i + 64] = shadowColor;
      }
    }
  }

  // These shaders should return an index into the Master Palette (64 colors)
  // They don't add any new colors the NES cannot already generate.

  // Arguments for Shaders:
  // bgIndex and spIndex should be 0..3 values without attribute information applied.
  // bgColor and spColor should be indexes into the Master Palette (64 colors)
  // decision should be 1 if the multiplexer is wanting to the sprite pixel to show, and 0 for the background pixel
  // showLeft should be 0 if the left 8 pixels of the screen are currently masked

  // First, the standard shader, as a reference:
  function standard(scanLine, fineY, dot, fineX, bgIndex, bgColor, spIndex, spColor, decision, showLeft) {
    return decision ? spColor : bgColor;
  }

  // Spectral Highlights & Shadows by Jeff R. Day
  function spectral(scanLine, fineY, dot, fineX, bgIndex, bgColor, spIndex, spColor, decision, showLeft) {
    var color = bgColor;
    var pshift = 3;
    var dither = settings.spectral.fxDither;
    var mute = false;
    if ((dot <= 2) || ((!showLeft) && (dot <= 9))) {
      if (bgIndex) {
        fxSpectralState.phase = 7; // half way
      } else {
        fxSpectralState.phase = 14;
      }
      fxSpectralState.bgShadow = 0;
      fxSpectralState.lastColor = bgColor;
      mute = true;
    }
    if (decision) fxSpectralState.spShadow = Math.min(9, fxSpectralState.spShadow + 5);
    if ((bgColor == fxSpectralState.lastColor)) {
      if (bgIndex) { // not universal background
        if (fxSpectralState.phase) fxSpectralState.phase--;
      } else {
        fxSpectralState.phase = 0;
      }
    } else {
      fxSpectralState.lastColor = bgColor;
      if (!mute) {
        fxSpectralState.phase = 14;
        if ((bgIndex == 0) && (fxCache[1][bgColor + 64] != 0x2D)) {
          fxSpectralState.bgShadow = 3;
        }
      }
    }
    if (fxSpectralState.spShadow || fxSpectralState.bgShadow) {
      if (fxSpectralState.spShadow) fxSpectralState.spShadow--;
      if (fxSpectralState.spShadow) fxSpectralState.spShadow--;
      if (fxSpectralState.bgShadow) fxSpectralState.bgShadow--;
      if (fxCache[1][bgColor + 64] == 0x2D) {
        dither = true;
      }
    }
    if (! (decision || (settings.spectral.fxTransparency && spIndex))) {
      // The following mask comparison is hacky, but improves SMB, SMB2, and others.
      if ((bgColor & 0x0F) != 10) {
        pshift = 5 - Math.floor( Math.abs(fxSpectralState.phase - 7) / 3 );
      }
      if (fxSpectralState.spShadow || fxSpectralState.bgShadow) {
        if (color <= 0x10) {
          color += 64;
        }
        pshift = Math.max(0, pshift - 1);
      }
      if (dither && ((scanLine + dot + fineX + fineY) & 1)) {
        pshift = 3;
      }
      pshift = Math.min(6, Math.max(0, pshift));
    }
    return fxCache[pshift][ decision ? spColor : color ];
  }

  initialize();
  return {
    settings,
    standard,
    spectral
  };
}
