public interface ConditionalRecordFormDefinition {
    String getFormKey();
    String getObjectApiName();
    String getConfigJson();
    Map<String, String> getFieldApiNames();
    Map<String, String> getLookupObjectApiNames();
}
