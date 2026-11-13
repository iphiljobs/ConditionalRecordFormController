# Conditional Record Form (LWC)

A configurable Salesforce LWC for conditional create/edit forms in Lightning Experience and Experience Cloud, including LWR. Form configuration is imported from a JavaScript module in the LWC bundle. The browser-facing config uses logical references in `FormKey.FieldKey` form. Apex maps those keys to Salesforce object and field API names using `Conditional_Form_Field__mdt`, and performs record reads, lookup searches, and user-mode DML.

## Configuration and deployment

1. Generate an LWC JavaScript config module with `conditional-form-config-builder.html`.
2. Replace the contents of `force-app/main/default/lwc/conditionalRecordForm/conditionalRecordFormConfig.js` with the generated module.
3. Deploy `force-app/main/default` to Salesforce:

   ```sh
   sf project deploy start --source-dir force-app/main/default
   ```

4. Create one `Conditional_Form_Field__mdt` record per Salesforce field used by the form. Set:
   - `Form_Key__c`: the form key, such as `ApplicationForm`.
   - `Field_Key__c`: the logical key without its prefix, such as `applicantType`.
   - `Object_API_Name__c`: the form's Salesforce object API name. Repeat the same value on every mapping for that form.
   - `Field_API_Name__c`: the real Salesforce field API name.
   - `Lookup_Object_API_Name__c`: the target object API name for lookup/master-detail fields; blank for other fields.
5. Add `conditionalRecordForm` to an Experience Builder page and set **Form Key** to the same key in the imported config and metadata mappings. Set `recordId` for edit mode; leave it blank to create.

Apex rejects a form if its field mapping records specify inconsistent object API names. The JavaScript config module is the only runtime form-config source; no Custom Metadata form-config JSON field or server config wire is used.

## Example module shape

The builder outputs a module with this structure. The form key prefixes field keys and all field references in conditions and value rules:

```js
export default {
  formKey: 'ApplicationForm',
  title: 'Application Details',
  columns: 2,
  showSubmitButton: true,
  submissionMode: 'apex',
  items: [
    {
      kind: 'field',
      key: 'ApplicationForm.applicantType',
      label: 'Applicant type',
      type: 'picklist',
      options: [
        { label: 'Individual', value: 'Individual' },
        { label: 'Organization', value: 'Organization' }
      ]
    },
    {
      kind: 'field',
      key: 'ApplicationForm.organizationName',
      label: 'Organization name',
      type: 'text',
      visibleWhen: {
        field: 'ApplicationForm.applicantType',
        operator: 'equals',
        value: 'Organization'
      }
    }
  ],
  valueRules: []
};
```

The example contains no Salesforce API names. The separate server mapping manifest from the builder includes the API names needed to create `Conditional_Form_Field__mdt` records. For addresses, configure each part's logical key and map each part separately. For lookups, map the relationship field and target object in metadata. Never import the server mapping manifest into the LWC.

## Supported configuration

- Ordered fields, text, section headings/descriptions, and spacers.
- Field types: text, email, tel/phone, number, date, time, datetime, checkbox, URL, password, search, picklist, lookup, and address (`lightning-input-address`).
- Visibility conditions on fields, text, and sections. Each section can set `columns: 1` or `columns: 2`; following items use that layout until the next section. An omitted value inherits top-level `columns`.
- Named custom synchronous conditions from an allowlisted JavaScript registry; they re-evaluate immediately as form values change.
- Immediate value rules: `copy` with optional `overwrite`, and `clear` to null. Field references use fully qualified logical keys.
- Parent-controlled save with public `submit()` or `submissionMode: 'event'` emitting `formsubmit` with logical wrappers.

Address compound fields map each constituent part separately. Lookup search is Apex-backed and returns record IDs and display labels; polymorphic relationships are not supported by this starter.

## Custom visibility evaluators

The config can name an evaluator and pass JSON arguments. The evaluator must be implemented in `conditionalRecordFormVisibility.js`; only names present in `VISIBILITY_EVALUATORS` are callable. Evaluators receive `{ values, args, formKey }`, where `values` is keyed by fully qualified logical field keys. They must be synchronous and side-effect-free.

```js
visibleWhen: {
  method: 'isValueInList',
  args: {
    field: 'ApplicationForm.applicantType',
    allowedValues: ['Organization', 'Other']
  }
}
```

The package includes `isValueInList` and `areFieldsNonBlank` examples. To add business-specific behavior, add a function to the registry and refer to its exact name in the config. Don't put executable code in the config. Custom conditions also work in `valueRules`; those rules are checked after every field change because Apex cannot infer a custom evaluator's dependencies. If a method is missing from the registry or throws an error, it evaluates to false so conditional content stays hidden.

## Security and migration notes

- `Conditional_Form__mdt` and `Configuration_JSON__c` are removed from this package. The package has no remaining internal Apex/LWC dependency on that type. Before deleting it from an org, check for org-specific references in Apex, Flows, permission sets, integrations, or deployment automation; removing metadata files from this source package does not itself delete the existing org type.
- `Object_API_Name__c` is now on each `Conditional_Form_Field__mdt` mapping. Every mapping for one form must use the same object API name.
- Field API names are not included in the imported LWC config or `formsubmit` event. This is an abstraction boundary, not secrecy from Salesforce administrators or users who can inspect org metadata/source.
- Grant portal users Apex class access and required object/field permissions and record sharing. Reads and DML use user mode. Guest-user access must follow the site's guest profile and sharing setup.
- The builder's server-mapping manifest is setup input and contains API names. Keep it out of the LWC bundle.
- Verify the configuration and portal permissions in a Salesforce org before production use.
