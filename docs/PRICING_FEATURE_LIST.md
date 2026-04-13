# Checkmate — Feature List for Pricing Packages

*Last updated: March 2026*

---

## Standard Features

### Event Management
| Feature | Description |
|---------|-------------|
| Multi-tenant accounts | Isolated customer accounts with role-based access (Admin, Manager, Staff) |
| Event creation & configuration | Create and manage events with custom settings, dates, and locations |
| Attendee management | Import, search, filter, and manage attendee lists |
| Participant type categorization | Classify attendees by type (VIP, Speaker, Exhibitor, Staff, etc.) |
| Check-in & check-out | Real-time attendee check-in with status tracking and reversal |
| Walk-in registration | Add new attendees on-site directly from the check-in dashboard |
| Audit trail | Full logging of all check-in actions with timestamps and staff attribution |
| Location management | Define venues and map them to printers for automatic printer selection |

### Badge Design & Printing
| Feature | Description |
|---------|-------------|
| Visual badge designer | Drag-and-drop editor with merge fields, images, and custom layouts |
| Dynamic merge fields | Auto-populate attendee name, company, title, QR code, and custom fields |
| Multi-template support | Multiple badge templates per event with participant-type mapping |
| Template resolution | Automatic badge selection based on attendee type (3-tier fallback) |
| Auto-sizing text | Text automatically scales to fit within badge fields while maintaining layout |
| Standard printing | Browser-based print dialog (AirPrint, system printers) |
| High-DPI rendering | 300/600 DPI support for crisp, professional badge output |
| Badge print tracking | Tracks printed status to prevent duplicates |
| PDF badge export | Download badges as PDF files |

### Staff & Access
| Feature | Description |
|---------|-------------|
| Staff check-in dashboard | Purpose-built interface for on-site check-in staff |
| Temporary staff access | Passcode-based, time-limited access scoped to specific events |
| Staff URL QR code | Scannable QR code on event settings for quick device setup |
| Idle timeout protection | Automatic session logout after inactivity (configurable) |
| Multi-factor authentication | SMS OTP and Email OTP login options |

### Kiosk Mode
| Feature | Description |
|---------|-------------|
| Self-service kiosk | Attendees check themselves in via name search or QR scan |
| QR code scanning | Front and rear camera support for self-scan and managed modes |
| PIN-protected exit | Prevent unauthorized exit from kiosk mode |
| Badge template chooser | Select auto-match by attendee type or force a specific template |
| Session kiosk | Dedicated kiosk mode for breakout session check-in |

### Session Management
| Feature | Description |
|---------|-------------|
| Session check-in/out | Track attendance at breakout sessions and workshops |
| Capacity enforcement | Set and enforce session capacity limits |
| Waitlist management | Automatic waitlist when sessions reach capacity |

### Reporting & Analytics
| Feature | Description |
|---------|-------------|
| Event dashboard | Real-time check-in statistics and progress visualization |
| Attendee reporting | Check-in rates, timing analysis, and participant breakdowns |
| Session reporting | Session attendance stats and capacity utilization |

### Notifications
| Feature | Description |
|---------|-------------|
| SMS notifications | Twilio-powered alerts triggered by check-in events |
| Email notifications | Email alerts for check-in activity |
| Custom notification rules | Per-event rules for VIP/high-value attendee alerts |

---

## Premium Features

### Advanced Printing
| Feature | Description |
|---------|-------------|
| Cloud printing (PrintNode) | Silent, dialog-free printing from any device to local network printers |
| Zebra printer support | Direct ZPL printing to Zebra label printers (ZD, ZT, ZP series) |
| Network printer (IP) | Print directly to printers via IP address (Port 9100) |
| Offline print queue | IndexedDB-backed queue that stores print jobs during connectivity loss and auto-resumes |
| Custom font support | Upload and use brand-specific fonts (WOFF, TTF) on badges |

### Platform Integrations
| Feature | Description |
|---------|-------------|
| Certain integration (Basic Auth) | Bi-directional sync with Certain event platform via API key |
| Certain integration (OAuth2) | Enterprise OAuth2 connection with automated token refresh |
| Smart event filtering | Only sync events tagged for check-in (e.g., "checkmate" tag) |
| Automated sync scheduling | Configurable sync intervals that adapt based on event proximity |
| Field mapping engine | Custom mapping of external platform fields to badge merge fields |
| Outbound attendee sync | Push locally-created attendees (walk-ins) back to external platforms |
| Webhook notifications | Real-time outbound webhooks on check-in/revert to external systems |
| Encrypted credential storage | AES-256-GCM encryption for all stored integration credentials |

### Offline-First Architecture
| Feature | Description |
|---------|-------------|
| Full offline operation | Complete check-in capability with no internet connection |
| Local data caching | IndexedDB-backed attendee and session data for instant access |
| Background sync queue | Queued actions auto-synchronize when connectivity is restored |
| Precaching service | Automatic data caching when staff/kiosk modes launch |

### Advanced Badge Features
| Feature | Description |
|---------|-------------|
| 3D badge flip preview | Animated front/back badge preview with flip effect |
| Custom QR code configuration | Configurable QR content (external ID, JSON, custom fields) |
| Image elements on badges | Place logos, sponsor images, and graphics on badge templates |
| Label rotation | 0/90/180/270 degree rotation for different printer orientations |

### Enterprise Administration
| Feature | Description |
|---------|-------------|
| Platform-level dashboard | Cross-account analytics for platform operators |
| Account-level dashboard | Aggregated event stats across an organization's events |
| Real-time activity monitoring | Online user tracking, page views, and system health |
| Configuration templates | Copy event settings (badges, printers, workflows) across events |
| Multi-event management | Manage multiple concurrent events per account |

### Feedback & Support
| Feature | Description |
|---------|-------------|
| Beta feedback widget | In-app conversational feedback with behavior tracking |
| AI-powered feedback analysis | Gemini-driven sentiment analysis and categorization |
| Slack notifications | Automatic Slack alerts for critical feedback submissions |
| Two-way feedback communication | Admin responses delivered back to users in-app |

---

## Planned Features (Roadmap)

### Coming Soon
| Feature | Target | Description |
|---------|--------|-------------|
| Giveaway & prize tracking | Q2 2026 | Event-scoped prize drawings, entry tracking, and winner claim management |
| Bulk badge printing | Q2 2026 | Print badges for multiple attendees in a single batch |
| Check-in status push | Q2 2026 | Write check-in timestamps back to external platforms |
| Native mobile app (Capacitor) | Q2 2026 | iOS/Android wrapper for silent printing and zero-tap badge output |
| Balance due validation | Q2 2026 | Block badge printing until payment is confirmed |

### Future
| Feature | Target | Description |
|---------|--------|-------------|
| Checkmate AI Assistant | Q3 2026 | Platform-wide conversational assistant for natural language event configuration and operations |
| Advanced sync engine | Q3 2026 | Delta sync, conflict resolution, dead letter queue, and sync health dashboard |
| SOC 2 Type II compliance | Q3 2026 | Enterprise security certification and audit trail |
| GDPR/CCPA data privacy | Q3 2026 | Right to deletion, data export, and consent tracking |
| Automated testing suite | Q3 2026 | Playwright E2E, API integration tests, CI/CD pipeline |

---

## Package Comparison Summary

| Capability | Starter | Professional | Enterprise |
|------------|:-------:|:------------:|:----------:|
| Event creation & management | Yes | Yes | Yes |
| Attendee check-in & walk-ins | Yes | Yes | Yes |
| Badge designer & standard printing | Yes | Yes | Yes |
| Kiosk mode (self-service) | Yes | Yes | Yes |
| Staff dashboard & access | Yes | Yes | Yes |
| Session check-in | Yes | Yes | Yes |
| SMS & email notifications | Yes | Yes | Yes |
| Reporting & analytics | Basic | Advanced | Full platform |
| Cloud printing (PrintNode) | — | Yes | Yes |
| Zebra/network printer support | — | Yes | Yes |
| Offline-first operation | — | Yes | Yes |
| Custom fonts & advanced badges | — | Yes | Yes |
| Platform integrations (Certain) | — | Yes | Yes |
| Automated sync & field mapping | — | Yes | Yes |
| Outbound attendee sync | — | — | Yes |
| Multi-account management | — | — | Yes |
| Platform-level dashboard | — | — | Yes |
| Configuration templates | — | — | Yes |
| AI-powered feedback & monitoring | — | — | Yes |
| Dedicated support & SLA | — | — | Yes |

---

*Note: Package names and tier assignments are suggestions. Features can be reorganized across tiers based on pricing strategy and market positioning.*
