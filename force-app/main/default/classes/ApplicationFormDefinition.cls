public class ApplicationFormDefinition implements ConditionalRecordFormDefinition {
    public String getFormKey() {
        return 'ApplicationForm';
    }

    public String getObjectApiName() {
        return 'Account';
    }

    public String getConfigJson() {
        return '{"formKey":"ApplicationForm","title":"Account Intake","description":"Example form definition; copy this provider pattern for each form.",' +
            '"submitLabel":"Save","columns":2,"showSubmitButton":true,"submissionMode":"apex","clearWhenHidden":false,' +
            '"items":[' +
                '{"kind":"section","key":"accountDetails","heading":"Account details","columns":2},' +
                '{"kind":"field","key":"ApplicationForm.name","label":"Account name","type":"text","required":true},' +
                '{"kind":"field","key":"ApplicationForm.phone","label":"Phone","type":"tel"},' +
                '{"kind":"field","key":"ApplicationForm.website","label":"Website","type":"url","visibleWhen":{"field":"ApplicationForm.phone","operator":"isNotBlank"}},' +
                '{"kind":"field","key":"ApplicationForm.parentAccount","label":"Parent account","type":"lookup"},' +
                '{"kind":"section","key":"billingAddress","heading":"Billing address","columns":1},' +
                '{"kind":"field","key":"billingAddress","label":"Billing address","type":"address","fieldKeys":{' +
                    '"street":"ApplicationForm.billingStreet","city":"ApplicationForm.billingCity",' +
                    '"province":"ApplicationForm.billingState","postalCode":"ApplicationForm.billingPostalCode",' +
                    '"country":"ApplicationForm.billingCountry"}}' +
            '],"valueRules":[]}';
    }

    public Map<String, String> getFieldApiNames() {
        return new Map<String, String>{
            'ApplicationForm.name' => 'Name',
            'ApplicationForm.phone' => 'Phone',
            'ApplicationForm.website' => 'Website',
            'ApplicationForm.parentAccount' => 'ParentId',
            'ApplicationForm.billingStreet' => 'BillingStreet',
            'ApplicationForm.billingCity' => 'BillingCity',
            'ApplicationForm.billingState' => 'BillingState',
            'ApplicationForm.billingPostalCode' => 'BillingPostalCode',
            'ApplicationForm.billingCountry' => 'BillingCountry'
        };
    }

    public Map<String, String> getLookupObjectApiNames() {
        return new Map<String, String>{
            'ApplicationForm.parentAccount' => 'Account'
        };
    }
}
