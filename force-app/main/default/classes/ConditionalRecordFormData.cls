public class ConditionalRecordFormData {
    @AuraEnabled public List<ConditionalRecordFormFieldValue> fields { get; set; }

    public ConditionalRecordFormData() {
        fields = new List<ConditionalRecordFormFieldValue>();
    }
}
