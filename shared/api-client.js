import { ICLOUD_SETUP_URL, API_PATHS, AUTH } from './constants.js';

class ApiClient {
  constructor() {
    this.baseUrl = null;
    this.v2BaseUrl = null;
  }

  async request(url, options = {}) {
    // Note: Origin and Referer headers are handled by declarativeNetRequest
    // in the service worker. We just need to make the fetch with credentials.
    
    const config = {
      method: options.method || 'GET',
      credentials: 'include', // This sends cookies
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        ...options.headers
      }
    };

    if (options.body) {
      config.body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
    }

    try {
      console.log('API Request:', config.method, url);
      const response = await fetch(url, config);
      
      console.log('API Response status:', response.status);
      
      // Check for auth issues
      if (response.status === 401 || response.status === 403 || response.status === 421) {
        this.clearSession();
        throw { code: 'NOT_AUTH', message: 'Not signed in to iCloud' };
      }

      if (!response.ok) {
        const text = await response.text();
        console.error('API Error:', response.status, text.substring(0, 500));
        throw { code: 'API_ERROR', message: `HTTP ${response.status}` };
      }

      const text = await response.text();
      if (!text) {
        return { success: true };
      }

      try {
        const data = JSON.parse(text);
        if (data.success === false && data.error) {
          throw { code: 'API_ERROR', message: data.error.errorMessage || 'API error' };
        }
        return data;
      } catch (parseError) {
        if (parseError.code) throw parseError;
        console.error('JSON Parse Error:', text.substring(0, 200));
        throw { code: 'PARSE_ERROR', message: 'Invalid response from server' };
      }
    } catch (error) {
      if (error.code) throw error;
      console.error('Network Error:', error);
      throw { code: 'NETWORK_ERROR', message: 'Network error - check your connection' };
    }
  }

  async validateSession() {
    try {
      console.log('Validating iCloud session...');
      
      const data = await this.request(ICLOUD_SETUP_URL, {
        method: 'POST',
        body: {
          clientBuildNumber: '2420Project78',
          clientMasteringNumber: '2420B28',
          clientId: crypto.randomUUID().toUpperCase()
        }
      });

      console.log('Validate response received');

      // Check if we got a valid response with webservices
      if (!data.webservices) {
        console.error('No webservices in response - not logged in');
        return { status: AUTH.NOT_LOGGED_IN };
      }

      console.log('Available webservices:', Object.keys(data.webservices));

      // Check for premium mail settings (Hide My Email requires iCloud+)
      if (!data.webservices.premiummailsettings?.url) {
        console.log('No premiummailsettings - user does not have iCloud+');
        return { status: AUTH.NO_ICLOUD_PLUS };
      }

      const premiumUrl = data.webservices.premiummailsettings.url;
      console.log('Premium mail URL:', premiumUrl);
      
      this.baseUrl = premiumUrl;
      this.v2BaseUrl = premiumUrl;

      return { 
        status: AUTH.READY, 
        dsid: data.dsInfo?.dsid,
        fullName: data.dsInfo?.fullName
      };
    } catch (error) {
      console.error('validateSession error:', error);
      if (error.code === 'NOT_AUTH') {
        return { status: AUTH.NOT_LOGGED_IN, error: error.message };
      }
      return { status: AUTH.ERROR, error: error.message };
    }
  }

  async ensureUrls() {
    if (!this.baseUrl) {
      const result = await this.validateSession();
      if (result.status !== AUTH.READY) {
        throw { code: result.status, message: result.error || 'Not connected to iCloud' };
      }
    }
  }

  async listAliases() {
    await this.ensureUrls();
    const data = await this.request(`${this.v2BaseUrl}${API_PATHS.LIST}`);
    
    return {
      aliases: data.result?.hmeEmails || [],
      forwardToEmail: data.result?.selectedForwardTo || data.result?.forwardToEmails?.[0] || null
    };
  }

  async generateAlias() {
    await this.ensureUrls();
    const data = await this.request(`${this.baseUrl}${API_PATHS.GENERATE}`, {
      method: 'POST',
      body: {}
    });
    
    if (!data.result?.hme) {
      throw { code: 'API_ERROR', message: 'Could not generate alias' };
    }
    return data.result.hme;
  }

  async reserveAlias(hme, label = '', note = '') {
    await this.ensureUrls();
    const data = await this.request(`${this.baseUrl}${API_PATHS.RESERVE}`, {
      method: 'POST',
      body: { hme, label, note }
    });
    return data.result;
  }

  async updateMetaData(anonymousId, label, note) {
    await this.ensureUrls();
    const data = await this.request(`${this.baseUrl}${API_PATHS.UPDATE_METADATA}`, {
      method: 'POST',
      body: { anonymousId, label, note }
    });
    return data.result;
  }

  async deactivateAlias(anonymousId) {
    await this.ensureUrls();
    const data = await this.request(`${this.baseUrl}${API_PATHS.DEACTIVATE}`, {
      method: 'POST',
      body: { anonymousId }
    });
    return data.success !== false;
  }

  async reactivateAlias(anonymousId) {
    await this.ensureUrls();
    const data = await this.request(`${this.baseUrl}${API_PATHS.REACTIVATE}`, {
      method: 'POST',
      body: { anonymousId }
    });
    return data.success !== false;
  }

  async deleteAlias(anonymousId) {
    await this.ensureUrls();
    const data = await this.request(`${this.baseUrl}${API_PATHS.DELETE}`, {
      method: 'POST',
      body: { anonymousId }
    });
    return data.success !== false;
  }

  async updateForwardTo(forwardToEmail) {
    await this.ensureUrls();
    const data = await this.request(`${this.baseUrl}${API_PATHS.UPDATE_FORWARD_TO}`, {
      method: 'POST',
      body: { forwardToEmail }
    });
    return data.success !== false;
  }

  clearSession() {
    this.baseUrl = null;
    this.v2BaseUrl = null;
  }
}

export const apiClient = new ApiClient();
