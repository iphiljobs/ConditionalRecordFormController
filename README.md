# Conditional Record Form (LWC)

A configurable create/edit form for Lightning Experience and Experience Cloud, including LWR. Each form is defined by an allowlisted Apex provider. The provider returns browser-safe JSON keyed by logical names such as `ApplicationForm.email` and privately maps those names to Salesforce API names for the shared controller. No form Custom Metadata or imported JavaScript configuration is required.

## Add a form

1. Open `conditional-form-config-builder.html` and define the form key, Salesforce object, fields, sections, layout, visibility rules, value rules, and server-side field mappings.
2. Download the generated `<FormKey>Definition.cls` provider. Add a matching `.cls-meta.xml` file with the project API version.
3. Register the provider in `ConditionalRecordFormRegistry.getDefinition()`. This explicit allowlist prevents client input from selecting arbitrary Apex classes.
4. Deploy the provider and shared form classes under `force-app/main/default`.
5. Add `conditionalRecordForm` to the Experience Builder page and set **Form Key** to the provider's form key. Set `recordId` to edit an existing record; leave it blank to create.

Deploy with Salesforce CLI, for example:

```sh
sf project deploy start --source-dir force-app/main/default
```

Each provider implements `ConditionalRecordFormDefinition` and supplies:

- `getFormKey()` and `getObjectApiName()`.
- `getConfigJson()` with only logical keys, labels, options, conditions, and display settings. Do not include Salesforce API names in this JSON.
- `getFieldApiNames()` mapping fully qualified logical keys to Salesforce field API names.
- `getLookupObjectApiNames()` mapping lookup logical keys to target object API names.

The shared controller validates provider selection and mappings, checks schema permissions, performs user-mode reads and DML, and serves configuration through a cacheable Apex method. Address parts are mapped as separate logical fields. Lookup and master-detail fields use the same server-side relationship mapping; polymorphic relationships are not supported by this starter.

## Example provider config

The browser receives JSON like this from `getFormConfig`. It contains no Salesforce API names:

```json
{
  "formKey": "ApplicationForm",
  "title": "Application Details",
  "columns": 2,
  "showSubmitButton": true,
  "submissionMode": "apex",
  "items": [
    {
      "kind": "field",
      "key": "ApplicationForm.applicantType",
      "label": "Applicant type",
      "type": "picklist",
      "options": [
        { "label": "Individual", "value": "Individual" },
        { "label": "Organization", "value": "Organization" }
      ]
    },
    {
      "kind": "field",
      "key": "ApplicationForm.organizationName",
      "label": "Organization name",
      "type": "text",
      "visibleWhen": {
        "field": "ApplicationForm.applicantType",
        "operator": "equals",
        "value": "Organization"
      }
    }
  ],
  "valueRules": []
}
```

In the provider's `getFieldApiNames()`, map `ApplicationForm.applicantType` and `ApplicationForm.organizationName` to their actual Salesforce field API names. Those names remain in Apex source and are never returned in the config or `formsubmit` event.

## Section layout

Choose **Standard headings** or **Accordion** under **Section layout** in the
config builder. In an Apex provider, set the top-level JSON property
`"sectionLayout": "flat"` or `"sectionLayout": "accordion"`.
Standard headings are the default when the setting is omitted.

Accordion sections start expanded and can be collapsed independently. Fields,
text, and spacers are grouped under the preceding section heading. A valid
explicit `sectionKey` takes precedence. Items before the first heading without
a section key are displayed above the accordion. A section's visibility rules
apply to its accordion content. Collapsing a section preserves its values and
keeps them eligible for submission. Saving opens any collapsed section that
contains an invalid field.

## Account Intake sample fields

`ApplicationFormDefinition` demonstrates all 14 input types. Deploy the sample
provider with the five Account fields under `objects/Account/fields`. Grant
the intended form users Read and Edit access to the mapped fields as needed.

| Account field | Salesforce field type |
| --- | --- |
| `Form_Email__c` | Email |
| `Form_Active__c` | Checkbox (defaults to unchecked) |
| `Form_Follow_Up_Date__c` | Date |
| `Form_Preferred_Time__c` | Time |
| `Form_Appointment_Date_Time__c` | Date/Time |

The sample uses the standard Account Type picklist and loads its active values
from the org. The password-style input masks `AccountNumber` on screen and is
intended for an account number. The search-style input captures the Account
`Site` value. The lookup searches for a parent Account.

## Address country and state picklists

Select **United States** under **Address picklist preset** for an address field
in the config builder, or add `"addressPreset": "US"` to the address item in
the provider JSON. The Account Intake billing address uses this preset. It
includes United States and all 50 states plus D.C. New records default to United
States and leave the state for the user to select. Existing records load their
saved country and state.

Use `countryOptions` and `provinceOptions` (arrays of `{ "label": "...",
"value": "..." }`) to replace either list. Use `defaultCountry` to supply
a different create-mode value that matches the configured country options.
Without a preset or options, that part remains free text.
When an address has a valid default country, the country control is hidden
and the country is included in the payload only when State/Province has a
value. Editing an existing record preserves its stored country when present.
Use `"hideDefaultCountry": false` to show the country picker and retain
normal country submission for that address.

The preset saves full names for the sample's `BillingCountry` and `BillingState`
mappings. For code fields or custom integration values, set the option values
and default country to the values accepted by your org. Include existing
stored values in the configured lists if users need to keep those selections
when editing a record.

## Client-only fields

In the config builder, select **Client only (exclude from load and save)** on
a field. For a hand-written provider, add the following item to `items` and
omit its key from `getFieldApiNames()`.

```json
{
  "kind": "field",
  "key": "ApplicationForm.sameAsBilling",
  "label": "Mailing address is the same as billing address",
  "type": "checkbox",
  "defaultValue": false,
  "clientOnly": true
}
```

Client-only fields can drive visibility and value rules and can be validated.
Their values stay in the component, including when a rule clears them or the
form uses event submission. Use distinct keys for client-only and persisted
fields. Salesforce lookups require a server mapping.

The Account Intake sample copies each of the five Billing Address parts to
its Mailing Address counterpart. The sample maps Mailing Address to Account's
standard Shipping Address fields. Add a value rule like the following and
repeat the copy action for each address part.

```json
{
  "when": { "field": "ApplicationForm.sameAsBilling", "operator": "equals", "value": true },
  "actions": [
    {
      "type": "copy",
      "from": "ApplicationForm.billingStreet",
      "to": "ApplicationForm.mailingStreet",
      "overwrite": true,
      "clearIfMissing": true
    }
  ]
}
```

Set the Mailing Address item's `readOnlyWhen` to the same condition to prevent
manual edits while it mirrors Billing. Checking the box replaces existing
Mailing values, including clearing any part that is missing in Billing.
Changes to Billing continue to copy while checked. Unchecking keeps the last
copied values and enables editing. The checkbox starts unchecked on each
fresh form load.

## Input formatting and validation

Default placeholders and field validation messages live in
[`conditionalRecordFormInput.js`](force-app/main/default/lwc/conditionalRecordFormInput/conditionalRecordFormInput.js).
Use the **Input text overrides (JSON)** box in the config builder or add the
same object as the top-level `inputText` property in a provider's `getConfigJson()`.

```json
{
  "placeholders": {
    "search": "Find by keyword",
    "address": { "postalCode": "Postal or ZIP code" }
  },
  "help": { "datetime": "Choose a date and time for the appointment." },
  "messages": {
    "all": { "required": "This field is required." },
    "email": { "typeMismatch": "Enter a valid email address." },
    "lookup": { "lookupRequired": "Select an account from the results." }
  },
  "fields": {
    "ApplicationForm.email": {
      "placeholder": "you@example.com",
      "messages": { "required": "Enter your email address." }
    }
  }
}
```

Field overrides take precedence over type and global overrides. Existing item
`placeholder` and `fieldLevelHelp` values remain supported. Address placeholders
use an object with `street`, `city`, `province`, `postalCode`, and `country`
keys. Date/time controls use Salesforce locale formatting. Date-time fields can
use help text and checkboxes use a visible label.

| Input | Formatting and validation |
| --- | --- |
| Text, search, email, phone (`tel`), URL, password | Optional `minLength`, `maxLength`, and a Lightning-supported `pattern`. Email uses the native format check. URLs require HTTP or HTTPS. Phone allows international punctuation and extensions. |
| Number | Optional `min`, `max`, `step`, and `formatter` (`decimal`, `currency`, `percent`, or `percent-fixed`). Use `percent-fixed` when the displayed percentage and stored number should use the same scale. |
| Date, time, date-time | Optional `min` and `max`. Set `dateStyle` or `timeStyle` to `short`, `medium`, or `long` where supported. Date-time also accepts an IANA `timezone` for display. |
| Checkbox | Uses a Boolean. A required checkbox must be checked. |
| Picklist, lookup | Picklist values must match a configured option. Lookup values must be valid Salesforce ID shapes. Users select a lookup result or clear the search text. |
| Address | Required checks apply to mapped address parts. Configured country and province options are validated against their respective lists. |

Message keys follow the defaults module. Length and range messages accept
`{minLength}`, `{maxLength}`, `{min}`, `{max}`, or `{step}` where applicable.
Address messages accept `{part}`.

Before submission, the form trims surrounding whitespace from ordinary text,
preserves password whitespace and configured selection values, normalizes street
line endings, and serializes valid date-time values in UTC. Input and result
labels use Lightning text bindings. Continue to enforce data, field access,
and record validation in Apex. A password-style field masks text on screen and
should only be mapped to data that the form is authorized to read and write.

## Supported configuration

- Ordered fields, text blocks, section headings and descriptions, and spacers.
- Text, email, phone, number, date, time, datetime, checkbox, URL, password, search, picklist, lookup, and `lightning-input-address` fields.
- One- or two-column form layout and per-section column settings.
- Built-in visibility conditions and allowlisted custom synchronous JavaScript evaluators, applied immediately as answers change.
- Immediate value rules: copy with optional overwrite, and clear to null.
- Built-in Save, parent-controlled `submit()`, or `formsubmit` custom event mode.

Visibility evaluators remain in `conditionalRecordFormVisibility.js` because they drive immediate browser UI behavior. The config can name an evaluator and pass JSON arguments; only functions registered in `VISIBILITY_EVALUATORS` can run. The package includes `isValueInList` and `areFieldsNonBlank`. Add business-specific evaluators to that LWC registry; do not put executable code in form config.

## Security and deployment notes

- Form keys resolve through an explicit Apex registry. Never dispatch based on an arbitrary class name provided by the browser.
- Configure Apex class access, object and field permissions, and record sharing for portal users. Reads and DML use user mode; the controller is `with sharing`.
- Salesforce API names live in provider code and are visible to administrators and users with source access. The abstraction keeps them out of the browser payload; it is not a secrecy boundary from org administrators.
- Updating a form config or mapping requires deploying its provider class. Changes do not require Custom Metadata records or updates to the LWC bundle.
- Removing Custom Metadata files from source does not delete existing org metadata. Check for org-specific Apex, Flow, permission set, integration, and deployment references before deleting old types from an org.
- Run Apex tests and verify portal permissions in a Salesforce org before production use.
