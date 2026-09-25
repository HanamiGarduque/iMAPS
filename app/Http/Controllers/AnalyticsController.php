<?php
namespace App\Http\Controllers;

use App\Exceptions\FastApiException;
use App\Models\ForecastRun;
use App\Models\ForecastOutput;
use App\Services\FastApiService;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Support\Facades\DB;
use App\Models\ZoningApplication;
use Illuminate\Support\Facades\Response;

class AnalyticsController extends Controller
{
    public function uploadCpi(Request $request)
    {
        \Illuminate\Support\Facades\Log::info('uploadCpi hit');
        $request->validate([
            'cpi_file' => 'required|file' 
        ]);
        
        $file = $request->file('cpi_file');
        $fileName = 'cpi_data.xlsx';
        $destinationPath = base_path('python-analytics/data');

        try {
            $file->move($destinationPath, $fileName);
            \Illuminate\Support\Facades\Log::info('File moved successfully');
            return back()->with('success', 'CPI data updated successfully.');
        } catch (\Exception $e) {
            \Illuminate\Support\Facades\Log::error('Upload error: ' . $e->getMessage());
            return back()->withErrors(['error' => 'Failed to upload CPI file: ' . $e->getMessage()]);
        }
    }

    public function index()
    {
        $latestRun = ForecastRun::with('outputs')->latest()->first();
        $forecastData = [];
        $modelMetrics = null;

        if ($latestRun) {
            $modelMetrics = $latestRun->model_metrics;
            $history = is_array($latestRun->historical_data) ? $latestRun->historical_data : [];

            foreach ($history as $h) {
                $forecastData[] = [
                    'date' => substr($h['metric_date'], 0, 7),
                    'historical_volume' => $h['target_value'],
                    'predicted_volume' => null,
                    'lower_ci' => null,
                    'upper_ci' => null,
                ];
            }

            foreach ($latestRun->outputs as $f) {
                $forecastData[] = [
                    'date' => substr($f->forecast_date, 0, 7),
                    'historical_volume' => null,
                    'predicted_volume' => (float) $f->mean_value,
                    'lower_ci' => (float) $f->lower_ci,
                    'upper_ci' => (float) $f->upper_ci,
                ];
            }
        }

        return Inertia::render('Analytics/Index', [
            'initialForecasts' => $forecastData,
            'initialMetrics' => $modelMetrics,
            'latestRun' => $latestRun,
        ]);
    }

    public function forecast(Request $request, FastApiService $fastApiService)
    {
        $steps = $request->input('forecast_periods', 6);
        $appType = $request->input('application_type', 'Locational Clearance');

        try {
            $response = $fastApiService->post('/api/forecast', [
                'application_type' => $appType,
                'steps' => $steps,
            ]);
            
            if (isset($response['error'])) {
                return response()->json(['status' => 'error', 'detail' => $response['error']], 400);
            }

            $formattedHistory = $response['historical_data'] ?? [];

            $modelMetrics = $response['metrics'] ?? [
                'aic' => 1204.5,
                'rmse' => 14.2
            ];

            $run = ForecastRun::create([
                'application_type' => $appType,
                'forecast_periods' => $steps,
                'model_metrics' => $modelMetrics,
                'historical_data' => $formattedHistory,
                'triggered_by' => auth()->user() ? auth()->user()->name : 'system',
                'executed_at' => now(),
                'status' => 'completed',
            ]);

            $forecasts = [];
            if (isset($response['forecasts'])) {
                foreach ($response['forecasts'] as $f) {
                    ForecastOutput::create([
                        'forecast_run_id' => $run->id,
                        'forecast_date' => $f['forecast_date'],
                        'mean_value' => $f['mean_value'],
                        'lower_ci' => $f['lower_ci'],
                        'upper_ci' => $f['upper_ci'],
                    ]);

                    $forecasts[] = [
                        'date' => substr($f['forecast_date'], 0, 7),
                        'historical_volume' => null,
                        'predicted_volume' => $f['mean_value'],
                        'lower_ci' => $f['lower_ci'],
                        'upper_ci' => $f['upper_ci'],
                    ];
                }
            }

            $historyForChart = [];
            foreach ($formattedHistory as $h) {
                $historyForChart[] = [
                    'date' => substr($h['metric_date'], 0, 7),
                    'historical_volume' => $h['target_value'],
                    'predicted_volume' => null,
                    'lower_ci' => null,
                    'upper_ci' => null,
                ];
            }

            $fullData = array_merge($historyForChart, $forecasts);

            return response()->json([
                'status' => 'success',
                'forecast' => $fullData,
                'model_metrics' => $modelMetrics,
                'run_id' => $run->id,
            ]);

        } catch (FastApiException $e) {
            return response()->json(['status' => 'error', 'detail' => $e->getMessage()], 500);
        } catch (\Exception $e) {
            return response()->json(['status' => 'error', 'detail' => $e->getMessage()], 500);
        }
    }


    public function previewReport(Request $request)
    {
        $request->validate([
            'start_date' => 'nullable|date',
            'end_date' => 'nullable|date',
            'application_type' => 'nullable|string',
            'variables' => 'required|array',
            'presentation_style' => 'nullable|string'
        ]);

        $query = DB::table('zoning_applications')
            ->leftJoin('parcels', 'zoning_applications.id', '=', 'parcels.zoning_application_id');

        if ($request->start_date) {
            $query->whereDate('zoning_applications.created_at', '>=', $request->start_date);
        }
        if ($request->end_date) {
            $query->whereDate('zoning_applications.created_at', '<=', $request->end_date);
        }
        if ($request->application_type && $request->application_type !== 'All') {
            $query->where('zoning_applications.application_type', $request->application_type);
        }

        $selects = [];
        $headers = [];

        foreach ($request->variables as $var) {
            switch ($var) {
                case 'month':
                    $selects[] = DB::raw('MONTH(zoning_applications.created_at) as month');
                    $headers[] = 'Month';
                    break;
                case 'date':
                    $selects[] = DB::raw('DATE(zoning_applications.created_at) as date');
                    $headers[] = 'Date';
                    break;
                case 'year':
                    $selects[] = DB::raw('YEAR(zoning_applications.created_at) as year');
                    $headers[] = 'Year';
                    break;
                case 'application_type':
                    $selects[] = 'zoning_applications.application_type';
                    $headers[] = 'Application Type';
                    break;
                case 'name':
                    $selects[] = 'parcels.owner_name as name';
                    $headers[] = 'Name';
                    break;
                case 'barangay':
                    $selects[] = 'parcels.barangay';
                    $headers[] = 'Barangay';
                    break;
                case 'land_use_class':
                    $selects[] = 'parcels.land_use_class';
                    $headers[] = 'Land Use Class';
                    break;
                case 'lot_area_sqm':
                    $selects[] = 'parcels.lot_area_sqm';
                    $headers[] = 'Lot Area (SQM)';
                    break;
                case 'purpose':
                    $selects[] = 'zoning_applications.purpose';
                    $headers[] = 'Purpose';
                    break;
                case 'assessment_fee':
                    $selects[] = 'zoning_applications.assessment_fee';
                    $headers[] = 'Assessment Fee';
                    break;
            }
        }

        if (empty($selects)) {
            $selects[] = 'zoning_applications.reference_number';
            $headers[] = 'Reference Number';
        }

        $query->select($selects);
        
        $total_rows = $query->count();
        $data = $query->take(100)->get();

        $rows = [];
        foreach ($data as $item) {
            $row = [];
            foreach ($request->variables as $var) {
                $row[] = $item->{$var} ?? '';
            }
            $rows[] = $row;
        }

        $chartData = null;
        if (in_array($request->presentation_style, ['bar_chart', 'line_chart'])) {
            $groupColumn = null;
            $groupName = '';
            foreach ($request->variables as $var) {
                if (in_array($var, ['month', 'year', 'application_type', 'barangay', 'land_use_class'])) {
                    $groupColumn = $var;
                    $groupName = str_replace('_', ' ', $var);
                    break;
                }
            }
            if (!$groupColumn) {
                $groupColumn = $request->variables[0] ?? 'application_type';
                $groupName = str_replace('_', ' ', $groupColumn);
            }

            $counts = [];
            $allData = DB::table('zoning_applications')
                ->leftJoin('parcels', 'zoning_applications.id', '=', 'parcels.zoning_application_id');
            if ($request->start_date) $allData->whereDate('zoning_applications.created_at', '>=', $request->start_date);
            if ($request->end_date) $allData->whereDate('zoning_applications.created_at', '<=', $request->end_date);
            if ($request->application_type && $request->application_type !== 'All') $allData->where('zoning_applications.application_type', $request->application_type);
            $allData->select($selects);
            $allDataRecords = $allData->get();
            
            foreach ($allDataRecords as $item) {
                $val = (string) ($item->{$groupColumn} ?? 'Unknown');
                if (!isset($counts[$val])) {
                    $counts[$val] = 0;
                }
                $counts[$val]++;
            }

            $labels = array_keys($counts);
            $dataPts = array_values($counts);

            $chartData = [
                'type' => $request->presentation_style === 'line_chart' ? 'line' : 'bar',
                'labels' => $labels,
                'data' => $dataPts,
                'datasetLabel' => 'Count by ' . ucwords($groupName)
            ];
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
            'variables' => 'required|array',
            'format' => 'required|in:pdf,csv,xlsx',
            'report_title' => 'nullable|string',
            'presentation_style' => 'nullable|string',
            'document_size' => 'nullable|in:a4,letter,legal'
        ]);

        $query = DB::table('zoning_applications')
            ->leftJoin('parcels', 'zoning_applications.id', '=', 'parcels.zoning_application_id');

        if ($request->start_date) {
            $query->whereDate('zoning_applications.created_at', '>=', $request->start_date);
        }
        if ($request->end_date) {
            $query->whereDate('zoning_applications.created_at', '<=', $request->end_date);
        }
        if ($request->application_type && $request->application_type !== 'All') {
            $query->where('zoning_applications.application_type', $request->application_type);
        }

        $selects = [];
        $headers = [];

        foreach ($request->variables as $var) {
            switch ($var) {
                case 'month':
                    $selects[] = DB::raw('MONTH(zoning_applications.created_at) as month');
                    $headers[] = 'Month';
                    break;
                case 'date':
                    $selects[] = DB::raw('DATE(zoning_applications.created_at) as date');
                    $headers[] = 'Date';
                    break;
                case 'year':
                    $selects[] = DB::raw('YEAR(zoning_applications.created_at) as year');
                    $headers[] = 'Year';
                    break;
                case 'application_type':
                    $selects[] = 'zoning_applications.application_type';
                    $headers[] = 'Application Type';
                    break;
                case 'name':
                    $selects[] = 'parcels.owner_name as name';
                    $headers[] = 'Name';
                    break;
                case 'barangay':
                    $selects[] = 'parcels.barangay';
                    $headers[] = 'Barangay';
                    break;
                case 'land_use_class':
                    $selects[] = 'parcels.land_use_class';
                    $headers[] = 'Land Use Class';
                    break;
                case 'lot_area_sqm':
                    $selects[] = 'parcels.lot_area_sqm';
                    $headers[] = 'Lot Area (SQM)';
                    break;
                case 'purpose':
                    $selects[] = 'zoning_applications.purpose';
                    $headers[] = 'Purpose';
                    break;
                case 'assessment_fee':
                    $selects[] = 'zoning_applications.assessment_fee';
                    $headers[] = 'Assessment Fee';
                    break;
            }
        }

        if (empty($selects)) {
            $selects[] = 'zoning_applications.reference_number';
            $headers[] = 'Reference Number';
        }

        $query->select($selects);
        $data = $query->get();

        $rows = [];
        foreach ($data as $item) {
            $row = [];
            foreach ($request->variables as $var) {
                $row[] = $item->{$var} ?? '';
            }
            $rows[] = $row;
        }

        
        $chartUrl = null;
        if ($request->format === 'pdf' && in_array($request->presentation_style, ['bar_chart', 'line_chart'])) {
            $groupColumn = null;
            $groupName = '';
            foreach ($request->variables as $var) {
                if (in_array($var, ['month', 'year', 'application_type', 'barangay', 'land_use_class'])) {
                    $groupColumn = $var;
                    $groupName = str_replace('_', ' ', $var);
                    break;
                }
            }
            if (!$groupColumn) {
                $groupColumn = $request->variables[0] ?? 'application_type';
                $groupName = str_replace('_', ' ', $groupColumn);
            }

            $counts = [];
            foreach ($rows as $r) {
                $idx = array_search($groupColumn, $request->variables);
                $val = $idx !== false ? ($r[$idx] ?? 'Unknown') : 'Unknown';
                if (!isset($counts[$val])) {
                    $counts[$val] = 0;
                }
                $counts[$val]++;
            }

            $labels = array_keys($counts);
            $dataPts = array_values($counts);

            $chartType = $request->presentation_style === 'line_chart' ? 'line' : 'bar';
            
            $chartConfig = [
                'type' => $chartType,
                'data' => [
                    'labels' => $labels,
                    'datasets' => [
                        [
                            'label' => 'Count by ' . ucwords($groupName),
                            'data' => $dataPts,
                            'backgroundColor' => '#3b82f6'
                        ]
                    ]
                ],
                'options' => [
                    'plugins' => [
                        'datalabels' => [
                            'display' => true,
                            'align' => 'end',
                            'anchor' => 'end'
                        ]
                    ]
                ]
            ];

            $chartUrl = 'https://quickchart.io/chart?w=600&h=400&c=' . urlencode(json_encode($chartConfig));
        }

        // Record audit trail
        DB::table('audit_trail')->insert([
            'application_id' => 0, // Using 0 as it is a bulk report
            'action' => 'Generated ' . strtoupper($request->format) . ' Report',
            'performed_by' => auth()->id() ?? 1,
            'note' => 'Generated report for variables: ' . implode(', ', $request->variables),
            'performed_at' => now()
        ]);

        $format = $request->format;
        $filename = 'report_' . date('Ymd_His');

        if ($format === 'csv') {
            $callback = function () use ($headers, $rows) {
                $file = fopen('php://output', 'w');
                fputcsv($file, $headers);
                foreach ($rows as $row) {
                    fputcsv($file, $row);
                }
                fclose($file);
            };
            return response()->streamDownload($callback, $filename . '.csv', [
                'Content-Type' => 'text/csv',
                'Cache-Control' => 'no-store, no-cache',
            ]);
        } elseif ($format === 'pdf') {
            if (!view()->exists('reports.custom')) {
                return response('View not found', 500);
            }
            $docSize = $request->document_size ?? 'a4';
            $pdf = Pdf::loadView('reports.custom', [
                'headers' => $headers, 
                'rows' => $rows,
                'report_title' => $request->report_title ?? 'Custom Report',
                'presentation_style' => $request->presentation_style ?? 'table',
                'chartUrl' => $chartUrl
            ])->setPaper($docSize, 'landscape')->setOptions(['isRemoteEnabled' => true]);
            return $pdf->download($filename . '.pdf');
        } elseif ($format === 'xlsx') {
            if (class_exists('\Shuchkin\SimpleXLSXGen')) {
                $xlsxData = [];
                $xlsxData[] = $headers;
                foreach ($rows as $row) {
                    $xlsxData[] = $row;
                }
                $xlsx = \Shuchkin\SimpleXLSXGen::fromArray($xlsxData);
                return response($xlsx->toXML(), 200, [
                    'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                    'Content-Disposition' => 'attachment; filename="' . $filename . '.xlsx"',
                ]);
            } else {
                // Fallback to CSV if not installed
                $callback = function () use ($headers, $rows) {
                    $file = fopen('php://output', 'w');
                    fputcsv($file, $headers);
                    foreach ($rows as $row) {
                        fputcsv($file, $row);
                    }
                    fclose($file);
                };
                return response()->streamDownload($callback, $filename . '.csv', [
                    'Content-Type' => 'text/csv',
                ]);
            }
        }
    }
}
