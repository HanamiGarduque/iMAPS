<?php

/*
|--------------------------------------------------------------------------
| Permit generation (Excel template → PDF)
|--------------------------------------------------------------------------
|
| Permits are produced from ONE workbook that keeps the office's exact
| layout. Each permit is a sheet in that workbook. At generation time the
| chosen sheet is filled in (every ${TAG} is replaced), all of its formulas
| are frozen to plain values, every other sheet is dropped, and the result is
| converted to PDF with LibreOffice.
|
| Tags are written in the cells as ${TAG_NAME} (spaces are treated as "_",
| so ${BUILDING SETBACK} == ${BUILDING_SETBACK}). Unknown ${TAGS} print blank.
|
| To change a permit: edit the .xlsx in Excel/Sheets and re-upload it to
| storage/app/templates/permits. Only touch this file when you add a NEW tag
| or a new dropdown that should be shared between permits.
|
*/

return [

    'template' => storage_path('app/templates/permits/LC_ZC_DP_TEMPLATE W TAGS.xlsx'),

    // Sheet that holds the dropdown option lists (data validation sources)
    'list_sheet' => 'LIST',
    'allowed_uses_sheet' => 'ALLOWED USES LIST',

    // How the filled .xlsx is turned into a PDF (see App\Services\PermitPdfConverter):
    //   auto        → Microsoft Excel (Windows) → remote Excel converter → LibreOffice → dompdf
    //   remote      → always the Windows Excel converter below (for cloud hosts such as Railway)
    //   excel       → always Microsoft Excel (Windows only)   libreoffice → always LibreOffice
    //   dompdf      → no external software, rougher layout (draft quality)
    'pdf_driver' => env('PERMIT_PDF_DRIVER', 'auto'),

    // Windows machine running scripts/excel-converter (real Excel, exact layout). Used by the cloud app.
    'remote_url' => env('PERMIT_REMOTE_URL', ''),
    'remote_key' => env('PERMIT_REMOTE_KEY', ''),

    // LibreOffice binary. Leave as "soffice" to auto-detect (PATH + usual install folders),
    // or set a full path, e.g. "C:\Program Files\LibreOffice\program\soffice.exe"
    'soffice' => env('PERMIT_SOFFICE_BIN', 'soffice'),

    // Defaults for the signatories (editable in the Generate Permit modal)
    'zoning_administrator' => env('PERMIT_ZONING_ADMIN', 'Myralyn A. Luistro, PDO III'),

    /*
    | Permit documents. `cells` overrides specific cells with a tag template —
    | used where the workbook still has cross-sheet formulas (e.g. pointing at
    | the "ORIG COPY OF ..." sheets) instead of tags. Those are resolved from
    | the same cell of the matching sheet WITHOUT "ORIG COPY OF" (e.g.
    | 'ORIG COPY OF EVALUATION'!M27 → EVALUATION!M27). Everything else in the
    | sheet is filled automatically from the ${TAGS} already typed in it.
    | `bind` ties a dropdown cell to a named field so its value can be reused
    | by other permits.
    */
    'documents' => [

        // Only cells the template cannot fill by itself are overridden here: checkmarks and
        // dropdowns chosen in the modal (the template holds a fixed sample value there), and
        // formulas whose source is gone. Everything else prints exactly as typed in the workbook.

        'ze' => [
            'label'      => 'Zoning Evaluation',
            'sheet'      => 'EVALUATION',
            'paper'      => 'A4',
            'print_area' => 'A1:N80',
            'fit_height' => 2, // printed on 2 pages
            // The Zoning Administrator's name box (H74:J74) is too narrow for the name; K-N are empty.
            'merge' => ['H74:N74' => 'left'],
            'cells' => [
                'W8'  => '${ZONING_CLASSIFICATION}', // =K63
                'C23' => '${ROL_OWNER_MARK}',
                'G23' => '${ROL_LESSEE_MARK}',
                'L23' => '${ROL_OTHERS_MARK}',
                'C24' => '${REF_LOT_PLAN}',
                'F24' => '${REF_SKETCH_PLAN}',
                'J24' => '${REF_TITLE}',
                'L24' => '${REF_OTHERS}',
                'W10' => '${EVALUATION_OF_FACTS}',
                'C29' => '${ZONING_REQUIREMENT}',
                'K63' => '${ZONING_CLASSIFICATION}',
                'R11' => '${BUILDING_SETBACK}',
            ],
            'bind' => [
                'W10' => 'EVALUATION_OF_FACTS',
                'C29' => 'ZONING_REQUIREMENT',
                'K63' => 'ZONING_CLASSIFICATION',
            ],
        ],

        'lc' => [
            'label'      => 'Locational Clearance',
            'sheet'      => 'LC',
            'paper'      => 'A4',
            'print_area' => 'A1:G54',
            'fit_height' => 1,
            'cells' => [
                'A26' => '${EVALUATION_OF_FACTS}', // =EVALUATION!W10 (dropdown)
                'B30' => '${ZONING_REQUIREMENT}',  // =EVALUATION!C29 (dropdown)
            ],
            'bind' => [],
        ],

        'zc' => [
            'label'      => 'Zoning Certificate',
            'sheet'      => 'ZONING',
            'paper'      => 'A4',
            'print_area' => 'A1:I83',
            'fit_height' => 0,
            'cells' => [
                'F40' => '${CERTIFICATION_PURPOSE}',
                // ='ORIG COPY OF EVALUATION'!P20 — that sheet no longer exists (#REF!)
                'A42' => '${GIVEN_DATE}',
            ],
            'bind' => [
                'F40' => 'CERTIFICATION_PURPOSE',
            ],
        ],

        'dp' => [
            'label'      => 'Development Permit',
            'sheet'      => 'DP',
            'paper'      => 'FOLIO', // 8.5" x 13" long bond
            'print_area' => 'A1:J53',
            'fit_height' => 1,
            'cells' => [],
            'bind' => [],
        ],
    ],

    // Old / alternate tag names → the canonical field they show
    'aliases' => [
        'NAME_OF_APPLICANT'        => 'APPLICANT_NAME',
        'DECISION_NO'              => 'LC_DN',
        'ZONING_CERT_NO'           => 'ZC_DN',
        'BUSINESS_NAME'            => 'PROJECT_NAME',
        'LAND_USE_CLASS'           => 'ZONING_CLASSIFICATION',
        'REFERENCE_NUMBER'         => 'APPLICATION_NO',
        'ZC_AMOUNT'                => 'ZONING_FEE',
        'ZONING_CERTIFICATE_FEE'   => 'ZONING_FEE',
        'LOCATIONAL_CLEARANCE'     => 'LOCATIONAL_CLEARANCE_FEE',
        'DEVELOPMENT_PERMIT_FEE'   => 'DEVELOPMENT_FEE',
    ],

    // Tags computed from other fields — never shown in the modal
    'derived' => [
        'YEAR_TODAY', 'MONTH_TODAY', 'DAY_TODAY', 'GIVEN_DATE',
        'ROL_OWNER_MARK', 'ROL_LESSEE_MARK', 'ROL_OTHERS_MARK',
    ],

    /*
    | Fields shown in the Generate Permit modal. Only the fields whose tags
    | appear in the selected permit are shown. `options` reads a dropdown list
    | straight from the LIST sheet, so the modal always matches the workbook.
    */
    'fields' => [
        // Numbers & dates
        'APPLICATION_NO'  => ['label' => 'Application No.',            'group' => 'Numbers & dates', 'readonly' => true],
        'FORM_NUMBER'     => ['label' => 'Form No.',                   'group' => 'Numbers & dates', 'readonly' => true],
        'ZE_NO'           => ['label' => 'Zoning Evaluation No.',      'group' => 'Numbers & dates'],
        'LC_DN'           => ['label' => 'LC Decision No.',            'group' => 'Numbers & dates'],
        'ZC_DN'           => ['label' => 'Zoning Certificate No.',   'group' => 'Numbers & dates'],
        'DP_DN'           => ['label' => 'Development Permit No.',     'group' => 'Numbers & dates'],
        'DATE_TODAY'      => ['label' => 'Evaluation date',            'group' => 'Numbers & dates', 'type' => 'date'],
        'DATE_ISSUED'     => ['label' => 'Date issued',                'group' => 'Numbers & dates', 'type' => 'date'],
        'BRGY_RESOLUTION' => ['label' => 'Barangay Resolution No.',    'group' => 'Numbers & dates'],
        'SB_RESOLUTION'   => ['label' => 'SB Resolution / Ordinance No.', 'group' => 'Numbers & dates'],
        'DATE_APPROVED'   => ['label' => 'SB Resolution date approved', 'group' => 'Numbers & dates'],

        // Applicant & project
        'APPLICANT_NAME'      => ['label' => 'Name of applicant',        'group' => 'Applicant & project', 'readonly' => true],
        'STREET_APP'          => ['label' => 'Applicant street',         'group' => 'Applicant & project', 'readonly' => true],
        'BARANGAY_APP'        => ['label' => 'Applicant barangay',       'group' => 'Applicant & project', 'readonly' => true],
        'ADDRESS'             => ['label' => 'Applicant address',        'group' => 'Applicant & project', 'readonly' => true],
        'CONTACT_NUMBER'      => ['label' => 'Contact number',           'group' => 'Applicant & project', 'readonly' => true],
        'CORPORATION_NAME'    => ['label' => 'Name of corporation',      'group' => 'Applicant & project', 'readonly' => true],
        'CORPORATION_ADDRESS' => ['label' => 'Corporation address / tel.', 'group' => 'Applicant & project', 'readonly' => true],
        'PROJECT_NAME'        => ['label' => 'Project / business name',  'group' => 'Applicant & project', 'readonly' => true],
        'PROJECT_TYPE'        => ['label' => 'Project type',             'group' => 'Applicant & project', 'readonly' => true],
        'PROPOSED_USE'        => ['label' => 'Proposed use',             'group' => 'Applicant & project', 'readonly' => true],
        'PROJECT_AREA'        => ['label' => 'Project area (sq.m)',      'group' => 'Applicant & project', 'readonly' => true],
        'BUILDING_AREA'       => ['label' => 'Building floor area (sq.m)', 'group' => 'Applicant & project', 'readonly' => true],
        'SALEABLE_LOTS'       => ['label' => 'No. of saleable lots',     'group' => 'Applicant & project', 'readonly' => true],

        // Lot / property
        'PARCEL_OWNER'      => ['label' => 'Registered owner',          'group' => 'Lot / property', 'readonly' => true],
        'PARCEL_COUNT'      => ['label' => 'No. of parcel(s)',          'group' => 'Lot / property', 'readonly' => true],
        'LOT_NO'            => ['label' => 'Lot No.',                   'group' => 'Lot / property', 'readonly' => true],
        'STREET_LOT'        => ['label' => 'Lot street',                'group' => 'Lot / property', 'readonly' => true],
        'BARANGAY_LOT'      => ['label' => 'Lot barangay',              'group' => 'Lot / property', 'readonly' => true],
        'BARANGAY'          => ['label' => 'Barangay',                  'group' => 'Lot / property', 'readonly' => true],
        'PROJECT_LOCATION'  => ['label' => 'Project / property location', 'group' => 'Lot / property', 'readonly' => true],
        'LOT_AREA'          => ['label' => 'Total lot area (sq.m)',     'group' => 'Lot / property', 'readonly' => true],
        'TD_ARP'            => ['label' => 'TD / ARP No.',              'group' => 'Lot / property', 'readonly' => true],
        'PROPERTY_INDEX_NO' => ['label' => 'Property Index No. (PIN)',  'group' => 'Lot / property', 'readonly' => true],
        'RIGHT_OVER_LAND'   => ['label' => 'Right over land',           'group' => 'Lot / property', 'type' => 'select', 'options' => ['OWNER', 'LESSEE', 'OTHERS'], 'readonly' => true],
        'BUILDING_SETBACK'  => ['label' => 'Building setback (from road centerline)', 'group' => 'Lot / property'],

        // Evaluation
        'EVALUATION_OF_FACTS'   => ['label' => 'Evaluation of facts',    'group' => 'Evaluation', 'type' => 'select', 'options' => 'LIST!A2:A3'],
        'ZONING_CLASSIFICATION' => ['label' => 'Zoning classification',  'group' => 'Evaluation', 'type' => 'select', 'options' => 'LIST!D2:D26'],
        'ZONING_REQUIREMENT'    => ['label' => 'Zoning requirement',     'group' => 'Evaluation', 'type' => 'select', 'options' => 'LIST!D2:D26'],
        'ALLOWABLE_USE'         => ['label' => 'Allowable use',          'group' => 'Evaluation', 'type' => 'allowed_use'],
        'CERTIFICATION_PURPOSE' => ['label' => 'Certification issued for', 'group' => 'Evaluation', 'type' => 'select', 'options' => 'LIST!K2:K5'],
        'PROJECT_TYPE_NOTE'     => ['label' => 'Remarks',                'group' => 'Evaluation'],
        'REF_LOT_PLAN'          => ['label' => 'Reference: Lot Plan',     'group' => 'Evaluation', 'type' => 'check'],
        'REF_SKETCH_PLAN'       => ['label' => 'Reference: Lot Sketch Plan', 'group' => 'Evaluation', 'type' => 'check'],
        'REF_TITLE'             => ['label' => 'Reference: Title',        'group' => 'Evaluation', 'type' => 'check'],
        'REF_OTHERS'            => ['label' => 'Reference: Others',       'group' => 'Evaluation', 'type' => 'check'],

        // Fees
        'OR_NUMBER'                => ['label' => 'O.R. No.',                          'group' => 'Fees', 'readonly' => true],
        'ASSESSMENT_FEE'           => ['label' => 'Amount paid (Php)',                 'group' => 'Fees', 'readonly' => true],
        'ZONING_FEE'               => ['label' => 'Zoning Certificate fee (Php)',      'group' => 'Fees', 'readonly' => true],
        'LOCATIONAL_CLEARANCE_FEE' => ['label' => 'Locational Clearance fee (Php)',    'group' => 'Fees', 'readonly' => true],
        'DEVELOPMENT_FEE'          => ['label' => 'Development fee (Php)',             'group' => 'Fees', 'readonly' => true],
        'ZC_AMOUNT'                => ['label' => 'Zoning Certificate amount',         'group' => 'Fees', 'type' => 'select', 'options' => 'LIST!K10:K28'],

        // Signatories
        'PLANNING_OFFICER' => ['label' => 'Prepared by (Planning Officer)', 'group' => 'Signatories'],
        'PO_INITIALS'      => ['label' => 'Encoder initials',              'group' => 'Signatories'],
        'ADMIN'            => ['label' => 'Zoning Administrator',          'group' => 'Signatories'],
    ],
];
