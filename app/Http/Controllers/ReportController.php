<?php

namespace App\Http\Controllers;

use App\Models\ZoningApplication;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class ReportController extends Controller
{
    public function index()
    {
        return Inertia::render('Reports/Index');
    }

    private function getHeaders(array $variables): array
    {
        $headers = [];
        foreach ($variables as $var) {
            switch ($var) {
                case 'month': $headers[] = 'Month'; break;
                case 'day': $headers[] = 'Day'; break;
                case 'date': $headers[] = 'Date'; break;
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
            case 'lot_area_sqm': return $item->parcels->sum('lot_area_sqm');
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

        return $query;
    }

    private function generateSummaryData($data, $groupBy, $aggregation)
    {
        $groupedData = [];

        // Pre-fill all Rosario Barangays if grouping by Barangay
        if ($groupBy === 'barangay') {
            $rosarioBarangays = [
                'Alupay', 'Antipolo', 'Bagong Pook', 'Balibago',
                'Barangay A (Poblacion)', 'Barangay B (Poblacion)', 'Barangay C (Poblacion)',
                'Barangay D (Poblacion)', 'Barangay E (Poblacion)',
                'Bayawang', 'Baybayin', 'Bulihan', 'Cahigam', 'Calantas', 'Colongan', 'Itlugan',
                'Leviste (Tubahan)', 'Lumbangan', 'Maalas-as', 'Mabato', 'Mabunga',
                'Macalamcam A', 'Macalamcam B', 'Malaya', 'Maligaya', 'Marilag', 'Masaya',
                'Matamis (Malinao)', 'Mavalor', 'Mayuro', 'Namuco', 'Namunga', 'Nasi', 'Natu',
                'Palakpak', 'Pinagsibaan', 'Putingkahoy', 'Quilib', 'Salao', 'San Agustin',
                'San Carlos', 'San Ignacio', 'San Isidro', 'San Jose', 'San Roque', 'Santa Cruz',
                'Timbugan', 'Tiquiwan', 'Tulos'
            ];
            foreach ($rosarioBarangays as $b) {
                $groupedData[$b] = ['count' => 0, 'lot_area' => 0, 'fee' => 0, 'project_cost' => 0, 'building_area' => 0];
            }
        }

        foreach ($data as $item) {
            $val = (string) $this->extractValue($item, $groupBy);
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

        $labels = [];
        $dataPts = [];
        $rows = [];
        $datasetLabel = 'Count';

        foreach ($groupedData as $label => $stats) {
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

    /**
     * Builds an advanced QuickChart config array for unified rendering
     */
    private function buildQuickChartConfig($chartType, $labels, $data, $datasetLabel)
    {
        $isPieOrDoughnut = in_array($chartType, ['pie', 'doughnut']);
        $isHorizontal = $chartType === 'horizontalBar';
        
        $bgColors = [];
        $borderColors = [];
        $count = count($labels);
        
        if ($isPieOrDoughnut) {
            // Distribute hues evenly across the golden angle for high contrast
            for ($i = 0; $i < $count; $i++) {
                $hue = ($i * 137.508) % 360;
                $bgColors[] = "hsla({$hue}, 70%, 55%, 0.85)";
                $borderColors[] = "#ffffff";
            }
        } else {
            $bgColors = 'rgba(59, 130, 246, 0.8)';
            $borderColors = 'rgba(29, 78, 216, 1)';
        }

        $options = [
            'responsive' => true,
            'maintainAspectRatio' => false,
            'legend' => [
                'display' => $isPieOrDoughnut,
                'position' => 'right',
                'labels' => ['fontSize' => 10, 'boxWidth' => 12, 'fontColor' => '#475569']
            ],
            'plugins' => [
                'datalabels' => [
                    'display' => true,
                    'color' => $isPieOrDoughnut ? '#ffffff' : '#334155',
                    'font' => ['weight' => 'bold', 'size' => 9],
                    'align' => $isPieOrDoughnut ? 'center' : 'end',
                    'anchor' => $isPieOrDoughnut ? 'center' : 'end',
                ]
            ]
        ];

        if (!$isPieOrDoughnut) {
            $options['scales'] = [
                'xAxes' => [[
                    'gridLines' => ['display' => !$isHorizontal, 'color' => '#f1f5f9'],
                    'ticks' => ['beginAtZero' => true, 'fontSize' => 10, 'fontColor' => '#64748b']
                ]],
                'yAxes' => [[
                    'gridLines' => ['display' => $isHorizontal, 'color' => '#f1f5f9'],
                    'ticks' => ['beginAtZero' => true, 'fontSize' => 10, 'fontColor' => '#64748b']
                ]]
            ];
        }

        return [
            'type' => $chartType,
            'data' => [
                'labels' => $labels,
                'datasets' => [[
                    'label' => $datasetLabel,
                    'data' => $data,
                    'backgroundColor' => $bgColors,
                    'borderColor' => $borderColors,
                    'borderWidth' => 1
                ]]
            ],
            'options' => $options
        ];
    }

    public function previewReport(Request $request)
    {
        $request->validate([
            'start_date' => 'nullable|date',
            'end_date' => 'nullable|date',
            'application_type' => 'nullable|string',
            'variables' => 'nullable|array',
            'presentation_style' => 'nullable|string',
            'aggregation' => 'nullable|string',
            'group_by' => 'nullable|string'
        ]);

        $query = $this->buildQuery($request);
        $total_rows = $query->count();
        $allData = $query->get();

        $vars = $request->variables ?? ['reference_number'];
        $vars = array_unique(array_merge(['month', 'day', 'date', 'year'], $vars));

        $chartData = null;

        if ($request->presentation_style && $request->presentation_style !== 'table') {
            $summary = $this->generateSummaryData($allData, $request->group_by ?? 'barangay', $request->aggregation ?? 'count');
            $headers = [$summary['groupName'], $summary['datasetLabel']];
            $rows = $summary['rows'];
            
            $chartTypes = ['bar_chart', 'horizontal_bar_chart', 'line_chart', 'pie_chart', 'doughnut_chart'];
            if (in_array($request->presentation_style, $chartTypes)) {
                $chartType = $request->presentation_style === 'horizontal_bar_chart' ? 'horizontalBar' : str_replace('_chart', '', $request->presentation_style);
                
                $chartData = [
                    'config' => $this->buildQuickChartConfig($chartType, $summary['labels'], $summary['data'], $summary['datasetLabel']),
                    'datasetLabel' => $summary['datasetLabel']
                ];
            }
        } else {
            $headers = $this->getHeaders($vars);
            $rows = [];
            foreach ($allData->take(100) as $item) {
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
        $request->validate([
            'start_date' => 'nullable|date',
            'end_date' => 'nullable|date',
            'application_type' => 'nullable|string',
            'variables' => 'nullable|array',
            'format' => 'required|in:pdf,csv,xlsx',
            'presentation_style' => 'nullable|string',
            'document_size' => 'nullable|in:a4,letter,legal',
            'orientation' => 'nullable|in:portrait,landscape',
            'aggregation' => 'nullable|string',
            'group_by' => 'nullable|string'
        ]);

        $query = $this->buildQuery($request);
        $allData = $query->get();

        $vars = $request->variables ?? ['reference_number'];
        $vars = array_unique(array_merge(['month', 'day', 'date', 'year'], $vars));

        $chartSrc = null;

        if ($request->presentation_style && $request->presentation_style !== 'table') {
            $summary = $this->generateSummaryData($allData, $request->group_by ?? 'barangay', $request->aggregation ?? 'count');
            $headers = [$summary['groupName'], $summary['datasetLabel']];
            $rows = $summary['rows'];
            
            $chartTypes = ['bar_chart', 'horizontal_bar_chart', 'line_chart', 'pie_chart', 'doughnut_chart'];
            if ($request->format === 'pdf' && in_array($request->presentation_style, $chartTypes)) {
                $chartType = $request->presentation_style === 'horizontal_bar_chart' ? 'horizontalBar' : str_replace('_chart', '', $request->presentation_style);
                
                $chartConfig = $this->buildQuickChartConfig($chartType, $summary['labels'], $summary['data'], $summary['datasetLabel']);
                $chartUrl = 'https://quickchart.io/chart?w=1000&h=600&c=' . urlencode(json_encode($chartConfig));
                $chartSrc = $chartUrl;

                // PRE-FETCH AS BASE64 TO PREVENT DOMPDF GD BLOCKS
                try {
                    $imageContent = @file_get_contents($chartUrl);
                    if ($imageContent) {
                        $chartSrc = 'data:image/png;base64,' . base64_encode($imageContent);
                    }
                } catch (\Exception $e) {
                    // Fallback to URL
                }
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

        $reportTitleStr = $appTypeStr . ' Report (' . $dateStr . ')';
        $filename = str_replace([' ', '(', ')'], ['_', '', ''], $reportTitleStr) . '_' . date('Ymd_His');

        DB::table('audit_trail')->insert([
            'application_id' => 0,
            'action' => 'Generated ' . strtoupper($request->format) . ' Report',
            'performed_by' => auth()->id() ?? 1,
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
                'chartSrc' => $chartSrc
            ])->setPaper($request->document_size ?? 'a4', $request->orientation ?? 'landscape')->setOptions(['isRemoteEnabled' => true]);
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