<?php

return [

    /*
    |--------------------------------------------------------------------------
    | FieldSync Bridge Source Identity
    |--------------------------------------------------------------------------
    |
    | The shared Supabase FieldSync bridge project is written to by more than
    | one iMAPS environment. Its mirror tables key local iMAPS rows by BARE
    | local integer ids (`local_application_id`, `local_parcel_id`,
    | `local_inspection_id`), which are only unique INSIDE one iMAPS
    | database. Two environments writing the same bridge therefore collide on
    | the same remote row.
    |
    | `IMAPS_BRIDGE_SOURCE_ID` is the non-secret namespace identity that makes
    | those local ids safe. It MUST be:
    |
    |   - explicit          (never derived, never defaulted)
    |   - stable            (unchanged across restart, deploy and clone)
    |   - unique            (one distinct value per iMAPS database/environment)
    |   - non-secret        (it is an environment label, not a credential)
    |
    | There is deliberately NO fallback value. A deployment that needs to write
    | the bridge and has no configured source id FAILS CLOSED rather than
    | silently claiming another environment's namespace.
    |
    | See `docs/FIELDSYNC_BRIDGE_ARCHITECTURE.md` ("Bridge source namespace").
    |
    */

    'source_id' => env('IMAPS_BRIDGE_SOURCE_ID'),

];
