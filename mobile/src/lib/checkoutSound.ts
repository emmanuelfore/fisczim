/**
 * checkoutSound.ts
 * Plays a short scanner-like beep at checkout using expo-audio.
 * Sound is loaded lazily once and reused.
 */
import { createAudioPlayer, AudioPlayer } from "expo-audio";

let _sound: AudioPlayer | null = null;
let _addSound: AudioPlayer | null = null;

export async function playCheckoutSound() {
  try {
    if (!_sound) {
      _sound = createAudioPlayer(require("../../assets/sounds/checkout-beep.wav"));
      _sound.volume = 0.55;
    }
    await _sound.seekTo(0);
    _sound.play();
  } catch (e) {
    // Sound is a nice-to-have, never crash on failure
    console.warn("[Sound] Checkout sound failed:", e);
  }
}

export async function playAddToCartSound() {
  try {
    if (!_addSound) {
      _addSound = createAudioPlayer(require("../../assets/sounds/checkout-beep.wav"));
      _addSound.volume = 0.4;
    }
    await _addSound.seekTo(0);
    _addSound.play();
  } catch (e) {
    // Sound is a nice-to-have, never crash on failure
    console.warn("[Sound] Add-to-cart sound failed:", e);
  }
}

export async function unloadCheckoutSound() {
  if (_sound) {
    _sound.remove();
    _sound = null;
  }
  if (_addSound) {
    _addSound.remove();
    _addSound = null;
  }
}
