<?php

namespace App\Services;

use App\Models\ZoningApplication;
use PhpOffice\PhpWord\TemplateProcessor;
use Illuminate\Support\Facades\Log;

class PermitDocumentService
{
    /**
     * Path to template directory
     */
    protected string $templatePath;

    public function __construct()
    {
        $this->templatePath = storage_path('app/templates/permits');
    }

    /**
     * Map application data to common template placeholders.
     */
    protected function getCommonReplacements(ZoningApplication $application, array $customFields = []): array
    {
        $parcels = $application->parcels ?? collect();
        $firstParcel = $parcels->first();

        // Concatenate parcel attributes
        $parcelCodes  = $parcels->pluck('parcel_code')->filter()->implode(', ');
        $owners       = $parcels->pluck('owner_name')->filter()->unique()->implode(', ');
        $pins         = $parcels->pluck('property_index_number')->filter()->implode(', ');
        $lots         = $parcels->pluck('lot_number')->filter()->implode(', ');
        $tcts         = $parcels->pluck('tct_number')->filter()->implode(', ');
        $taxDecs      = $parcels->pluck('tax_dec_number')->filter()->implode(', ');
        $arps         = $parcels->pluck('arp_number')->filter()->implode(', ');
        $surveys      = $parcels->pluck('survey_number')->filter()->implode(', ');
        $parcelZoning = $parcels->pluck('land_use_class')->filter()->unique()->implode(', ');
        $latitudes    = $parcels->pluck('latitude')->filter()->implode(', ');
        $longitudes   = $parcels->pluck('longitude')->filter()->implode(', ');

        $totalArea = $parcels->sum('lot_area_sqm');
        if ($totalArea <= 0 && $application->area_to_develop) {
            $totalArea = $application->area_to_develop;
        }

        $dateFormatted = !empty($customFields['date_issued']) 
            ? date('F d, Y', strtotime($customFields['date_issued'])) 
            : now()->format('F d, Y');

        $dateFiledFormatted = $application->created_at ? $application->created_at->format('F d, Y') : $dateFormatted;

        $signatoryName = !empty($customFields['signatory_name']) 
            ? strtoupper($customFields['signatory_name']) 
            : strtoupper($application->encodedBy?->name ?? 'ENGR. JUAN DELA CRUZ');

        $signatoryTitle = !empty($customFields['signatory_title']) 
            ? strtoupper($customFields['signatory_title']) 
            : 'MUNICIPAL PLANNING & DEVELOPMENT COORDINATOR';

        $permitConditions = !empty($customFields['permit_conditions']) 
            ? $customFields['permit_conditions'] 
            : 'Standard municipal zoning compliance and building regulations apply.';

        return [
            'APPLICATION_NO'        => $customFields['reference_number'] ?? $application->reference_number ?? 'N/A',
            'REFERENCE_NUMBER'      => $customFields['reference_number'] ?? $application->reference_number ?? 'N/A',
            'DATE_FILED'            => $dateFiledFormatted,
            'DATE_ISSUED'           => $dateFormatted,
            'APPLICANT_NAME'        => strtoupper($application->applicant_name ?? 'N/A'),
            'NAME_OF_APPLICANT'     => strtoupper($application->applicant_name ?? 'N/A'),
            'CORPORATION_NAME'      => strtoupper($application->corporation_name ?? 'N/A'),
            'REPRESENTATIVE_NAME'   => strtoupper($application->representative_name ?? 'N/A'),
            'CONTACT_NUMBER'        => $application->contact_number ?? 'N/A',
            'ADDRESS'               => strtoupper(($application->street_address ? $application->street_address . ', ' : '') . 'BRGY. ' . $application->barangay . ', ROSARIO, BATANGAS'),
            'BARANGAY'              => strtoupper($application->barangay ?? 'N/A'),
            'LOCATION'              => strtoupper(($application->street_address ? $application->street_address . ', ' : '') . 'BRGY. ' . $application->barangay . ', ROSARIO, BATANGAS'),
            'APPLICATION_TYPE'      => $application->application_type ?? 'N/A',
            'PURPOSE'               => $application->purpose ?? 'N/A',
            'PROJECT_NAME'          => strtoupper($application->project_type_business_name ?? $application->purpose ?? 'N/A'),
            'BUSINESS_NAME'         => strtoupper($application->project_type_business_name ?? 'N/A'),
            'LAND_USE_CLASS'        => $application->target_land_use_class ?? $application->land_use_class ?? $parcelZoning ?: 'N/A',
            'TOTAL_AREA'            => number_format($totalArea, 2),
            'LOT_AREA'              => number_format($totalArea, 2),
            'PROPERTY_INDEX_NO'     => $pins ?: ($firstParcel?->property_index_number ?? 'N/A'),
            'PIN'                   => $pins ?: 'N/A',
            'LOT_NO'                => $lots ?: 'N/A',
            'LOT_NUMBER'            => $lots ?: 'N/A',
            'TCT_NO'                => $tcts ?: 'N/A',
            'TCT_NUMBER'            => $tcts ?: 'N/A',
            'TAX_DEC_NO'            => $taxDecs ?: 'N/A',
            'TAX_DEC_NUMBER'        => $taxDecs ?: 'N/A',
            'ARP_NO'                => $arps ?: 'N/A',
            'ARP_NUMBER'            => $arps ?: 'N/A',
            'TD_ARP'                => ($taxDecs ?: '') . ($arps ? ' / ' . $arps : '') ?: 'N/A',
            'SURVEY_NO'             => $surveys ?: 'N/A',
            'SURVEY_NUMBER'         => $surveys ?: 'N/A',
            'PARCEL_CODE'           => $parcelCodes ?: 'N/A',
            'REGISTERED_OWNER'      => strtoupper($owners ?: $application->applicant_name ?: 'N/A'),
            'PARCEL_OWNER'          => strtoupper($owners ?: $application->applicant_name ?: 'N/A'),
            'LATITUDE'              => $latitudes ?: 'N/A',
            'LONGITUDE'             => $longitudes ?: 'N/A',
            'ASSESSMENT_FEE'        => number_format($application->assessment_fee ?? 0, 2),
            'OR_NUMBER'             => $customFields['or_number'] ?? $application->or_number ?? 'To be issued',
            'RIGHT_OVER_LAND'       => $application->right_over_land ?? 'Owner',
            'ENCODED_BY'            => strtoupper($application->encodedBy?->name ?? 'Planning Staff'),
            'STATUS'                => $application->status ?? 'Received',
            'BUILDING_AREA'         => number_format($application->building_area ?? 0, 2),
            'AREA_TO_DEVELOP'       => number_format($application->area_to_develop ?? 0, 2),
            'PROJECT_COST'          => number_format($application->project_cost ?? 0, 2),
            'NUMBER_OF_SALEABLE_LOTS' => $application->number_of_saleable_lots ?? 'N/A',
            'PREFERRED_RELEASE_MODE' => $application->preferred_release_mode ?? 'N/A',
            'SB_ORDINANCE_NUMBER'   => $customFields['sb_ordinance_number'] ?? $application->sb_ordinance_number ?? 'N/A',
            'FORM_NUMBER'           => $application->form_number ?? 'N/A',
            'SIGNATORY_NAME'        => $signatoryName,
            'SIGNATORY_TITLE'       => $signatoryTitle,
            'PERMIT_CONDITIONS'     => $permitConditions,
            'CUSTOM_NOTES'          => $customFields['custom_notes'] ?? 'None',
        ];
    }

    /**
     * Generate Locational Clearance Document (.docx)
     */
    public function generateLocationalClearance(ZoningApplication $application, array $customFields = []): string
    {
        $templateFile = $this->templatePath . '/LC_TEMPLATE_removed.docx';
        return $this->processTemplate($templateFile, $application, 'Locational_Clearance', $customFields);
    }

    /**
     * Generate Zoning Evaluation Document (.docx)
     */
    public function generateZoningEvaluation(ZoningApplication $application, array $customFields = []): string
    {
        $templateFile = $this->templatePath . '/ZONING EVAL_TEMPLATE.docx';
        return $this->processTemplate($templateFile, $application, 'Zoning_Evaluation', $customFields);
    }

    /**
     * Generate Development Permit Document (.docx)
     */
    public function generateDevelopmentPermit(ZoningApplication $application, array $customFields = []): string
    {
        $templateFile = $this->templatePath . '/DP_TEMPLATE.docx';
        return $this->processTemplate($templateFile, $application, 'Development_Permit', $customFields);
    }

    /**
     * Generate Zoning Certification Document (.docx)
     */
    public function generateZoningCertification(ZoningApplication $application, array $customFields = []): string
    {
        $templateFile = $this->templatePath . '/ZC_TEMPLATE_removed.docx';
        return $this->processTemplate($templateFile, $application, 'Zoning_Certification', $customFields);
    }

    /**
     * Process template by replacing tags and saving to output path
     */
    protected function processTemplate(string $templateFile, ZoningApplication $application, string $prefix, array $customFields = []): string
    {
        if (!file_exists($templateFile)) {
            throw new \RuntimeException("Permit template file not found at: {$templateFile}");
        }

        $processor = new TemplateProcessor($templateFile);
        $replacements = $this->getCommonReplacements($application, $customFields);

        foreach ($replacements as $key => $value) {
            // Replace both ${KEY} and {KEY} style placeholders if present
            $processor->setValue($key, (string) $value);
            $processor->setValue('{' . $key . '}', (string) $value);
            $processor->setValue('${' . $key . '}', (string) $value);
        }

        $outputDir = storage_path('app/generated_permits');
        if (!file_exists($outputDir)) {
            mkdir($outputDir, 0755, true);
        }

        $sanitizedRef = preg_replace('/[^A-Za-z0-9_\-]/', '_', $application->reference_number);
        $outputPath = $outputDir . "/{$prefix}_{$sanitizedRef}.docx";

        $processor->saveAs($outputPath);
        return $outputPath;
    }
}
