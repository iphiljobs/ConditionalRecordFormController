public class ApplicationFormDefinition implements ConditionalRecordFormDefinition {
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
            'ApplicationForm.billingCountry' => 'BillingCountry'
        };
    }

    public Map<String, String> getLookupObjectApiNames() {
        return new Map<String, String>{
            'ApplicationForm.parentAccount' => 'Account'
        };
    }
}
