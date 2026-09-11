namespace App\Services;

use App\Exceptions\FastApiException;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Throwable;

class FastApiService
{
    protected string $baseUrl;
    protected int $timeout;

    public function __construct()
    {
        $this->baseUrl = config('services.fastapi.base_url');
        $this->timeout = config('services.fastapi.timeout', 30);
    }

    /**
     * Send a POST request to FastAPI endpoint with retries and error handling.
     *
     * @param string $endpoint
     * @param array $payload
     * @return array
     * @throws FastApiException
     */
    public function post(string $endpoint, array $payload): array
    {
        $url = rtrim($this->baseUrl, '/') . '/' . ltrim($endpoint, '/');

        try {
            $response = Http::timeout($this->timeout)
                ->acceptJson()
                // Retry up to 3 times with 200ms delay on connection failures or 5xx server errors
                ->retry(3, 200, function (Throwable $exception) {
                    if ($exception instanceof ConnectionException) {
                        return true;
                    }
                    if ($exception instanceof RequestException && $exception->response->serverError()) {
                        return true;
                    }
                    return false;
                })
                ->post($url, $payload);

            // Throw Illuminate\Http\Client\RequestException on HTTP 4xx or 5xx status codes
            $response->throw();

            return $response->json();

        } catch (ConnectionException $e) {
            Log::error('FastAPI Connection Failed', [
                'url' => $url,
                'error' => $e->getMessage(),
            ]);

            throw new FastApiException('Unable to reach the FastAPI service. Please check network connectivity.');

        } catch (RequestException $e) {
            Log::error('FastAPI Request Failed', [
                'url' => $url,
                'status' => $e->response->status(),
                'response' => $e->response->body(),
            ]);

            $errorMessage = $e->response->json('detail') ?? 'External service returned an error.';
            throw new FastApiException("FastAPI error [{$e->response->status()}]: {$errorMessage}");

        } catch (Throwable $e) {
            Log::error('Unexpected error communicating with FastAPI', [
                'url' => $url,
                'error' => $e->getMessage(),
            ]);

            throw new FastApiException('An unexpected error occurred while communicating with the forecast service.');
        }
    }
}