# Greet QA Runner — Chrome Extension

Internal QA test runner for the Greet event check-in platform. Runs 167 test cases from the staging test plan directly in the browser.

## Install (30 seconds)

1. Open Chrome → `chrome://extensions`
2. Toggle **Developer mode** (top right)
3. Click **Load unpacked**
4. Select this folder: `tools/qa-extension/`
5. Click the extension icon → side panel opens

## First Run

1. Click the gear icon in the side panel
2. Set your **Base URL** (e.g., `http://54.241.143.130:5000` or `http://localhost:5001`)
3. Fill in test credentials (super admin email, customer ID, event ID, etc.)
4. Save

## Usage

### Manual Testing (all 167 tests)
- Browse tests by section, filter by tag or status
- Click a test to expand steps and expected results
- Mark each test: **Pass** (checkmark), **Fail** (X), or **Skip** (dash)
- Results persist across sessions

### Automated Testing (~20 tests with AUTO tag)
- **Run Smoke Tests** — runs the 10 critical path tests automatically
- **Run Section** — select a section, runs all automated tests in it
- Click the play button on individual tests to run one at a time
- Tests interact with the DOM via `data-testid` selectors

### Export
- Click the download icon to export results as CSV
- Includes test ID, section, name, status, message, and timestamp

## Test Modes

| Mode | What it does |
|------|-------------|
| **AUTO** | Extension drives the browser: navigates, clicks, types, verifies DOM state |
| **MANUAL** | Shows steps and expected results — you drive, you mark pass/fail |
| **ASSISTED** | Extension runs what it can, pauses for human input (e.g., OTP codes, QR scans) |

## Adding New Tests

Edit `tests/test-cases.json`. Each test follows this structure:

```json
{
  "id": "1.1",
  "name": "Email/password login",
  "tags": ["critical", "auth", "smoke"],
  "mode": "assisted",
  "steps": "Enter valid credentials at /login",
  "expected": "Dashboard loads",
  "auto": {
    "actions": [
      { "type": "navigate", "url": "{{baseUrl}}/login" },
      { "type": "click", "selector": "testid:button-submit" },
      { "type": "type", "selector": "id:email", "value": "{{superAdmin.email}}" }
    ],
    "assertions": [
      { "type": "url_contains", "value": "/dashboard" },
      { "type": "element_visible", "selector": "testid:page-dashboard" }
    ]
  }
}
```

### Selector Strategies
- `testid:button-login` → `[data-testid="button-login"]`
- `id:email` → `#email`
- `text:Send Login Code` → element with exact text
- `contains:Welcome` → element containing text
- `css:.my-class button` → raw CSS selector

### Action Types
`navigate`, `click`, `type`, `clear`, `keypress`, `wait`, `waitForElement`, `waitForUrl`, `waitForGone`, `select`, `toggle`

### Assertion Types
`element_visible`, `element_hidden`, `element_not_exists`, `text_contains`, `text_equals`, `url_contains`, `url_matches`, `input_value`, `element_count`, `element_disabled`, `element_enabled`, `has_attribute`, `console_clean`, `page_loaded`

### Template Variables
Use `{{variableName}}` in actions/assertions — they resolve from the Settings panel:
- `{{baseUrl}}`, `{{superAdmin.email}}`, `{{superAdmin.phone}}`
- `{{customerId}}`, `{{eventId}}`, `{{attendeeName}}`, `{{kioskPin}}`

## Architecture

```
qa-extension/
├── manifest.json          # Chrome Manifest V3
├── background/
│   └── service-worker.js  # Tab management, message relay
├── content/
│   └── content.js         # DOM interaction (runs in page context)
├── sidepanel/
│   ├── panel.html         # Side panel UI
│   ├── panel.css          # Dark theme styles
│   └── panel.js           # Test runner controller
├── tests/
│   └── test-cases.json    # All 167 test cases
└── icons/
    └── icon-*.png         # Extension icons
```
