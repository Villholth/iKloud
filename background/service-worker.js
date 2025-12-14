import { apiClient } from '../shared/api-client.js';
import { storage } from '../shared/storage.js';
import { MSG, CACHE_TTL } from '../shared/constants.js';

// ============================================================
// DECLARATIVE NET REQUEST - ORIGIN SPOOFING
// This is CRITICAL for iCloud authentication to work.
// Without this, Chrome sends "Origin: chrome-extension://xxx" 
// which causes Apple to invalidate the session (logout).
// ============================================================

const RULE_ID_ORIGIN = 1;
const RULE_ID_REFERER = 2;
const ICLOUD_ORIGIN = 'https://www.icloud.com';

async function registerNetworkRules() {
  const extensionId = chrome.runtime.id;
  
  console.log('Registering declarativeNetRequest rules for extension:', extensionId);

  const rules = [
    {
      id: RULE_ID_ORIGIN,
      priority: 1,
      action: {
        type: 'modifyHeaders',
        requestHeaders: [
          {
            header: 'Origin',
            operation: 'set',
            value: ICLOUD_ORIGIN
          }
        ]
      },
      condition: {
        urlFilter: '||icloud.com',
        initiatorDomains: [extensionId],
        resourceTypes: ['xmlhttprequest', 'other']
      }
    },
    {
      id: RULE_ID_REFERER,
      priority: 1,
      action: {
        type: 'modifyHeaders',
        requestHeaders: [
          {
            header: 'Referer',
            operation: 'set',
            value: ICLOUD_ORIGIN + '/'
          }
        ]
      },
      condition: {
        urlFilter: '||icloud.com',
        initiatorDomains: [extensionId],
        resourceTypes: ['xmlhttprequest', 'other']
      }
    }
  ];

  try {
    // Remove existing rules first to avoid conflicts
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [RULE_ID_ORIGIN, RULE_ID_REFERER],
      addRules: rules
    });
    
    console.log('declarativeNetRequest rules registered successfully');
    
    // Verify rules are active
    const activeRules = await chrome.declarativeNetRequest.getDynamicRules();
    console.log('Active DNR rules:', activeRules.length);
  } catch (error) {
    console.error('Failed to register DNR rules:', error);
  }
}

// Register rules on install
chrome.runtime.onInstalled.addListener(() => {
  console.log('Extension installed - registering network rules');
  registerNetworkRules();
});

// Re-register on startup (browser restart bug workaround)
chrome.runtime.onStartup.addListener(() => {
  console.log('Browser started - re-registering network rules');
  registerNetworkRules();
});

// Also register immediately when service worker starts
registerNetworkRules();

// ============================================================
// CACHE FOR ALIAS LIST
// ============================================================

const cache = {
  aliases: null,
  forwardToEmail: null,
  timestamp: 0,
  isValid() {
    return this.aliases && (Date.now() - this.timestamp) < CACHE_TTL;
  },
  set(aliases, forwardToEmail) {
    this.aliases = aliases;
    this.forwardToEmail = forwardToEmail;
    this.timestamp = Date.now();
  },
  invalidate() {
    this.aliases = null;
    this.timestamp = 0;
  }
};

// ============================================================
// MESSAGE HANDLER
// ============================================================

async function handleMessage(message) {
  const { type, payload } = message;

  console.log('Handling message:', type);

  switch (type) {
    case MSG.GET_AUTH_STATUS:
      const authResult = await apiClient.validateSession();
      console.log('Auth result:', authResult);
      return authResult;

    case MSG.LIST_ALIASES:
      if (cache.isValid() && !payload?.forceRefresh) {
        console.log('Returning cached aliases');
        return { aliases: cache.aliases, forwardToEmail: cache.forwardToEmail };
      }
      console.log('Fetching aliases from API');
      const data = await apiClient.listAliases();
      cache.set(data.aliases, data.forwardToEmail);
      return data;

    case MSG.GENERATE_ALIAS:
      const hme = await apiClient.generateAlias();
      console.log('Generated alias:', hme);
      return { hme };

    case MSG.RESERVE_ALIAS:
      const reserved = await apiClient.reserveAlias(payload.hme, payload.label, payload.note);
      cache.invalidate();
      return reserved;

    case MSG.UPDATE_ALIAS:
      const updated = await apiClient.updateMetaData(payload.anonymousId, payload.label, payload.note);
      cache.invalidate();
      return updated;

    case MSG.DEACTIVATE_ALIAS:
      const deactivated = await apiClient.deactivateAlias(payload.anonymousId);
      cache.invalidate();
      return { success: deactivated };

    case MSG.REACTIVATE_ALIAS:
      const reactivated = await apiClient.reactivateAlias(payload.anonymousId);
      cache.invalidate();
      return { success: reactivated };

    case MSG.DELETE_ALIAS:
      const deleted = await apiClient.deleteAlias(payload.anonymousId);
      cache.invalidate();
      return { success: deleted };

    case MSG.UPDATE_FORWARD_TO:
      const forwardUpdated = await apiClient.updateForwardTo(payload.email);
      if (forwardUpdated) cache.forwardToEmail = payload.email;
      return { success: forwardUpdated };

    case MSG.AUTOFILL_REQUEST:
      const newHme = await apiClient.generateAlias();
      await apiClient.reserveAlias(newHme, payload.domain || '', '');
      cache.invalidate();
      return { alias: newHme };

    case MSG.GET_SETTINGS:
      return await storage.getSettings();

    default:
      throw new Error(`Unknown message: ${type}`);
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message)
    .then(data => {
      console.log('Message handled successfully:', message.type);
      sendResponse({ success: true, data });
    })
    .catch(error => {
      console.error('Message handler error:', message.type, error);
      sendResponse({ 
        success: false, 
        error: { 
          code: error.code || 'ERROR', 
          message: error.message || 'Unknown error'
        } 
      });
    });
  return true;
});

console.log('Hide My Email Manager service worker started');
