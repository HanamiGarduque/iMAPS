<?php

namespace Tests\Unit;

use PHPUnit\Framework\TestCase;

/**
 * ParcelEvaluationLoggingContractTest
 *
 * Verifies the contract that parcel evaluations (Approved, Needs Site Inspection,
 * Requires Reinspection) are consistently logged to:
 *   1. Application Status Tracker (ApplicationStatusTracker::log / application_status_tracks)
 *   2. Audit Trail (AuditLogger::log / audit_trail)
 *   3. Notifications (AppNotification::notifyUser & notifyUsers / notifications)
 *
 * Covers TechnicalReviewController (updateStatus, submitBatch, assignInspector)
 * and ApplicationController (store, submitTechnicalReview).
 */
class ParcelEvaluationLoggingContractTest extends TestCase
{
    private string $technicalReviewControllerSource;
    private string $applicationControllerSource;

    protected function setUp(): void
    {
        parent::setUp();
        $this->technicalReviewControllerSource = file_get_contents(
            dirname(__DIR__, 2) . '/app/Http/Controllers/TechnicalReviewController.php'
        );
        $this->applicationControllerSource = file_get_contents(
            dirname(__DIR__, 2) . '/app/Http/Controllers/ApplicationController.php'
        );
    }

    // ── TechnicalReviewController::updateStatus ──────────────────────────────

    public function test_update_status_logs_status_track_for_site_inspection_decisions(): void
    {
        $this->assertStringContainsString(
            "ApplicationStatusTracker::log(\n                    applicationOrRef: \$application,\n                    status: 'Site Inspection Scheduled'",
            $this->technicalReviewControllerSource,
            'updateStatus must log Site Inspection Scheduled in ApplicationStatusTracker'
        );
    }

    public function test_update_status_logs_status_track_for_approval_decisions(): void
    {
        $this->assertStringContainsString(
            "if (\$validated['decision'] === 'Approved') {\n                    ApplicationStatusTracker::log(\n                        applicationOrRef: \$application,\n                        status: 'Approved',",
            $this->technicalReviewControllerSource,
            'updateStatus must log Approved in ApplicationStatusTracker'
        );
    }

    public function test_update_status_logs_audit_trail_for_inspection_decisions(): void
    {
        $this->assertStringContainsString(
            "\$actionName = \$isReinspection ? 'TECHNICAL_REVIEW_REQUIRES_REINSPECTION' : 'TECHNICAL_REVIEW_NEEDS_SITE_INSPECTION';",
            $this->technicalReviewControllerSource,
            'updateStatus must determine audit action for inspection decisions'
        );
        $this->assertStringContainsString(
            "AuditLogger::log(\n                    applicationId: \$application->id,\n                    action: \$actionName,",
            $this->technicalReviewControllerSource,
            'updateStatus must log TECHNICAL_REVIEW_NEEDS_SITE_INSPECTION or REQUIRES_REINSPECTION to AuditLogger'
        );
    }

    public function test_update_status_logs_audit_trail_for_approval_decisions(): void
    {
        $this->assertStringContainsString(
            "action: 'TECHNICAL_REVIEW_' . strtoupper(str_replace(' ', '_', \$validated['decision'])),",
            $this->technicalReviewControllerSource,
            'updateStatus must log TECHNICAL_REVIEW_APPROVED to AuditLogger'
        );
    }

    public function test_update_status_sends_notifications_to_inspector_and_stakeholders(): void
    {
        // Inspector targeted notification
        $this->assertStringContainsString(
            "AppNotification::notifyUser(\n                        \$validated['inspector_id'],\n                        'Site Inspection Assigned',",
            $this->technicalReviewControllerSource,
            'updateStatus must notify the assigned inspector directly'
        );

        // Stakeholders broadcast
        $this->assertStringContainsString(
            "AppNotification::notifyUsers(\n                    \$recipientIds,",
            $this->technicalReviewControllerSource,
            'updateStatus must notify Admins, PO, and encoder'
        );
    }

    // ── TechnicalReviewController::submitBatch ───────────────────────────────

    public function test_submit_batch_notifies_inspector_per_inspection_parcel(): void
    {
        $this->assertStringContainsString(
            "AppNotification::notifyUser(\n                        \$review['inspector_id'],\n                        \$isReinspection ? 'Reinspection Assigned' : 'Site Inspection Assigned',",
            $this->technicalReviewControllerSource,
            'submitBatch must send notification to the assigned inspector for each inspection parcel'
        );
    }

    public function test_submit_batch_logs_status_track_when_site_inspection_required(): void
    {
        $this->assertStringContainsString(
            "if (!empty(\$inspectionParcels)) {",
            $this->technicalReviewControllerSource,
            'submitBatch must inspect if any parcels require site inspection'
        );

        $this->assertStringContainsString(
            "ApplicationStatusTracker::log(\n                    applicationOrRef: \$application,\n                    status: 'Site Inspection Scheduled',\n                    note: \$note,\n                    scheduledDate: \$earliestDate\n                );",
            $this->technicalReviewControllerSource,
            'submitBatch must log Site Inspection Scheduled with earliestDate in ApplicationStatusTracker'
        );
    }

    public function test_submit_batch_logs_approved_status_track(): void
    {
        $this->assertStringContainsString(
            "ApplicationStatusTracker::log(\n                        applicationOrRef: \$application,\n                        status: 'Approved',",
            $this->technicalReviewControllerSource,
            'submitBatch must log Approved in ApplicationStatusTracker when parcels are approved'
        );
    }

    public function test_submit_batch_logs_audit_trail_for_both_inspection_and_approved_parcels(): void
    {
        // Audit log for inspection parcels
        $this->assertStringContainsString(
            "AuditLogger::log(\n                    applicationId: \$application->id,\n                    action: 'TECHNICAL_REVIEW_NEEDS_SITE_INSPECTION',",
            $this->technicalReviewControllerSource,
            'submitBatch must log TECHNICAL_REVIEW_NEEDS_SITE_INSPECTION to AuditLogger'
        );

        // Audit log for approved parcels in mixed batch
        $this->assertStringContainsString(
            "if (!empty(\$approvedParcels)) {\n                    ApplicationStatusTracker::log(\n                        applicationOrRef: \$application,\n                        status: 'Approved',",
            $this->technicalReviewControllerSource,
            'submitBatch must log Approved status track for approved parcels when inspection is also needed'
        );

        // Audit log for all-approved batch
        $this->assertStringContainsString(
            "if (!empty(\$approvedParcels) && empty(\$declinedParcels)) {\n                    AuditLogger::log(\n                        applicationId: \$application->id,\n                        action: 'TECHNICAL_REVIEW_APPROVED',",
            $this->technicalReviewControllerSource,
            'submitBatch must log TECHNICAL_REVIEW_APPROVED when all parcels are approved'
        );
    }

    public function test_submit_batch_sends_notifications_for_both_inspection_and_approval(): void
    {
        // Inspection notification
        $this->assertStringContainsString(
            "AppNotification::notifyUsers(\n                    \$recipientIds,\n                    'Site Inspection Scheduled',",
            $this->technicalReviewControllerSource,
            'submitBatch must notify stakeholders when site inspections are scheduled'
        );

        // Approved notification
        $this->assertStringContainsString(
            "AppNotification::notifyUsers(\n                        \$recipientIds,\n                        'Technical Review Decision: Approved',",
            $this->technicalReviewControllerSource,
            'submitBatch must notify stakeholders when all parcels are approved'
        );
    }

    // ── TechnicalReviewController::assignInspector ───────────────────────────

    public function test_assign_inspector_logs_status_track_audit_trail_and_notifications(): void
    {
        $this->assertStringContainsString(
            "ApplicationStatusTracker::log(\n            applicationOrRef: \$application,\n            status: 'Site Inspection Scheduled',",
            $this->technicalReviewControllerSource,
            'assignInspector must log Site Inspection Scheduled in ApplicationStatusTracker'
        );

        $this->assertStringContainsString(
            "AuditLogger::log(\n            applicationId: \$application->id,\n            action: 'SITE_INSPECTION_ASSIGNED',",
            $this->technicalReviewControllerSource,
            'assignInspector must log SITE_INSPECTION_ASSIGNED in AuditLogger'
        );

        $this->assertStringContainsString(
            "AppNotification::notifyUser(\n            \$validated['inspector_id'],\n            'Site Inspection Assigned',",
            $this->technicalReviewControllerSource,
            'assignInspector must send targeted notification to the assigned inspector'
        );

        $this->assertStringContainsString(
            "AppNotification::notifyUsers(\n            \$recipientIds,\n            'Site Inspection Assigned',",
            $this->technicalReviewControllerSource,
            'assignInspector must notify stakeholders'
        );
    }

    // ── ApplicationController::store ─────────────────────────────────────────

    public function test_application_store_notifies_inspector_on_encoded_inspection(): void
    {
        $this->assertStringContainsString(
            "AppNotification::notifyUser(\n                            \$parcelData['inspector_id'],\n                            'Site Inspection Assigned',",
            $this->applicationControllerSource,
            'store must notify the inspector when encoding with Needs Site Inspection'
        );
    }

    public function test_application_store_logs_status_track_for_encoded_inspections_and_approvals(): void
    {
        // Site inspection scheduled track
        $this->assertStringContainsString(
            "ApplicationStatusTracker::log(\n                        applicationOrRef: \$application,\n                        status: 'Site Inspection Scheduled',\n                        note: \$note,\n                        scheduledDate: \$earliestDate\n                    );",
            $this->applicationControllerSource,
            'store must log Site Inspection Scheduled with earliestDate in ApplicationStatusTracker'
        );

        // Approved track when parcels are approved
        $this->assertStringContainsString(
            "ApplicationStatusTracker::log(\n                            applicationOrRef: \$application,\n                            status: 'Approved',",
            $this->applicationControllerSource,
            'store must log Approved status in ApplicationStatusTracker when parcels are approved'
        );
    }

    public function test_application_store_logs_audit_trail_and_notifies_for_encoded_evaluations(): void
    {
        // Audit log for Needs Site Inspection
        $this->assertStringContainsString(
            "AuditLogger::log(\n                        applicationId: \$application->id,\n                        action: 'TECHNICAL_REVIEW_NEEDS_SITE_INSPECTION',",
            $this->applicationControllerSource,
            'store must log TECHNICAL_REVIEW_NEEDS_SITE_INSPECTION in AuditLogger'
        );

        // Audit log for Approved parcels
        $this->assertStringContainsString(
            "AuditLogger::log(\n                            applicationId: \$application->id,\n                            action: 'TECHNICAL_REVIEW_APPROVED',",
            $this->applicationControllerSource,
            'store must log TECHNICAL_REVIEW_APPROVED in AuditLogger'
        );

        // Notification for Site Inspection Scheduled
        $this->assertStringContainsString(
            "AppNotification::notifyUsers(\n                        \$recipientIds,\n                        'Site Inspection Scheduled',",
            $this->applicationControllerSource,
            'store must notify stakeholders of Site Inspection Scheduled'
        );

        // Notification for Approved
        $this->assertStringContainsString(
            "AppNotification::notifyUsers(\n                            \$recipientIds,\n                            'Technical Review Decision: Approved',",
            $this->applicationControllerSource,
            'store must notify stakeholders of Approved evaluation'
        );
    }

    // ── ApplicationController::submitTechnicalReview ─────────────────────────

    public function test_submit_technical_review_logs_status_track_for_site_inspection(): void
    {
        $this->assertStringContainsString(
            "ApplicationStatusTracker::log(\n                    applicationOrRef: \$application,\n                    status: 'Site Inspection Scheduled',\n                    note: \$note\n                );",
            $this->applicationControllerSource,
            'submitTechnicalReview must log Site Inspection Scheduled in ApplicationStatusTracker'
        );
    }

    public function test_submit_technical_review_logs_status_track_for_approval(): void
    {
        $this->assertStringContainsString(
            "ApplicationStatusTracker::log(\n                    applicationOrRef: \$application,\n                    status: 'Approved',",
            $this->applicationControllerSource,
            'submitTechnicalReview must log Approved in ApplicationStatusTracker'
        );
    }

    public function test_submit_technical_review_logs_audit_trail_and_notifies(): void
    {
        $this->assertStringContainsString(
            "AuditLogger::log(\n                applicationId: \$application->id,\n                action: 'TECHNICAL_REVIEW_' . strtoupper(str_replace(' ', '_', \$validated['decision'])),",
            $this->applicationControllerSource,
            'submitTechnicalReview must log TECHNICAL_REVIEW_* in AuditLogger'
        );

        $this->assertStringContainsString(
            "AppNotification::notifyUsers(\n                    \$recipientIds,\n                    'Site Inspection Flagged',",
            $this->applicationControllerSource,
            'submitTechnicalReview must notify stakeholders when Site Inspection is flagged'
        );

        $this->assertStringContainsString(
            "AppNotification::notifyUsers(\n                    \$recipientIds,\n                    'Technical Review Decision: Approved',",
            $this->applicationControllerSource,
            'submitTechnicalReview must notify stakeholders when Approved'
        );
    }
}
