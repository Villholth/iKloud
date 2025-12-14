import { DEFAULT_SETTINGS } from './constants.js';

export const storage = {
  async getSettings() {
    try {
      const result = await chrome.storage.sync.get('hme_settings');
      return { ...DEFAULT_SETTINGS, ...result.hme_settings };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  },

  async saveSettings(settings) {
    const current = await this.getSettings();
    await chrome.storage.sync.set({ hme_settings: { ...current, ...settings } });
  },

  async getSetting(key) {
    const settings = await this.getSettings();
    return settings[key];
  },

  async setSetting(key, value) {
    await this.saveSettings({ [key]: value });
  }
};
