/**
 * checkoutSound.ts
 * Plays a short scanner-like beep at checkout using expo-av.
 * Sound is loaded lazily once and reused.
 */
import { Audio } from "expo-av";

let _sound: Audio.Sound | null = null;

export async function playCheckoutSound() {
  try {
    if (!_sound) {
      const { sound } = await Audio.Sound.createAsync(
        require("../../assets/sounds/checkout-beep.wav"),
        { shouldPlay: false, volume: 0.55 }
      );
      _sound = sound;
    }
    await _sound.setPositionAsync(0);
    await _sound.playAsync();
  } catch (e) {
    // Sound is a nice-to-have, never crash on failure
    console.warn("[Sound] Checkout sound failed:", e);
  }
}

export async function unloadCheckoutSound() {
  if (_sound) {
    await _sound.unloadAsync();
    _sound = null;
  }
}
