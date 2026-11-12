public with sharing class ConditionalRecordFormController {
    @AuraEnabled
    public static String saveRecord(String payloadJson) {
        try {
            if (String.isBlank(payloadJson)) {
                throw new AuraHandledException('The form submission is empty.');
            }

            Map<String, Object> payload = (Map<String, Object>) JSON.deserializeUntyped(payloadJson);
            String objectApiName = (String) payload.get('objectApiName');
            if (String.isBlank(objectApiName)) {
                throw new AuraHandledException('Object API name is required.');
            }

            Schema.SObjectType objectType = Schema.getGlobalDescribe().get(objectApiName);
            if (objectType == null) {
                throw new AuraHandledException('Unknown Salesforce object: ' + objectApiName);
            }

            Schema.DescribeSObjectResult objectDescribe = objectType.getDescribe();
            Object recordIdValue = payload.get('recordId');
            Boolean isUpdate = recordIdValue != null && String.valueOf(recordIdValue) != '';
            if (isUpdate && !objectDescribe.isUpdateable()) {
                throw new AuraHandledException('You do not have permission to update this object.');
            }
            if (!isUpdate && !objectDescribe.isCreateable()) {
                throw new AuraHandledException('You do not have permission to create this object.');
            }

            SObject record = objectType.newSObject();
            if (isUpdate) {
                Id recordId = (Id) String.valueOf(recordIdValue);
                if (recordId.getSObjectType() != objectType) {
                    throw new AuraHandledException('The record ID does not match the configured object.');
                }
                record.put('Id', recordId);
            }

            Object rawFields = payload.get('fields');
            if (rawFields == null) {
                throw new AuraHandledException('The form field values are missing or invalid.');
            }

            Map<String, Schema.SObjectField> fieldTokens = objectDescribe.fields.getMap();
            Map<String, Object> fieldValues = (Map<String, Object>) rawFields;
            for (String fieldApiName : fieldValues.keySet()) {
                if (fieldApiName == 'Id') {
                    throw new AuraHandledException('Id cannot be submitted as a form field.');
                }

                Schema.SObjectField fieldToken = fieldTokens.get(fieldApiName);
                if (fieldToken == null) {
                    throw new AuraHandledException('Unknown field: ' + fieldApiName);
                }
                Schema.DescribeFieldResult fieldDescribe = fieldToken.getDescribe();
                if (isUpdate && !fieldDescribe.isUpdateable()) {
                    throw new AuraHandledException('You do not have permission to update ' + fieldApiName + '.');
                }
                if (!isUpdate && !fieldDescribe.isCreateable()) {
                    throw new AuraHandledException('You do not have permission to set ' + fieldApiName + '.');
                }

                record.put(fieldApiName, convertValue(fieldValues.get(fieldApiName), fieldDescribe.getType()));
            }

            Database.SaveResult result = isUpdate
                ? Database.update(record, AccessLevel.USER_MODE)
                : Database.insert(record, AccessLevel.USER_MODE);

            if (!result.isSuccess()) {
                Database.Error firstError = result.getErrors()[0];
                throw new AuraHandledException(firstError.getMessage());
            }
            return String.valueOf(result.getId());
        } catch (AuraHandledException handledError) {
            throw handledError;
        } catch (Exception error) {
            throw new AuraHandledException(error.getMessage());
        }
    }

    private static Object convertValue(Object rawValue, Schema.DisplayType fieldType) {
        if (rawValue == null) return null;
        String value = String.valueOf(rawValue);

        if (String.isBlank(value) && fieldType != Schema.DisplayType.String &&
            fieldType != Schema.DisplayType.TextArea && fieldType != Schema.DisplayType.Picklist &&
            fieldType != Schema.DisplayType.MultiPicklist && fieldType != Schema.DisplayType.Phone &&
            fieldType != Schema.DisplayType.Email && fieldType != Schema.DisplayType.Url) {
            return null;
        }

        switch on fieldType {
            when Schema.DisplayType.Boolean {
                return Boolean.valueOf(value);
            }
            when Schema.DisplayType.Date {
                return Date.valueOf(value);
            }
            when Schema.DisplayType.DateTime {
                return parseDateTime(value);
            }
            when Schema.DisplayType.Time {
                return Time.valueOf(value);
            }
            when Schema.DisplayType.Integer {
                return Integer.valueOf(value);
            }
            when Schema.DisplayType.Double, Schema.DisplayType.Currency, Schema.DisplayType.Percent {
                return Decimal.valueOf(value);
            }
            when Schema.DisplayType.Reference {
                return Id.valueOf(value);
            }
            when else {
                return rawValue;
            }
        }
    }

    private static Datetime parseDateTime(String value) {
        String normalized = value.replace('T', ' ').replace('Z', '');
        Integer fractionIndex = normalized.indexOf('.');
        if (fractionIndex >= 0) normalized = normalized.substring(0, fractionIndex);
        Integer offsetIndex = normalized.indexOf('+');
        if (offsetIndex >= 0) normalized = normalized.substring(0, offsetIndex);
        return Datetime.valueOfGmt(normalized);
    }
}
