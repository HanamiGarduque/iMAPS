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
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        th, td { border: 1px solid #ddd; padding: 6px; text-align: left; }
        th { background-color: #f3f4f6; }
        .chart-container { text-align: center; margin-top: 20px; }
        .chart-container img { max-width: 80%; height: auto; }
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
                            <td>{{ $cell }}</td>
                        @endforeach
                    </tr>
                @endforeach
            </tbody>
        </table>
    @else
        <div class="chart-container">
            @if(isset($chartUrl) && $chartUrl)
                <img src="{{ $chartUrl }}" alt="Chart">
            @else
                <p>No chart data available.</p>
            @endif
        </div>
        
        <h3 style="margin-top: 30px;">Data Summary</h3>
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
                            <td>{{ $cell }}</td>
                        @endforeach
                    </tr>
                @endforeach
            </tbody>
        </table>
    @endif
</body>
</html>
