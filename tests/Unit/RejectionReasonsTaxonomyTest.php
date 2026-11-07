<?php

namespace Tests\Unit;

use App\Models\TechnicalReview;
use App\Support\RejectionReasons;
use PHPUnit\Framework\TestCase;

class RejectionReasonsTaxonomyTest extends TestCase
{
    /** @test */
    public function it_defines_eight_comprehensive_regulatory_categories(): void
    {
        $categories = RejectionReasons::categories();

        $this->assertCount(8, $categories);
        $this->assertContains(RejectionReasons::CATEGORY_ZONING, $categories);
        $this->assertContains(RejectionReasons::CATEGORY_EASEMENT, $categories);
        $this->assertContains(RejectionReasons::CATEGORY_ROW, $categories);
        $this->assertContains(RejectionReasons::CATEGORY_BUILDING, $categories);
        $this->assertContains(RejectionReasons::CATEGORY_BOUNDARY, $categories);
        $this->assertContains(RejectionReasons::CATEGORY_DOCS, $categories);
        $this->assertContains(RejectionReasons::CATEGORY_INSPECTION, $categories);
        $this->assertContains(RejectionReasons::CATEGORY_OTHER, $categories);
    }

    /** @test */
    public function it_defines_standard_reasons_with_complete_metadata(): void
    {
        $all = RejectionReasons::all();

        $this->assertGreaterThanOrEqual(21, count($all));

        foreach ($all as $code => $item) {
            $this->assertSame($code, $item['code']);
            $this->assertNotEmpty($item['category']);
            $this->assertContains($item['category'], RejectionReasons::categories());
            $this->assertNotEmpty($item['label']);
            $this->assertNotEmpty($item['regulatory_basis']);
            $this->assertNotEmpty($item['description']);
            $this->assertIsBool($item['requires_notes']);
        }
    }

    /** @test */
    public function it_identifies_rejection_causes_beyond_zoning_mismatch(): void
    {
        // 1. Waterway & Environmental legal easements (PD 1067)
        $this->assertTrue(RejectionReasons::isValidCode(RejectionReasons::EASEMENT_WATERWAY_VIOLATION));
        $easement = RejectionReasons::get(RejectionReasons::EASEMENT_WATERWAY_VIOLATION);
        $this->assertSame(RejectionReasons::CATEGORY_EASEMENT, $easement['category']);
        $this->assertStringContainsString('Water Code', $easement['regulatory_basis']);

        // 2. Road Right-of-Way (ROW) standards
        $this->assertTrue(RejectionReasons::isValidCode(RejectionReasons::ROW_ROAD_ENCROACHMENT));
        $row = RejectionReasons::get(RejectionReasons::ROW_ROAD_ENCROACHMENT);
        $this->assertSame(RejectionReasons::CATEGORY_ROW, $row['category']);
        $this->assertStringContainsString('Road Right-of-Way', $row['label']);

        // 3. National Building Code setbacks & spatial rules (PD 1096)
        $this->assertTrue(RejectionReasons::isValidCode(RejectionReasons::BUILDING_SETBACK_VIOLATION));
        $bldg = RejectionReasons::get(RejectionReasons::BUILDING_SETBACK_VIOLATION);
        $this->assertSame(RejectionReasons::CATEGORY_BUILDING, $bldg['category']);
        $this->assertStringContainsString('National Building Code', $bldg['regulatory_basis']);

        // 4. Lot Boundary & property verification disputes
        $this->assertTrue(RejectionReasons::isValidCode(RejectionReasons::BOUNDARY_ADJOINING_OVERLAP));
        $boundary = RejectionReasons::get(RejectionReasons::BOUNDARY_ADJOINING_OVERLAP);
        $this->assertSame(RejectionReasons::CATEGORY_BOUNDARY, $boundary['category']);

        // 5. Documentary & legal prerequisite deficiencies
        $this->assertTrue(RejectionReasons::isValidCode(RejectionReasons::DOCS_OWNERSHIP_UNVERIFIED));
        $docs = RejectionReasons::get(RejectionReasons::DOCS_OWNERSHIP_UNVERIFIED);
        $this->assertSame(RejectionReasons::CATEGORY_DOCS, $docs['category']);

        // 6. Site Inspection physical discrepancies
        $this->assertTrue(RejectionReasons::isValidCode(RejectionReasons::INSPECTION_ACTUAL_USE_CONTRADICTION));
        $inspect = RejectionReasons::get(RejectionReasons::INSPECTION_ACTUAL_USE_CONTRADICTION);
        $this->assertSame(RejectionReasons::CATEGORY_INSPECTION, $inspect['category']);
    }

    /** @test */
    public function it_groups_reasons_by_category_cleanly(): void
    {
        $grouped = RejectionReasons::byCategory();

        $this->assertCount(8, $grouped);

        foreach ($grouped as $cat => $items) {
            $this->assertContains($cat, RejectionReasons::categories());
            $this->assertNotEmpty($items);
            foreach ($items as $item) {
                $this->assertArrayHasKey('code', $item);
                $this->assertArrayHasKey('label', $item);
                $this->assertArrayHasKey('regulatory_basis', $item);
                $this->assertArrayHasKey('description', $item);
            }
        }
    }

    /** @test */
    public function it_formats_composite_decision_reason_string(): void
    {
        // Case 1: Standard reason with custom explanatory notes
        $formattedWithNotes = RejectionReasons::formatDecisionReason(
            RejectionReasons::EASEMENT_WATERWAY_VIOLATION,
            'Structure encroaches 1.8 meters into river easement bank.'
        );
        $this->assertSame(
            '[Environmental & Waterway Legal Easements - Waterway legal easement violation] Structure encroaches 1.8 meters into river easement bank.',
            $formattedWithNotes
        );

        // Case 2: Standard reason without custom notes (uses default statutory description)
        $formattedWithoutNotes = RejectionReasons::formatDecisionReason(
            RejectionReasons::ROW_ROAD_ENCROACHMENT
        );
        $expectedDesc = RejectionReasons::get(RejectionReasons::ROW_ROAD_ENCROACHMENT)['description'];
        $this->assertSame(
            "[Road Right-of-Way & Access Standards - Road Right-of-Way (ROW) encroachment] {$expectedDesc}",
            $formattedWithoutNotes
        );

        // Case 3: Unknown or null code preserves raw string notes
        $rawNotes = 'Custom manual decision reason provided directly.';
        $this->assertSame($rawNotes, RejectionReasons::formatDecisionReason(null, $rawNotes));
    }

    /** @test */
    public function technical_review_model_allows_rejection_taxonomy_fillable_columns(): void
    {
        $fillable = (new TechnicalReview())->getFillable();

        $this->assertContains('rejection_category', $fillable);
        $this->assertContains('rejection_code', $fillable);
    }
}
