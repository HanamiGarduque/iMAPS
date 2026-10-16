<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

// rename_palacpac_to_palakpak fixed land_parcels.barangay but left the old
// spelling in location_address ("Purok 4, Brgy. Palacpac, ..."). The permit
// strips "BRGY. <barangay>" from that address by the parcel's barangay, so the
// mismatch printed both spellings on the permit's address line.
return new class extends Migration
{
    private const SPELLINGS = [
        'Palacpac' => 'Palakpak',
        'PALACPAC' => 'PALAKPAK',
        'palacpac' => 'palakpak',
    ];

    public function up(): void
    {
        foreach (self::SPELLINGS as $old => $new) {
            $this->replaceInAddresses($old, $new);
        }
    }

    public function down(): void
    {
        foreach (self::SPELLINGS as $old => $new) {
            $this->replaceInAddresses($new, $old);
        }
    }

    private function replaceInAddresses(string $from, string $to): void
    {
        DB::table('land_parcels')
            ->where('location_address', 'like', "%{$from}%")
            ->update(['location_address' => DB::raw('replace(location_address, ' . DB::getPdo()->quote($from) . ', ' . DB::getPdo()->quote($to) . ')')]);
    }
};
