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
