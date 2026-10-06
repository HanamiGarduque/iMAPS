<?php

/*
|--------------------------------------------------------------------------
| iMAPS support / escalation contact
|--------------------------------------------------------------------------
|
| POST-LOOP-9 SMOKE FIX - developer escalation contact.
|
| A Planning Officer resolves FieldSync issues operationally inside MPDO. When
| they cannot, an ADMIN escalates to the iMAPS development/support team, so
| the diagnostic detail page needs somewhere to show that team.
|
| DELIBERATELY EMPTY BY DEFAULT. No contact details are invented and none are
| hardcoded. Until an operator sets the environment variables below, the page
| renders a configuration-backed placeholder that says the contact has not been
| configured yet, rather than displaying a fabricated or guessed address.
|
| ONLY SAFE CONTACT FIELDS ARE EXPOSED. There is deliberately no key, token,
| password, service-role value or API credential here, and the values below
| are rendered as inert text by the page. Add a field to this file only if it
| is a name, an email address, a phone/contact channel, or a short set of
| support instructions.
|
| To configure, set in .env:
|     IMAPS_SUPPORT_CONTACT_NAME
|     IMAPS_SUPPORT_CONTACT_EMAIL
|     IMAPS_SUPPORT_CONTACT_CHANNEL      (e.g. a phone number or chat handle)
|     IMAPS_SUPPORT_INSTRUCTIONS
|
*/

return [

    /*
    |----------------------------------------------------------------------
    | Development / support team contact
    |----------------------------------------------------------------------
    |
    | Shown to an ADMIN only, on diagnostic report detail, as the escalation
    | path when a Planning Officer cannot resolve the issue. Each value is
    | null until configured, and the page degrades to a clear placeholder.
    |
    */

    'contact' => [
        'name' => env('IMAPS_SUPPORT_CONTACT_NAME'),
        'email' => env('IMAPS_SUPPORT_CONTACT_EMAIL'),
        'channel' => env('IMAPS_SUPPORT_CONTACT_CHANNEL'),
        'instructions' => env('IMAPS_SUPPORT_INSTRUCTIONS'),
    ],

];
