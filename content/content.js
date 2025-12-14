(function() {
  const MSG_AUTOFILL = 'AUTOFILL_REQUEST';
  const MSG_GET_SETTINGS = 'GET_SETTINGS';
  
  let settings = { autofillEnabled: true, autoLabelWithDomain: true };
  let processedFields = new WeakMap(); // Maps input -> button

  function send(type, payload = {}) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type, payload }, res => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else if (!res?.success) reject(res?.error || { message: 'Unknown error' });
        else resolve(res.data);
      });
    });
  }

  function isEmailField(el) {
    if (el.tagName !== 'INPUT') return false;
    if (el.type === 'email') return true;
    const name = (el.name || '').toLowerCase();
    const id = (el.id || '').toLowerCase();
    const placeholder = (el.placeholder || '').toLowerCase();
    const autocomplete = (el.autocomplete || '').toLowerCase();
    return ['email', 'e-mail', 'epost', 'e-post'].some(k => 
      name.includes(k) || id.includes(k) || placeholder.includes(k) || autocomplete.includes(k)
    );
  }

  function createButton() {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'hme-autofill-btn';
    btn.title = 'Use Hide My Email';
    btn.setAttribute('tabindex', '-1');
    btn.innerHTML = `
      <svg class="hme-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="2" y="4" width="20" height="16" rx="2"/>
        <path d="M22 6L12 13L2 6"/>
      </svg>
      <span class="hme-spinner"></span>
      <span class="hme-check">✓</span>
      <span class="hme-error">✕</span>
    `;
    return btn;
  }

  function positionButton(btn, input) {
    const rect = input.getBoundingClientRect();
    
    // Hide if input not visible
    if (rect.width === 0 || rect.height === 0) {
      btn.style.display = 'none';
      return;
    }
    
    btn.style.display = 'flex';
    
    // Position button inside input area (visually), but using fixed positioning
    // Place it on the right side, vertically centered
    const btnSize = 24;
    const padding = 6;
    
    btn.style.top = (rect.top + (rect.height - btnSize) / 2) + 'px';
    btn.style.left = (rect.right - btnSize - padding) + 'px';
  }

  function addButtonToInput(input) {
    if (processedFields.has(input)) return;
    
    const rect = input.getBoundingClientRect();
    if (rect.width < 120 || rect.height < 24) return;
    
    const style = window.getComputedStyle(input);
    if (style.display === 'none' || style.visibility === 'hidden') return;
    
    const btn = createButton();
    
    // Add button directly to body with fixed positioning
    // This way we don't modify the input or its parent at all
    document.body.appendChild(btn);
    
    // Store reference
    processedFields.set(input, btn);
    
    // Initial position
    positionButton(btn, input);
    
    // Update position on scroll and resize
    const updatePosition = () => positionButton(btn, input);
    
    window.addEventListener('scroll', updatePosition, { passive: true, capture: true });
    window.addEventListener('resize', updatePosition, { passive: true });
    
    // Also reposition when input gets focus (handles layout shifts)
    input.addEventListener('focus', updatePosition);
    input.addEventListener('blur', updatePosition);
    
    // Check if input still exists periodically
    const checkExistence = setInterval(() => {
      if (!document.body.contains(input)) {
        btn.remove();
        clearInterval(checkExistence);
        processedFields.delete(input);
      } else {
        updatePosition();
      }
    }, 500);

    // Click handler
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (btn.classList.contains('loading')) return;

      btn.className = 'hme-autofill-btn loading';

      try {
        const domain = settings.autoLabelWithDomain ? window.location.hostname.replace('www.', '') : '';
        const result = await send(MSG_AUTOFILL, { domain, title: document.title });
        
        input.focus();
        
        // Use multiple methods to set value for better compatibility
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        nativeInputValueSetter.call(input, result.alias);
        
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));

        btn.className = 'hme-autofill-btn success';

        setTimeout(() => {
          btn.className = 'hme-autofill-btn';
        }, 2000);
      } catch (err) {
        console.error('HME Autofill error:', err);
        btn.className = 'hme-autofill-btn error';

        setTimeout(() => {
          btn.className = 'hme-autofill-btn';
        }, 2000);
      }
    });

    // Prevent losing focus from input when clicking button
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
    });
  }

  function scanPage() {
    if (!settings.autofillEnabled) return;
    
    document.querySelectorAll('input').forEach(input => {
      if (isEmailField(input) && !processedFields.has(input)) {
        addButtonToInput(input);
      }
    });
  }

  function observeDOM() {
    const observer = new MutationObserver((mutations) => {
      let shouldScan = false;
      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
          shouldScan = true;
          break;
        }
      }
      if (shouldScan) {
        setTimeout(scanPage, 100);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  async function init() {
    try {
      settings = await send(MSG_GET_SETTINGS);
    } catch (e) {
      console.log('HME: Could not load settings, using defaults');
    }

    if (!settings.autofillEnabled) return;

    scanPage();
    observeDOM();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
