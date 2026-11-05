@php
    // Text size picked by the on-screen preview so wide tables fit the paper width (12px = normal).
    $fs = max(5, min(12, (float) ($fontSize ?? 12)));
    $k = $fs / 12;
@endphp
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>{{ $report_title }}</title>
    <style>
        body { font-family: sans-serif; font-size: 12px; }
        .header-section { text-align: center; margin-bottom: 20px; }
        .header-section h1 { margin: 0; font-size: 16px; font-weight: bold; text-transform: uppercase; }
        .header-section h2 { margin: 5px 0; font-size: 14px; font-weight: normal; }
        .header-section p { margin: 5px 0; font-size: 11px; color: #555; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: {{ $fs }}px; }
        th, td { border: 1px solid #ddd; padding: {{ round(6 * $k, 2) }}px; text-align: left; word-wrap: break-word; }
        th { background-color: #f3f4f6; text-transform: uppercase; font-size: {{ round(10 * $k, 2) }}px; }
        .chart-container { text-align: center; margin-top: 20px; margin-bottom: 30px; }
        .chart-container img { max-width: 90%; height: auto; border: 1px solid #ddd; padding: 10px; background: #fafafa; }
    </style>
</head>
<body>
    <div class="header-section">
        <h1>MUNICIPALITY OF ROSARIO, BATANGAS</h1>
        <h2>{{ $report_title }}</h2>
        <p>Generated on: {{ now()->format('F d, Y h:i A') }}</p>
    </div>

    @if(($presentation_style ?? 'table') === 'table')
        <table>
            <thead>
                <tr>
                    @foreach($headers as $header)
                        <th>{{ $header }}</th>
                    @endforeach
                </tr>
            </thead>
            <tbody>
                @foreach($rows as $row)
                    <tr>
                        @foreach($row as $cell)
                            <td>{{ $cell !== '' && $cell !== null ? $cell : 'N/A' }}</td>
                        @endforeach
                    </tr>
                @endforeach
            </tbody>
        </table>
    @else
        @if(isset($chartSrc) && $chartSrc)
            <div class="chart-container">
                <img src="{{ $chartSrc }}" alt="Chart" @if(!empty($chartWidth)) style="width: {{ (int) $chartWidth }}px;" @endif>
            </div>
        @endif

        <h3>Data Summary</h3>
        <table>
            <thead>
                <tr>
                    @foreach($headers as $header)
                        <th>{{ $header }}</th>
                    @endforeach
                </tr>
            </thead>
            <tbody>
                @foreach($rows as $row)
                    <tr>
                        @foreach($row as $cell)
                            <td>{{ $cell !== '' && $cell !== null ? $cell : 'N/A' }}</td>
                        @endforeach
                    </tr>
                @endforeach
            </tbody>
        </table>
    @endif
</body>
</html>
