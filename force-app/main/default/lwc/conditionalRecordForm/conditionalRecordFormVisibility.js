// Add custom synchronous, side-effect-free evaluators to this allowlist.
// Refer to configured fields with their fully qualified logical keys: FormKey.FieldKey.
export const VISIBILITY_EVALUATORS = Object.freeze({
    isValueInList: ({ values, args = {} }) => {
        return Boolean(args.field) &&
            Array.isArray(args.allowedValues) &&
            args.allowedValues.includes(values[args.field]);
    },

    areFieldsNonBlank: ({ values, args = {} }) => {
        const fields = Array.isArray(args.fields) ? args.fields : [];
        return fields.length > 0 && fields.every((field) => {
            const value = values[field];
            return value !== null && value !== undefined && String(value).trim() !== '';
        });
    }
});
