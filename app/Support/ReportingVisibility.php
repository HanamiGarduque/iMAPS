<?php

namespace App\Support;

use App\Models\SiteInspection;
use App\Services\DiagnosticReportReader;
use Illuminate\Support\Facades\Schema;

/** Shared list/count/detail/notification/inspection authority. Never cache current ownership. */
class ReportingVisibility
{
    public function __construct(private DiagnosticReportReader $reader, private SupportReportResolution $resolution,
        private ReportEscalationGate $escalations) {}

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

    /**
     * READ access only. A Planning Officer may read a report on an application
     * they own OR on one where they assigned an inspection round (the same rule
     * as the Inspections page, SiteInspection::visibleTo). Handling, notifying
     * and escalating still require current ownership; see handlingStatuses().
     */
    public function canViewReport($viewer, array $report, ?array $context = null): bool
    {
        if (! in_array($report['report_type'] ?? null, $this->allowedTypes($viewer), true)) {
            return false;
        }
        if ($viewer->role === 'Admin') {
            return true;
        }
        if (! ($context['resolved'] ?? false)) {
            return false;
        }
        $ownerId = $context['application']['assigned_planning_officer_id'] ?? null;
        if ($ownerId !== null && (int) $ownerId === (int) $viewer->id) {
            return true;
        }
        return in_array((int) ($context['application']['id'] ?? 0), $this->inspectionApplicationIds($viewer), true);
    }

    /** @var array<int, int[]> Per-instance only, so one list scan costs one query, never stale across requests. */
    private array $inspectionApplications = [];

    /** Local application ids where this viewer assigned at least one inspection round. */
    private function inspectionApplicationIds($viewer): array
    {
        if (isset($this->inspectionApplications[$viewer->id])) {
            return $this->inspectionApplications[$viewer->id];
        }
        // Fail closed: without the provenance column nothing extra is visible.
        $ids = Schema::hasColumn('site_inspections', 'assigned_by_imaps_user_id')
            ? SiteInspection::visibleTo($viewer)->distinct()->pluck('zoning_application_id')->map(fn ($id) => (int) $id)->all()
            : [];
        return $this->inspectionApplications[$viewer->id] = $ids;
    }

    public function canNotify($viewer, array $report, array $context): bool
    {
        return $viewer?->role === 'Admin' && ($report['report_type'] ?? null) === 'application_support'
            && $this->canViewReport($viewer, $report, $context) && ($context['resolved'] ?? false)
            && ($context['owner'] ?? null) !== null;
    }

    /** Role/ownership authority, independent of lifecycle validity. POST resolves context under lock. */
    public function handlingStatuses($viewer, array $report, ?array $context): array
    {
        $all = ['in_review', 'resolved', 'wont_fix'];
        if (($report['report_type'] ?? null) === 'technical_issue') {
            return $viewer?->role === 'Admin' ? $all : [];
        }
        if (($report['report_type'] ?? null) !== 'application_support'
            || ! \Illuminate\Support\Str::isUuid($report['field_job_id'] ?? '')
            || ! ($context['resolved'] ?? false)) {
            return [];
        }
        $ownerId = $context['application']['assigned_planning_officer_id'] ?? null;
        if ($ownerId === null) {
            return $viewer?->role === 'Admin' ? ['in_review'] : [];
        }
        return $viewer?->role === 'Planning Officer' && ($context['owner']['id'] ?? null) === $viewer->id
            && (int) $ownerId === (int) $viewer->id ? $all : [];
    }

    public function handlingActions($viewer, array $report, ?array $context): array
    {
        $allowed = $this->handlingStatuses($viewer, $report, $context);
        $actions = match ($report['status'] ?? null) {
            'submitted' => $allowed,
            'in_review' => array_values(array_diff($allowed, ['in_review'])),
            default => [],
        };

        // An OPEN internal escalation blocks the terminal answer only. Mark In
        // Review stays available so triage can continue while Development Support
        // is being consulted. This is the single predicate behind both the hidden
        // buttons and the server-side refusal in DiagnosticReportHandling, so a
        // forged POST is judged by exactly the rule the page used.
        if ($this->terminalEscalationBlocked($report)) {
            $actions = array_values(array_diff($actions, ['resolved', 'wont_fix']));
        }

        return $actions;
    }

    /** Whether an open Development Support escalation currently forbids a terminal answer. */
    public function terminalEscalationBlocked(array $report): bool
    {
        return ($report['report_type'] ?? null) === 'technical_issue'
            && $this->escalations->hasOpen((string) ($report['id'] ?? ''));
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
