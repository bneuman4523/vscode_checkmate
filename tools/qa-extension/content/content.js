// Greet QA Runner — Content Script
// Runs in the context of the Greet app page. Receives commands from the side panel
// and interacts with the DOM.

(() => {
  'use strict';

  // ── Helpers ──

  function $(selector) {
    return document.querySelector(selector);
  }

  function $$(selector) {
    return [...document.querySelectorAll(selector)];
  }

  function byTestId(id) {
    return $(`[data-testid="${id}"]`);
  }

  function byText(text, tag = '*') {
    const els = $$(tag);
    return els.find(el => el.textContent.trim() === text) || null;
  }

  function byTextContains(text, tag = '*') {
    const els = $$(tag);
    return els.find(el => el.textContent.includes(text)) || null;
  }

  function resolve(selector) {
    // Support multiple selector strategies:
    // "testid:button-login"       → [data-testid="button-login"]
    // "id:email"                  → #email
    // "text:Send Login Code"      → element containing exact text
    // "contains:Welcome"          → element containing text
    // "css:.my-class button"      → raw CSS selector
    // Plain string                → try testid, then id, then css

    if (selector.startsWith('testid:')) {
      return byTestId(selector.slice(7));
    }
    if (selector.startsWith('id:')) {
      return $(`#${selector.slice(3)}`);
    }
    if (selector.startsWith('text:')) {
      return byText(selector.slice(5));
    }
    if (selector.startsWith('contains:')) {
      return byTextContains(selector.slice(9));
    }
    if (selector.startsWith('css:')) {
      return $(selector.slice(4));
    }

    // Auto-detect: try testid first, then id, then CSS
    return byTestId(selector) || $(`#${selector}`) || $(selector);
  }

  function wait(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  async function waitForElement(selector, timeoutMs = 10000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const el = resolve(selector);
      if (el) return el;
      await wait(200);
    }
    return null;
  }

  async function waitForUrl(pattern, timeoutMs = 15000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (window.location.href.includes(pattern)) return true;
      await wait(200);
    }
    return false;
  }

  async function waitForElementGone(selector, timeoutMs = 10000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const el = resolve(selector);
      if (!el) return true;
      await wait(200);
    }
    return false;
  }

  // ── DOM Actions ──

  async function execAction(action) {
    const { type, selector, value, url, pattern, timeout, key } = action;

    switch (type) {
      case 'navigate': {
        window.location.href = url;
        await wait(500);
        return { ok: true };
      }

      case 'click': {
        const el = await waitForElement(selector, timeout || 10000);
        if (!el) return { ok: false, error: `Element not found: ${selector}` };
        el.scrollIntoView({ behavior: 'instant', block: 'center' });
        await wait(100);
        el.click();
        return { ok: true };
      }

      case 'type': {
        const el = await waitForElement(selector, timeout || 10000);
        if (!el) return { ok: false, error: `Element not found: ${selector}` };
        el.scrollIntoView({ behavior: 'instant', block: 'center' });
        el.focus();
        // Clear existing value
        el.value = '';
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype, 'value'
        )?.set || Object.getOwnPropertyDescriptor(
          window.HTMLTextAreaElement.prototype, 'value'
        )?.set;
        if (nativeInputValueSetter) {
          nativeInputValueSetter.call(el, value);
        } else {
          el.value = value;
        }
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return { ok: true };
      }

      case 'clear': {
        const el = await waitForElement(selector, timeout || 10000);
        if (!el) return { ok: false, error: `Element not found: ${selector}` };
        el.focus();
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype, 'value'
        )?.set;
        if (setter) setter.call(el, '');
        else el.value = '';
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return { ok: true };
      }

      case 'keypress': {
        const el = selector ? await waitForElement(selector) : document.activeElement;
        if (!el) return { ok: false, error: `Element not found: ${selector}` };
        el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
        el.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }));
        return { ok: true };
      }

      case 'wait': {
        await wait(value || 1000);
        return { ok: true };
      }

      case 'waitForElement': {
        const el = await waitForElement(selector, timeout || 10000);
        return el ? { ok: true } : { ok: false, error: `Timed out waiting for: ${selector}` };
      }

      case 'waitForUrl': {
        const found = await waitForUrl(pattern || url, timeout || 15000);
        return found ? { ok: true } : { ok: false, error: `URL did not match: ${pattern || url}` };
      }

      case 'waitForGone': {
        const gone = await waitForElementGone(selector, timeout || 10000);
        return gone ? { ok: true } : { ok: false, error: `Element still present: ${selector}` };
      }

      case 'select': {
        const el = await waitForElement(selector, timeout || 10000);
        if (!el) return { ok: false, error: `Element not found: ${selector}` };
        // For Radix UI Select, we need to click the trigger then click the option
        el.click();
        await wait(300);
        const option = byText(value, '[role="option"]') || byTextContains(value, '[role="option"]');
        if (option) {
          option.click();
          return { ok: true };
        }
        return { ok: false, error: `Option not found: ${value}` };
      }

      case 'toggle': {
        const el = await waitForElement(selector, timeout || 10000);
        if (!el) return { ok: false, error: `Element not found: ${selector}` };
        el.click();
        await wait(200);
        return { ok: true };
      }

      default:
        return { ok: false, error: `Unknown action type: ${type}` };
    }
  }

  // ── Assertions ──

  async function execAssert(assertion) {
    const { type, selector, value, pattern, timeout } = assertion;

    switch (type) {
      case 'element_visible': {
        const el = await waitForElement(selector, timeout || 5000);
        if (!el) return { pass: false, message: `Not found: ${selector}` };
        const visible = el.offsetParent !== null || el.offsetWidth > 0;
        return visible
          ? { pass: true, message: `Visible: ${selector}` }
          : { pass: false, message: `Found but hidden: ${selector}` };
      }

      case 'element_hidden': {
        await wait(500);
        const el = resolve(selector);
        if (!el) return { pass: true, message: `Not present: ${selector}` };
        const hidden = el.offsetParent === null && el.offsetWidth === 0;
        return hidden
          ? { pass: true, message: `Hidden: ${selector}` }
          : { pass: false, message: `Still visible: ${selector}` };
      }

      case 'element_not_exists': {
        await wait(500);
        const el = resolve(selector);
        return !el
          ? { pass: true, message: `Does not exist: ${selector}` }
          : { pass: false, message: `Still exists: ${selector}` };
      }

      case 'text_contains': {
        const el = await waitForElement(selector, timeout || 5000);
        if (!el) return { pass: false, message: `Not found: ${selector}` };
        const text = el.textContent || '';
        return text.includes(value)
          ? { pass: true, message: `Contains "${value}"` }
          : { pass: false, message: `Text is "${text.slice(0, 100)}", expected to contain "${value}"` };
      }

      case 'text_equals': {
        const el = await waitForElement(selector, timeout || 5000);
        if (!el) return { pass: false, message: `Not found: ${selector}` };
        const text = (el.textContent || '').trim();
        return text === value
          ? { pass: true, message: `Equals "${value}"` }
          : { pass: false, message: `Text is "${text.slice(0, 100)}", expected "${value}"` };
      }

      case 'url_contains': {
        const match = window.location.href.includes(value);
        return match
          ? { pass: true, message: `URL contains "${value}"` }
          : { pass: false, message: `URL is "${window.location.href}", expected to contain "${value}"` };
      }

      case 'url_matches': {
        const re = new RegExp(pattern);
        const match = re.test(window.location.href);
        return match
          ? { pass: true, message: `URL matches ${pattern}` }
          : { pass: false, message: `URL "${window.location.href}" doesn't match ${pattern}` };
      }

      case 'input_value': {
        const el = await waitForElement(selector, timeout || 5000);
        if (!el) return { pass: false, message: `Not found: ${selector}` };
        return el.value === value
          ? { pass: true, message: `Value is "${value}"` }
          : { pass: false, message: `Value is "${el.value}", expected "${value}"` };
      }

      case 'element_count': {
        await wait(300);
        const count = $$(selector.startsWith('testid:')
          ? `[data-testid="${selector.slice(7)}"]`
          : selector
        ).length;
        return count === value
          ? { pass: true, message: `Count is ${count}` }
          : { pass: false, message: `Count is ${count}, expected ${value}` };
      }

      case 'element_disabled': {
        const el = await waitForElement(selector, timeout || 5000);
        if (!el) return { pass: false, message: `Not found: ${selector}` };
        return el.disabled || el.getAttribute('aria-disabled') === 'true'
          ? { pass: true, message: `Disabled: ${selector}` }
          : { pass: false, message: `Not disabled: ${selector}` };
      }

      case 'element_enabled': {
        const el = await waitForElement(selector, timeout || 5000);
        if (!el) return { pass: false, message: `Not found: ${selector}` };
        return !el.disabled && el.getAttribute('aria-disabled') !== 'true'
          ? { pass: true, message: `Enabled: ${selector}` }
          : { pass: false, message: `Disabled: ${selector}` };
      }

      case 'has_attribute': {
        const el = await waitForElement(selector, timeout || 5000);
        if (!el) return { pass: false, message: `Not found: ${selector}` };
        return el.hasAttribute(value)
          ? { pass: true, message: `Has attribute "${value}"` }
          : { pass: false, message: `Missing attribute "${value}"` };
      }

      case 'console_clean': {
        // This is tracked by the error collector below
        return _consoleErrors.length === 0
          ? { pass: true, message: 'No console errors' }
          : { pass: false, message: `${_consoleErrors.length} console error(s): ${_consoleErrors[0]}` };
      }

      case 'no_element_with_role': {
        const el = $(`[role="${value}"]`);
        return !el
          ? { pass: true, message: `No element with role="${value}"` }
          : { pass: false, message: `Found element with role="${value}"` };
      }

      case 'page_loaded': {
        return document.readyState === 'complete'
          ? { pass: true, message: 'Page loaded' }
          : { pass: false, message: `Page state: ${document.readyState}` };
      }

      default:
        return { pass: false, message: `Unknown assertion type: ${type}` };
    }
  }

  // ── Console Error Collector ──

  const _consoleErrors = [];
  const _origError = console.error;
  console.error = function (...args) {
    _consoleErrors.push(args.map(a => String(a)).join(' '));
    _origError.apply(console, args);
  };

  // ── Snapshot: capture DOM state for reporting ──

  function snapshot() {
    return {
      url: window.location.href,
      title: document.title,
      timestamp: new Date().toISOString(),
      consoleErrors: [..._consoleErrors],
      visibleText: document.body?.innerText?.slice(0, 500) || ''
    };
  }

  // ── Message Handler ──

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    (async () => {
      try {
        switch (message.type) {
          case 'exec-action': {
            const result = await execAction(message.action);
            sendResponse(result);
            break;
          }
          case 'exec-assert': {
            const result = await execAssert(message.assertion);
            sendResponse(result);
            break;
          }
          case 'exec-actions': {
            // Run a sequence of actions
            const results = [];
            for (const action of message.actions) {
              const result = await execAction(action);
              results.push(result);
              if (!result.ok) break; // stop on first failure
            }
            sendResponse({ results });
            break;
          }
          case 'exec-asserts': {
            const results = [];
            for (const assertion of message.assertions) {
              const result = await execAssert(assertion);
              results.push(result);
            }
            sendResponse({ results });
            break;
          }
          case 'snapshot': {
            sendResponse(snapshot());
            break;
          }
          case 'clear-errors': {
            _consoleErrors.length = 0;
            sendResponse({ ok: true });
            break;
          }
          case 'ping': {
            sendResponse({ ok: true, url: window.location.href });
            break;
          }
          default:
            sendResponse({ error: `Unknown message type: ${message.type}` });
        }
      } catch (err) {
        sendResponse({ error: err.message });
      }
    })();
    return true; // async response
  });

  console.log('[Greet QA] Content script loaded');
})();
