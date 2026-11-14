import { LightningElement, api, wire } from 'lwc';
import { VISIBILITY_EVALUATORS } from './conditionalRecordFormVisibility';
import getFormConfig from '@salesforce/apex/ConditionalRecordFormController.getFormConfig';
import saveRecord from '@salesforce/apex/ConditionalRecordFormController.saveRecord';
import loadFormData from '@salesforce/apex/ConditionalRecordFormController.loadFormData';
import Toast from 'lightning/toast';
import {
    ADDRESS_PARTS, INPUT_TYPES, addressCountryDefault, addressError, addressOptions, fieldError, formatMessage, getInputText, normalizeValue
} from 'c/conditionalRecordFormInput';

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

const DATE_STYLES = new Set(['short', 'medium', 'long']);
const TIME_STYLES = new Set(['short', 'medium', 'long']);
const NUMBER_FORMATS = new Set(['decimal', 'currency', 'percent', 'percent-fixed']);

export default class ConditionalRecordForm extends LightningElement {
    _formKey;
    _configLoaded = false;
    collapsedSections = [];
    formTitle = 'Conditional Form';
    formDescription;
    formSubmitLabel = 'Save';

    @api
    get formKey() {
        return this._formKey;
    }

    set formKey(value) {
        const nextFormKey = value ? value.trim() : undefined;
        if (nextFormKey === this._formKey) return;
        this._formKey = nextFormKey;
        this._configLoaded = false;
        this._config = { items: [], clearWhenHidden: false, columns: 1, valueRules: [] };
        this.clientFieldValues = [];
        this.collapsedSections = [];
        this._invalidAddresses.clear();
        this._createdRecordId = undefined;
    }

    @api recordId;

    showSubmitButton = true;
    submissionMode = 'apex';

    clientFieldValues = [];
    _invalidAddresses = new Set();
    isSubmitting = false;
    _config = { items: [], clearWhenHidden: false, columns: 1, valueRules: [] };
    _createdRecordId;
    _ruleClearedFields = new Set();

    @wire(getFormConfig, { formKey: '$formKey' })
    wiredFormConfig({ data, error }) {
        if (data) {
            this._configLoaded = this.parseConfig(data);
            if (this._configLoaded) this.loadRecordValues();
        } else if (error) {
            this._configLoaded = false;
            this._config = { items: [], clearWhenHidden: false, columns: 1, valueRules: [] };
            this.showToast('Unable to load form configuration', this.getErrorMessage(error), 'error');
        }
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

    get accordionLayout() {
        return this._config.sectionLayout === 'accordion';
    }

    get sectionAssignments() {
        const assignments = new Map();
        if (!this.accordionLayout) return assignments;

        const sections = new Map(this._config.items
            .filter((item) => item.kind === 'section' && item.key)
            .map((item) => [item.key, item]));
        let currentSection;
        for (const item of this._config.items) {
            if (item.kind === 'section') {
                currentSection = item;
            } else {
                const section = item.sectionKey ? sections.get(item.sectionKey) : currentSection;
                if (section) assignments.set(item, section);
            }
        }
        return assignments;
    }

    get layoutGroups() {
        const assignments = this.sectionAssignments;
        const items = this.getVisibleItems(assignments);
        const unsectioned = { key: 'unsectioned', items: [] };
        if (!this.accordionLayout) return [{ ...unsectioned, items }];

        const groups = new Map();
        for (const item of items.filter((entry) => entry.isSection)) {
            const key = `section-${item.itemIndex}`;
            const expanded = !this.collapsedSections.includes(key);
            groups.set(item.itemIndex, {
                key,
                panelId: `${key}-content`,
                heading: item.heading || 'Section',
                description: item.description,
                isAccordion: true,
                sectionClass: 'slds-section slds-m-bottom_small',
                expanded,
                collapsed: !expanded,
                icon: expanded ? 'utility:chevrondown' : 'utility:chevronright',
                items: []
            });
        }
        for (const item of items.filter((entry) => !entry.isSection)) {
            (groups.get(item.sectionIndex) || unsectioned).items.push(item);
        }
        return [...(unsectioned.items.length ? [unsectioned] : []), ...groups.values()];
    }

    getVisibleItems(assignments) {
        let activeColumns = this._config.columns;
        const values = this.values;
        const sectionIndexes = new Map(this._config.items.map((item, index) => [item, index]));
        return this._config.items
            .map((item, index) => {
                const kind = item.kind || (item.key ? 'field' : 'text');
                if (kind === 'section') {
                    activeColumns = Number(item.columns) === 1 || Number(item.columns) === 2
                        ? Number(item.columns)
                        : this._config.columns;
                }
                const section = assignments.get(item);
                const itemColumns = this.accordionLayout && kind !== 'section'
                    ? ([1, 2].includes(Number(section?.columns)) ? Number(section.columns) : this._config.columns)
                    : activeColumns;
                const isField = kind === 'field' && Boolean(item.key);
                const isCheckbox = isField && item.type === 'checkbox';
                const inputText = isField ? getInputText(item, this._config.inputText) : {};
                const storedValue = Object.prototype.hasOwnProperty.call(values, item.key)
                    ? values[item.key] : item.defaultValue;
                const isSpacer = kind === 'spacer';
                const fullWidth = kind === 'section' || kind === 'text' ||
                    (isField && (item.type === 'address' || item.fullWidth === true || item.span === 2)) ||
                    (isSpacer && item.span === 2) || itemColumns === 1;
                return {
                    ...item,
                    ...inputText,
                    kind,
                    itemColumns,
                    renderKey: item.key ? `${kind}-${item.key}` : `item-${index}`,
                    itemIndex: index,
                    sectionIndex: sectionIndexes.get(section),
                    isSpacer,
                    columnClass: fullWidth
                        ? 'slds-col slds-size_1-of-1 slds-m-bottom_small'
                        : 'slds-col slds-size_1-of-1 slds-medium-size_1-of-2 slds-m-bottom_small',
                    isSection: kind === 'section',
                    isText: kind === 'text',
                    isField,
                    heading: item.heading || item.label || item.title,
                    type: INPUT_TYPES.has(item.type) ? item.type : 'text',
                    dateStyle: DATE_STYLES.has(item.dateStyle) ? item.dateStyle : undefined,
                    timeStyle: TIME_STYLES.has(item.timeStyle) ? item.timeStyle : undefined,
                    formatter: NUMBER_FORMATS.has(item.formatter) ? item.formatter : undefined,
                    requiredMessage: inputText.messages?.required,
                    badInputMessage: inputText.messages?.badInput,
                    typeMismatchMessage: inputText.messages?.typeMismatch,
                    patternMessage: inputText.messages?.patternMismatch,
                    tooShortMessage: inputText.messages && formatMessage(inputText.messages.tooShort, item),
                    tooLongMessage: inputText.messages && formatMessage(inputText.messages.tooLong, item),
                    underflowMessage: inputText.messages && formatMessage(inputText.messages.rangeUnderflow, item),
                    overflowMessage: inputText.messages && formatMessage(inputText.messages.rangeOverflow, item),
                    stepMessage: inputText.messages && formatMessage(inputText.messages.stepMismatch, {
                        step: item.step ?? 1
                    }),
                    isLookup: isField && item.type === 'lookup',
                    isAddress: isField && item.type === 'address',
                    isPicklist: isField && item.type === 'picklist',
                    addressRequired: item.required && ADDRESS_PARTS.every((part) => item.fieldKeys?.[part]),
                    countryOptions: item.type === 'address' ? addressOptions(item, 'country') : undefined,
                    provinceOptions: item.type === 'address' ? addressOptions(item, 'province') : undefined,
                    address: {
                        street: values[item.fieldKeys?.street] || '',
                        city: values[item.fieldKeys?.city] || '',
                        province: values[item.fieldKeys?.province] || '',
                        postalCode: values[item.fieldKeys?.postalCode] || '',
                        country: values[item.fieldKeys?.country] || ''
                    },
                    streetLabel: item.streetLabel || 'Street',
                    cityLabel: item.cityLabel || 'City',
                    provinceLabel: item.provinceLabel || 'State/Province',
                    postalCodeLabel: item.postalCodeLabel || 'Postal Code',
                    countryLabel: item.countryLabel || 'Country',
                    value: storedValue,
                    checked: isCheckbox && normalizeValue('checkbox', storedValue) === true,
                    options: Array.isArray(item.options) ? item.options : []
                };
            })
            .filter((item) => item.kind !== 'spacer' || item.itemColumns === 2)
            .filter((item) => this.isItemVisible(this._config.items[item.itemIndex], assignments));
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
                sectionLayout: parsed?.sectionLayout === 'accordion' ? 'accordion' : 'flat',
                showSubmitButton: parsed?.showSubmitButton !== false,
                submissionMode: parsed?.submissionMode === 'event' ? 'event' : 'apex',
                inputText: parsed?.inputText,
                valueRules: Array.isArray(parsed?.valueRules) ? parsed.valueRules : []
            };
            this.collapsedSections = [];
            this._ruleClearedFields = new Set();
            this._invalidAddresses.clear();
            this.showSubmitButton = this._config.showSubmitButton;
            this.submissionMode = this._config.submissionMode;
            this.formTitle = parsed?.title || 'Conditional Form';
            this.formDescription = parsed?.description;
            this.formSubmitLabel = parsed?.submitLabel || 'Save';

            const defaults = { ...this.values };
            this.formFields.forEach((field) => {
                if (field.type === 'address') {
                    const countryKey = field.fieldKeys?.country;
                    const defaultCountry = addressCountryDefault(field);
                    if (!this.effectiveRecordId && countryKey && defaultCountry !== undefined &&
                        !Object.prototype.hasOwnProperty.call(defaults, countryKey)) {
                        defaults[countryKey] = defaultCountry;
                    }
                    return;
                }
                if (field.defaultValue !== undefined &&
                    !Object.prototype.hasOwnProperty.call(defaults, field.key)) {
                    defaults[field.key] = field.defaultValue;
                }
            });
            this.values = defaults;
            return true;
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
            this._invalidAddresses.clear();
            this.showSubmitButton = true;
            this.submissionMode = 'apex';
            this.showToast('Invalid form configuration', error.message, 'error');
            return false;
        }
    }

    handleSectionToggle(event) {
        const key = event.currentTarget.dataset.sectionId;
        this.collapsedSections = this.collapsedSections.includes(key)
            ? this.collapsedSections.filter((section) => section !== key)
            : [...this.collapsedSections, key];
    }

    handleFieldChange(event) {
        const fieldKey = event.currentTarget.dataset.fieldKey;
        if (!fieldKey) return;
        const field = this.formFields.find((item) => item.key === fieldKey);
        if (!field) return;
        const input = event.currentTarget;
        if (field.type === 'address') {
            const address = event.target;
            const nextValues = { ...this.values };
            ADDRESS_PARTS.forEach((part) => {
                const key = field.fieldKeys?.[part];
                if (key) nextValues[key] = address[part] || '';
            });
            this.values = nextValues;
            if (this._invalidAddresses.has(fieldKey)) this.reportFieldValidity(input, field, nextValues);
            this._ruleClearedFields = new Set(
                [...this._ruleClearedFields].filter((name) => !Object.values(field.fieldKeys || {}).includes(name))
            );
            this.applyValueRules(Object.values(field.fieldKeys || {}).filter(Boolean));
            return;
        }
        input.setCustomValidity?.('');
        const value = field.type === 'checkbox'
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

    handleFieldBlur(event) {
        const input = event.currentTarget;
        const field = this.formFields.find((item) => item.key === input.dataset.fieldKey);
        if (field) this.reportFieldValidity(input, field, this.values);
    }

    reportFieldValidity(input, field, values) {
        const { messages } = getInputText(field, this._config.inputText);
        if (field.type === 'lookup') return input.reportValidity();
        if (field.type === 'address') {
            const errors = ADDRESS_PARTS.map((part) => {
                const key = addressError(field, part, values[field.fieldKeys?.[part]]);
                const label = field[`${part}Label`] || {
                    street: 'street', city: 'city', province: 'state or province',
                    postalCode: 'postal code', country: 'country'
                }[part];
                return [part, key ? formatMessage(messages[key], { part: label }) : ''];
            });
            errors.forEach(([part, message]) => input.setCustomValidityForField?.(message, part));
            const nativeValid = input.reportValidity?.();
            const valid = !errors.some(([, message]) => message) && nativeValid !== false;
            if (valid) this._invalidAddresses.delete(field.key);
            else this._invalidAddresses.add(field.key);
            return valid;
        }
        const error = input.validity?.badInput || input.validity?.badNumericInput
            ? 'badInput' : fieldError(field, values[field.key]);
        const message = error ? formatMessage(messages[error], field) : '';
        input.setCustomValidity?.(message);
        const nativeValid = input.reportValidity();
        return !error && nativeValid !== false;
    }

    async handleSubmit() {
        if (this.isSubmitting) return;
        if (!this.formKey || !this._configLoaded) {
            this.showToast('Form configuration required', 'Load a valid server-side form configuration.', 'error');
            return;
        }
        // Let an input change and its visibility rules render before reading the controls.
        await Promise.resolve();
        if (this.isSubmitting || !this._configLoaded) return;
        const currentValues = this.values;
        const assignments = this.sectionAssignments;
        const visibleFields = this.formFields.filter((field) => this.isItemVisible(field, assignments));
        const inputs = new Map([...this.template.querySelectorAll('[data-field-key]')]
            .map((input) => [input.dataset.fieldKey, input]));
        const invalidFields = visibleFields.filter((field) => {
            const input = inputs.get(field.key);
            return !input || !this.reportFieldValidity(input, field, currentValues);
        });
        if (invalidFields.length) {
            const invalidSections = new Set(invalidFields
                .map((field) => assignments.get(field))
                .filter(Boolean)
                .map((section) => `section-${this._config.items.indexOf(section)}`));
            this.collapsedSections = this.collapsedSections.filter((key) => !invalidSections.has(key));
            await Promise.resolve();
            inputs.get(invalidFields[0].key)?.focus?.();
            return;
        }

        const valueTypes = new Map(visibleFields.flatMap((field) => field.type === 'address'
            ? ADDRESS_PARTS.filter((part) => field.fieldKeys?.[part])
                .map((part) => [
                    field.fieldKeys[part], addressOptions(field, part)?.length ? 'picklist' : part
                ])
            : [[field.key, field.type || 'text']]));
        const visibleFieldKeys = new Set(valueTypes.keys());
        this._ruleClearedFields.forEach((fieldKey) => visibleFieldKeys.add(fieldKey));
        const fields = [...visibleFieldKeys]
            .filter((fieldKey) => Object.prototype.hasOwnProperty.call(currentValues, fieldKey))
            .map((key) => ({
                key,
                valueJson: JSON.stringify(normalizeValue(valueTypes.get(key), currentValues[key]))
            }));
        if (this._config.clearWhenHidden) {
            this.formFields
                .filter((field) => !this.isItemVisible(field, assignments))
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

    isItemVisible(item, assignments) {
        if (this.accordionLayout) {
            const section = assignments.get(item);
            return (!section || this.conditionsPass(section)) && this.conditionsPass(item);
        }
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
