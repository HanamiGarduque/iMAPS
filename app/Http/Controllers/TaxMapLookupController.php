<?php

namespace App\Http\Controllers;

use App\Models\TaxMapParcel;
use Illuminate\Http\JsonResponse;

class TaxMapLookupController extends Controller
{
    // ─────────────────────────────────────────────────────────────────────────
    // LOOKUP — GET /api/tax-map/lookup/{pin}
    // Returns parcel geometry + attributes for a given Property Index Number,
    // so the encode form can auto-fill lot/TCT/area/coordinates once the
    // municipal tax map is wired in. Returns 404 if the PIN isn't found.
    // ─────────────────────────────────────────────────────────────────────────
    public function lookup(string $pin): JsonResponse
    {
        $pin = trim($pin);

        if ($pin === '') {
            return response()->json([
                'found'   => false,
                'message' => 'Property Index Number is required.',
            ], 422);
        }

        $parcel = TaxMapParcel::findByPin($pin);

        if (!$parcel) {
            return response()->json([
                'found'   => false,
                'message' => "No parcel found for PIN \"{$pin}\".",
            ], 404);
        }

        return response()->json([
            'found' => true,
            'data'  => $parcel,
        ]);
    }
}