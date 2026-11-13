import { LightningElement, api } from 'lwc';
import searchLookup from '@salesforce/apex/ConditionalRecordFormController.searchLookup';

export default class ConditionalRecordLookup extends LightningElement {
    @api formKey;
    @api fieldKey;
    @api label;
    @api placeholder;
    @api required = false;

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
        this._value = nextValue;
        if (!nextValue) {
            this._resolvedId = undefined;
            this.selectedLabel = '';
            if (!this._keepSearchOnNull) this.searchText = '';
            this._keepSearchOnNull = false;
        }
    }

    get hasSuggestions() {
        return this.suggestions.length > 0;
    }

    renderedCallback() {
        if (this._value && this._resolvedId !== this._value && this.formKey && this.fieldKey) {
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
            this.errorMessage = error?.body?.message || 'Unable to load the selected related record.';
        }
    }

    async handleSearch(event) {
        const searchTerm = event.target.value || '';
        this.searchText = searchTerm;
        this.selectedLabel = '';
        this.errorMessage = '';
        this.suggestions = [];
        if (this._value) {
            this._value = null;
            this._keepSearchOnNull = true;
            this.dispatchLookupChange(null);
        }
        const requestNumber = ++this._searchSequence;
        if (searchTerm.trim().length < 2) {
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
                this.errorMessage = error?.body?.message || 'Unable to search related records.';
            }
        } finally {
            if (requestNumber === this._searchSequence) this.loading = false;
        }
    }

    handleSelect(event) {
        const recordId = event.currentTarget.dataset.recordId;
        const selected = this.suggestions.find((option) => option.recordId === recordId);
        if (!selected) return;
        this._value = selected.recordId;
        this._resolvedId = selected.recordId;
        this.selectedLabel = selected.label;
        this.searchText = selected.label;
        this.suggestions = [];
        this.errorMessage = '';
        this.dispatchLookupChange(selected.recordId);
    }

    handleClear() {
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
    reportValidity() {
        const input = this.template.querySelector('lightning-input');
        if (!input) return true;
        input.setCustomValidity(this.required && !this._value ? 'Select a related record.' : '');
        return input.reportValidity();
    }
}
