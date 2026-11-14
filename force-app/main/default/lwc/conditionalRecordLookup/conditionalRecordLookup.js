import { LightningElement, api } from 'lwc';
import searchLookup from '@salesforce/apex/ConditionalRecordFormController.searchLookup';
import { getInputText, hasControlCharacters, isRecordId, normalizeValue } from 'c/conditionalRecordFormInput';

export default class ConditionalRecordLookup extends LightningElement {
    @api formKey;
    @api fieldKey;
    @api label;
    @api placeholder;
    @api required = false;
    @api inputMessages;
    @api inputHelp;

    searchText = '';
    selectedLabel = '';
    suggestions = [];
    loading = false;
    errorMessage = '';
    _value;
    _resolvedId;
    _searchSequence = 0;
    _keepSearchOnNull = false;

    @api
    get value() {
        return this._value;
    }

    set value(nextValue) {
        if (nextValue !== this._value) {
            this._searchSequence += 1;
            this.loading = false;
            this.suggestions = [];
        }
        this._value = nextValue;
        if (!nextValue) {
            this._resolvedId = undefined;
            this.selectedLabel = '';
            if (!this._keepSearchOnNull) this.searchText = '';
            this._keepSearchOnNull = false;
        }
    }

    get copy() {
        return getInputText({ type: 'lookup', key: this.fieldKey }, {
            messages: { lookup: this.inputMessages }
        });
    }

    get searchPlaceholder() {
        return this.placeholder ?? this.copy.placeholder;
    }

    get hasSuggestions() {
        return this.suggestions.length > 0;
    }

    renderedCallback() {
        if (isRecordId(this._value) && this._resolvedId !== this._value && this.formKey && this.fieldKey) {
            this.resolveSelectedLabel(this._value);
        }
    }

    async resolveSelectedLabel(recordId) {
        this._resolvedId = recordId;
        try {
            const rows = await searchLookup({
                formKey: this.formKey,
                fieldKey: this.fieldKey,
                searchTerm: '',
                selectedRecordId: recordId
            });
            if (this._value === recordId && rows?.length) {
                this.selectedLabel = rows[0].label;
                this.searchText = rows[0].label;
            }
        } catch (error) {
            if (this._value === recordId) {
                this.errorMessage = error?.body?.message || this.copy.messages.lookupLoadFailed;
            }
        }
    }

    async handleSearch(event) {
        const rawTerm = event.target.value || '';
        const searchTerm = normalizeValue('search', rawTerm);
        this.searchText = rawTerm;
        event.currentTarget.setCustomValidity?.('');
        this.selectedLabel = '';
        this.errorMessage = '';
        this.suggestions = [];
        if (this._value) {
            this._value = null;
            this._keepSearchOnNull = true;
            this.dispatchLookupChange(null);
        }
        const requestNumber = ++this._searchSequence;
        if (hasControlCharacters(rawTerm) || searchTerm.length < 2) {
            this.loading = false;
            return;
        }
        this.loading = true;
        try {
            const rows = await searchLookup({
                formKey: this.formKey,
                fieldKey: this.fieldKey,
                searchTerm,
                selectedRecordId: null
            });
            if (requestNumber === this._searchSequence) this.suggestions = rows || [];
        } catch (error) {
            if (requestNumber === this._searchSequence) {
                this.errorMessage = error?.body?.message || this.copy.messages.lookupSearchFailed;
            }
        } finally {
            if (requestNumber === this._searchSequence) this.loading = false;
        }
    }

    handleSelect(event) {
        const recordId = event.currentTarget.dataset.recordId;
        const selected = this.suggestions.find((option) => option.recordId === recordId);
        if (!selected || !isRecordId(selected.recordId)) return;
        this._value = selected.recordId;
        this._resolvedId = selected.recordId;
        this.selectedLabel = selected.label;
        this.searchText = selected.label;
        this.suggestions = [];
        this.errorMessage = '';
        this.template.querySelector('lightning-input').setCustomValidity('');
        this.dispatchLookupChange(selected.recordId);
    }

    handleClear() {
        this._searchSequence += 1;
        this.loading = false;
        this.template.querySelector('lightning-input').setCustomValidity('');
        this._keepSearchOnNull = false;
        this._value = null;
        this._resolvedId = undefined;
        this.selectedLabel = '';
        this.searchText = '';
        this.suggestions = [];
        this.errorMessage = '';
        this.dispatchLookupChange(null);
    }

    dispatchLookupChange(recordId) {
        this.dispatchEvent(new CustomEvent('lookupchange', {
            detail: { fieldKey: this.fieldKey, recordId }
        }));
    }

    @api
    focus() {
        this.template.querySelector('lightning-input')?.focus?.();
    }

    @api
    reportValidity() {
        const input = this.template.querySelector('lightning-input');
        if (!input) return true;
        const messages = this.copy.messages;
        let message = '';
        if (this._value && !isRecordId(this._value)) message = messages.lookupInvalid;
        else if (!this._value && hasControlCharacters(this.searchText)) message = messages.invalidCharacters;
        else if (!this._value && this.required) message = messages.lookupRequired;
        else if (!this._value && this.searchText.trim()) message = messages.lookupUnselected;
        input.setCustomValidity(message);
        const nativeValid = input.reportValidity();
        return !message && nativeValid !== false;
    }
}
