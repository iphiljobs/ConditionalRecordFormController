export const INPUT_TYPES = new Set([
    'text', 'email', 'tel', 'number', 'date', 'time', 'datetime',
    'checkbox', 'url', 'password', 'search'
]);

export const ADDRESS_PARTS = ['street', 'city', 'province', 'postalCode', 'country'];

const PLACEHOLDERS = {
    text: 'Enter text',
    email: 'name@example.com',
    tel: '+1 555 010 1234',
    number: 'Enter a number',
    date: 'Choose a date',
    time: 'Choose a time',
    url: 'https://example.com',
    password: 'Enter a password',
    search: 'Enter a search term',
    picklist: 'Select an option',
    lookup: 'Enter at least 2 characters',
    address: {
        street: 'Street and unit',
        city: 'City or locality',
        province: 'State or region',
        postalCode: 'ZIP or postal code',
        country: 'Country or territory'
    }
};

const HELP_TEXT = {
    datetime: 'Enter a date and time using the displayed format.'
};

const MESSAGES = {
    required: 'Complete this field.',
    badInput: 'Enter a valid value.',
    typeMismatch: 'Enter a value in the expected format.',
    patternMismatch: 'Enter a value that matches the expected format.',
    tooShort: 'Enter at least {minLength} characters.',
    tooLong: 'Enter no more than {maxLength} characters.',
    rangeUnderflow: 'Enter a value on or after the minimum of {min}.',
    rangeOverflow: 'Enter a value on or before the maximum of {max}.',
    stepMismatch: 'Enter a value in increments of {step}.',
    invalidCharacters: 'Remove unsupported control characters.',
    invalidOption: 'Select an available option.',
    invalidCheckbox: 'Choose a valid checkbox value.',
    addressRequired: 'Enter a value for {part}.',
    addressOption: 'Select an available option for {part}.',
    addressCharacters: 'Remove unsupported control characters from {part}.',
    lookupRequired: 'Select a related record.',
    lookupInvalid: 'Select a valid related record.',
    lookupUnselected: 'Select a related record or clear the search text.',
    lookupSearchFailed: 'Unable to search related records.',
    lookupLoadFailed: 'Unable to load the selected related record.'
};

const TYPE_MESSAGES = {
    email: { typeMismatch: 'Enter an email address such as name@example.com.' },
    tel: { badInput: 'Enter a valid phone number, including the country code if needed.' },
    url: { typeMismatch: 'Enter a complete URL starting with https:// or http://.' },
    number: {
        badInput: 'Enter a valid number.',
        rangeUnderflow: 'Enter a number greater than or equal to {min}.',
        rangeOverflow: 'Enter a number less than or equal to {max}.'
    },
    date: { badInput: 'Enter a valid date.' },
    time: { badInput: 'Enter a valid time.' },
    datetime: { badInput: 'Enter a valid date and time.' },
    checkbox: { required: 'Select this checkbox to continue.' },
    picklist: { required: 'Select an option.' }
};

const SINGLE_LINE_CONTROLS = /[\u0000-\u001F\u007F-\u009F]/u;
const MULTILINE_CONTROLS = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/u;
const SALESFORCE_ID = /^[a-zA-Z0-9]{15}(?:[a-zA-Z0-9]{3})?$/u;
const PHONE = /^(?=.*\d)\+?[\d\p{Zs}()./\-–]+(?:[\p{Zs}]*(?:ext(?:ension)?\.?|x|#|;ext=)[\p{Zs}]*\d+)?$/iu;
const NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/iu;
const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?Z?$/u;
const DATETIME = /^(\d{4}-\d{2}-\d{2})T((?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?)(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u;
const TEXT_LENGTH_TYPES = new Set(['text', 'email', 'tel', 'url', 'password', 'search']);

export function getInputText(field, inputText) {
    const type = field.type || 'text';
    const fieldText = inputText?.fields?.[field.key];
    const typePlaceholder = inputText?.placeholders?.[type];
    const placeholders = type === 'address'
        ? { ...PLACEHOLDERS.address, ...typePlaceholder, ...fieldText?.placeholder }
        : undefined;
    const messages = {
        ...MESSAGES,
        ...TYPE_MESSAGES[type],
        ...inputText?.messages?.all,
        ...inputText?.messages?.[type],
        ...fieldText?.messages
    };

    return {
        placeholder: type === 'address' ? undefined
            : fieldText?.placeholder ?? field.placeholder ?? typePlaceholder ?? PLACEHOLDERS[type],
        addressPlaceholders: placeholders,
        help: fieldText?.help ?? field.fieldLevelHelp ?? inputText?.help?.[type] ?? HELP_TEXT[type],
        messages: Object.fromEntries(Object.entries(MESSAGES).map(([key, fallback]) => [
            key, typeof messages[key] === 'string' && messages[key] ? messages[key] : fallback
        ]))
    };
}

export function formatMessage(message, values) {
    return message.replace(/\{(\w+)\}/g, (match, key) =>
        Object.prototype.hasOwnProperty.call(values, key) ? values[key] ?? match : match
    );
}

export function normalizeValue(type, value) {
    if (typeof value !== 'string' || type === 'password') return value;
    if (type === 'street') return value.replace(/\r\n?/g, '\n').trim();
    if (type === 'checkbox' && (value === 'true' || value === 'false')) return value === 'true';
    if (type === 'datetime') {
        const parts = value.match(DATETIME);
        if (parts && validDate(parts[1])) {
            const date = new Date(value);
            if (Number.isFinite(date.getTime())) return date.toISOString();
        }
    }
    // Selection values are exact identifiers defined by the configuration.
    return type === 'picklist' || type === 'lookup' ? value : value.trim();
}

export function isRecordId(value) {
    return typeof value === 'string' && SALESFORCE_ID.test(value);
}

export function hasControlCharacters(value, multiline = false) {
    return typeof value === 'string' &&
        (multiline ? MULTILINE_CONTROLS : SINGLE_LINE_CONTROLS).test(value);
}

function validDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(value) || value.startsWith('0000-')) return false;
    const date = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isWebUrl(value) {
    if (!/^https?:\/\/[^/\s]/iu.test(value) || /[\s\\]/u.test(value)) return false;
    try {
        const url = new URL(value);
        return Boolean(url.hostname) && !url.username && !url.password;
    } catch {
        return false;
    }
}

export function fieldError(field, rawValue) {
    const type = field.type || 'text';
    if (hasControlCharacters(rawValue)) return 'invalidCharacters';
    const value = normalizeValue(type, rawValue);
    if (type === 'checkbox') {
        if (field.required && value !== true) return 'required';
        return value != null && typeof value !== 'boolean' ? 'invalidCheckbox' : '';
    }
    if (value == null || value === '') return field.required ? 'required' : '';

    const text = String(value);
    if (TEXT_LENGTH_TYPES.has(type)) {
        if (field.minLength != null && text.length < field.minLength) return 'tooShort';
        if (field.maxLength != null && text.length > field.maxLength) return 'tooLong';
    }
    switch (type) {
        case 'picklist':
            return field.options?.some((option) => option.value === value) ? '' : 'invalidOption';
        case 'lookup':
            return isRecordId(value) ? '' : 'lookupInvalid';
        case 'email':
            return /^[^\s@]+@[^\s@]+$/u.test(text) ? '' : 'typeMismatch';
        case 'url':
            return isWebUrl(text) ? '' : 'typeMismatch';
        case 'tel':
            return PHONE.test(text) ? '' : 'badInput';
        case 'number':
            return NUMBER.test(text) && Number.isFinite(Number(text)) ? '' : 'badInput';
        case 'date':
            return validDate(text) ? '' : 'badInput';
        case 'time':
            return TIME.test(text) ? '' : 'badInput';
        case 'datetime': {
            const parts = text.match(DATETIME);
            return parts && validDate(parts[1]) && Number.isFinite(Date.parse(text)) ? '' : 'badInput';
        }
        default:
            return '';
    }
}

const US_COUNTRY = 'United States';
const US_STATES = [
    'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut',
    'Delaware', 'District of Columbia', 'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois',
    'Indiana', 'Iowa', 'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland', 'Massachusetts',
    'Michigan', 'Minnesota', 'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada',
    'New Hampshire', 'New Jersey', 'New Mexico', 'New York', 'North Carolina', 'North Dakota',
    'Ohio', 'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota',
    'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington', 'West Virginia',
    'Wisconsin', 'Wyoming'
].map((name) => ({ label: name, value: name }));

export function addressCountryDefault(field) {
    const options = addressOptions(field, 'country');
    const value = field.defaultCountry ?? (field.addressPreset === 'US' ? US_COUNTRY : undefined);
    return value && (!options?.length || options.some((option) => option.value === value))
        ? value : undefined;
}

export function addressOptions(field, part) {
    if (part === 'country') {
        return field.countryOptions ?? (field.addressPreset === 'US' ? [{ label: US_COUNTRY, value: US_COUNTRY }] : undefined);
    }
    if (part === 'province') {
        return field.provinceOptions ?? (field.addressPreset === 'US' ? US_STATES : undefined);
    }
    return undefined;
}

export function addressError(field, part, rawValue) {
    if (!field.fieldKeys?.[part]) return '';
    const options = addressOptions(field, part);
    const value = normalizeValue(options?.length ? 'picklist' : part, rawValue);
    const isStreet = part === 'street';
    const addressText = isStreet && typeof rawValue === 'string' ? rawValue.replace(/\r\n?/g, '\n') : rawValue;
    if (hasControlCharacters(addressText, isStreet)) return 'addressCharacters';
    if (!value) return field.required ? 'addressRequired' : '';
    return options?.length && !options.some((option) => option.value === value) ? 'addressOption' : '';
}
