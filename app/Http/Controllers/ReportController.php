<?php

namespace App\Http\Controllers;

use App\Models\ZoningApplication;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Support\Facades\DB;

class ReportController extends Controller
{
    private const BARANGAYS = [
        'Alupay', 'Antipolo', 'Bagong Pook', 'Balibago',
        'Barangay A (Poblacion)', 'Barangay B (Poblacion)', 'Barangay C (Poblacion)',
        'Barangay D (Poblacion)', 'Barangay E (Poblacion)',
        'Bayawang', 'Baybayin', 'Bulihan', 'Cahigam', 'Calantas', 'Colongan', 'Itlugan',
        'Leviste (Tubahan)', 'Lumbangan', 'Maalas-as', 'Mabato', 'Mabunga',
        'Macalamcam A', 'Macalamcam B', 'Malaya', 'Maligaya', 'Marilag', 'Masaya',
        'Matamis (Malinao)', 'Mavalor', 'Mayuro', 'Namuco', 'Namunga', 'Nasi', 'Natu',
        'Palakpak', 'Pinagsibaan', 'Putingkahoy', 'Quilib', 'Salao', 'San Agustin',
        'San Carlos', 'San Ignacio', 'San Isidro', 'San Jose', 'San Roque', 'Santa Cruz',
        'Timbugan', 'Tiquiwan', 'Tulos',
    ];

    public function index()
    {
        return Inertia::render('Reports/Index', [
            'barangays' => self::BARANGAYS,
        ]);
    }

    private function getHeaders(array $variables): array
    {
        $headers = [];
        foreach ($variables as $var) {
            switch ($var) {
                case 'month': $headers[] = 'Month'; break;
                case 'day': $headers[] = 'Day'; break;
                case 'date': $headers[] = 'Date Filed'; break;
                case 'year': $headers[] = 'Year'; break;
                case 'application_type': $headers[] = 'Application Type'; break;
                case 'status': $headers[] = 'Status'; break;
                case 'name': $headers[] = 'Name'; break;
                case 'barangay': $headers[] = 'Barangay'; break;
                case 'land_use_class': $headers[] = 'Land Use Class'; break;
                case 'lot_area_sqm': $headers[] = 'Lot Area (SQM)'; break;
                case 'building_area': $headers[] = 'Building Area (SQM)'; break;
                case 'purpose': $headers[] = 'Purpose'; break;
                case 'project_cost': $headers[] = 'Project Cost (PHP)'; break;
                case 'assessment_fee': $headers[] = 'Assessment Fee (PHP)'; break;
                case 'reference_number': $headers[] = 'Reference Number'; break;
            }
        }
        return empty($headers) ? ['Reference Number'] : $headers;
    }

    private function extractValue($item, $var)
    {
        switch ($var) {
            case 'month': return $item->created_at ? $item->created_at->format('F') : '';
            case 'day': return $item->created_at ? $item->created_at->format('d') : '';
            case 'date': return $item->created_at ? $item->created_at->format('Y-m-d') : '';
            case 'year': return $item->created_at ? $item->created_at->format('Y') : '';
            case 'application_type': return $item->application_type;
            case 'status': return $item->status;
            case 'name': return $item->applicant_name ?: ($item->parcels->first()->owner_name ?? '');
            case 'barangay': return $item->barangay ?: ($item->parcels->first()->barangay ?? '');
            case 'land_use_class': return $item->land_use_class ?: ($item->parcels->first()->land_use_class ?? '');
            // Summing float areas leaves artefacts like 1266.1599999; round to centimetre precision.
            case 'lot_area_sqm': return round((float) $item->parcels->sum('lot_area_sqm'), 2);
            case 'building_area': return $item->building_area;
            case 'purpose': return $item->purpose;
            case 'project_cost': return $item->project_cost;
            case 'assessment_fee': return $item->assessment_fee;
            case 'reference_number': return $item->reference_number;
            default: return '';
        }
    }

    private function buildQuery(Request $request)
    {
        $query = ZoningApplication::with('parcels');

        if ($request->start_date) {
            $query->whereDate('created_at', '>=', $request->start_date);
        }
        if ($request->end_date) {
            $query->whereDate('created_at', '<=', $request->end_date);
        }
        if ($request->application_type && $request->application_type !== 'All') {
            $query->where('application_type', $request->application_type);
        }
        // Same fallback as extractValue(): the application's own barangay, else its first parcel's.
        if ($request->barangay) {
            $b = $request->barangay;
            $query->where(function ($q) use ($b) {
                $q->where('barangay', $b)
                  ->orWhere(function ($q2) use ($b) {
                      $q2->where(fn ($e) => $e->whereNull('barangay')->orWhere('barangay', ''))
                         ->whereHas('parcels', fn ($p) => $p->where('barangay', $b));
                  });
            });
        }

        return $query;
    }

    private function generateSummaryData($data, $groupBy, $aggregation)
    {
        $groupedData = [];

        // Pre-fill all Rosario Barangays if grouping by Barangay
        if ($groupBy === 'barangay') {
            foreach (self::BARANGAYS as $b) {
                $groupedData[$b] = ['count' => 0, 'lot_area' => 0, 'fee' => 0, 'project_cost' => 0, 'building_area' => 0];
            }
        }

        foreach ($data as $item) {
            // Months are keyed by year too ("2026-01"), so January 2025 and January 2026 stay separate.
            $val = $groupBy === 'month'
                ? ($item->created_at ? $item->created_at->format('Y-m') : '')
                : (string) $this->extractValue($item, $groupBy);
            if ($val === '') $val = 'Unknown';
            
            if (!isset($groupedData[$val])) {
                $groupedData[$val] = ['count' => 0, 'lot_area' => 0, 'fee' => 0, 'project_cost' => 0, 'building_area' => 0];
            }
            
            $groupedData[$val]['count']++;
            $groupedData[$val]['lot_area'] += (float) $this->extractValue($item, 'lot_area_sqm');
            $groupedData[$val]['fee'] += (float) $this->extractValue($item, 'assessment_fee');
            $groupedData[$val]['project_cost'] += (float) $this->extractValue($item, 'project_cost');
            $groupedData[$val]['building_area'] += (float) $this->extractValue($item, 'building_area');
        }

        // Time groupings read best in chronological order.
        if (in_array($groupBy, ['month', 'year'])) {
            ksort($groupedData);
        }

        $labels = [];
        $dataPts = [];
        $rows = [];
        $datasetLabel = 'Count';

        foreach ($groupedData as $label => $stats) {
            if ($groupBy === 'month' && $label !== 'Unknown') {
                $label = \Carbon\Carbon::createFromFormat('Y-m', $label)->format('M Y');
            }
            $val = 0;
            if ($aggregation === 'sum_lot_area') {
                $val = round($stats['lot_area'], 2);
                $datasetLabel = 'Total Lot Area (SQM)';
            } elseif ($aggregation === 'avg_lot_area') {
                $val = $stats['count'] > 0 ? round($stats['lot_area'] / $stats['count'], 2) : 0;
                $datasetLabel = 'Avg Lot Area (SQM)';
            } elseif ($aggregation === 'sum_building_area') {
                $val = round($stats['building_area'], 2);
                $datasetLabel = 'Total Building Area (SQM)';
            } elseif ($aggregation === 'sum_fee') {
                $val = round($stats['fee'], 2);
                $datasetLabel = 'Total Assessment Fee (PHP)';
            } elseif ($aggregation === 'sum_project_cost') {
                $val = round($stats['project_cost'], 2);
                $datasetLabel = 'Total Project Cost (PHP)';
            } else {
                $val = $stats['count'];
                $datasetLabel = 'Total Applications';
            }
            
            $labels[] = $label;
            $dataPts[] = $val;
            $rows[] = [$label, $val];
        }

        return [
            'labels' => $labels,
            'data' => $dataPts,
            'datasetLabel' => $datasetLabel,
            'groupName' => ucwords(str_replace('_', ' ', $groupBy)),
            'rows' => $rows
        ];
    }

    // Only embed what is genuinely a PNG data URI; anything else is dropped and the PDF shows the table alone.
    private function validPngDataUri(?string $uri): ?string
    {
        if (!$uri || !str_starts_with($uri, 'data:image/png;base64,')) {
            return null;
        }
        $bytes = base64_decode(substr($uri, 22), true);
        return $bytes !== false && str_starts_with($bytes, "\x89PNG\r\n\x1a\n") ? $uri : null;
    }

    // Shared by preview and download so both accept exactly the same options.
    private function reportRules(): array
    {
        return [
            'start_date' => 'nullable|date',
            'end_date' => 'nullable|date|after_or_equal:start_date',
            'application_type' => 'nullable|in:All,Locational Clearance,Zoning Certificate,Development Permit',
            'barangay' => 'nullable|in:' . implode(',', self::BARANGAYS),
            'variables' => 'nullable|array',
            'variables.*' => 'in:reference_number,date,application_type,status,name,barangay,land_use_class,lot_area_sqm,building_area,project_cost,purpose,assessment_fee',
            'presentation_style' => 'nullable|in:table,summary_table,bar_chart,horizontal_bar_chart,line_chart,pie_chart,doughnut_chart',
            'aggregation' => 'nullable|in:count,sum_lot_area,avg_lot_area,sum_building_area,sum_project_cost,sum_fee',
            'group_by' => 'nullable|in:status,barangay,application_type,land_use_class,month,year',
        ];
    }

    public function previewReport(Request $request)
    {
        $request->validate($this->reportRules(), [
            'end_date.after_or_equal' => 'The end date must be on or after the start date.',
        ]);

        $query = $this->buildQuery($request);
        $total_rows = (clone $query)->count();

        // Only the columns the user picked, in the order they picked them.
        $vars = array_values(array_unique($request->variables ?: ['reference_number']));

        $chartData = null;

        if ($request->presentation_style && $request->presentation_style !== 'table') {
            $allData = $query->get();
            $summary = $this->generateSummaryData($allData, $request->group_by ?? 'barangay', $request->aggregation ?? 'count');
            $headers = [$summary['groupName'], $summary['datasetLabel']];
            $rows = $summary['rows'];
            
            // Raw series only: the browser draws the chart itself, so no data leaves the server.
            if (str_ends_with((string) $request->presentation_style, '_chart')) {
                $chartData = [
                    'labels' => $summary['labels'],
                    'data' => $summary['data'],
                    'datasetLabel' => $summary['datasetLabel'],
                ];
            }
        } else {
            $headers = $this->getHeaders($vars);
            $rows = [];
            // The preview only shows 100 rows, so only fetch 100.
            foreach ($query->limit(100)->get() as $item) {
                $row = [];
                foreach ($vars as $var) {
                    $row[] = $this->extractValue($item, $var);
                }
                $rows[] = $row;
            }
        }

        return response()->json([
            'headers' => $headers,
            'rows' => $rows,
            'chartData' => $chartData,
            'total_rows' => $total_rows
        ]);
    }

    public function generateReport(Request $request)
    {
        $request->validate($this->reportRules() + [
            'format' => 'required|in:pdf,csv,xlsx',
            'document_size' => 'nullable|in:a4,letter,legal',
            'orientation' => 'nullable|in:portrait,landscape',
            // Chart drawn by the browser; ~4 MB ceiling covers a 2000×1200 PNG with room to spare.
            'chart_image' => 'nullable|string|max:4000000',
            // Text size (px) chosen by the preview so wide tables fit the paper width.
            'font_size' => 'nullable|numeric|between:5,12',
            // Chart width (px) chosen by the preview so the chart and table fit on page 1.
            'chart_width' => 'nullable|numeric|between:100,1000',
        ], [
            'end_date.after_or_equal' => 'The end date must be on or after the start date.',
        ]);

        $query = $this->buildQuery($request);
        $allData = $query->get();

        // Only the columns the user picked, in the order they picked them.
        $vars = array_values(array_unique($request->variables ?: ['reference_number']));

        $chartSrc = null;

        if ($request->presentation_style && $request->presentation_style !== 'table') {
            $summary = $this->generateSummaryData($allData, $request->group_by ?? 'barangay', $request->aggregation ?? 'count');
            $headers = [$summary['groupName'], $summary['datasetLabel']];
            $rows = $summary['rows'];
            
            if ($request->format === 'pdf' && str_ends_with((string) $request->presentation_style, '_chart')) {
                $chartSrc = $this->validPngDataUri($request->chart_image);
            }
        } else {
            $headers = $this->getHeaders($vars);
            $rows = [];
            foreach ($allData as $item) {
                $row = [];
                foreach ($vars as $var) {
                    $row[] = $this->extractValue($item, $var);
                }
                $rows[] = $row;
            }
        }

        $appTypeStr = ($request->application_type && $request->application_type !== 'All') 
            ? $request->application_type 
            : 'All Applications';

        $dateStr = 'All Time';
        if ($request->start_date && $request->end_date) $dateStr = $request->start_date . ' to ' . $request->end_date;
        elseif ($request->start_date) $dateStr = 'from ' . $request->start_date;
        elseif ($request->end_date) $dateStr = 'until ' . $request->end_date;

        $filters = array_filter([$request->barangay]);
        $reportTitleStr = $appTypeStr . ' Report (' . $dateStr . ')' . ($filters ? ' - ' . implode(', ', $filters) : '');
        $filename = str_replace([' ', '(', ')'], ['_', '', ''], $reportTitleStr) . '_' . date('Ymd_His');

        DB::table('audit_trail')->insert([
            'application_id' => 0,
            'action' => 'Generated ' . strtoupper($request->format) . ' Report',
            'performed_by' => $request->user()->id,
            'note' => 'Generated report: ' . $reportTitleStr,
            'performed_at' => now()
        ]);

        $format = $request->format;

        if ($format === 'csv') {
            $callback = function () use ($headers, $rows, $reportTitleStr) {
                $file = fopen('php://output', 'w');
                $emptyRow = array_fill(0, count($headers), '');
                $titleRow = $emptyRow; $titleRow[0] = $reportTitleStr;
                
                fputcsv($file, $titleRow); 
                fputcsv($file, $emptyRow); 
                fputcsv($file, $headers); 
                foreach ($rows as $row) fputcsv($file, $row);
                fclose($file);
            };
            return response()->streamDownload($callback, $filename . '.csv', ['Content-Type' => 'text/csv']);
        } elseif ($format === 'pdf') {
            $pdf = Pdf::loadView('reports.custom', [
                'headers' => $headers, 
                'rows' => $rows,
                'report_title' => $reportTitleStr,
                'presentation_style' => $request->presentation_style ?? 'table',
                'chartSrc' => $chartSrc,
                'fontSize' => (float) ($request->font_size ?: 12),
                'chartWidth' => $request->chart_width ? (int) $request->chart_width : null,
            ])->setPaper($request->document_size ?? 'a4', $request->orientation ?? 'landscape')->setOptions(['isRemoteEnabled' => false]);
            return $pdf->download($filename . '.pdf');
        } elseif ($format === 'xlsx') {
            if (class_exists('\Shuchkin\SimpleXLSXGen')) {
                $emptyRow = array_fill(0, count($headers), '');
                $titleRow = $emptyRow; $titleRow[0] = $reportTitleStr;

                $xlsxData = [$titleRow, $emptyRow, $headers];
                foreach ($rows as $row) {
                    $xlsxData[] = $row;
                }
                
                // BARO: Ag-save iti temporary a file tapno umiso ti format ti ZIP/XLSX
                $tempFile = tempnam(sys_get_temp_dir(), 'imaps_report_');
                \Shuchkin\SimpleXLSXGen::fromArray($xlsxData)->saveAs($tempFile);
                
                return response()->download($tempFile, $filename . '.xlsx', [
                    'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                ])->deleteFileAfterSend(true);
                
            } else {
                // FALLBACK NO AWAN TI LIBRARY
                $callback = function () use ($headers, $rows, $reportTitleStr) {
                    $file = fopen('php://output', 'w');
                    $emptyRow = array_fill(0, count($headers), '');
                    $titleRow = $emptyRow; $titleRow[0] = $reportTitleStr;
                    
                    fputcsv($file, $titleRow); 
                    fputcsv($file, $emptyRow); 
                    fputcsv($file, $headers); 
                    foreach ($rows as $row) fputcsv($file, $row);
                    fclose($file);
                };
                return response()->streamDownload($callback, $filename . '.csv', ['Content-Type' => 'text/csv']);
            }
        }
    }
}