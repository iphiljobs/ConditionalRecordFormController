public class ApplicationFormDefinition implements ConditionalRecordFormDefinition {
    // Use 'accordion' for collapsible sections or 'flat' for standard headings.
    private static final String SECTION_LAYOUT = 'accordion';

    public String getFormKey() {
        return 'ApplicationForm';
    }

    public String getObjectApiName() {
        return 'Account';
    }

    public String getConfigJson() {
        List<Map<String, String>> accountTypeOptions = new List<Map<String, String>>();
        for (Schema.PicklistEntry entry : Account.Type.getDescribe().getPicklistValues()) {
            if (entry.isActive()) {
                accountTypeOptions.add(new Map<String, String>{
                    'label' => entry.getLabel(),
                    'value' => entry.getValue()
                });
            }
        }

        return '{"formKey":"ApplicationForm","title":"Account Intake","description":"Example form definition; copy this provider pattern for each form.",' +
            '"submitLabel":"Save","columns":2,"showSubmitButton":true,"submissionMode":"apex","clearWhenHidden":false,' +
            '"sectionLayout":' + JSON.serialize(SECTION_LAYOUT) + ',' +
            '"inputText":{"fields":{' +
                '"ApplicationForm.password":{"help":"Enter an account number. Do not enter a password or secret."},' +
                '"ApplicationForm.searchText":{"placeholder":"Enter a site name"}}},' +
            '"items":[' +
                '{"kind":"section","key":"accountDetails","heading":"Account details","columns":2},' +
                '{"kind":"field","key":"ApplicationForm.name","label":"Account name","type":"text","required":true},' +
                '{"kind":"field","key":"ApplicationForm.phone","label":"Phone","type":"tel"},' +
                '{"kind":"field","key":"ApplicationForm.website","label":"Website","type":"url","visibleWhen":{"field":"ApplicationForm.phone","operator":"isNotBlank"}},' +
                '{"kind":"field","key":"ApplicationForm.email","label":"Email","type":"email","maxLength":80},' +
                '{"kind":"field","key":"ApplicationForm.employeeCount","label":"Employees","type":"number","min":0,"step":1},' +
                '{"kind":"field","key":"ApplicationForm.accountType","label":"Account type","type":"picklist","options":' +
                    JSON.serialize(accountTypeOptions) + '},' +
                '{"kind":"field","key":"ApplicationForm.password","label":"Account number (masked)","type":"password","maxLength":40},' +
                '{"kind":"field","key":"ApplicationForm.searchText","label":"Account site","type":"search","maxLength":80},' +
                '{"kind":"field","key":"ApplicationForm.active","label":"Active","type":"checkbox"},' +
                '{"kind":"field","key":"ApplicationForm.parentAccount","label":"Parent account","type":"lookup"},' +
                '{"kind":"section","key":"scheduling","heading":"Scheduling","columns":2},' +
                '{"kind":"field","key":"ApplicationForm.followUpDate","label":"Follow-up date","type":"date"},' +
                '{"kind":"field","key":"ApplicationForm.preferredTime","label":"Preferred time","type":"time"},' +
                '{"kind":"field","key":"ApplicationForm.appointmentDateTime","label":"Appointment date and time","type":"datetime"},' +
                '{"kind":"section","key":"billingAddress","heading":"Billing address","columns":1},' +
                '{"kind":"field","key":"billingAddress","label":"Billing address","type":"address","addressPreset":"US","fieldKeys":{' +
                    '"street":"ApplicationForm.billingStreet","city":"ApplicationForm.billingCity",' +
                    '"province":"ApplicationForm.billingState","postalCode":"ApplicationForm.billingPostalCode",' +
                    '"country":"ApplicationForm.billingCountry"}},' +
                '{"kind":"section","key":"mailingAddress","heading":"Mailing address","columns":1},' +
                '{"kind":"field","key":"ApplicationForm.sameAsBilling","label":"Mailing address is the same as billing address",' +
                    '"type":"checkbox","clientOnly":true,"defaultValue":false},' +
                '{"kind":"field","key":"mailingAddress","label":"Mailing address","type":"address","addressPreset":"US",' +
                    '"defaultCountry":"","readOnlyWhen":{"field":"ApplicationForm.sameAsBilling","operator":"equals","value":true},' +
                    '"fieldKeys":{"street":"ApplicationForm.mailingStreet","city":"ApplicationForm.mailingCity",' +
                    '"province":"ApplicationForm.mailingState","postalCode":"ApplicationForm.mailingPostalCode",' +
                    '"country":"ApplicationForm.mailingCountry"}}' +
            '],"valueRules":[{"when":{"field":"ApplicationForm.sameAsBilling","operator":"equals","value":true},"actions":[' +
                '{"type":"copy","from":"ApplicationForm.billingStreet","to":"ApplicationForm.mailingStreet","overwrite":true,"clearIfMissing":true},' +
                '{"type":"copy","from":"ApplicationForm.billingCity","to":"ApplicationForm.mailingCity","overwrite":true,"clearIfMissing":true},' +
                '{"type":"copy","from":"ApplicationForm.billingState","to":"ApplicationForm.mailingState","overwrite":true,"clearIfMissing":true},' +
                '{"type":"copy","from":"ApplicationForm.billingPostalCode","to":"ApplicationForm.mailingPostalCode","overwrite":true,"clearIfMissing":true},' +
                '{"type":"copy","from":"ApplicationForm.billingCountry","to":"ApplicationForm.mailingCountry","overwrite":true,"clearIfMissing":true}' +
            ']}]}';
    }

    public Map<String, String> getFieldApiNames() {
        return new Map<String, String>{
            'ApplicationForm.name' => 'Name',
            'ApplicationForm.phone' => 'Phone',
            'ApplicationForm.website' => 'Website',
            'ApplicationForm.email' => 'Form_Email__c',
            'ApplicationForm.employeeCount' => 'NumberOfEmployees',
            'ApplicationForm.accountType' => 'Type',
            'ApplicationForm.password' => 'AccountNumber',
            'ApplicationForm.searchText' => 'Site',
            'ApplicationForm.active' => 'Form_Active__c',
            'ApplicationForm.parentAccount' => 'ParentId',
            'ApplicationForm.followUpDate' => 'Form_Follow_Up_Date__c',
            'ApplicationForm.preferredTime' => 'Form_Preferred_Time__c',
            'ApplicationForm.appointmentDateTime' => 'Form_Appointment_Date_Time__c',
            'ApplicationForm.billingStreet' => 'BillingStreet',
            'ApplicationForm.billingCity' => 'BillingCity',
            'ApplicationForm.billingState' => 'BillingState',
            'ApplicationForm.billingPostalCode' => 'BillingPostalCode',
            'ApplicationForm.billingCountry' => 'BillingCountry',
            'ApplicationForm.mailingStreet' => 'ShippingStreet',
            'ApplicationForm.mailingCity' => 'ShippingCity',
            'ApplicationForm.mailingState' => 'ShippingState',
            'ApplicationForm.mailingPostalCode' => 'ShippingPostalCode',
            'ApplicationForm.mailingCountry' => 'ShippingCountry'
        };
    }

    public Map<String, String> getLookupObjectApiNames() {
        return new Map<String, String>{
            'ApplicationForm.parentAccount' => 'Account'
        };
    }
}
