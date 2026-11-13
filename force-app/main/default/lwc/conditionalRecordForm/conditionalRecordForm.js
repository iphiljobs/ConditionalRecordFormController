import { LightningElement, api, wire } from 'lwc';
import { getRecord, getFieldValue } from 'lightning/uiRecordApi';
import saveRecord from '@salesforce/apex/ConditionalRecordFormController.saveRecord';
import Toast from 'lightning/toast';
import DEFAULT_FORM_CONFIG from './conditionalRecordFormConfig';

const OPERATORS = new Set([
    'equals',
    'notEquals',
    'contains',
    'notContains',
    'isBlank',
    'isNotBlank',
    'greaterThan',
    'lessThan'
]);

const INPUT_TYPES = new Set([
    'text', 'email', 'tel', 'number', 'date', 'time', 'datetime',
    'checkbox', 'url', 'password', 'search'
]);

const ADDRESS_PARTS = ['street', 'city', 'province', 'postalCode', 'country'];

export default class ConditionalRecordForm extends LightningElement {
    @api objectApiName;
    @api recordId;
    @api title = 'Conditional Form';
    @api description;
    @api submitLabel = 'Save';
    showSubmitButton = true;
    submissionMode = 'apex';

    clientFieldValues = [];
    isSubmitting = false;
    _config = { items: [], clearWhenHidden: false, valueRules: [] };
    _formConfigJson;
    _createdRecordId;
    _ruleClearedFields = new Set();

    @api
    get formConfigJson() {
        return this._formConfigJson;
    }

    set formConfigJson(value) {
        this._formConfigJson = value;
        if (this.isConnected) this.parseConfig();
    }

    connectedCallback() {
        this.parseConfig();
    }

    get values() {
        return this.clientFieldValues.reduce((result, wrapper) => {
            result[wrapper.fieldApiName] = wrapper.value;
            return result;
        }, {});
    }

    set values(nextValues) {
        this.clientFieldValues = Object.entries(nextValues || {}).map(([fieldApiName, value]) => ({
            fieldApiName,
            value
        }));
    }

    // Parent components can call this when the built-in button is hidden.
    // In Apex mode this saves the record; in event mode it emits formsubmit.
    @api
    submit() {
        return this.handleSubmit();
    }

    get recordFields() {
        if (!this.objectApiName || !this.formFields.length) return undefined;
        return this.formFields
            .flatMap((field) => this.getFieldApiNames(field))
            .map((apiName) => `${this.objectApiName}.${apiName}`);
    }

    get formFields() {
        return this._config.items.filter((item) =>
            item?.apiName && (item.kind === 'field' || !item.kind)
        );
    }

    get effectiveRecordId() {
        return this.recordId || this._createdRecordId;
    }

    get visibleItems() {
        return this._config.items
            .map((item, index) => {
                const kind = item.kind || (item.apiName ? 'field' : 'text');
                const isField = kind === 'field' && Boolean(item.apiName);
                const isCheckbox = isField && item.type === 'checkbox';
                const isSpacer = kind === 'spacer';
                const fullWidth = kind === 'section' || kind === 'text' ||
                    (isField && (item.type === 'address' || item.fullWidth === true || item.span === 2)) ||
                    (isSpacer && item.span === 2) || this._config.columns === 1;
                return {
                    ...item,
                    kind,
                    renderKey: item.key || item.apiName || `item-${index}`,
                    isSpacer,
                    columnClass: fullWidth
                        ? 'slds-col slds-size_1-of-1 slds-m-bottom_small'
                        : 'slds-col slds-size_1-of-1 slds-medium-size_1-of-2 slds-m-bottom_small',
                    isSection: kind === 'section',
                    isText: kind === 'text',
                    isField,
                    heading: item.heading || item.label || item.title,
                    type: item.type === 'picklist' ? 'text' : (INPUT_TYPES.has(item.type) ? item.type : 'text'),
                    isAddress: isField && item.type === 'address',
                    isPicklist: isField && item.type === 'picklist',
                    address: {
                        street: this.values[item.apiNames?.street] || '',
                        city: this.values[item.apiNames?.city] || '',
                        province: this.values[item.apiNames?.province] || '',
                        postalCode: this.values[item.apiNames?.postalCode] || '',
                        country: this.values[item.apiNames?.country] || ''
                    },
                    streetLabel: item.streetLabel || 'Street',
                    cityLabel: item.cityLabel || 'City',
                    provinceLabel: item.provinceLabel || 'State/Province',
                    postalCodeLabel: item.postalCodeLabel || 'Postal Code',
                    countryLabel: item.countryLabel || 'Country',
                    value: Object.prototype.hasOwnProperty.call(this.values, item.apiName)
                        ? this.values[item.apiName]
                        : item.defaultValue,
                    checked: isCheckbox
                        ? Boolean(Object.prototype.hasOwnProperty.call(this.values, item.apiName)
                            ? this.values[item.apiName]
                            : item.defaultValue)
                        : false,
                    options: Array.isArray(item.options) ? item.options : []
                };
            })
            .filter((item) => item.kind !== 'spacer' || this._config.columns === 2)
            .filter((item) => this.isItemVisible(item));
    }

    @wire(getRecord, { recordId: '$effectiveRecordId', fields: '$recordFields' })
    wiredRecord({ data, error }) {
        if (data) {
            const loadedValues = { ...this.values };
            this.formFields.forEach((field) => {
                this.getFieldApiNames(field).forEach((apiName) => {
                    loadedValues[apiName] = getFieldValue(data, `${this.objectApiName}.${apiName}`);
                });
            });
            this.values = loadedValues;
        } else if (error) {
            this.showToast('Unable to load record', this.getErrorMessage(error), 'error');
        }
    }

    parseConfig() {
        try {
            const configSource = this.formConfigJson || DEFAULT_FORM_CONFIG;
            const parsed = typeof configSource === 'string'
                ? JSON.parse(configSource)
                : configSource;
            const items = Array.isArray(parsed?.items)
                ? parsed.items
                : Array.isArray(parsed?.fields) ? parsed.fields : [];
            this._config = {
                items,
                clearWhenHidden: Boolean(parsed?.clearWhenHidden),
                columns: Number(parsed?.columns) === 2 ? 2 : 1,
                showSubmitButton: parsed?.showSubmitButton !== false,
                submissionMode: parsed?.submissionMode === 'event' ? 'event' : 'apex',
                valueRules: Array.isArray(parsed?.valueRules) ? parsed.valueRules : []
            };
            this._ruleClearedFields = new Set();
            this.showSubmitButton = this._config.showSubmitButton;
            this.submissionMode = this._config.submissionMode;
            this.title = parsed?.title || this.title;
            this.description = parsed?.description || this.description;
            this.submitLabel = parsed?.submitLabel || this.submitLabel;

            const defaults = { ...this.values };
            this.formFields.forEach((field) => {
                if (field.defaultValue !== undefined &&
                    !Object.prototype.hasOwnProperty.call(defaults, field.apiName)) {
                    defaults[field.apiName] = field.defaultValue;
                }
            });
            this.values = defaults;
        } catch (error) {
            this._config = {
                items: [],
                clearWhenHidden: false,
                columns: 1,
                showSubmitButton: true,
                submissionMode: 'apex',
                valueRules: []
            };
            this._ruleClearedFields = new Set();
            this.showSubmitButton = true;
            this.submissionMode = 'apex';
            this.showToast('Invalid form configuration', error.message, 'error');
        }
    }

    handleFieldChange(event) {
        const apiName = event.currentTarget.dataset.field;
        if (!apiName) return;
        const field = this.formFields.find((item) => item.apiName === apiName);
        if (field?.type === 'address') {
            const address = event.target;
            const nextValues = { ...this.values };
            ADDRESS_PARTS.forEach((part) => {
                const fieldApiName = field.apiNames?.[part];
                if (fieldApiName) nextValues[fieldApiName] = address[part] || '';
            });
            this.values = nextValues;
            this._ruleClearedFields = new Set(
                [...this._ruleClearedFields].filter((name) => !Object.values(field.apiNames || {}).includes(name))
            );
            this.applyValueRules(Object.values(field.apiNames || {}).filter(Boolean));
            return;
        }
        const value = event.target.type === 'checkbox'
            ? event.target.checked
            : event.detail?.value ?? event.target.value;
        this.setClientValue(apiName, value);
        this._ruleClearedFields.delete(apiName);
        this.applyValueRules([apiName]);
    }

    applyValueRules(changedFieldApiNames) {
        const rules = this._config.valueRules || [];
        if (!rules.length) return;

        const changedFields = new Set(changedFieldApiNames);
        const currentValues = { ...this.values };
        const executedRules = new Set();
        let hasUpdates = true;
        let passes = 0;

        // Allow a value written by one rule to trigger a dependent rule, while
        // ensuring each configured rule executes at most once per user change.
        while (hasUpdates && passes <= rules.length) {
            hasUpdates = false;
            passes += 1;

            rules.forEach((rule, ruleIndex) => {
                if (executedRules.has(ruleIndex) || !rule || !Array.isArray(rule.actions)) return;
                const whenConditions = Array.isArray(rule.when)
                    ? rule.when
                    : rule.when ? [rule.when] : [];
                const dependencies = new Set(whenConditions.map((condition) => condition?.field).filter(Boolean));
                rule.actions.forEach((action) => {
                    if (action?.type === 'copy' && action.from) dependencies.add(action.from);
                });
                if (![...dependencies].some((field) => changedFields.has(field))) return;
                if (!this.conditionsPass({
                    visibleWhen: rule.when,
                    visibleWhenLogic: rule.whenLogic
                }, currentValues)) return;

                executedRules.add(ruleIndex);
                rule.actions.forEach((action) => {
                    if (action?.type === 'copy' && action.from && action.to) {
                        const sourceValue = Object.prototype.hasOwnProperty.call(currentValues, action.from)
                            ? currentValues[action.from]
                            : undefined;
                        if (sourceValue === undefined) return;

                        const targetValue = currentValues[action.to];
                        const targetIsBlank = targetValue === null || targetValue === undefined ||
                            String(targetValue).trim() === '';
                        if (action.overwrite !== true && !targetIsBlank) return;

                        const copiedValue = sourceValue === undefined ? null : sourceValue;
                        if (targetValue !== copiedValue) {
                            currentValues[action.to] = copiedValue;
                            changedFields.add(action.to);
                            this._ruleClearedFields.delete(action.to);
                            hasUpdates = true;
                        }
                    } else if (action?.type === 'clear') {
                        (Array.isArray(action.fields) ? action.fields : []).filter(Boolean).forEach((field) => {
                            if (currentValues[field] !== null ||
                                !Object.prototype.hasOwnProperty.call(currentValues, field)) {
                                currentValues[field] = null;
                                changedFields.add(field);
                                hasUpdates = true;
                            }
                            this._ruleClearedFields.add(field);
                        });
                    }
                });
            });
        }

        this.values = currentValues;
    }

    async handleSubmit() {
        const inputs = [...this.template.querySelectorAll('lightning-input, lightning-combobox')];
        const allValid = inputs.reduce((valid, input) => input.reportValidity() && valid, true);
        const invalidRequiredAddress = this.formFields.some((field) => {
            if (field.type !== 'address' || !field.required || !this.isItemVisible(field)) return false;
            return ADDRESS_PARTS
                .filter((part) => field.apiNames?.[part])
                .some((part) => !String(this.values[field.apiNames[part]] || '').trim());
        });
        if (!allValid || invalidRequiredAddress || !this.objectApiName) {
            if (invalidRequiredAddress) {
                this.showToast('Address is incomplete', 'Complete all required address fields before saving.', 'error');
            }
            if (!this.objectApiName) {
                this.showToast('Form configuration required', 'Set the Salesforce object API name.', 'error');
            }
            return;
        }

        const currentValues = this.values;
        const visibleApiNames = new Set(
            this.formFields
                .filter((field) => this.isItemVisible(field))
                .flatMap((field) => this.getFieldApiNames(field))
        );
        this._ruleClearedFields.forEach((apiName) => visibleApiNames.add(apiName));
        const fields = {};
        visibleApiNames.forEach((apiName) => {
            if (Object.prototype.hasOwnProperty.call(currentValues, apiName)) {
                fields[apiName] = currentValues[apiName];
            }
        });
        if (this._config.clearWhenHidden) {
            this.formFields
                .filter((field) => !this.isItemVisible(field))
                .flatMap((field) => this.getFieldApiNames(field))
                .forEach((apiName) => { fields[apiName] = null; });
        }

        if (this.submissionMode === 'event') {
            this.dispatchEvent(new CustomEvent('formsubmit', {
                detail: {
                    objectApiName: this.objectApiName,
                    recordId: this.effectiveRecordId,
                    fields
                },
                bubbles: true,
                composed: true
            }));
            return fields;
        }

        this.isSubmitting = true;
        try {
            const savedRecordId = await saveRecord({
                payloadJson: JSON.stringify({
                    objectApiName: this.objectApiName,
                    recordId: this.effectiveRecordId,
                    fields
                })
            });
            if (!this.effectiveRecordId) this._createdRecordId = savedRecordId;
            this.showToast('Saved', 'Record saved successfully.', 'success');
            this.dispatchEvent(new CustomEvent('success', { detail: { id: savedRecordId } }));
            return savedRecordId;
        } catch (error) {
            this.showToast('Unable to save record', this.getErrorMessage(error), 'error');
            this.dispatchEvent(new CustomEvent('error', { detail: error }));
        } finally {
            this.isSubmitting = false;
        }
    }

    getFieldApiNames(field) {
        if (field?.type === 'address') {
            return ADDRESS_PARTS.map((part) => field.apiNames?.[part]).filter(Boolean);
        }
        return field?.apiName ? [field.apiName] : [];
    }

    setClientValue(fieldApiName, value) {
        const updated = [...this.clientFieldValues];
        const existingIndex = updated.findIndex((wrapper) => wrapper.fieldApiName === fieldApiName);
        const wrapper = { fieldApiName, value };
        if (existingIndex === -1) updated.push(wrapper);
        else updated[existingIndex] = wrapper;
        this.clientFieldValues = updated;
    }

    isItemVisible(item) {
        if (item.sectionKey) {
            const parentSection = this._config.items.find((candidate) =>
                candidate.kind === 'section' && candidate.key === item.sectionKey
            );
            if (parentSection && !this.conditionsPass(parentSection)) return false;
        }
        return this.conditionsPass(item);
    }

    conditionsPass(item, values = this.values) {
        const conditions = Array.isArray(item.visibleWhen)
            ? item.visibleWhen
            : item.visibleWhen
                ? [item.visibleWhen]
                : [];
        if (!conditions.length) return true;
        const results = conditions.map((condition) => this.evaluate(condition, values));
        return item.visibleWhenLogic === 'OR'
            ? results.some(Boolean)
            : results.every(Boolean);
    }

    evaluate(condition, values = this.values) {
        if (!condition?.field || !OPERATORS.has(condition.operator)) return false;
        const actual = values[condition.field];
        const expected = condition.value;
        const actualText = Array.isArray(actual) ? actual.join(';') : String(actual ?? '');
        const expectedText = Array.isArray(expected) ? expected.join(';') : String(expected ?? '');

        switch (condition.operator) {
            case 'equals': return actualText === expectedText;
            case 'notEquals': return actualText !== expectedText;
            case 'contains':
                return Array.isArray(actual) ? actual.includes(expected) : actualText.includes(expectedText);
            case 'notContains':
                return Array.isArray(actual) ? !actual.includes(expected) : !actualText.includes(expectedText);
            case 'isBlank': return actual === null || actual === undefined || actualText.trim() === '';
            case 'isNotBlank': return !(actual === null || actual === undefined || actualText.trim() === '');
            case 'greaterThan': return actual !== '' && Number(actual) > Number(expected);
            case 'lessThan': return actual !== '' && Number(actual) < Number(expected);
            default: return false;
        }
    }

    showToast(label, message, variant) {
        Toast.show({ label, message, variant }, this);
    }

    getErrorMessage(error) {
        return error?.body?.message || error?.message || 'An unexpected error occurred.';
    }
}
