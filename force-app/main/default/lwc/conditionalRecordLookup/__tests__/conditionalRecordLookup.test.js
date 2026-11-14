import { createElement } from 'lwc';
import ConditionalRecordLookup from 'c/conditionalRecordLookup';
import searchLookup from '@salesforce/apex/ConditionalRecordFormController.searchLookup';

jest.mock('@salesforce/apex/ConditionalRecordFormController.searchLookup', () => ({
    default: jest.fn()
}), { virtual: true });

const flushPromises = () => Promise.resolve();

function createComponent(properties = {}) {
    const element = createElement('c-conditional-record-lookup', {
        is: ConditionalRecordLookup
    });
    Object.assign(element, {
        formKey: 'JestForm',
        fieldKey: 'JestForm.AccountId',
        label: 'Account',
        ...properties
    });
    document.body.appendChild(element);
    return element;
}

function search(element, value) {
    const input = element.shadowRoot.querySelector('lightning-input');
    input.value = value;
    input.dispatchEvent(new CustomEvent('change', { detail: { value } }));
}

describe('c-conditional-record-lookup', () => {
    afterEach(() => {
        document.body.innerHTML = '';
        jest.clearAllMocks();
    });

    it('does not search until at least two characters are entered', async () => {
        const element = createComponent();
        search(element, 'A');
        await flushPromises();

        expect(searchLookup).not.toHaveBeenCalled();
        expect(element.shadowRoot.querySelector('.suggestions')).toBeNull();
    });

    it('searches, renders suggestions, and dispatches the selected record', async () => {
        searchLookup.mockResolvedValue([
            { recordId: '001000000000001AAA', label: 'Acme' },
            { recordId: '001000000000002AAA', label: 'Global Media' }
        ]);
        const handler = jest.fn();
        const element = createComponent();
        element.addEventListener('lookupchange', handler);

        search(element, 'Ac');
        await flushPromises();
        await flushPromises();

        expect(searchLookup).toHaveBeenCalledWith({
            formKey: 'JestForm',
            fieldKey: 'JestForm.AccountId',
            searchTerm: 'Ac',
            selectedRecordId: null
        });
        const suggestions = element.shadowRoot.querySelectorAll('.suggestion');
        expect(suggestions).toHaveLength(2);
        expect(suggestions[0].textContent).toBe('Acme');

        suggestions[0].click();
        await flushPromises();

        expect(element.value).toBe('001000000000001AAA');
        expect(element.shadowRoot.querySelector('lightning-input').value).toBe('Acme');
        expect(handler).toHaveBeenCalledWith(expect.objectContaining({
            detail: {
                fieldKey: 'JestForm.AccountId',
                recordId: '001000000000001AAA'
            }
        }));
        expect(element.shadowRoot.querySelector('.suggestions')).toBeNull();
    });

    it('clears a selected record and dispatches a null value', async () => {
        searchLookup.mockResolvedValue([{ recordId: '001000000000001AAA', label: 'Acme' }]);
        const handler = jest.fn();
        const element = createComponent();
        element.addEventListener('lookupchange', handler);
        search(element, 'Ac');
        await flushPromises();
        await flushPromises();
        element.shadowRoot.querySelector('.suggestion').click();
        await flushPromises();
        handler.mockClear();

        element.shadowRoot.querySelector('lightning-button-icon').click();
        await flushPromises();

        expect(element.value).toBeNull();
        expect(element.shadowRoot.querySelector('lightning-input').value).toBe('');
        expect(handler).toHaveBeenCalledWith(expect.objectContaining({
            detail: { fieldKey: 'JestForm.AccountId', recordId: null }
        }));
    });

    it('resolves the label for a preselected record', async () => {
        searchLookup.mockResolvedValue([{ recordId: '001000000000001AAA', label: 'Existing Account' }]);
        const element = createComponent({ value: '001000000000001AAA' });
        await flushPromises();
        await flushPromises();

        expect(searchLookup).toHaveBeenCalledWith({
            formKey: 'JestForm',
            fieldKey: 'JestForm.AccountId',
            searchTerm: '',
            selectedRecordId: '001000000000001AAA'
        });
        expect(element.shadowRoot.querySelector('lightning-input').value).toBe('Existing Account');
        expect(element.shadowRoot.querySelector('lightning-button-icon')).not.toBeNull();
    });

    it('shows Apex search and selected-label errors', async () => {
        searchLookup.mockRejectedValueOnce({ body: { message: 'Search unavailable' } });
        const element = createComponent();
        search(element, 'Ac');
        await flushPromises();
        await flushPromises();
        expect(element.shadowRoot.querySelector('[role="alert"]').textContent).toBe('Search unavailable');

        document.body.innerHTML = '';
        searchLookup.mockRejectedValueOnce({ body: { message: 'Record unavailable' } });
        const selectedElement = createComponent({ value: '001000000000001AAA' });
        await flushPromises();
        await flushPromises();
        expect(selectedElement.shadowRoot.querySelector('[role="alert"]').textContent)
            .toBe('Record unavailable');
    });

    it('ignores a stale search response', async () => {
        let resolveFirst;
        const firstResponse = new Promise((resolve) => {
            resolveFirst = resolve;
        });
        searchLookup
            .mockReturnValueOnce(firstResponse)
            .mockResolvedValueOnce([{ recordId: '001000000000002AAA', label: 'New result' }]);
        const element = createComponent();

        search(element, 'Ac');
        search(element, 'New');
        await flushPromises();
        await flushPromises();
        resolveFirst([{ recordId: '001000000000001AAA', label: 'Stale result' }]);
        await flushPromises();

        expect(element.shadowRoot.querySelectorAll('.suggestion')).toHaveLength(1);
        expect(element.shadowRoot.querySelector('.suggestion').textContent).toBe('New result');
    });

    it('reports required-field validity through the underlying input', () => {
        const element = createComponent({ required: true });
        const input = element.shadowRoot.querySelector('lightning-input');
        input.setCustomValidity = jest.fn();
        input.reportValidity = jest.fn(() => false);

        expect(element.reportValidity()).toBe(false);
        expect(input.setCustomValidity).toHaveBeenCalledWith('Select a related record.');
        expect(input.reportValidity).toHaveBeenCalledTimes(1);
    });
});
