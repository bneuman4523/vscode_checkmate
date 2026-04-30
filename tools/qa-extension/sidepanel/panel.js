// Greet QA Runner — Side Panel Controller
(() => {
  'use strict';

  // ── State ──

  let testData = null;        // Loaded from test-cases.json
  let config = {};             // User configuration (baseUrl, credentials, etc.)
  let results = {};            // { testId: { status, message, timestamp } }
  let expandedTests = {};      // { testId: true }
  let collapsedSections = {};  // { sectionId: true }
  let running = false;         // Is a test run in progress?
  let abortRun = false;        // Flag to cancel a run

  // ── DOM Refs ──

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];

  const els = {
    testList:      $('#test-list'),
    statTotal:     $('#stat-total'),
    statPass:      $('#stat-pass'),
    statFail:      $('#stat-fail'),
    statSkip:      $('#stat-skip'),
    statPending:   $('#stat-pending'),
    progressFill:  $('#progress-fill'),
    filterSection: $('#filter-section'),
    filterTag:     $('#filter-tag'),
    filterStatus:  $('#filter-status'),
    settingsPanel: $('#settings-panel'),
    toast:         $('#toast'),
  };

  // ── Config ──

  const CONFIG_KEYS = [
    'cfg-baseUrl', 'cfg-email', 'cfg-phone',
    'cfg-customerId', 'cfg-eventId', 'cfg-attendeeName', 'cfg-kioskPin'
  ];

  function loadConfig() {
    const stored = localStorage.getItem('greet-qa-config');
    if (stored) {
      config = JSON.parse(stored);
      CONFIG_KEYS.forEach(key => {
        const el = $(`#${key}`);
        if (el && config[key]) el.value = config[key];
      });
      // Load checkbox state
      const skipAuth = $('#cfg-skipAuth');
      if (skipAuth) skipAuth.checked = config['cfg-skipAuth'] !== false;
    }
  }

  function saveConfig() {
    CONFIG_KEYS.forEach(key => {
      config[key] = $(`#${key}`)?.value || '';
    });
    config['cfg-skipAuth'] = $('#cfg-skipAuth')?.checked !== false;
    localStorage.setItem('greet-qa-config', JSON.stringify(config));
    toast('Configuration saved', 'success');
    els.settingsPanel.classList.add('hidden');
  }

  function loadResults() {
    const stored = localStorage.getItem('greet-qa-results');
    if (stored) results = JSON.parse(stored);
  }

  function saveResults() {
    localStorage.setItem('greet-qa-results', JSON.stringify(results));
  }

  // ── Template Interpolation ──

  function interpolate(str) {
    if (!str || typeof str !== 'string') return str;
    return str
      .replace(/\{\{baseUrl\}\}/g, config['cfg-baseUrl'] || '')
      .replace(/\{\{superAdmin\.email\}\}/g, config['cfg-email'] || '')
      .replace(/\{\{superAdmin\.phone\}\}/g, config['cfg-phone'] || '')
      .replace(/\{\{customerId\}\}/g, config['cfg-customerId'] || '')
      .replace(/\{\{eventId\}\}/g, config['cfg-eventId'] || '')
      .replace(/\{\{attendeeName\}\}/g, config['cfg-attendeeName'] || '')
      .replace(/\{\{kioskPin\}\}/g, config['cfg-kioskPin'] || '');
  }

  function interpolateAction(action) {
    const result = { ...action };
    for (const key of ['url', 'value', 'selector', 'pattern']) {
      if (result[key]) result[key] = interpolate(result[key]);
    }
    return result;
  }

  // ── Communication with Content Script ──

  async function sendToContent(message) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { ...message, target: 'content' },
        (response) => {
          if (chrome.runtime.lastError) {
            resolve({ error: chrome.runtime.lastError.message });
          } else {
            resolve(response || { error: 'No response' });
          }
        }
      );
    });
  }

  // ── Test Execution ──

  async function runTest(test) {
    if (!test.auto) return; // Can't auto-run manual tests

    const testId = test.id;
    setTestStatus(testId, 'running');
    renderTests();

    try {
      // Execute actions
      if (test.auto.actions && test.auto.actions.length > 0) {
        const actions = test.auto.actions.map(interpolateAction);
        for (const action of actions) {
          if (abortRun) {
            setTestStatus(testId, 'skip', 'Run aborted');
            return;
          }

          if (action.type === 'navigate') {
            // Navigate via the background script
            await new Promise((resolve) => {
              chrome.runtime.sendMessage(
                { type: 'navigate', url: action.url },
                () => resolve()
              );
            });
            // Wait for page load
            await new Promise(r => setTimeout(r, 2000));
          } else {
            const result = await sendToContent({
              type: 'exec-action',
              action
            });
            if (result?.error || result?.ok === false) {
              setTestStatus(testId, 'fail', result.error || 'Action failed');
              renderTests();
              return;
            }
          }
        }
      }

      // Execute assertions
      if (test.auto.assertions && test.auto.assertions.length > 0) {
        const assertResults = await sendToContent({
          type: 'exec-asserts',
          assertions: test.auto.assertions.map(a => ({
            ...a,
            value: a.value ? interpolate(a.value) : a.value,
            selector: a.selector ? interpolate(a.selector) : a.selector
          }))
        });

        if (assertResults?.error) {
          setTestStatus(testId, 'fail', assertResults.error);
        } else if (assertResults?.results) {
          const failed = assertResults.results.find(r => !r.pass);
          if (failed) {
            setTestStatus(testId, 'fail', failed.message);
          } else {
            const msg = assertResults.results.map(r => r.message).join('; ');
            setTestStatus(testId, 'pass', msg);
          }
        }
      } else if (!test.auto.assertions || test.auto.assertions.length === 0) {
        // No assertions — just check actions succeeded
        setTestStatus(testId, 'pass', 'Actions completed');
      }
    } catch (err) {
      setTestStatus(testId, 'fail', `Error: ${err.message}`);
    }

    renderTests();
  }

  async function runTests(tests) {
    if (running) return;
    running = true;
    abortRun = false;

    const skipAuth = config['cfg-skipAuth'] !== false;

    for (const test of tests) {
      if (abortRun) break;

      // Auto-skip auth/login tests when "assume logged in" is checked
      if (skipAuth && (test.tags || []).includes('auth')) {
        setTestStatus(test.id, 'skip', 'Skipped — assume logged in');
        renderTests();
        continue;
      }

      if (test.auto) {
        await runTest(test);
        // Small delay between tests
        await new Promise(r => setTimeout(r, 500));
      }
    }

    running = false;
    toast(`Run complete: ${countByStatus('pass')} pass, ${countByStatus('fail')} fail`, 'info');
  }

  function setTestStatus(testId, status, message = '') {
    results[testId] = {
      status,
      message,
      timestamp: new Date().toISOString()
    };
    saveResults();
    updateStats();
  }

  // ── Rendering ──

  function getAllTests() {
    if (!testData) return [];
    const tests = [];
    for (const section of testData.sections) {
      for (const test of section.tests) {
        tests.push({ ...test, sectionId: section.id, sectionName: section.name });
      }
    }
    return tests;
  }

  function getFilteredTests() {
    const section = els.filterSection.value;
    const tag = els.filterTag.value;
    const status = els.filterStatus.value;

    return getAllTests().filter(t => {
      if (section !== 'all' && t.sectionId !== section) return false;
      if (tag !== 'all' && !(t.tags || []).includes(tag)) return false;
      if (status !== 'all') {
        const testStatus = results[t.id]?.status || 'pending';
        if (testStatus !== status) return false;
      }
      return true;
    });
  }

  function countByStatus(status) {
    return getAllTests().filter(t => (results[t.id]?.status || 'pending') === status).length;
  }

  function updateStats() {
    const all = getAllTests();
    const pass = countByStatus('pass');
    const fail = countByStatus('fail');
    const skip = countByStatus('skip');
    const pending = all.length - pass - fail - skip;
    const completed = pass + fail + skip;

    els.statTotal.textContent = all.length;
    els.statPass.textContent = pass;
    els.statFail.textContent = fail;
    els.statSkip.textContent = skip;
    els.statPending.textContent = pending;

    const pct = all.length > 0 ? (completed / all.length * 100) : 0;
    els.progressFill.style.width = `${pct}%`;
  }

  function renderTests() {
    const filtered = getFilteredTests();

    // Group by section
    const groups = {};
    for (const test of filtered) {
      if (!groups[test.sectionId]) {
        groups[test.sectionId] = {
          id: test.sectionId,
          name: test.sectionName,
          tests: []
        };
      }
      groups[test.sectionId].tests.push(test);
    }

    let html = '';
    for (const group of Object.values(groups)) {
      const collapsed = collapsedSections[group.id];
      const sectionPass = group.tests.filter(t => results[t.id]?.status === 'pass').length;
      const sectionFail = group.tests.filter(t => results[t.id]?.status === 'fail').length;

      let countHtml = `${group.tests.length} tests`;
      if (sectionPass > 0) countHtml += ` &middot; <span style="color:var(--green)">${sectionPass}&#10003;</span>`;
      if (sectionFail > 0) countHtml += ` &middot; <span style="color:var(--red)">${sectionFail}&#10007;</span>`;

      html += `
        <div class="section-group">
          <div class="section-header ${collapsed ? 'collapsed' : ''}" data-section="${group.id}">
            <div style="display:flex;align-items:center;gap:4px">
              <span class="arrow">&#9660;</span>
              <h3>${group.id}. ${group.name}</h3>
            </div>
            <span class="section-count">${countHtml}</span>
          </div>
          <div class="section-tests ${collapsed ? 'hidden' : ''}">
            ${group.tests.map(t => renderTestCard(t)).join('')}
          </div>
        </div>
      `;
    }

    els.testList.innerHTML = html;
    bindTestEvents();
    updateStats();
  }

  function renderTestCard(test) {
    const status = results[test.id]?.status || 'pending';
    const message = results[test.id]?.message || '';
    const expanded = expandedTests[test.id];
    const hasAuto = !!test.auto;
    const isSmoke = (test.tags || []).includes('smoke');

    const tags = [];
    if (isSmoke) tags.push('<span class="tag tag-smoke">SMOKE</span>');
    if (hasAuto) tags.push('<span class="tag tag-auto">AUTO</span>');
    if (!hasAuto) tags.push('<span class="tag tag-manual">MANUAL</span>');

    let detailHtml = '';
    if (expanded) {
      detailHtml = `<div class="test-detail">
        <div class="steps"><strong>Steps:</strong> ${test.steps}</div>
        <div class="expected"><strong>Expected:</strong> ${test.expected}</div>
        ${message ? `<div class="${status === 'fail' ? 'error' : ''}">${message}</div>` : ''}
        ${test.auto?.note ? `<div class="note">${test.auto.note}</div>` : ''}
      </div>`;
    }

    return `
      <div class="test-card status-${status} ${expanded ? 'expanded' : ''}" data-test="${test.id}">
        <span class="test-id">${test.id}</span>
        <div class="test-body">
          <div class="test-name">${test.name}</div>
          <div class="test-meta">${tags.join(' ')}</div>
          ${detailHtml}
        </div>
        <div class="test-actions">
          ${hasAuto ? `<button class="btn-run" data-action="run" title="Run">&#9654;</button>` : ''}
          <button class="btn-pass ${status === 'pass' ? 'active' : ''}" data-action="pass" title="Pass">&#10003;</button>
          <button class="btn-fail ${status === 'fail' ? 'active' : ''}" data-action="fail" title="Fail">&#10007;</button>
          <button class="btn-skip ${status === 'skip' ? 'active' : ''}" data-action="skip" title="Skip">&#8722;</button>
        </div>
      </div>
    `;
  }

  function bindTestEvents() {
    // Section toggle
    $$('.section-header').forEach(el => {
      el.addEventListener('click', () => {
        const sectionId = el.dataset.section;
        collapsedSections[sectionId] = !collapsedSections[sectionId];
        renderTests();
      });
    });

    // Test card click (expand/collapse)
    $$('.test-body').forEach(el => {
      el.addEventListener('click', () => {
        const testId = el.closest('.test-card')?.dataset.test;
        if (testId) {
          expandedTests[testId] = !expandedTests[testId];
          renderTests();
        }
      });
    });

    // Test action buttons
    $$('.test-actions button').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const testId = btn.closest('.test-card')?.dataset.test;
        const action = btn.dataset.action;
        if (!testId || !action) return;

        if (action === 'run') {
          const test = findTest(testId);
          if (test) runTest(test);
        } else {
          // Toggle: if already set to this status, clear it
          const current = results[testId]?.status;
          if (current === action) {
            delete results[testId];
          } else {
            setTestStatus(testId, action);
          }
          renderTests();
        }
      });
    });
  }

  function findTest(testId) {
    for (const section of testData.sections) {
      const test = section.tests.find(t => t.id === testId);
      if (test) return test;
    }
    return null;
  }

  // ── Populate Filters ──

  function populateFilters() {
    if (!testData) return;
    els.filterSection.innerHTML = '<option value="all">All Sections</option>';
    for (const section of testData.sections) {
      const opt = document.createElement('option');
      opt.value = section.id;
      opt.textContent = `${section.id}. ${section.name}`;
      els.filterSection.appendChild(opt);
    }
  }

  // ── Export ──

  function exportResults() {
    const all = getAllTests();
    const lines = [
      'Test ID,Section,Name,Status,Message,Timestamp',
      ...all.map(t => {
        const r = results[t.id] || { status: 'pending', message: '', timestamp: '' };
        return `"${t.id}","${t.sectionName}","${t.name}","${r.status}","${(r.message || '').replace(/"/g, '""')}","${r.timestamp}"`;
      })
    ];

    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `greet-qa-results-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Results exported to CSV', 'success');
  }

  // ── Toast ──

  let toastTimer;
  function toast(message, type = 'info') {
    els.toast.textContent = message;
    els.toast.className = `toast ${type}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      els.toast.classList.add('hidden');
    }, 3000);
  }

  // ── Init ──

  async function init() {
    loadConfig();
    loadResults();

    // Load test cases
    try {
      const response = await fetch(chrome.runtime.getURL('tests/test-cases.json'));
      testData = await response.json();
    } catch (err) {
      els.testList.innerHTML = `<div style="padding:20px;color:var(--red)">Failed to load test cases: ${err.message}</div>`;
      return;
    }

    populateFilters();
    renderTests();

    // ── Event Listeners ──

    $('#btn-settings').addEventListener('click', () => {
      els.settingsPanel.classList.toggle('hidden');
    });
    $('#btn-close-settings').addEventListener('click', () => {
      els.settingsPanel.classList.add('hidden');
    });
    $('#btn-save-config').addEventListener('click', saveConfig);
    $('#btn-export').addEventListener('click', exportResults);

    $('#btn-run-smoke').addEventListener('click', () => {
      const smokeTests = getAllTests().filter(t => (t.tags || []).includes('smoke') && t.auto);
      if (smokeTests.length === 0) {
        toast('No automated smoke tests found', 'error');
        return;
      }
      toast(`Running ${smokeTests.length} smoke tests...`, 'info');
      runTests(smokeTests);
    });

    $('#btn-run-section').addEventListener('click', () => {
      const sectionId = els.filterSection.value;
      if (sectionId === 'all') {
        toast('Select a section first', 'error');
        return;
      }
      const section = testData.sections.find(s => s.id === sectionId);
      if (!section) return;
      const autoTests = section.tests.filter(t => t.auto);
      if (autoTests.length === 0) {
        toast('No automated tests in this section', 'error');
        return;
      }
      toast(`Running ${autoTests.length} tests from section ${sectionId}...`, 'info');
      runTests(autoTests);
    });

    $('#btn-reset').addEventListener('click', () => {
      if (running) {
        abortRun = true;
        running = false;
        toast('Run aborted', 'error');
        return;
      }
      results = {};
      saveResults();
      renderTests();
      toast('All results cleared', 'info');
    });

    // Filter changes
    els.filterSection.addEventListener('change', renderTests);
    els.filterTag.addEventListener('change', renderTests);
    els.filterStatus.addEventListener('change', renderTests);
  }

  init();
})();
