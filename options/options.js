import { storage } from '../shared/storage.js';

const PRIVACY_POLICY_URL = 'https://villholth.github.io/iKloud/privacy-policy.html';

const $ = id => document.getElementById(id);

let toastTimeout;

function showToast(message = 'Saved!') {
  const el = $('toast');
  el.textContent = message;
  el.classList.remove('hidden');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => el.classList.add('hidden'), 1500);
}

async function loadSettings() {
  const settings = await storage.getSettings();
  $('autofill').checked = settings.autofillEnabled;
  $('auto-label').checked = settings.autoLabelWithDomain;
}

async function saveSetting(key, value) {
  await storage.setSetting(key, value);
  showToast();
}

function openPrivacyPolicy() {
  window.open(PRIVACY_POLICY_URL, '_blank');
}

async function resetConsent() {
  await chrome.storage.local.remove('privacyConsent');
  showToast('Consent reset');
}

function init() {
  loadSettings();

  $('autofill').addEventListener('change', e => saveSetting('autofillEnabled', e.target.checked));
  $('auto-label').addEventListener('change', e => saveSetting('autoLabelWithDomain', e.target.checked));
  
  $('btn-privacy').addEventListener('click', openPrivacyPolicy);
  $('btn-reset-consent').addEventListener('click', resetConsent);
}

document.addEventListener('DOMContentLoaded', init);
