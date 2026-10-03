<?php

namespace App\Support;

use App\Services\DiagnosticReportReader;

/** Shared list/count/detail/notification/inspection authority. Never cache current ownership. */
class ReportingVisibility
{
    public function __construct(private DiagnosticReportReader $reader, private SupportReportResolution $resolution) {}

    public function allowedTypes($viewer): array
    {
        return match ($viewer?->role) {
            'Admin' => ['technical_issue', 'application_support'],
            'Planning Officer' => ['application_support'],
            default => [],
        };
    }

    public function authorizeRequestedType($viewer, ?string $type): string
    {
        $allowed = $this->allowedTypes($viewer);
        abort_if(! $allowed, 403);
        $type ??= $allowed[0];
        abort_unless(in_array($type, $allowed, true), 403);
        return $type;
    }

    public function canViewReport($viewer, array $report, ?array $context = null): bool
    {
        if (! in_array($report['report_type'] ?? null, $this->allowedTypes($viewer), true)) {
            return false;
        }
        return $viewer->role === 'Admin' || (($context['resolved'] ?? false)
            && ($context['application']['assigned_planning_officer_id'] ?? null) !== null
            && (int) $context['application']['assigned_planning_officer_id'] === (int) $viewer->id);
    }

    public function canNotify($viewer, array $report, array $context): bool
    {
        return $viewer?->role === 'Admin' && ($report['report_type'] ?? null) === 'application_support'
            && $this->canViewReport($viewer, $report, $context) && ($context['resolved'] ?? false)
            && ($context['owner'] ?? null) !== null;
    }

    public function scopeVisibleReports($viewer, array $filters = []): array
    {
        $type = $this->authorizeRequestedType($viewer, $filters['type'] ?? null);
        $allowed = $this->allowedTypes($viewer);
        $query = array_filter(['supabase_application_id' => $filters['application'] ?? null, 'status' => $filters['status'] ?? null]);
        // A PO's remote query never even requests Technical Issue rows.
        if (count($allowed) === 1 || ($filters['only_type'] ?? false)) {
            $query['report_type'] = $type;
        }
        $result = $this->reader->all($query);
        $contexts = $this->resolution->resolveMany(array_values(array_filter($result['reports'], fn ($r) => $r['report_type'] === 'application_support')));
        $visible = [];
        $counts = array_fill_keys(($filters['only_type'] ?? false) ? [$type] : $allowed, 0);
        foreach ($result['reports'] as $r) {
            $context = $contexts[$r['id']] ?? null;
            if (! $this->canViewReport($viewer, $r, $context)) {
                continue;
            }
            $counts[$r['report_type']]++;
            if ($r['report_type'] === $type) {
                $r['context'] = $context;
                $visible[] = $r;
            }
        }
        return ['ok' => $result['ok'], 'message' => $result['message'], 'reports' => $visible, 'counts' => $counts];
    }

    public function applicationSummary($viewer, int $localId): array
    {
        $empty = ['ok' => true, 'total' => 0, 'latest' => null, 'url' => null, 'message' => null];
        $this->authorizeRequestedType($viewer, 'application_support');
        try {
            $uuid = $this->resolution->mirrorForApplication($localId);
            if (! $uuid) {
                return $empty;
            }
            $result = $this->scopeVisibleReports($viewer, ['type' => 'application_support', 'application' => $uuid, 'only_type' => true]);
            // Even an Admin summary must not attach an unresolved/foreign report to this application.
            $reports = array_values(array_filter($result['reports'], fn ($r) => ($r['context']['resolved'] ?? false)
                && (int) $r['context']['application']['id'] === $localId));
            $summary = $this->reader->summary($reports) + ['ok' => $result['ok'], 'message' => $result['message']];

            // A destination link is only offered when there is something to
            // open. With zero visible support reports the link would navigate to
            // an empty list, which reads as a broken control rather than an
            // honest zero state.
            $summary['url'] = $summary['total'] > 0
                ? '/diagnostics?type=application_support&application='.$uuid
                : null;

            return $summary;
        } catch (\Throwable) {
            return array_replace($empty, ['ok' => false, 'message' => 'Application support could not be loaded.']);
        }
    }
}
