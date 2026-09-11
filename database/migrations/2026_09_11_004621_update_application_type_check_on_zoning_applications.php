<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up()
    {
        // Drop the existing outdated constraint
        DB::statement('ALTER TABLE zoning_applications DROP CONSTRAINT IF EXISTS zoning_applications_application_type_check');
        
        // Add the new constraint with all valid frontend types
        DB::statement("
            ALTER TABLE zoning_applications ADD CONSTRAINT zoning_applications_application_type_check 
            CHECK (application_type IN (
                'Locational Clearance',
                'Zoning Certification',
                'Development Permit',
                'Preliminary Approval and Locational Clearance (PALC)',
                'Petition for Rezoning',
                'Petition for Reclassification'
            ))
        ");
    }

    public function down()
    {
        // Optional: Revert back to the original constraint if needed
    }
};