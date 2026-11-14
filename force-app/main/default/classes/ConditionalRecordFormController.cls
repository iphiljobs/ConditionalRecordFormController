public with sharing class ConditionalRecordFormController {
    @AuraEnabled(cacheable=true)
    public static String getFormConfig(String formKey) {
        ConditionalRecordFormDefinition definition = getDefinition(formKey);
        String configJson = definition.getConfigJson();
        try {
            Map<String, Object> config = (Map<String, Object>) JSON.deserializeUntyped(configJson);
            if (String.valueOf(config.get('formKey')) != definition.getFormKey()) {
                throw new AuraHandledException('The form configuration key does not match its provider.');
            }
        } catch (AuraHandledException handledError) {
            throw handledError;
        } catch (Exception error) {
            throw new AuraHandledException('The form configuration is invalid.');
        }
        return configJson;
    }

    @AuraEnabled(cacheable=true)
    public static ConditionalRecordFormData loadFormData(String formKey, String recordId, List<String> fieldKeys) {
        ConditionalRecordFormData result = new ConditionalRecordFormData();
        if (String.isBlank(recordId)) return result;

        ConditionalRecordFormDefinition definition = getDefinition(formKey);
        String objectApiName = getFormObjectApiName(definition);
        Schema.SObjectType objectType = Schema.getGlobalDescribe().get(objectApiName);
        Schema.DescribeSObjectResult objectDescribe = objectType.getDescribe();
        if (!objectDescribe.isAccessible()) {
            throw new AuraHandledException('You do not have access to this form record.');
        }

        Id parsedRecordId;
        try {
            parsedRecordId = Id.valueOf(recordId);
        } catch (Exception error) {
            throw new AuraHandledException('The record ID is invalid.');
        }
        if (parsedRecordId.getSObjectType() != objectType) {
            throw new AuraHandledException('The record ID does not belong to this form.');
        }

        Map<String, String> mappings = getFieldApiNames(definition);
        Map<String, String> keyToApiName = new Map<String, String>();
        Set<String> apiNames = new Set<String>();
        if (fieldKeys != null) {
            for (String fieldKey : fieldKeys) {
                String configuredApiName = requireMapping(mappings, fieldKey);
                Schema.SObjectField token = findField(objectDescribe.fields.getMap(), configuredApiName);
                if (token == null || !token.getDescribe().isAccessible()) {
                    throw new AuraHandledException('You do not have access to one or more form fields.');
                }
                String apiName = token.getDescribe().getName();
                keyToApiName.put(fieldKey, apiName);
                apiNames.add(apiName);
            }
        }
        if (apiNames.isEmpty()) return result;

        List<String> selectedFields = new List<String>();
        selectedFields.addAll(apiNames);
        selectedFields.sort();
        String queryText = 'SELECT ' + String.join(selectedFields, ',') +
            ' FROM ' + objectApiName + ' WHERE Id = :parsedRecordId WITH USER_MODE LIMIT 1';
        SObject record;
        try {
            List<SObject> records = Database.query(queryText);
            if (records.isEmpty()) return result;
            record = records[0];
        } catch (Exception error) {
            throw new AuraHandledException('Unable to load this form record.');
        }

        for (String fieldKey : keyToApiName.keySet()) {
            ConditionalRecordFormFieldValue wrapper = new ConditionalRecordFormFieldValue();
            wrapper.key = fieldKey;
            wrapper.valueJson = JSON.serialize(record.get(keyToApiName.get(fieldKey)));
            result.fields.add(wrapper);
        }
        return result;
    }

    @AuraEnabled
    public static List<ConditionalRecordFormLookupOption> searchLookup(
        String formKey,
        String fieldKey,
        String searchTerm,
        String selectedRecordId
    ) {
        ConditionalRecordFormDefinition definition = getDefinition(formKey);
        Map<String, String> mappings = getFieldApiNames(definition);
        String relationshipApiName = requireMapping(mappings, fieldKey);
        Map<String, String> lookupMappings = definition.getLookupObjectApiNames();
        String targetObjectApiName = lookupMappings == null ? null : lookupMappings.get(fieldKey);
        if (String.isBlank(targetObjectApiName)) {
            throw new AuraHandledException('The related-record field is not configured for search.');
        }

        Schema.SObjectType targetType = Schema.getGlobalDescribe().get(targetObjectApiName);
        if (targetType == null || !targetType.getDescribe().isAccessible()) {
            throw new AuraHandledException('You do not have access to search this related record.');
        }
        String sourceObjectApiName = getFormObjectApiName(definition);
        Schema.SObjectType sourceType = Schema.getGlobalDescribe().get(sourceObjectApiName);
        Schema.SObjectField relationshipToken = findField(
            sourceType.getDescribe().fields.getMap(),
            relationshipApiName
        );
        if (relationshipToken == null || relationshipToken.getDescribe().getType() != Schema.DisplayType.Reference ||
            !relationshipToken.getDescribe().isAccessible()) {
            throw new AuraHandledException('The related-record field is not configured for search.');
        }
        Boolean targetIsValid = false;
        for (Schema.SObjectType referencedType : relationshipToken.getDescribe().getReferenceTo()) {
            if (referencedType == targetType) targetIsValid = true;
        }
        if (!targetIsValid) {
            throw new AuraHandledException('The related-record field is not configured for search.');
        }
        Schema.DescribeSObjectResult targetDescribe = targetType.getDescribe();
        targetObjectApiName = targetDescribe.getName();
        String nameField = getNameField(targetDescribe);
        Schema.SObjectField nameToken = findField(targetDescribe.fields.getMap(), nameField);
        if (nameToken == null || !nameToken.getDescribe().isAccessible()) {
            throw new AuraHandledException('You do not have access to search this related record.');
        }

        String queryText = 'SELECT Id, ' + nameField + ' FROM ' + targetObjectApiName;
        if (!String.isBlank(selectedRecordId)) {
            Id selectedId;
            try {
                selectedId = Id.valueOf(selectedRecordId);
            } catch (Exception error) {
                throw new AuraHandledException('The selected related record is invalid.');
            }
            if (selectedId.getSObjectType() != targetType) {
                throw new AuraHandledException('The selected related record is invalid.');
            }
            queryText += ' WHERE Id = :selectedId WITH USER_MODE LIMIT 1';
        } else {
            if (String.isBlank(searchTerm) || searchTerm.trim().length() < 2) {
                return new List<ConditionalRecordFormLookupOption>();
            }
            String searchPattern = '%' + searchTerm.trim() + '%';
            queryText += ' WHERE ' + nameField + ' LIKE :searchPattern WITH USER_MODE ORDER BY ' + nameField + ' LIMIT 20';
        }

        List<ConditionalRecordFormLookupOption> results = new List<ConditionalRecordFormLookupOption>();
        try {
            for (SObject record : Database.query(queryText)) {
                ConditionalRecordFormLookupOption option = new ConditionalRecordFormLookupOption();
                option.recordId = String.valueOf(record.get('Id'));
                option.label = String.valueOf(record.get(nameField));
                results.add(option);
            }
        } catch (Exception error) {
            throw new AuraHandledException('Unable to search related records.');
        }
        return results;
    }

    @AuraEnabled
    public static String saveRecord(String payloadJson) {
        try {
            if (String.isBlank(payloadJson)) {
                throw new AuraHandledException('The form submission is empty.');
            }

            ConditionalRecordFormSubmission payload = (ConditionalRecordFormSubmission) JSON.deserialize(
                payloadJson,
                ConditionalRecordFormSubmission.class
            );
            ConditionalRecordFormDefinition definition = getDefinition(payload.formKey);
            String objectApiName = getFormObjectApiName(definition);
            Schema.SObjectType objectType = Schema.getGlobalDescribe().get(objectApiName);
            Schema.DescribeSObjectResult objectDescribe = objectType.getDescribe();
            Boolean isUpdate = !String.isBlank(payload.recordId);
            if (isUpdate && !objectDescribe.isUpdateable()) {
                throw new AuraHandledException('You do not have permission to update this form record.');
            }
            if (!isUpdate && !objectDescribe.isCreateable()) {
                throw new AuraHandledException('You do not have permission to create this form record.');
            }

            SObject record = objectType.newSObject();
            if (isUpdate) {
                Id recordId = Id.valueOf(payload.recordId);
                if (recordId.getSObjectType() != objectType) {
                    throw new AuraHandledException('The record ID does not belong to this form.');
                }
                record.put('Id', recordId);
            }

            Map<String, String> mappings = getFieldApiNames(definition);
            Set<String> submittedKeys = new Set<String>();
            if (payload.fields == null) {
                throw new AuraHandledException('The form field values are missing or invalid.');
            }
            for (ConditionalRecordFormFieldValue wrapper : payload.fields) {
                if (wrapper == null || String.isBlank(wrapper.key) || submittedKeys.contains(wrapper.key)) {
                    throw new AuraHandledException('The form contains an invalid or duplicate field.');
                }
                submittedKeys.add(wrapper.key);
                String configuredApiName = requireMapping(mappings, wrapper.key);
                Schema.SObjectField token = findField(objectDescribe.fields.getMap(), configuredApiName);
                if (token == null) {
                    throw new AuraHandledException('The form contains an invalid field mapping.');
                }
                String apiName = token.getDescribe().getName();
                Schema.DescribeFieldResult fieldDescribe = token.getDescribe();
                if (isUpdate && !fieldDescribe.isUpdateable()) {
                    throw new AuraHandledException('You do not have permission to update a submitted field.');
                }
                if (!isUpdate && !fieldDescribe.isCreateable()) {
                    throw new AuraHandledException('You do not have permission to set a submitted field.');
                }
                Object rawValue = String.isBlank(wrapper.valueJson)
                    ? null
                    : JSON.deserializeUntyped(wrapper.valueJson);
                record.put(apiName, convertValue(rawValue, fieldDescribe.getType()));
            }

            Database.SaveResult result = isUpdate
                ? Database.update(record, AccessLevel.USER_MODE)
                : Database.insert(record, AccessLevel.USER_MODE);
            if (!result.isSuccess()) {
                throw new AuraHandledException('Unable to save the form record. Check required fields and validation rules.');
            }
            return String.valueOf(result.getId());
        } catch (AuraHandledException handledError) {
            throw handledError;
        } catch (Exception error) {
            throw new AuraHandledException('Unable to save the form record. Check required fields, permissions, and validation rules.');
        }
    }

    private static ConditionalRecordFormDefinition getDefinition(String formKey) {
        ConditionalRecordFormDefinition definition = ConditionalRecordFormRegistry.getDefinition(formKey);
        if (definition == null || String.isBlank(definition.getFormKey()) ||
            definition.getFormKey() != formKey || String.isBlank(definition.getObjectApiName())) {
            throw new AuraHandledException('This form is not configured correctly.');
        }
        return definition;
    }

    private static String getFormObjectApiName(ConditionalRecordFormDefinition definition) {
        Schema.SObjectType objectType = Schema.getGlobalDescribe().get(definition.getObjectApiName());
        if (objectType == null) throw new AuraHandledException('This form is not configured correctly.');
        return objectType.getDescribe().getName();
    }

    private static Map<String, String> getFieldApiNames(ConditionalRecordFormDefinition definition) {
        Map<String, String> mappings = definition.getFieldApiNames();
        if (mappings == null || mappings.isEmpty()) {
            throw new AuraHandledException('This form has no server-side field mappings.');
        }
        String requiredPrefix = definition.getFormKey() + '.';
        for (String key : mappings.keySet()) {
            if (String.isBlank(key) || !key.startsWith(requiredPrefix) || String.isBlank(mappings.get(key))) {
                throw new AuraHandledException('This form contains an invalid server-side field mapping.');
            }
        }
        return mappings;
    }

    private static String requireMapping(Map<String, String> mappings, String fieldKey) {
        String apiName = mappings.get(fieldKey);
        if (String.isBlank(apiName)) throw new AuraHandledException('A form field is not configured.');
        return apiName;
    }

    private static Schema.SObjectField findField(Map<String, Schema.SObjectField> fieldTokens, String fieldApiName) {
        for (String key : fieldTokens.keySet()) {
            if (key.equalsIgnoreCase(fieldApiName)) return fieldTokens.get(key);
        }
        return null;
    }

    private static String getNameField(Schema.DescribeSObjectResult objectDescribe) {
        for (String apiName : objectDescribe.fields.getMap().keySet()) {
            Schema.SObjectField token = objectDescribe.fields.getMap().get(apiName);
            if (token.getDescribe().isNameField()) return apiName;
        }
        throw new AuraHandledException('The related record type does not have a searchable name field.');
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
            when Boolean { return Boolean.valueOf(value); }
            when Date { return Date.valueOf(value); }
            when DateTime { return parseDateTime(value); }
            when Time { return parseTime(value); }
            when Integer { return Integer.valueOf(value); }
            when Double, Currency, Percent { return Decimal.valueOf(value); }
            when Reference { return Id.valueOf(value); }
            when else { return rawValue; }
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

    private static Time parseTime(String value) {
        String normalized = value.replace('Z', '');
        List<String> parts = normalized.split(':');
        if (parts.size() < 2 || parts.size() > 3) {
            throw new AuraHandledException('Time value must use HH:mm or HH:mm:ss format.');
        }
        Integer hour = Integer.valueOf(parts[0]);
        Integer minute = Integer.valueOf(parts[1]);
        Integer second = 0;
        Integer millisecond = 0;
        if (parts.size() == 3) {
            String secondPart = parts[2];
            Integer fractionIndex = secondPart.indexOf('.');
            if (fractionIndex >= 0) {
                String fraction = secondPart.substring(fractionIndex + 1);
                secondPart = secondPart.substring(0, fractionIndex);
                if (fraction.length() > 3) fraction = fraction.substring(0, 3);
                while (fraction.length() < 3) fraction += '0';
                if (!String.isBlank(fraction)) millisecond = Integer.valueOf(fraction);
            }
            second = Integer.valueOf(secondPart);
        }
        return Time.newInstance(hour, minute, second, millisecond);
    }
}
