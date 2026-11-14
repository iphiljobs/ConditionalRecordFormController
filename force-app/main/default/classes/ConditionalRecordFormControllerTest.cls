@IsTest
private class ConditionalRecordFormControllerTest {
    @IsTest
    static void returnsClientSafeConfig() {
        Test.startTest();
        String configJson = ConditionalRecordFormController.getFormConfig('ApplicationForm');
        Test.stopTest();

        System.assert(configJson.contains('"formKey":"ApplicationForm"'));
        Set<String> configuredTypes = new Set<String>();
        Map<String, Object> config = (Map<String, Object>) JSON.deserializeUntyped(configJson);
        for (Object item : (List<Object>) config.get('items')) {
            Map<String, Object> entry = (Map<String, Object>) item;
            if (entry.get('kind') == 'field') configuredTypes.add((String) entry.get('type'));
        }
        System.assertEquals(new Set<String>{
            'text', 'email', 'tel', 'number', 'date', 'time', 'datetime', 'checkbox',
            'url', 'password', 'search', 'picklist', 'lookup', 'address'
        }, configuredTypes);
        System.assert(!configJson.contains('Form_Email__c'));
        System.assert(configJson.contains('"visibleWhen"'));
        System.assert(!configJson.contains('BillingStreet'));
        System.assert(!configJson.contains('ParentId'));
    }

    @IsTest
    static void savesLoadsAndSearchesUsingProviderMappings() {
        Account parentAccount = new Account(Name = 'Parent Account');
        insert parentAccount;

        ConditionalRecordFormSubmission submission = new ConditionalRecordFormSubmission();
        submission.formKey = 'ApplicationForm';
        submission.fields = new List<ConditionalRecordFormFieldValue>{
            fieldValue('ApplicationForm.name', 'Child Account'),
            fieldValue('ApplicationForm.phone', '555-0100'),
            fieldValue('ApplicationForm.email', 'intake@example.com'),
            fieldValue('ApplicationForm.active', true),
            fieldValue('ApplicationForm.followUpDate', '2026-11-18'),
            fieldValue('ApplicationForm.preferredTime', '14:30:15.250Z'),
            fieldValue('ApplicationForm.appointmentDateTime', '2026-11-18T19:30:00.000Z'),
            fieldValue('ApplicationForm.website', 'https://example.com'),
            fieldValue('ApplicationForm.parentAccount', String.valueOf(parentAccount.Id)),
            fieldValue('ApplicationForm.billingStreet', '1 Main Street'),
            fieldValue('ApplicationForm.billingCity', 'Sacramento'),
            fieldValue('ApplicationForm.billingState', 'California'),
            fieldValue('ApplicationForm.billingPostalCode', '95814'),
            fieldValue('ApplicationForm.billingCountry', 'United States')
        };

        Test.startTest();
        String recordId = ConditionalRecordFormController.saveRecord(JSON.serialize(submission));
        ConditionalRecordFormData loaded = ConditionalRecordFormController.loadFormData(
            'ApplicationForm',
            recordId,
            new List<String>{
                'ApplicationForm.name',
                'ApplicationForm.phone',
                'ApplicationForm.email',
                'ApplicationForm.active',
                'ApplicationForm.followUpDate',
                'ApplicationForm.preferredTime',
                'ApplicationForm.appointmentDateTime',
                'ApplicationForm.parentAccount',
                'ApplicationForm.billingStreet',
                'ApplicationForm.billingCity',
                'ApplicationForm.billingState',
                'ApplicationForm.billingPostalCode',
                'ApplicationForm.billingCountry'
            }
        );
        List<ConditionalRecordFormLookupOption> matches = ConditionalRecordFormController.searchLookup(
            'ApplicationForm',
            'ApplicationForm.parentAccount',
            'Parent',
            null
        );
        Test.stopTest();

        Account saved = [
            SELECT Name, Phone, Website, ParentId, BillingStreet, BillingCity, BillingState,
                BillingPostalCode, BillingCountry, Form_Email__c, Form_Active__c,
                Form_Follow_Up_Date__c, Form_Preferred_Time__c, Form_Appointment_Date_Time__c
            FROM Account
            WHERE Id = :recordId
        ];
        System.assertEquals('Child Account', saved.Name);
        System.assertEquals('555-0100', saved.Phone);
        System.assertEquals('intake@example.com', saved.Form_Email__c);
        System.assertEquals(true, saved.Form_Active__c);
        System.assertEquals(Date.newInstance(2026, 11, 18), saved.Form_Follow_Up_Date__c);
        System.assertEquals(Time.newInstance(14, 30, 15, 250), saved.Form_Preferred_Time__c);
        System.assertEquals(Datetime.newInstanceGmt(2026, 11, 18, 19, 30, 0), saved.Form_Appointment_Date_Time__c);
        System.assertEquals('https://example.com', saved.Website);
        System.assertEquals(parentAccount.Id, saved.ParentId);
        System.assertEquals('1 Main Street', saved.BillingStreet);
        System.assertEquals('Sacramento', saved.BillingCity);
        System.assertEquals('California', saved.BillingState);
        System.assertEquals('95814', saved.BillingPostalCode);
        System.assertEquals('United States', saved.BillingCountry);

        Map<String, String> loadedValues = new Map<String, String>();
        for (ConditionalRecordFormFieldValue field : loaded.fields) {
            loadedValues.put(field.key, field.valueJson);
        }
        System.assertEquals('"Child Account"', loadedValues.get('ApplicationForm.name'));
        System.assertEquals('"1 Main Street"', loadedValues.get('ApplicationForm.billingStreet'));
        System.assertEquals(JSON.serialize(saved.Form_Email__c), loadedValues.get('ApplicationForm.email'));
        System.assertEquals(JSON.serialize(saved.Form_Active__c), loadedValues.get('ApplicationForm.active'));
        System.assertEquals(JSON.serialize(saved.Form_Follow_Up_Date__c), loadedValues.get('ApplicationForm.followUpDate'));
        System.assertEquals(JSON.serialize(saved.Form_Preferred_Time__c), loadedValues.get('ApplicationForm.preferredTime'));
        System.assertEquals(JSON.serialize(saved.Form_Appointment_Date_Time__c),
            loadedValues.get('ApplicationForm.appointmentDateTime'));
        System.assertEquals(1, matches.size());
        System.assertEquals(String.valueOf(parentAccount.Id), matches[0].recordId);

        submission.recordId = recordId;
        submission.fields = new List<ConditionalRecordFormFieldValue>{
            fieldValue('ApplicationForm.name', 'Updated Child Account')
        };
        String updatedId = ConditionalRecordFormController.saveRecord(JSON.serialize(submission));
        System.assertEquals(recordId, updatedId);
        System.assertEquals('Updated Child Account', [SELECT Name FROM Account WHERE Id = :recordId].Name);
    }

    @IsTest
    static void returnsEmptyLoadForCreateModeAndRejectsUnknownForm() {
        System.assertEquals(0, ConditionalRecordFormController.loadFormData(
            'ApplicationForm', null, new List<String>{'ApplicationForm.name'}
        ).fields.size());

        Boolean rejected = false;
        try {
            ConditionalRecordFormController.getFormConfig('UnknownForm');
        } catch (AuraHandledException error) {
            rejected = true;
        }
        System.assert(rejected, 'Unknown form keys should not resolve to a provider.');
    }

    private static ConditionalRecordFormFieldValue fieldValue(String key, Object value) {
        ConditionalRecordFormFieldValue wrapper = new ConditionalRecordFormFieldValue();
        wrapper.key = key;
        wrapper.valueJson = JSON.serialize(value);
        return wrapper;
    }
}
