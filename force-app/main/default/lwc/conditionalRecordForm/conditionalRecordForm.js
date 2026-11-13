import { LightningElement, api } from 'lwc';
import DEFAULT_FORM_CONFIG from './conditionalRecordFormConfig';
import { VISIBILITY_EVALUATORS } from './conditionalRecordFormVisibility';
import saveRecord from '@salesforce/apex/ConditionalRecordFormController.saveRecord';
import loadFormData from '@salesforce/apex/ConditionalRecordFormController.loadFormData';
import Toast from 'lightning/toast';

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
    _formKey;
    _configLoaded = false;
    formTitle = 'Conditional Form';
    formDescription;
    formSubmitLabel = 'Save';

    @api
    get formKey() {
        return this._formKey;
    }

    set formKey(value) {
        this._formKey = value;
        if (this.isConnected && this._configLoaded) {
            this.clientFieldValues = [];
            this._createdRecordId = undefined;
            this.loadRecordValues();
        }
    }

    @api recordId;

    showSubmitButton = true;
    submissionMode = 'apex';

    clientFieldValues = [];
    isSubmitting = false;
    _config = { items: [], clearWhenHidden: false, columns: 1, valueRules: [] };
    _createdRecordId;
    _ruleClearedFields = new Set();

    connectedCallback() {
        if (!this.formKey && DEFAULT_FORM_CONFIG?.formKey) {
            this._formKey = DEFAULT_FORM_CONFIG.formKey;
        }
        this.parseConfig(DEFAULT_FORM_CONFIG);
        this._configLoaded = true;
        this.loadRecordValues();
    }

    async loadRecordValues() {
        if (!this.formKey || !this.effectiveRecordId || !this.formFields.length) return;
        const fieldKeys = [...new Set(this.formFields.flatMap((field) => this.getFieldKeys(field)))];
        try {
            const data = await loadFormData({
                formKey: this.formKey,
                recordId: this.effectiveRecordId,
                fieldKeys
            });
            const loadedValues = { ...this.values };
            (data?.fields || []).forEach((wrapper) => {
                loadedValues[wrapper.key] = wrapper.valueJson ? JSON.parse(wrapper.valueJson) : null;
            });
            this.values = loadedValues;
        } catch (error) {
            this.showToast('Unable to load record', this.getErrorMessage(error), 'error');
        }
    }

    get values() {
        return this.clientFieldValues.reduce((result, wrapper) => {
            result[wrapper.key] = wrapper.value;
            return result;
        }, {});
    }

    set values(nextValues) {
        this.clientFieldValues = Object.entries(nextValues || {}).map(([key, value]) => ({
            key,
            value
        }));
    }

    // Parent components can call this when the built-in button is hidden.
    // In Apex mode this saves the record; in event mode it emits formsubmit.
    @api
    submit() {
        return this.handleSubmit();
    }

    get formFields() {
        return this._config.items.filter((item) =>
            item?.key && (item.kind === 'field' || !item.kind)
        );
    }

    get effectiveRecordId() {
        return this.recordId || this._createdRecordId;
    }

    get visibleItems() {
        let activeColumns = this._config.columns;
        return this._config.items
            .map((item, index) => {
                const kind = item.kind || (item.key ? 'field' : 'text');
                if (kind === 'section') {
                    activeColumns = Number(item.columns) === 1 || Number(item.columns) === 2
                        ? Number(item.columns)
                        : this._config.columns;
                }
                const itemColumns = activeColumns;
                const isField = kind === 'field' && Boolean(item.key);
                const isCheckbox = isField && item.type === 'checkbox';
                const isSpacer = kind === 'spacer';
                const fullWidth = kind === 'section' || kind === 'text' ||
                    (isField && (item.type === 'address' || item.fullWidth === true || item.span === 2)) ||
                    (isSpacer && item.span === 2) || itemColumns === 1;
                return {
                    ...item,
                    kind,
                    itemColumns,
                    renderKey: item.key || `item-${index}`,
                    itemIndex: index,
                    isSpacer,
                    columnClass: fullWidth
                        ? 'slds-col slds-size_1-of-1 slds-m-bottom_small'
                        : 'slds-col slds-size_1-of-1 slds-medium-size_1-of-2 slds-m-bottom_small',
                    isSection: kind === 'section',
                    isText: kind === 'text',
                    isField,
                    heading: item.heading || item.label || item.title,
                    type: item.type === 'picklist' ? 'text' : (INPUT_TYPES.has(item.type) ? item.type : 'text'),
                    isLookup: isField && item.type === 'lookup',
                    isAddress: isField && item.type === 'address',
                    isPicklist: isField && item.type === 'picklist',
                    address: {
                        street: this.values[item.fieldKeys?.street] || '',
                        city: this.values[item.fieldKeys?.city] || '',
                        province: this.values[item.fieldKeys?.province] || '',
                        postalCode: this.values[item.fieldKeys?.postalCode] || '',
                        country: this.values[item.fieldKeys?.country] || ''
                    },
                    streetLabel: item.streetLabel || 'Street',
                    cityLabel: item.cityLabel || 'City',
                    provinceLabel: item.provinceLabel || 'State/Province',
                    postalCodeLabel: item.postalCodeLabel || 'Postal Code',
                    countryLabel: item.countryLabel || 'Country',
                    value: Object.prototype.hasOwnProperty.call(this.values, item.key)
                        ? this.values[item.key]
                        : item.defaultValue,
                    checked: isCheckbox
                        ? Boolean(Object.prototype.hasOwnProperty.call(this.values, item.key)
                            ? this.values[item.key]
                            : item.defaultValue)
                        : false,
                    options: Array.isArray(item.options) ? item.options : []
                };
            })
            .filter((item) => item.kind !== 'spacer' || item.itemColumns === 2)
            .filter((item) => this.isItemVisible(item));
    }

    parseConfig(configSource) {
        try {
            const parsed = typeof configSource === 'string' ? JSON.parse(configSource) : configSource;
            if (parsed?.formKey && parsed.formKey !== this.formKey) {
                throw new Error('The imported config formKey must match the component formKey.');
            }
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
            this.formTitle = parsed?.title || 'Conditional Form';
            this.formDescription = parsed?.description;
            this.formSubmitLabel = parsed?.submitLabel || 'Save';

            const defaults = { ...this.values };
            this.formFields.forEach((field) => {
                if (field.defaultValue !== undefined &&
                    !Object.prototype.hasOwnProperty.call(defaults, field.key)) {
                    defaults[field.key] = field.defaultValue;
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
        const fieldKey = event.currentTarget.dataset.fieldKey;
        if (!fieldKey) return;
        const field = this.formFields.find((item) => item.key === fieldKey);
        if (field?.type === 'address') {
            const address = event.target;
            const nextValues = { ...this.values };
            ADDRESS_PARTS.forEach((part) => {
                const key = field.fieldKeys?.[part];
                if (key) nextValues[key] = address[part] || '';
            });
            this.values = nextValues;
            this._ruleClearedFields = new Set(
                [...this._ruleClearedFields].filter((name) => !Object.values(field.fieldKeys || {}).includes(name))
            );
            this.applyValueRules(Object.values(field.fieldKeys || {}).filter(Boolean));
            return;
        }
        const value = event.target.type === 'checkbox'
            ? event.target.checked
            : event.detail?.value ?? event.target.value;
        this.setClientValue(fieldKey, value);
        this._ruleClearedFields.delete(fieldKey);
        this.applyValueRules([fieldKey]);
    }

    handleLookupChange(event) {
        const { fieldKey, recordId } = event.detail || {};
        if (!fieldKey) return;
        this.setClientValue(fieldKey, recordId);
        this._ruleClearedFields.delete(fieldKey);
        this.applyValueRules([fieldKey]);
    }

    applyValueRules(changedFieldKeys) {
        const rules = this._config.valueRules || [];
        if (!rules.length) return;

        const changedFields = new Set(changedFieldKeys);
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
                const hasCustomCondition = whenConditions.some((condition) => Boolean(condition?.method));
                rule.actions.forEach((action) => {
                    if (action?.type === 'copy' && action.from) dependencies.add(action.from);
                });
                if (!hasCustomCondition && ![...dependencies].some((field) => changedFields.has(field))) return;
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
        const inputs = [...this.template.querySelectorAll('lightning-input, lightning-combobox, c-conditional-record-lookup')];
        const allValid = inputs.reduce((valid, input) => input.reportValidity() && valid, true);
        const invalidRequiredAddress = this.formFields.some((field) => {
            if (field.type !== 'address' || !field.required || !this.isItemVisible(field)) return false;
            return ADDRESS_PARTS
                .filter((part) => field.fieldKeys?.[part])
                .some((part) => !String(this.values[field.fieldKeys[part]] || '').trim());
        });
        if (!allValid || invalidRequiredAddress || !this.formKey) {
            if (invalidRequiredAddress) {
                this.showToast('Address is incomplete', 'Complete all required address fields before saving.', 'error');
            }
            if (!this.formKey) {
                this.showToast('Form configuration required', 'Set the server-side form key.', 'error');
            }
            return;
        }

        const currentValues = this.values;
        const visibleFieldKeys = new Set(
            this.formFields
                .filter((field) => this.isItemVisible(field))
                .flatMap((field) => this.getFieldKeys(field))
        );
        this._ruleClearedFields.forEach((fieldKey) => visibleFieldKeys.add(fieldKey));
        const fields = [...visibleFieldKeys]
            .filter((fieldKey) => Object.prototype.hasOwnProperty.call(currentValues, fieldKey))
            .map((key) => ({ key, valueJson: JSON.stringify(currentValues[key]) }));
        if (this._config.clearWhenHidden) {
            this.formFields
                .filter((field) => !this.isItemVisible(field))
                .flatMap((field) => this.getFieldKeys(field))
                .forEach((key) => {
                    if (!fields.some((fieldValue) => fieldValue.key === key)) fields.push({ key, valueJson: 'null' });
                });
        }

        if (this.submissionMode === 'event') {
            this.dispatchEvent(new CustomEvent('formsubmit', {
                detail: {
                    formKey: this.formKey,
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
                    formKey: this.formKey,
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

    getFieldKeys(field) {
        if (field?.type === 'address') {
            return ADDRESS_PARTS.map((part) => field.fieldKeys?.[part]).filter(Boolean);
        }
        return field?.key ? [field.key] : [];
    }

    setClientValue(key, value) {
        const updated = [...this.clientFieldValues];
        const existingIndex = updated.findIndex((wrapper) => wrapper.key === key);
        const wrapper = { key, value };
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
        if (condition?.method) {
            const evaluator = VISIBILITY_EVALUATORS[condition.method];
            if (typeof evaluator !== 'function') return false;
            try {
                return Boolean(evaluator({
                    values,
                    args: condition.args && typeof condition.args === 'object' ? condition.args : {},
                    formKey: this.formKey
                }));
            } catch {
                // A custom evaluator failure should hide the conditional content safely.
                return false;
            }
        }
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
