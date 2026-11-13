public class ConditionalRecordFormSubmission {
    @AuraEnabled public String formKey { get; set; }
    @AuraEnabled public String recordId { get; set; }
    @AuraEnabled public List<ConditionalRecordFormFieldValue> fields { get; set; }
}
