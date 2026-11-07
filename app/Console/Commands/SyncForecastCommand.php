<?php

namespace App\Console\Commands;

use App\Services\ForecastSyncService;
use Illuminate\Console\Command;
use Exception;

class SyncForecastCommand extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'forecast:sync
        {--force : Force execution even if already synced this quarter}';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Compile real locational clearance filings and synchronize with the forecasting microservice';

    public function handle(ForecastSyncService $syncService): int
    {
        $this->info('========================================================');
        $this->info('  iMAPS Spatial Forecast: Scheduled Compilation & Sync  ');
        $this->info('========================================================');
        $this->newLine();

        $this->line('1. Compiling Locational Clearance records from database...');
        try {
            $csv = $syncService->compileFilingsCsv();
            $lines = explode("\n", trim($csv));
            $count = max(0, count($lines) - 1);
            $this->info("   ✓ Compiled {$count} clearance records into CSV format.");
        } catch (Exception $e) {
            $this->error("   ✗ Failed to compile clearance filings: " . $e->getMessage());
            return 1;
        }

        $this->newLine();
        $this->line('2. Uploading compilation to forecasting microservice and training...');
        try {
            $result = $syncService->pushAndSync($csv, 'artisan:forecast:sync');
            $this->info('   ✓ Model training & forecasting completed successfully.');
        } catch (Exception $e) {
            $this->error('   ✗ Synchronization failed: ' . $e->getMessage());
            return 1;
        }

        $this->newLine();
        $this->info('3. Sync Summary:');

        $metrics = $result['metrics'] ?? [];
        $demandLabels = array_unique(array_filter(array_column($result['demand'] ?? [], 'label')));
        $headers = ['Metric', 'Value'];
        $rows = [
            ['Records Compiled', $count],
            ['Training Window', ($result['training_window']['start'] ?? 'N/A') . ' to ' . ($result['training_window']['end'] ?? 'N/A')],
            ['Target Quarters', implode(', ', $demandLabels) ?: 'N/A'],
            ['Validation MAE', isset($metrics['validation_mae']) ? number_format($metrics['validation_mae'], 3) : 'N/A'],
            ['Validation WMAPE', isset($metrics['validation_wmape']) ? number_format($metrics['validation_wmape'], 1) . '%' : 'N/A'],
            ['Validation R²', isset($metrics['validation_r2']) ? number_format($metrics['validation_r2'], 3) : 'N/A'],
        ];
        $this->table($headers, $rows);

        $this->newLine();
        $this->info('Forecast results persisted to database and cache successfully.');
        return 0;
    }
}
