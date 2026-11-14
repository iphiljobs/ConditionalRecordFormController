@IsTest
private class ConditionalRecordFormControllerTest {
    @IsTest
    static void returnsClientSafeConfig() {
        Test.startTest();
        String configJson = ConditionalRecordFormController.getFormConfig('ApplicationForm');
        Test.stopTest();

        System.assert(configJson.contains('"formKey":"ApplicationForm"'));
        System.assert(configJson.contains('"type":"address"'));
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
                BillingPostalCode, BillingCountry
            FROM Account
            WHERE Id = :recordId
        ];
        System.assertEquals('Child Account', saved.Name);
        System.assertEquals('555-0100', saved.Phone);
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
