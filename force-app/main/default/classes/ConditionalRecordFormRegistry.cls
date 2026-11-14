public class ConditionalRecordFormRegistry {
    public static ConditionalRecordFormDefinition getDefinition(String formKey) {
        if (String.isBlank(formKey)) {
            throw new AuraHandledException('The form key is required.');
        }

        // Add one allowlisted provider per form. Never accept an Apex class name from the client.
        if (formKey == 'ApplicationForm') return new ApplicationFormDefinition();
        throw new AuraHandledException('This form is not configured.');
    }
}
