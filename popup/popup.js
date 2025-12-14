import { MSG, AUTH } from '../shared/constants.js';

const PRIVACY_POLICY_URL = 'https://villholth.github.io/iKloud/privacy-policy.html';

let aliases = [];
let forwardTo = '';
let currentFilter = 'all';
let currentSort = 'newest';
let searchQuery = '';
let selectMode = false;
let selectedIds = new Set();
let openDropdownId = null;
let pendingBulkAction = null;
let hasConsented = false;

const $ = id => document.getElementById(id);

const SERVICE_MAP = {
  'netflix': 'Netflix', 'hbo': 'HBO Max', 'disney': 'Disney+', 'viaplay': 'Viaplay',
  'spotify': 'Spotify', 'apple': 'Apple', 'amazon': 'Amazon', 'youtube': 'YouTube',
  'twitch': 'Twitch', 'nrk': 'NRK', 'tv2': 'TV 2', 'twitter': 'Twitter', 'x': 'X',
  'facebook': 'Facebook', 'instagram': 'Instagram', 'tiktok': 'TikTok',
  'linkedin': 'LinkedIn', 'reddit': 'Reddit', 'github': 'GitHub', 'google': 'Google',
  'finn': 'FINN.no', 'komplett': 'Komplett', 'elkjop': 'Elkjøp'
};

function parseLabel(label) {
  if (!label) return null;
  if (!label.includes('.')) return label;
  let hostname = label.toLowerCase().trim();
  try { if (label.includes('://')) hostname = new URL(label).hostname; } catch {}
  const parts = hostname.split('.');
  const main = parts.length >= 2 ? parts[parts.length - 2] : parts[0];
  return SERVICE_MAP[main] || main.charAt(0).toUpperCase() + main.slice(1);
}

function send(type, payload = {}) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type, payload }, res => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else if (!res?.success) reject(res?.error || { message: 'Unknown error' });
      else resolve(res.data);
    });
  });
}

function showState(name) {
  ['loading', 'not-logged-in', 'no-icloud', 'main'].forEach(s => {
    $(`state-${s}`)?.classList.toggle('hidden', s !== name);
  });
}

function toast(msg, type = '') {
  const t = $('toast');
  t.textContent = msg;
  t.className = `toast ${type}`;
  t.classList.remove('hidden');
  setTimeout(() => t.classList.add('hidden'), 2500);
}

async function copy(text) {
  try { await navigator.clipboard.writeText(text); toast('Copied', 'success'); }
  catch { toast('Error', 'error'); }
}

function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

function closeDropdowns() {
  document.querySelectorAll('.dropdown-menu.open').forEach(m => m.classList.remove('open'));
  openDropdownId = null;
}

function getFiltered() {
  let r = [...aliases];
  if (currentFilter === 'active') r = r.filter(a => a.isActive);
  else if (currentFilter === 'inactive') r = r.filter(a => !a.isActive);
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    r = r.filter(a => a.hme.toLowerCase().includes(q) || (a.label || '').toLowerCase().includes(q));
  }
  
  // Sort
  switch (currentSort) {
    case 'newest': r.sort((a, b) => b.createTimestamp - a.createTimestamp); break;
    case 'oldest': r.sort((a, b) => a.createTimestamp - b.createTimestamp); break;
    case 'az': r.sort((a, b) => (parseLabel(a.label) || 'zzz').localeCompare(parseLabel(b.label) || 'zzz')); break;
    case 'za': r.sort((a, b) => (parseLabel(b.label) || '').localeCompare(parseLabel(a.label) || '')); break;
  }
  
  // Active first (only if filter is 'all')
  if (currentFilter === 'all') r.sort((a, b) => (b.isActive ? 1 : 0) - (a.isActive ? 1 : 0));
  
  return r;
}

function render() {
  const list = $('alias-list');
  const empty = $('empty-state');
  const filtered = getFiltered();

  if (aliases.length === 0) {
    list.classList.add('hidden');
    empty.classList.remove('hidden');
    return;
  }

  empty.classList.add('hidden');
  list.classList.remove('hidden');

  if (filtered.length === 0) {
    list.innerHTML = '<div class="empty-state"><p>No matches</p></div>';
    return;
  }

  list.innerHTML = filtered.map(a => {
    const name = parseLabel(a.label) || 'Unnamed';
    const isSelected = selectedIds.has(a.anonymousId);
    return `
      <div class="alias-card ${a.isActive ? '' : 'inactive'} ${isSelected ? 'selected' : ''}" data-id="${a.anonymousId}">
        <div class="alias-row">
          <input type="checkbox" class="alias-checkbox" ${isSelected ? 'checked' : ''} data-check="${a.anonymousId}">
          <div class="status-dot ${a.isActive ? '' : 'inactive'}"></div>
          <div class="alias-info">
            <div class="alias-label">${esc(name)}</div>
            <div class="alias-email">${a.hme}</div>
          </div>
          <div class="alias-menu-trigger">
            <button class="btn-icon" data-toggle="${a.anonymousId}">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="6" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="18" r="2"/></svg>
            </button>
          </div>
        </div>
        <div class="alias-menu">
          <div class="dropdown-menu" data-menu="${a.anonymousId}">
            <button class="dropdown-item" data-action="copy" data-hme="${a.hme}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              Copy
            </button>
            <button class="dropdown-item" data-action="edit" data-id="${a.anonymousId}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              Edit
            </button>
            <div class="dropdown-divider"></div>
            ${a.isActive ? `
              <button class="dropdown-item warning" data-action="deactivate" data-id="${a.anonymousId}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
                Deactivate
              </button>
              <button class="dropdown-item danger" data-action="deactivate-delete" data-id="${a.anonymousId}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                Deactivate & Delete
              </button>
            ` : `
              <button class="dropdown-item success" data-action="activate" data-id="${a.anonymousId}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                Activate
              </button>
              <button class="dropdown-item danger" data-action="delete" data-id="${a.anonymousId}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                Delete
              </button>
            `}
          </div>
        </div>
      </div>
    `;
  }).join('');
  
  updateBulkBar();
}

function skeleton() {
  $('alias-list').innerHTML = `<div class="skeleton"></div><div class="skeleton" style="margin-top:8px"></div><div class="skeleton" style="margin-top:8px"></div>`;
}

// Select Mode
function enterSelectMode() {
  selectMode = true;
  selectedIds.clear();
  document.body.classList.add('select-mode');
  $('btn-select-mode')?.classList.add('active');
  $('bulk-bar')?.classList.remove('hidden');
  render();
}

function exitSelectMode() {
  selectMode = false;
  selectedIds.clear();
  document.body.classList.remove('select-mode');
  $('btn-select-mode')?.classList.remove('active');
  $('bulk-bar')?.classList.add('hidden');
  render();
}

function toggleSelection(id) {
  if (selectedIds.has(id)) selectedIds.delete(id);
  else selectedIds.add(id);
  render();
}

function selectAll() {
  const filtered = getFiltered();
  if (selectedIds.size === filtered.length) {
    selectedIds.clear();
  } else {
    filtered.forEach(a => selectedIds.add(a.anonymousId));
  }
  render();
}

function updateBulkBar() {
  const count = selectedIds.size;
  $('bulk-count').textContent = count === 1 ? '1 selected' : `${count} selected`;
  
  const filtered = getFiltered();
  $('btn-select-all').textContent = selectedIds.size === filtered.length ? 'Deselect all' : 'Select all';
  
  const selectedAliases = aliases.filter(a => selectedIds.has(a.anonymousId));
  const activeCount = selectedAliases.filter(a => a.isActive).length;
  const inactiveCount = selectedAliases.filter(a => !a.isActive).length;
  
  const deactivateBtn = $('btn-bulk-deactivate');
  const deleteBtn = $('btn-bulk-delete');
  
  // Show/hide and label buttons based on selection
  if (count === 0) {
    deactivateBtn.classList.add('hidden');
    deleteBtn.classList.add('hidden');
  } else if (activeCount > 0 && inactiveCount === 0) {
    // Only active selected
    deactivateBtn.classList.remove('hidden');
    deactivateBtn.textContent = 'Deactivate';
    deleteBtn.classList.remove('hidden');
    deleteBtn.textContent = 'Deactivate & Delete';
  } else if (activeCount === 0 && inactiveCount > 0) {
    // Only inactive selected
    deactivateBtn.classList.add('hidden');
    deleteBtn.classList.remove('hidden');
    deleteBtn.textContent = 'Delete';
  } else {
    // Mixed selection
    deactivateBtn.classList.remove('hidden');
    deactivateBtn.textContent = `Deactivate (${activeCount})`;
    deleteBtn.classList.remove('hidden');
    deleteBtn.textContent = 'Deactivate & Delete';
  }
}

// Modals
function openModal(id) { $(id)?.classList.remove('hidden'); }
function closeModal(id) { $(id)?.classList.add('hidden'); }
function closeAllModals() { document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden')); }

// Consent
async function checkConsent() {
  return new Promise(resolve => {
    chrome.storage.local.get(['privacyConsent'], result => {
      resolve(result.privacyConsent === true);
    });
  });
}

async function saveConsent() {
  return new Promise(resolve => {
    chrome.storage.local.set({ privacyConsent: true }, resolve);
  });
}

function showDisclosure() {
  $('link-privacy-policy').href = PRIVACY_POLICY_URL;
  openModal('modal-disclosure');
}

async function acceptDisclosure() {
  await saveConsent();
  hasConsented = true;
  closeModal('modal-disclosure');
  checkAuth();
}

// Auth & Loading
async function checkAuth() {
  // Check consent first
  if (!hasConsented) {
    hasConsented = await checkConsent();
    if (!hasConsented) {
      showDisclosure();
      return;
    }
  }
  
  showState('loading');
  try {
    const res = await send(MSG.GET_AUTH_STATUS);
    if (res.status === AUTH.NOT_LOGGED_IN) return showState('not-logged-in');
    if (res.status === AUTH.NO_ICLOUD_PLUS) return showState('no-icloud');
    if (res.status !== AUTH.READY) throw new Error();
    showState('main');
    await loadAliases();
  } catch { showState('not-logged-in'); }
}

async function loadAliases() {
  skeleton();
  $('error-banner')?.classList.add('hidden');
  try {
    const data = await send(MSG.LIST_ALIASES);
    aliases = data.aliases || [];
    forwardTo = data.forwardToEmail || '';
    $('forward-email').textContent = forwardTo || '—';
    render();
  } catch (e) {
    $('error-msg').textContent = e.message || 'Error';
    $('error-banner')?.classList.remove('hidden');
    $('alias-list').innerHTML = '';
  }
}

// CRUD Operations
async function generateAlias() {
  const btn = $('btn-create');
  btn.classList.add('loading'); btn.disabled = true;
  try {
    const res = await send(MSG.GENERATE_ALIAS);
    $('new-alias-hme').textContent = res.hme;
    $('new-label').value = ''; $('new-note').value = '';
    openModal('modal-create');
  } catch (e) { toast(e.message || 'Error', 'error'); }
  finally { btn.classList.remove('loading'); btn.disabled = false; }
}

async function saveNewAlias() {
  const btn = $('btn-save-new');
  btn.classList.add('loading'); btn.disabled = true;
  try {
    await send(MSG.RESERVE_ALIAS, { hme: $('new-alias-hme').textContent, label: $('new-label').value.trim(), note: $('new-note').value.trim() });
    closeModal('modal-create');
    toast('Alias created', 'success');
    await loadAliases();
  } catch (e) { toast(e.message || 'Error', 'error'); }
  finally { btn.classList.remove('loading'); btn.disabled = false; }
}

function openEdit(id) {
  const a = aliases.find(x => x.anonymousId === id);
  if (!a) return;
  $('edit-alias-id').value = a.anonymousId;
  $('edit-alias-hme').textContent = a.hme;
  $('edit-label').value = a.label || '';
  $('edit-note').value = a.note || '';
  openModal('modal-edit');
}

async function saveEdit() {
  const btn = $('btn-save-edit');
  btn.classList.add('loading'); btn.disabled = true;
  try {
    await send(MSG.UPDATE_ALIAS, { anonymousId: $('edit-alias-id').value, label: $('edit-label').value.trim(), note: $('edit-note').value.trim() });
    closeModal('modal-edit');
    toast('Saved', 'success');
    await loadAliases();
  } catch (e) { toast(e.message || 'Error', 'error'); }
  finally { btn.classList.remove('loading'); btn.disabled = false; }
}

// Single alias operations
function openDelete(id) {
  const a = aliases.find(x => x.anonymousId === id);
  if (!a) return;
  $('delete-alias-id').value = a.anonymousId;
  const label = parseLabel(a.label) || 'Unnamed';
  $('delete-alias-hme').innerHTML = `<strong>${esc(label)}</strong> (${a.hme})`;
  openModal('modal-delete');
}

async function confirmDelete() {
  const btn = $('btn-confirm-delete');
  btn.classList.add('loading'); btn.disabled = true;
  try {
    await send(MSG.DELETE_ALIAS, { anonymousId: $('delete-alias-id').value });
    closeModal('modal-delete');
    toast('Deleted', 'success');
    await loadAliases();
  } catch (e) { toast(e.message || 'Error', 'error'); }
  finally { btn.classList.remove('loading'); btn.disabled = false; }
}

function openDeactivateDelete(id) {
  const a = aliases.find(x => x.anonymousId === id);
  if (!a) return;
  $('deactivate-delete-alias-id').value = a.anonymousId;
  const label = parseLabel(a.label) || 'Unnamed';
  $('deactivate-delete-alias-hme').innerHTML = `<strong>${esc(label)}</strong> (${a.hme})`;
  openModal('modal-deactivate-delete');
}

async function confirmDeactivateDelete() {
  const btn = $('btn-confirm-deactivate-delete');
  btn.classList.add('loading'); btn.disabled = true;
  try {
    await send(MSG.DEACTIVATE_ALIAS, { anonymousId: $('deactivate-delete-alias-id').value });
    await new Promise(r => setTimeout(r, 300));
    await send(MSG.DELETE_ALIAS, { anonymousId: $('deactivate-delete-alias-id').value });
    closeModal('modal-deactivate-delete');
    toast('Deleted', 'success');
    await loadAliases();
  } catch (e) { toast(e.message || 'Error', 'error'); }
  finally { btn.classList.remove('loading'); btn.disabled = false; }
}

async function toggleStatus(id, activate) {
  try {
    await send(activate ? MSG.REACTIVATE_ALIAS : MSG.DEACTIVATE_ALIAS, { anonymousId: id });
    toast(activate ? 'Activated' : 'Deactivated', 'success');
    await loadAliases();
  } catch (e) { toast(e.message || 'Error', 'error'); }
}

// Bulk operations
function openBulkDeactivate() {
  const selectedAliases = aliases.filter(a => selectedIds.has(a.anonymousId));
  const activeCount = selectedAliases.filter(a => a.isActive).length;
  
  if (activeCount === 0) {
    toast('No active aliases selected', 'error');
    return;
  }
  
  pendingBulkAction = 'deactivate';
  $('bulk-modal-title').textContent = 'Deactivate Aliases';
  $('bulk-modal-message').textContent = `This will deactivate ${activeCount === 1 ? 'the selected alias' : `all ${activeCount} selected aliases`}. They will stop forwarding emails.`;
  $('btn-confirm-bulk').textContent = 'Deactivate';
  $('btn-confirm-bulk').className = 'btn btn-warning';
  openModal('modal-bulk');
}

function openBulkDelete() {
  const selectedAliases = aliases.filter(a => selectedIds.has(a.anonymousId));
  const activeCount = selectedAliases.filter(a => a.isActive).length;
  const total = selectedAliases.length;
  
  pendingBulkAction = 'delete';
  
  if (activeCount > 0) {
    $('bulk-modal-title').textContent = 'Deactivate & Delete';
    if (activeCount === total) {
      $('bulk-modal-message').textContent = `This will deactivate and delete ${total === 1 ? 'the selected alias' : `all ${total} selected aliases`}.`;
    } else {
      $('bulk-modal-message').textContent = `This will deactivate ${activeCount} active ${activeCount === 1 ? 'alias' : 'aliases'} and delete all ${total} selected.`;
    }
  } else {
    $('bulk-modal-title').textContent = 'Delete Aliases';
    $('bulk-modal-message').textContent = `This will permanently delete ${total === 1 ? 'the selected alias' : `all ${total} selected aliases`}.`;
  }
  $('btn-confirm-bulk').textContent = activeCount > 0 ? 'Deactivate & Delete' : 'Delete';
  $('btn-confirm-bulk').className = 'btn btn-danger';
  openModal('modal-bulk');
}

async function confirmBulkAction() {
  closeModal('modal-bulk');
  openModal('modal-progress');
  
  const ids = Array.from(selectedIds);
  const selectedAliases = aliases.filter(a => selectedIds.has(a.anonymousId));
  const total = ids.length;
  
  let done = 0, failed = 0;
  
  if (pendingBulkAction === 'deactivate') {
    // Only deactivate active ones
    const activeAliases = selectedAliases.filter(a => a.isActive);
    for (let i = 0; i < activeAliases.length; i++) {
      $('progress-text').textContent = `Deactivating ${i + 1}/${activeAliases.length}…`;
      $('progress-fill').style.width = `${((i + 1) / activeAliases.length) * 100}%`;
      try {
        await send(MSG.DEACTIVATE_ALIAS, { anonymousId: activeAliases[i].anonymousId });
        done++;
      } catch { failed++; }
      if (i < activeAliases.length - 1) await new Promise(r => setTimeout(r, 200));
    }
    closeModal('modal-progress');
    exitSelectMode();
    await loadAliases();
    toast(failed === 0 ? `${done} deactivated` : `${done} done, ${failed} failed`, failed === 0 ? 'success' : 'error');
  } else if (pendingBulkAction === 'delete') {
    // Deactivate active ones first, then delete all
    for (let i = 0; i < ids.length; i++) {
      const alias = selectedAliases.find(a => a.anonymousId === ids[i]);
      try {
        if (alias?.isActive) {
          $('progress-text').textContent = `Deactivating ${i + 1}/${total}…`;
          $('progress-fill').style.width = `${((i + 0.5) / total) * 100}%`;
          await send(MSG.DEACTIVATE_ALIAS, { anonymousId: ids[i] });
          await new Promise(r => setTimeout(r, 200));
        }
        $('progress-text').textContent = `Deleting ${i + 1}/${total}…`;
        $('progress-fill').style.width = `${((i + 1) / total) * 100}%`;
        await send(MSG.DELETE_ALIAS, { anonymousId: ids[i] });
        done++;
      } catch { failed++; }
      if (i < ids.length - 1) await new Promise(r => setTimeout(r, 200));
    }
    closeModal('modal-progress');
    exitSelectMode();
    await loadAliases();
    toast(failed === 0 ? `${done} deleted` : `${done} done, ${failed} failed`, failed === 0 ? 'success' : 'error');
  }
  
  pendingBulkAction = null;
}

// Init
function init() {
  $('btn-retry-auth')?.addEventListener('click', checkAuth);
  $('btn-retry')?.addEventListener('click', loadAliases);
  $('btn-settings')?.addEventListener('click', () => chrome.runtime.openOptionsPage());
  $('search')?.addEventListener('input', e => { searchQuery = e.target.value; render(); });
  $('sort')?.addEventListener('change', e => { currentSort = e.target.value; render(); });

  // Disclosure
  $('btn-accept-disclosure')?.addEventListener('click', acceptDisclosure);

  // Filter tabs
  document.querySelectorAll('.filter-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentFilter = tab.dataset.filter;
      render();
    });
  });

  // Select mode
  $('btn-select-mode')?.addEventListener('click', () => selectMode ? exitSelectMode() : enterSelectMode());
  $('btn-cancel-select')?.addEventListener('click', exitSelectMode);
  $('btn-select-all')?.addEventListener('click', selectAll);
  $('btn-bulk-deactivate')?.addEventListener('click', openBulkDeactivate);
  $('btn-bulk-delete')?.addEventListener('click', openBulkDelete);
  $('btn-confirm-bulk')?.addEventListener('click', confirmBulkAction);

  // Create/Edit
  $('btn-create')?.addEventListener('click', generateAlias);
  $('btn-save-new')?.addEventListener('click', saveNewAlias);
  $('btn-copy-new')?.addEventListener('click', () => copy($('new-alias-hme').textContent));
  $('btn-save-edit')?.addEventListener('click', saveEdit);
  $('btn-confirm-delete')?.addEventListener('click', confirmDelete);
  $('btn-confirm-deactivate-delete')?.addEventListener('click', confirmDeactivateDelete);

  // Modals
  document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', closeAllModals));
  document.querySelectorAll('.modal-backdrop').forEach(b => b.addEventListener('click', closeAllModals));

  // Alias list events
  $('alias-list')?.addEventListener('click', e => {
    // Checkbox
    const checkbox = e.target.closest('.alias-checkbox');
    if (checkbox && selectMode) {
      e.stopPropagation();
      toggleSelection(checkbox.dataset.check);
      return;
    }
    
    // Card click in select mode
    if (selectMode && e.target.closest('.alias-card')) {
      const card = e.target.closest('.alias-card');
      toggleSelection(card.dataset.id);
      return;
    }

    // Dropdown toggle
    const toggle = e.target.closest('[data-toggle]');
    if (toggle) {
      e.stopPropagation();
      const id = toggle.dataset.toggle;
      const menu = document.querySelector(`[data-menu="${id}"]`);
      if (openDropdownId === id) { closeDropdowns(); return; }
      closeDropdowns();
      
      // Determine if dropdown should open up or down
      if (menu) {
        const card = toggle.closest('.alias-card');
        const cardRect = card.getBoundingClientRect();
        const listRect = $('alias-list').getBoundingClientRect();
        const spaceBelow = listRect.bottom - cardRect.bottom;
        
        menu.classList.remove('drop-up', 'drop-down');
        if (spaceBelow < 150) {
          menu.classList.add('drop-up');
        } else {
          menu.classList.add('drop-down');
        }
        menu.classList.add('open');
      }
      openDropdownId = id;
      return;
    }

    // Actions
    const action = e.target.closest('[data-action]');
    if (action) {
      closeDropdowns();
      const { action: act, id, hme } = action.dataset;
      if (act === 'copy') copy(hme);
      else if (act === 'edit') openEdit(id);
      else if (act === 'delete') openDelete(id);
      else if (act === 'deactivate-delete') openDeactivateDelete(id);
      else if (act === 'deactivate') toggleStatus(id, false);
      else if (act === 'activate') toggleStatus(id, true);
    }
  });

  document.addEventListener('click', e => { if (!e.target.closest('.alias-menu')) closeDropdowns(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeAllModals(); closeDropdowns(); if (selectMode) exitSelectMode(); } });

  checkAuth();
}

document.addEventListener('DOMContentLoaded', init);
