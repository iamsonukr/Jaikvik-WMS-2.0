# Client Help Center maintenance

Signed-in client owners and team members can open `/client/help` from the sidebar's Support section, alongside Support & Tickets. Both pages require client authentication; signed-out visitors are redirected to login. The Help Center works before a WhatsApp number is connected. It provides categorized, searchable step-by-step articles, expand/collapse controls, related guides, individual shareable article links and shortcuts to the implemented application screens. Owner-only instructions are labeled; their page shortcuts are withheld from team members.

Content lives in `wa-notifier-frontend/lib/client-help.mjs`; presentation lives in `components/help/ClientHelpCenter.jsx`. Search matches every query word across titles, descriptions, numbered steps, notes and examples. Typing a new search starts across all topics; category selection narrows the results. An article hash such as `/client/help#csv-import` opens its topic and expands the matching guide.

## Reviewed coverage

| Client feature | Implementation reviewed | Documentation topics |
| --- | --- | --- |
| Registration, login and navigation | `app/signup`, `app/login`, `lib/auth-context`, `hooks/useClient`, `components/layout` | Setup checklist, email verification, selecting accounts, mobile menu, theme, roles and logout |
| Dashboard, Notifications, Analytics | `app/client/dashboard`, `alerts`, `analytics` | Overview, alerts, fixed 30-day charts, inbox statistics and delivery status |
| WhatsApp Setup | `app/client/connect-whatsapp`, `components/whatsapp/WhatsAppAccountsPanel` | Both Meta onboarding modes, plan limits, edit, registration PIN, subscription, diagnostics, deactivate, remove with keep/delete choices |
| Contacts | `components/contacts`, `lib/segments.mjs` | Add/search/delete, direct message, CSV mapping and preview, new-only import, import history, tag management, custom fields, conditions and saved segments, CSV export |
| Templates | `components/templates/TemplatesWorkspace` | Meta sync, approval, filters, previews, text-template creation, numbered examples, quick replies and Meta library |
| Broadcasts | `components/broadcasts` | Audience rules, drafts, scheduling, sends, pause/resume/cancel/duplicate, test sends, per-recipient logs and export; current absence of parameter mapping |
| Inbox | `components/inbox/InboxWorkspace` | Text replies, attachments, status icons, session window, assignment, status/priority/tags/deadline, internal notes, conversation filters and both CSV exports |
| Chatbot | `components/chatbot/ChatbotWorkspace` | Three keyword-match modes, priority, create/edit/toggle/delete and testing |
| Integrations | `components/integrations` and matching backend modules | Sheets mapping/import/export/automation, Calendar occurrence mapping/reminders, Calendly question mapping and notifications, Zapier actions/keys/hooks/samples/activity |
| Plans, Wallet, Payments | `app/client/plans`, `wallet`, `components/billing`, `components/payments` and backend payment role checks | Plan cycles/rates/limits, subscription history, owner purchases, both client roles recharging, wallet ledger, purpose/status filters and paid invoice/print/PDF actions |
| Team | `components/team/TeamWorkspace` and backend auth role checks | Owner-created logins, supplied temporary passwords, roles, reset, disable/activate/remove and member read-only view |
| Settings and security | `app/client/settings`, `components/security` and backend tenant role checks | Profile, password in Security tab, 2FA, secondary-email verification/removal/promotion, plan and number snapshots, owner-editable billing and webhook reference |
| Support & Tickets | `components/tickets/TicketsWorkspace` | Create, filter, reply, safe issue details and client-allowed open/closed states |
| Troubleshooting | Error handling and validation in the modules above | Access, OTP, setup, CSV, template, send, plan limit, payment, integration, automation, uncertain-send and attachment issues |

Legacy `/client/clients`, `/client/clients/[id]`, `/client/google-sheets`, `/client/meta-embedded-signup` and `/client` are entry points or redirects to current workflows, not additional client management features. Platform administration screens are intentionally outside this client guide.

## Updating documentation

Review changed buttons, fields, roles, validations and error behavior before editing instructions. Do not assume a backend endpoint has a client-facing control. Do not describe a feature as available merely because a label exists on an inactive or disabled control. Keep IDs stable so shared links continue working, and make every related ID point to a real guide.

Run `node --test tests/client-help.test.mjs` and `npm run build` from `wa-notifier-frontend`. Content checks validate client-menu coverage, destinations, links, role labels and search behavior. For browser review, check both client roles, an account with no connected number, small-screen navigation, keyboard expansion, category/search reset, deep links and clipboard failure fallback. Tests do not replace a live authenticated browser check.
