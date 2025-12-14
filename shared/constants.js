export const ICLOUD_SETUP_URL = 'https://setup.icloud.com/setup/ws/1/validate';

export const API_PATHS = {
  LIST: '/v2/hme/list',
  GENERATE: '/v1/hme/generate',
  RESERVE: '/v1/hme/reserve',
  UPDATE_METADATA: '/v1/hme/updateMetaData',
  DEACTIVATE: '/v1/hme/deactivate',
  REACTIVATE: '/v1/hme/reactivate',
  DELETE: '/v1/hme/delete',
  UPDATE_FORWARD_TO: '/v1/hme/updateForwardTo'
};

export const MSG = {
  GET_AUTH_STATUS: 'GET_AUTH_STATUS',
  LIST_ALIASES: 'LIST_ALIASES',
  GENERATE_ALIAS: 'GENERATE_ALIAS',
  RESERVE_ALIAS: 'RESERVE_ALIAS',
  UPDATE_ALIAS: 'UPDATE_ALIAS',
  DEACTIVATE_ALIAS: 'DEACTIVATE_ALIAS',
  REACTIVATE_ALIAS: 'REACTIVATE_ALIAS',
  DELETE_ALIAS: 'DELETE_ALIAS',
  UPDATE_FORWARD_TO: 'UPDATE_FORWARD_TO',
  AUTOFILL_REQUEST: 'AUTOFILL_REQUEST',
  GET_SETTINGS: 'GET_SETTINGS'
};

export const AUTH = {
  READY: 'ready',
  NOT_LOGGED_IN: 'not_logged_in',
  NO_ICLOUD_PLUS: 'no_icloud_plus',
  ERROR: 'error'
};

export const DEFAULT_SETTINGS = {
  theme: 'system',
  autofillEnabled: true,
  autoLabelWithDomain: true
};

export const CACHE_TTL = 60000;
