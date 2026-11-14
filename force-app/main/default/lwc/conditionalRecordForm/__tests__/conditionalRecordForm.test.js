import { createElement } from 'lwc';
import ConditionalRecordForm from 'c/conditionalRecordForm';
import getFormConfig from '@salesforce/apex/ConditionalRecordFormController.getFormConfig';
import loadFormData from '@salesforce/apex/ConditionalRecordFormController.loadFormData';
import saveRecord from '@salesforce/apex/ConditionalRecordFormController.saveRecord';
import Toast from 'lightning/toast';

jest.mock('@salesforce/apex/ConditionalRecordFormController.getFormConfig', () => {
    const { createApexTestWireAdapter } = require('@salesforce/sfdx-lwc-jest');
    return { default: createApexTestWireAdapter(jest.fn()) };
}, { virtual: true });
jest.mock('@salesforce/apex/ConditionalRecordFormController.loadFormData', () => ({
    default: jest.fn()
}), { virtual: true });
jest.mock('@salesforce/apex/ConditionalRecordFormController.saveRecord', () => ({
    default: jest.fn()
}), { virtual: true });
jest.mock('@salesforce/apex/ConditionalRecordFormController.searchLookup', () => ({
    default: jest.fn().mockResolvedValue([])
}), { virtual: true });
jest.mock('lightning/toast', () => ({ show: jest.fn() }), { virtual: true });

const FORM_KEY = 'JestForm';
const STATUS = `${FORM_KEY}.Status`;
const DETAILS = `${FORM_KEY}.Details`;
const SOURCE = `${FORM_KEY}.Source`;
const TARGET = `${FORM_KEY}.Target`;
const flushPromises = () => Promise.resolve();

const FORM_CONFIG = {
    formKey: FORM_KEY,
    title: 'Wired Jest Form',
    description: 'Configuration loaded from Apex.',
    submitLabel: 'Submit test form',
    columns: 2,
    clearWhenHidden: true,
    items: [
        { kind: 'section', key: 'main', heading: 'Main fields', columns: 2 },
        {
            kind: 'field', key: STATUS, label: 'Status', type: 'picklist', defaultValue: 'Hide',
            options: [{ label: 'Hide', value: 'Hide' }, { label: 'Show', value: 'Show' }]
        },
        {
            kind: 'field', key: DETAILS, label: 'Details', type: 'text',
            visibleWhen: { field: STATUS, operator: 'equals', value: 'Show' }
        },
        { kind: 'field', key: SOURCE, label: 'Source', type: 'text' },
        { kind: 'field', key: TARGET, label: 'Target', type: 'text' },
        { kind: 'field', key: `${FORM_KEY}.AccountId`, label: 'Account', type: 'lookup' },
        { kind: 'text', key: 'help', text: 'Helpful form text' }
    ],
    valueRules: [{
        when: { field: SOURCE, operator: 'isNotBlank' },
        actions: [{ type: 'copy', from: SOURCE, to: TARGET, overwrite: true }]
    }]
};

function createComponent(properties = {}) {
    const element = createElement('c-conditional-record-form', { is: ConditionalRecordForm });
    Object.assign(element, { formKey: FORM_KEY, ...properties });
    document.body.appendChild(element);
    return element;
}

async function emitConfig(config = FORM_CONFIG) {
    getFormConfig.emit(JSON.stringify(config));
    await flushPromises();
    await flushPromises();
}

function findField(element, tagName, name) {
    return [...element.shadowRoot.querySelectorAll(tagName)].find((field) => field.name === name);
}

function changeValue(element, tagName, name, value) {
    const field = findField(element, tagName, name);
    field.value = value;
    field.dispatchEvent(new CustomEvent('change', { detail: { value } }));
}

function makeInputsValid(element) {
    element.shadowRoot
        .querySelectorAll('lightning-input, lightning-combobox, c-conditional-record-lookup')
        .forEach((input) => { input.reportValidity = jest.fn(() => true); });
}

describe('c-conditional-record-form', () => {
    beforeEach(() => {
        loadFormData.mockResolvedValue({ fields: [] });
        saveRecord.mockResolvedValue('00T000000000001AAA');
    });

    afterEach(() => {
        document.body.innerHTML = '';
        jest.clearAllMocks();
    });

    it('renders JSON configuration supplied by the Apex wire', async () => {
        const element = createComponent({ formKey: '  JestForm  ' });
        await emitConfig();

        expect(getFormConfig.getLastConfig()).toEqual({ formKey: FORM_KEY });
        expect(element.shadowRoot.querySelector('lightning-card').title).toBe('Wired Jest Form');
        expect(element.shadowRoot.textContent).toContain('Configuration loaded from Apex.');
        expect(element.shadowRoot.textContent).toContain('Main fields');
        expect(element.shadowRoot.textContent).toContain('Helpful form text');
        expect(findField(element, 'lightning-combobox', STATUS).value).toBe('Hide');
        expect(findField(element, 'lightning-input', DETAILS)).toBeUndefined();
    });

    it('loads existing record values after configuration arrives', async () => {
        loadFormData.mockResolvedValue({ fields: [
            { key: STATUS, valueJson: '"Show"' },
            { key: DETAILS, valueJson: '"Loaded details"' }
        ] });
        const element = createComponent({ recordId: '00T000000000001AAA' });
        await emitConfig();

        expect(loadFormData).toHaveBeenCalledWith({
            formKey: FORM_KEY,
            recordId: '00T000000000001AAA',
            fieldKeys: expect.arrayContaining([STATUS, DETAILS, SOURCE, TARGET])
        });
        expect(findField(element, 'lightning-input', DETAILS).value).toBe('Loaded details');
    });

    it('updates conditional visibility and applies value rules', async () => {
        const element = createComponent();
        await emitConfig();
        changeValue(element, 'lightning-combobox', STATUS, 'Show');
        changeValue(element, 'lightning-input', SOURCE, 'Copied value');
        await flushPromises();

        expect(findField(element, 'lightning-input', DETAILS)).toBeDefined();
        expect(findField(element, 'lightning-input', TARGET).value).toBe('Copied value');
    });

    it('saves values, clears hidden fields, and dispatches success', async () => {
        const success = jest.fn();
        const element = createComponent();
        element.addEventListener('success', success);
        await emitConfig();
        changeValue(element, 'lightning-input', SOURCE, 'Source value');
        await flushPromises();
        makeInputsValid(element);

        expect(await element.submit()).toBe('00T000000000001AAA');
        const payload = JSON.parse(saveRecord.mock.calls[0][0].payloadJson);
        expect(payload.formKey).toBe(FORM_KEY);
        expect(payload.fields).toEqual(expect.arrayContaining([
            { key: STATUS, valueJson: '"Hide"' },
            { key: SOURCE, valueJson: '"Source value"' },
            { key: TARGET, valueJson: '"Source value"' },
            { key: DETAILS, valueJson: 'null' }
        ]));
        expect(Toast.show).toHaveBeenCalledWith(
            { label: 'Saved', message: 'Record saved successfully.', variant: 'success' }, expect.anything()
        );
        expect(success).toHaveBeenCalledWith(expect.objectContaining({
            detail: { id: '00T000000000001AAA' }
        }));
    });

    it('reports configuration, record-load, and save errors', async () => {
        const element = createComponent();
        getFormConfig.error({ message: 'Config failed' });
        await flushPromises();
        expect(Toast.show).toHaveBeenCalledWith(
            { label: 'Unable to load form configuration', message: 'Config failed', variant: 'error' },
            expect.anything()
        );

        Toast.show.mockClear();
        loadFormData.mockRejectedValue({ body: { message: 'Load failed' } });
        element.recordId = '00T000000000001AAA';
        await emitConfig();
        expect(Toast.show).toHaveBeenCalledWith(
            { label: 'Unable to load record', message: 'Load failed', variant: 'error' }, expect.anything()
        );

        Toast.show.mockClear();
        saveRecord.mockRejectedValue({ body: { message: 'Save failed' } });
        makeInputsValid(element);
        const errorHandler = jest.fn();
        element.addEventListener('error', errorHandler);
        await element.submit();
        expect(Toast.show).toHaveBeenCalledWith(
            { label: 'Unable to save record', message: 'Save failed', variant: 'error' }, expect.anything()
        );
        expect(errorHandler).toHaveBeenCalled();
    });

    it('rejects configuration for a different form key', async () => {
        const element = createComponent();
        await emitConfig({ ...FORM_CONFIG, formKey: 'AnotherForm' });

        expect(Toast.show).toHaveBeenCalledWith(
            {
                label: 'Invalid form configuration',
                message: 'The imported config formKey must match the component formKey.',
                variant: 'error'
            },
            expect.anything()
        );
        expect(element.shadowRoot.querySelectorAll('lightning-input')).toHaveLength(0);
    });
});
