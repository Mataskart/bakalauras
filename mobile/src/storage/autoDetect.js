import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'keliq_auto_detect';

export async function getAutoDetect() {
  try {
    const v = await AsyncStorage.getItem(KEY);
    return v === 'true';
  } catch {
    return false;
  }
}

export async function setAutoDetect(on) {
  await AsyncStorage.setItem(KEY, on ? 'true' : 'false');
}
