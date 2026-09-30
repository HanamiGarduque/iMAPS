<?php

namespace Tests\Unit;

use Tests\TestCase;

/**
 * Loop 9C-5 blocker fix - parcel geometry bridge contract.
 *
 * THE DEFECT THIS PINS
 * --------------------
 * `PushInspectionToSupabase` built `supabase_parcels.geom` by preferring
 * `ST_AsText(land_parcels.geom)` whenever a parcel's PIN matched
 * `land_parcels`. That column is `geometry(MultiPolygon,4326)` - a cadastral
 * boundary, 4177 of 4177 rows.
 *
 * The remote column is `geometry(Geometry,4326)` and so accepts anything, but
 * the remote `sync_parcel_latlng` BEFORE INSERT/UPDATE trigger derives
 * `latitude`/`longitude` with `ST_X()`/`ST_Y()`, which are POINT-only
 * accessors. Every PIN-matched parcel delivery therefore died remotely with
 *
 *   SQLSTATE XX000: Argument to ST_Y() must have type POINT
 *
 * aborting the whole inspection push at the parcel step, leaving the
 * application, parcel and inspection rows committed locally with no FieldSync
 * task and no delivery attempt. Proven on `imaps_db_0921` as failed_jobs id 13.
 *
 * THE CONTRACT NOW PINNED
 * -----------------------
 * `supabase_parcels.geom` is a REPRESENTATIVE POINT built from the stored
 * parcel pin: `POINT(<longitude> <latitude>)`, longitude FIRST.
 *
 * This is a source contract because there is no frontend test runner in this
 * repository and no jsdom, and because a real bridge push would write to
 * Supabase - which this phase must not do. Real delivery is 9C-5.
 */
class ParcelPointBridgeContractTest extends TestCase
{
    private function jobPath(): string
    {
        return 'app/Jobs/PushInspectionToSupabase.php';
    }

    private function source(): string
    {
        $path = base_path($this->jobPath());

        $this->assertFileExists($path, 'The FieldSync writer job must exist.');

        return (string) file_get_contents($path);
    }

    /** Source with comments stripped, so prose about a defect can never satisfy a rule. */
    private function code(): string
    {
        $text = $this->source();
        $text = (string) preg_replace('#/\*.*?\*/#s', '', $text);
        $text = (string) preg_replace('#^\s*(//|\*).*$#m', '', $text);

        return (string) preg_replace('/\s+/', ' ', $text);
    }

    // ── 7. POINT CONSTRUCTION, WITH LONGITUDE FIRST ──────────────────────────

    public function test_the_remote_geom_is_built_from_the_stored_parcel_pin(): void
    {
        $code = $this->code();

        $this->assertStringContainsString(
            '"POINT({$parcel->longitude} {$parcel->latitude})"',
            $code,
            'The outgoing geom must be built from the stored parcel coordinates.',
        );
    }

    public function test_the_point_is_longitude_first(): void
    {
        $code = $this->code();

        // The ordering assertion is the whole point of this fix, so it is
        // asserted structurally rather than trusted: the literal must place
        // longitude before latitude, and never the reverse.
        $this->assertMatchesRegularExpression(
            '/POINT\(\{\$parcel->longitude\}\s*\{\$parcel->latitude\}\)/',
            $code,
            'WKT must be POINT(<longitude> <latitude>). Reversed order silently relocates the parcel.',
        );

        $this->assertStringNotContainsString(
            'POINT({$parcel->latitude} {$parcel->longitude})',
            $code,
            'WKT must never be POINT(<latitude> <longitude>); that is the transposed form.',
        );
    }

    public function test_the_stored_pin_is_the_only_coordinate_source(): void
    {
        $code = $this->code();

        // Both coordinates must be read from the parcel. Anything else would
        // introduce a second source of truth for the site pin.
        $this->assertStringContainsString('$parcel->longitude', $code);
        $this->assertStringContainsString('$parcel->latitude', $code);
    }

    // ── 8. NO POLYGON PAYLOAD ───────────────────────────────────────────────

    public function test_no_cadastral_geometry_is_read_into_the_payload(): void
    {
        $code = $this->code();

        // Scoped to GEOMETRY construction. The job legitimately touches other
        // tables, so this forbids only the spatial read that caused the defect.
        foreach ([
            'ST_AsText',
            'wkt_geom',
            "DB::table('land_parcels')",
            'land_parcels',
        ] as $forbidden) {
            $this->assertStringNotContainsString(
                $forbidden,
                $code,
                "The writer must not read '{$forbidden}'. The cadastral polygon is local-only.",
            );
        }
    }

    public function test_no_spatial_derivation_is_used_for_the_point(): void
    {
        $code = $this->code();

        // Explicitly rejected alternatives. A centroid or point-on-surface of a
        // concave cadastral lot can sit away from the officer's selected pin,
        // which would move the GPS threshold the inspector is judged against.
        foreach ([
            'ST_Centroid',
            'ST_PointOnSurface',
            'ST_GeometryType',
            'ST_AsGeoJSON',
            'MULTIPOLYGON',
            'POLYGON(',
        ] as $derivation) {
            $this->assertStringNotContainsString(
                $derivation,
                $code,
                "The writer must not use '{$derivation}'. The stored pin is the canonical point.",
            );
        }
    }

    // ── 9. NULL COORDINATE CONTRACT ─────────────────────────────────────────

    public function test_a_missing_coordinate_yields_null_not_a_fabricated_point(): void
    {
        $code = $this->code();

        // A null check on BOTH coordinates, and an explicit null result.
        $this->assertMatchesRegularExpression(
            '/\$parcel->longitude\s*!==\s*null\s*&&\s*\$parcel->latitude\s*!==\s*null/',
            $code,
            'Both coordinates must be null-checked. A truthiness check would also reject a valid 0 coordinate.',
        );

        $this->assertMatchesRegularExpression(
            '/:\s*null\s*;/',
            $code,
            'When a coordinate is missing the geometry must be null, not a fabricated point.',
        );

        // The specific fabrications that must never appear.
        foreach ([
            'POINT(0 0)',
            "'0'",
            'rosarioCenter',
        ] as $fabrication) {
            $this->assertStringNotContainsString(
                $fabrication,
                $code,
                "A missing pin must not become '{$fabrication}'. It must fail visibly instead.",
            );
        }
    }

    // ── 10. EVERY OTHER BRIDGE STEP IS UNCHANGED ────────────────────────────

    public function test_the_rest_of_the_bridge_payload_is_untouched(): void
    {
        $code = $this->code();

        // This fix changes exactly one value. These are the identities and
        // context fields the FieldSync bridge depends on; if any disappeared the
        // correction would have broken correlation instead of fixing delivery.
        foreach ([
            "'local_parcel_id'",
            "'supabase_application_id'",
            "'parcel_code'",
            "'property_index_number'",
            "'barangay'",
            "'lot_number'",
            "'lot_area_sqm'",
            "'latitude'",
            "'longitude'",
            "'geom'",
        ] as $field) {
            $this->assertStringContainsString(
                $field,
                $code,
                "The parcel payload field {$field} must survive this fix.",
            );
        }

        // And the ordered pipeline itself: application mirror, then parcel
        // mirror, then the field job.
        $appAt = strpos($code, 'supabase_zoning_applications');
        $parcelAt = strpos($code, 'supabase_parcels');
        $jobAt = strpos($code, 'field_jobs');

        $this->assertNotFalse($appAt, 'The application mirror step must remain.');
        $this->assertNotFalse($parcelAt, 'The parcel mirror step must remain.');
        $this->assertNotFalse($jobAt, 'The field job step must remain.');

        $this->assertLessThan(
            $parcelAt,
            $appAt,
            'The application mirror is written before the parcel mirror, because the parcel row references it.',
        );
        $this->assertLessThan(
            $jobAt,
            $parcelAt,
            'The field job is written after the parcel mirror, because it references the parcel row.',
        );
    }

    public function test_the_writer_still_correlates_and_guards_identity(): void
    {
        $code = $this->code();

        $this->assertStringContainsString(
            '?on_conflict=local_parcel_id',
            $code,
            'The upsert key must remain: a re-push must update, not duplicate, the parcel mirror row.',
        );

        $this->assertStringContainsString(
            'resolveSupabaseUserId',
            $code,
            'Handshake resolution for the Site Inspector must remain untouched.',
        );
    }

    // ── 6. NO REMOTE CONTRACT CHANGE ─────────────────────────────────────────

    public function test_no_remote_contract_is_changed_by_this_phase(): void
    {
        // The remote trigger, the RPC and the remote column type all still
        // require a POINT. This fix conforms the WRITER to them; it must not
        // have tried to change them, because that would have meant a Supabase
        // schema change, which this phase forbids.
        $code = $this->code();

        foreach ([
            'sync_parcel_latlng',
            'distance_to_parcel_boundary',
        ] as $remoteObject) {
            $this->assertStringNotContainsString(
                $remoteObject,
                $code,
                "The iMAPS writer must not define or alter the remote {$remoteObject}.",
            );
        }
    }

    public function test_no_migration_or_schema_artifact_was_added(): void
    {
        $migrationDiff = (string) shell_exec(
            'git diff --cached 4958fc4 -- database/migrations/ database/sql/'
        );

        $this->assertSame(
            '',
            trim($migrationDiff),
            'This is a bridge-writer correction only. It must not add a migration or forward SQL.',
        );
    }
}
