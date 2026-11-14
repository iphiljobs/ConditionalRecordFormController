import { createElement } from 'lwc';
import ConditionalRecordForm from 'c/conditionalRecordForm';
import getFormConfig from '@salesforce/apex/ConditionalRecordFormController.getFormConfig';
import loadFormData from '@salesforce/apex/ConditionalRecordFormController.loadFormData';
import saveRecord from '@salesforce/apex/ConditionalRecordFormController.saveRecord';
import Toast from 'lightning/toast';
import { addressError, fieldError, normalizeValue } from 'c/conditionalRecordFormInput';

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
        expect(element.shadowRoot.querySelector('button[data-section-id]')).toBeNull();
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

    it('shows configured field copy and blocks an unsafe URL before event submission', async () => {
        const urlKey = `${FORM_KEY}.Url`;
        const element = createComponent();
        const submitted = jest.fn();
        element.addEventListener('formsubmit', submitted);
        await emitConfig({
            formKey: FORM_KEY,
            submissionMode: 'event',
            inputText: {
                placeholders: { url: 'https://website.example' },
                fields: { [urlKey]: { messages: { typeMismatch: 'Use a web URL.' } } }
            },
            items: [{ key: urlKey, label: 'Website', type: 'url' }]
        });
        const input = findField(element, 'lightning-input', urlKey);
        input.setCustomValidity = jest.fn();
        expect(input.placeholder).toBe('https://website.example');

        changeValue(element, 'lightning-input', urlKey, 'javascript:alert(1)');
        await element.submit();
        expect(input.setCustomValidity).toHaveBeenLastCalledWith('Use a web URL.');
        expect(submitted).not.toHaveBeenCalled();

        changeValue(element, 'lightning-input', urlKey, ' https://example.com ');
        await element.submit();
        expect(input.setCustomValidity).toHaveBeenLastCalledWith('');
        expect(submitted.mock.calls[0][0].detail.fields).toEqual([
            { key: urlKey, valueJson: '"https://example.com"' }
        ]);
    });

    it('reports a configured error for each incomplete mapped address part', async () => {
        const element = createComponent();
        await emitConfig({
            formKey: FORM_KEY,
            inputText: {
                placeholders: { address: { city: 'Enter your locality' } },
                messages: { address: { addressRequired: 'Add the {part}.' } }
            },
            items: [{
                key: 'address', label: 'Address', type: 'address', required: true,
                fieldKeys: { city: `${FORM_KEY}.City` }
            }]
        });
        const input = element.shadowRoot.querySelector('lightning-input-address');
        input.setCustomValidityForField = jest.fn();
        expect(input.cityPlaceholder).toBe('Enter your locality');

        await element.submit();
        expect(input.setCustomValidityForField).toHaveBeenCalledWith('Add the city.', 'city');
        expect(input.setCustomValidityForField).toHaveBeenCalledWith('', 'street');
        expect(saveRecord).not.toHaveBeenCalled();
    });

    it('opens a collapsed section with an invalid field and retains entered values', async () => {
        const element = createComponent();
        const submitted = jest.fn();
        element.addEventListener('formsubmit', submitted);
        await emitConfig({
            formKey: FORM_KEY,
            sectionLayout: 'accordion',
            submissionMode: 'event',
            clearWhenHidden: true,
            items: [
                { kind: 'section', key: 'first', heading: 'First' },
                { key: SOURCE, label: 'Source', type: 'text' },
                { kind: 'section', key: 'second', heading: 'Second' },
                { key: TARGET, label: 'Target', type: 'text', required: true },
                { key: DETAILS, label: 'Details', type: 'text', sectionKey: 'first' }
            ]
        });

        const [first, second] = element.shadowRoot.querySelectorAll('button[data-section-id]');
        const panels = [...element.shadowRoot.querySelectorAll('[id]')];
        const firstPanel = panels.find((panel) => panel.id === first.getAttribute('aria-controls'));
        const secondPanel = panels.find((panel) => panel.id === second.getAttribute('aria-controls'));
        expect(firstPanel.querySelector('[data-field-key="JestForm.Details"]')).toBeTruthy();
        expect(secondPanel.querySelector('[data-field-key="JestForm.Target"]')).toBeTruthy();

        changeValue(element, 'lightning-input', SOURCE, 'Keep this value');
        first.click();
        second.click();
        await flushPromises();
        expect(first.getAttribute('aria-expanded')).toBe('false');
        expect(firstPanel.hidden).toBe(true);
        expect(secondPanel.hidden).toBe(true);

        await element.submit();
        expect(submitted).not.toHaveBeenCalled();
        expect(firstPanel.hidden).toBe(true);
        expect(secondPanel.hidden).toBe(false);

        changeValue(element, 'lightning-input', TARGET, 'Valid now');
        await element.submit();
        expect(submitted.mock.calls[0][0].detail.fields).toEqual([
            { key: SOURCE, valueJson: '"Keep this value"' },
            { key: TARGET, valueJson: '"Valid now"' }
        ]);
    });

    it('honors section visibility for implicitly grouped fields in accordion mode', async () => {
        const element = createComponent();
        await emitConfig({
            formKey: FORM_KEY,
            sectionLayout: 'accordion',
            clearWhenHidden: true,
            submissionMode: 'event',
            items: [
                { key: SOURCE, label: 'Source', type: 'text' },
                {
                    kind: 'section', key: 'details', heading: 'Details',
                    visibleWhen: { field: SOURCE, operator: 'isNotBlank' }
                },
                { key: DETAILS, label: 'Details', type: 'text', required: true }
            ]
        });
        expect(findField(element, 'lightning-input', DETAILS)).toBeUndefined();
        expect(await element.submit()).toEqual([{ key: DETAILS, valueJson: 'null' }]);
        changeValue(element, 'lightning-input', SOURCE, 'Show');
        await flushPromises();
        expect(findField(element, 'lightning-input', DETAILS)).toBeDefined();
    });

    it('hides the default country and submits it only when state is populated', async () => {
        const country = `${FORM_KEY}.Country`;
        const province = `${FORM_KEY}.Province`;
        const element = createComponent();
        await emitConfig({
            formKey: FORM_KEY, submissionMode: 'event',
            items: [{
                key: 'address', label: 'Address', type: 'address', addressPreset: 'US',
                fieldKeys: { country, province }
            }]
        });
        const state = element.shadowRoot.querySelector('[data-address-part="province"]');
        expect(element.shadowRoot.querySelector('[data-address-part="country"]')).toBeNull();
        expect(element.shadowRoot.querySelector('lightning-input-address')).toBeNull();
        expect(state.options).toHaveLength(51);
        expect(await element.submit()).toEqual([]);

        state.dispatchEvent(new CustomEvent('change', { detail: { value: 'Florida' } }));
        expect(await element.submit()).toEqual(expect.arrayContaining([
            { key: province, valueJson: '"Florida"' },
            { key: country, valueJson: '"United States"' }
        ]));

        state.dispatchEvent(new CustomEvent('change', { detail: { value: '' } }));
        expect(await element.submit()).toEqual([{ key: province, valueJson: '""' }]);
    });

    it('preserves an existing country and uses custom country and state options', async () => {
        const country = `${FORM_KEY}.Country`;
        const province = `${FORM_KEY}.Province`;
        loadFormData.mockResolvedValue({ fields: [
            { key: country, valueJson: '"CA"' }, { key: province, valueJson: '"ON"' }
        ] });
        const element = createComponent({ recordId: '001000000000001AAA' });
        await emitConfig({
            formKey: FORM_KEY, submissionMode: 'event',
            items: [{
                key: 'address', label: 'Address', type: 'address', addressPreset: 'US',
                fieldKeys: { country, province }, defaultCountry: 'US',
                countryOptions: [{ label: 'United States', value: 'US' }, { label: 'Canada', value: 'CA' }],
                provinceOptions: [{ label: 'Ontario', value: 'ON' }]
            }]
        });
        const state = element.shadowRoot.querySelector('[data-address-part="province"]');
        expect(element.shadowRoot.querySelector('[data-address-part="country"]')).toBeNull();
        expect(state.options).toEqual([{ label: 'Ontario', value: 'ON' }]);
        expect(await element.submit()).toEqual([
            { key: province, valueJson: '"ON"' }, { key: country, valueJson: '"CA"' }
        ]);
    });

    it('omits both countries when the mirrored state is cleared before Apex save', async () => {
        const billingState = `${FORM_KEY}.BillingState`;
        const billingCountry = `${FORM_KEY}.BillingCountry`;
        const mailingState = `${FORM_KEY}.MailingState`;
        const mailingCountry = `${FORM_KEY}.MailingCountry`;
        const same = `${FORM_KEY}.Same`;
        const when = { field: same, operator: 'equals', value: true };
        const element = createComponent();
        await emitConfig({
            formKey: FORM_KEY,
            items: [
                { key: 'billing', type: 'address', addressPreset: 'US', fieldKeys: { province: billingState, country: billingCountry } },
                { key: same, type: 'checkbox', clientOnly: true },
                { key: 'mailing', type: 'address', addressPreset: 'US', fieldKeys: { province: mailingState, country: mailingCountry }, readOnlyWhen: when }
            ],
            valueRules: [{
                when,
                actions: [
                    { type: 'copy', from: billingState, to: mailingState, overwrite: true },
                    { type: 'copy', from: billingCountry, to: mailingCountry, overwrite: true }
                ]
            }]
        });
        const toggle = findField(element, 'lightning-input', same);
        toggle.checked = true;
        toggle.dispatchEvent(new CustomEvent('change'));
        const [billing, mailing] = element.shadowRoot.querySelectorAll('[data-address-part="province"]');
        billing.dispatchEvent(new CustomEvent('change', { detail: { value: 'Florida' } }));
        await element.submit();
        expect(mailing.disabled).toBe(true);
        expect(mailing.value).toBe('Florida');
        expect(JSON.parse(saveRecord.mock.calls[0][0].payloadJson).fields).toEqual(expect.arrayContaining([
            { key: billingCountry, valueJson: '"United States"' },
            { key: mailingCountry, valueJson: '"United States"' }
        ]));

        billing.dispatchEvent(new CustomEvent('change', { detail: { value: '' } }));
        await element.submit();
        expect(mailing.value).toBe('');
        expect(JSON.parse(saveRecord.mock.calls[1][0].payloadJson).fields).toEqual([
            { key: billingState, valueJson: '""' }, { key: mailingState, valueJson: '""' }
        ]);
    });

    it('mirrors billing while checked and submits only the mapped address values', async () => {
        const same = `${FORM_KEY}.SameAsBilling`;
        const parts = ['street', 'city', 'province', 'postalCode', 'country'];
        const addressKeys = (prefix) => Object.fromEntries(parts.map((part) => [part, `${FORM_KEY}.${prefix}_${part}`]));
        const billingKeys = addressKeys('Billing');
        const mailingKeys = addressKeys('Mailing');
        const when = { field: same, operator: 'equals', value: true };
        const element = createComponent();
        await emitConfig({
            formKey: FORM_KEY, submissionMode: 'event',
            items: [
                { key: 'billing', label: 'Billing', type: 'address', fieldKeys: billingKeys },
                { key: same, label: 'Same as billing', type: 'checkbox', clientOnly: true, defaultValue: false },
                { key: 'mailing', label: 'Mailing', type: 'address', fieldKeys: mailingKeys, readOnlyWhen: when }
            ],
            valueRules: [{
                when,
                actions: parts.map((part) => ({
                    type: 'copy', from: billingKeys[part], to: mailingKeys[part], overwrite: true, clearIfMissing: true
                }))
            }]
        });
        const toggle = findField(element, 'lightning-input', same);
        const [billing, mailing] = element.shadowRoot.querySelectorAll('lightning-input-address');
        const changeAddress = (address, parts) => {
            Object.assign(address, parts);
            address.dispatchEvent(new CustomEvent('change'));
        };
        const toggleMirror = async (checked) => {
            toggle.checked = checked;
            toggle.dispatchEvent(new CustomEvent('change'));
            await flushPromises();
        };

        changeAddress(mailing, { street: 'Old address', city: 'Old city' });
        await flushPromises();
        await toggleMirror(true);
        expect(mailing.street).toBe('');
        expect(mailing.city).toBe('');
        expect(mailing.disabled).toBe(true);
        expect(billing.disabled).toBe(false);

        const updated = {
            street: 'New address', city: 'Tampa', province: 'Florida', postalCode: '33647', country: 'United States'
        };
        changeAddress(billing, updated);
        await flushPromises();
        expect(mailing).toMatchObject({ ...updated, disabled: true });

        changeAddress(mailing, { street: 'Attempted override' });
        // Restore the Jest stub property after simulating an event on the disabled control.
        mailing.street = updated.street;
        const beforeRevision = await element.submit();
        expect(beforeRevision).toContainEqual({ key: mailingKeys.street, valueJson: '"New address"' });

        const revised = { ...updated, city: '', postalCode: '33602' };
        changeAddress(billing, revised);
        const submitted = await element.submit();
        expect(mailing).toMatchObject({ ...revised, disabled: true });
        expect(submitted).toHaveLength(10);
        expect(Object.fromEntries(submitted.map(({ key, valueJson }) => [key, JSON.parse(valueJson)])))
            .toEqual(Object.fromEntries([billingKeys, mailingKeys].flatMap((keys) =>
                parts.map((part) => [keys[part], revised[part]]))));

        await toggleMirror(false);
        expect(mailing.disabled).toBe(false);
        changeAddress(billing, { street: 'Another address', city: 'Orlando' });
        await flushPromises();
        expect(mailing.street).toBe('New address');
        expect(mailing.city).toBe('');
        changeAddress(mailing, { city: 'Orlando' });
        expect(await element.submit()).toContainEqual({ key: mailingKeys.city, valueJson: '"Orlando"' });
    });

    it('excludes client-only fields from record loading and hidden or rule-cleared save paths', async () => {
        const clientKey = `${FORM_KEY}.Local`;
        const localStreet = `${FORM_KEY}.LocalStreet`;
        const element = createComponent({ recordId: '001000000000001AAA' });
        await emitConfig({
            formKey: FORM_KEY, clearWhenHidden: true,
            items: [
                { key: SOURCE, label: 'Source', type: 'text' },
                {
                    key: clientKey, label: 'Local', type: 'text', clientOnly: true, defaultValue: 'local',
                    visibleWhen: { field: SOURCE, operator: 'isBlank' }
                },
                { key: 'localAddress', label: 'Local address', type: 'address', clientOnly: true, fieldKeys: { street: localStreet } }
            ],
            valueRules: [{
                when: { field: SOURCE, operator: 'isNotBlank' },
                actions: [{ type: 'clear', fields: [clientKey, localStreet] }]
            }]
        });
        expect(loadFormData).toHaveBeenCalledWith(expect.objectContaining({ fieldKeys: [SOURCE] }));
        changeValue(element, 'lightning-input', SOURCE, 'Save this');
        await element.submit();
        expect(JSON.parse(saveRecord.mock.calls[0][0].payloadJson).fields).toEqual([
            { key: SOURCE, valueJson: '"Save this"' }
        ]);
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


describe('input validation and normalization', () => {
    it.each([
        [{ type: 'text', required: true }, '   ', 'required'],
        [{ type: 'search' }, 'bad\u0000term', 'invalidCharacters'],
        [{ type: 'email' }, 'name.example.com', 'typeMismatch'],
        [{ type: 'tel' }, '+91 555-1234 ext. 2', ''],
        [{ type: 'tel' }, 'unknown', 'badInput'],
        [{ type: 'number' }, '1e999', 'badInput'],
        [{ type: 'date' }, '2026-02-29', 'badInput'],
        [{ type: 'time' }, '24:00', 'badInput'],
        [{ type: 'datetime' }, '2026-11-13T13:00:00-05:00', ''],
        [{ type: 'checkbox', required: true }, false, 'required'],
        [{ type: 'password', minLength: 4 }, '  x ', ''],
        [{ type: 'picklist', options: [{ value: '01' }] }, '1', 'invalidOption'],
        [{ type: 'lookup' }, 'wrong', 'lookupInvalid']
    ])('validates %j with value %p', (field, value, expected) => {
        expect(fieldError(field, value)).toBe(expected);
    });

    it('preserves password whitespace, normalizes street line endings and converts offsets to UTC', () => {
        expect(normalizeValue('password', '  x ')).toBe('  x ');
        expect(normalizeValue('street', ' Main St\r\nApt 2 ')).toBe('Main St\nApt 2');
        expect(normalizeValue('datetime', '2026-11-13T13:00:00-05:00')).toBe('2026-11-13T18:00:00.000Z');
        expect(addressError({
            fieldKeys: { country: 'Test.Country' }, countryOptions: [{ value: 'CA' }]
        }, 'country', 'US')).toBe('addressOption');
    });
});
