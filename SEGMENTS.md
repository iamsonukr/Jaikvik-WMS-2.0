# Contact segments

Open **Contacts → Segments**, select tags and add field conditions, choose **Match all (AND)** or **Match any (OR)**, enter a name, then save. Select a saved segment to edit or delete it. Choose **New segment / saved segments** to start another segment.

Supported fields are name, phone and contact custom fields. Operators include equality, inequality, case-insensitive contains, does not contain, has/no value, numeric comparisons and before/after dates. Equality is case-sensitive. Missing values count as empty; they do not match numeric or date comparisons. Numeric comparisons accept decimal numbers, and date comparisons accept valid ISO dates (`YYYY-MM-DD` or UTC timestamps). Every selected tag and field condition participates in the selected AND/OR rule. 

The contact table previews matching contacts and can export them as CSV. Search and status filters further narrow that table but are not saved as segment rules. Broadcasts can select saved segments and resolve their current membership when preparing recipients. Multiple segments form a union; only active contacts that have not opted out are eligible. Existing tag-only groups remain supported without a data migration.

Event-based conditions such as purchases and abandoned carts are not included: the app needs an event source and event model before those can be supported.

## Verification

From `wa-notifier-backend`, run `npm run build` and `node --test test/segments.cjs`. From `wa-notifier-frontend`, run `npm run build`.

For a manual check with a configured database:

1. Create two contacts with different tags and custom-field values.
2. Create a field-only segment and a mixed tag/field segment. Check AND/OR membership and CSV output.
3. Reload the page, select a segment, edit its conditions/name/description and save. Confirm the same segment is updated.
4. Change a matching contact's data and verify membership changes on reload.
5. Select the segment in a draft broadcast and check that the recipient count excludes opted-out contacts.
6. Switch WhatsApp accounts and confirm segments and contacts are scoped to that account.

The unit tests cover query validation, legacy tags, account scoping, opt-out filtering, empty segments, field-only saves, malformed tags and contact-preview matching. `test/segments-mongo.cjs` additionally compares preview results with queries against an isolated temporary MongoDB and verifies account/opt-out boundaries. It requires the optional `mongodb-memory-server` test package (setup instructions are in the file). Run `npm ci` afterward to restore the exact application dependency tree. These checks do not replace browser testing.