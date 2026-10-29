import dialog, { tight } from '@/utils/dialog';

// Help for the header "?" button. Every page follows the Export Reports help
// exactly: three numbered steps, then two short notes, in a 420px dialog.
// Each line must match what the page actually does.

const step = (title, text) => `<li><b class="text-slate-800">${title}</b> ${text}</li>`;
const note = (title, text, first) =>
    `<p class="text-left text-[12px] text-slate-500 ${first ? 'mt-3' : 'mt-2'}"><b class="text-slate-700">${title}</b> ${text}</p>`;

const PAGES = [
    {
        match: (u) => u.startsWith('/reports'),
        title: 'Making a report',
        steps: [
            ['Pick a template', 'at the top, or set up your own under <i>Data to Include</i> and <i>Layout &amp; Content</i>.'],
            ['Check the preview', 'on the right. It updates as you change settings; use ‹ › to flip pages.'],
            ['Download', 'as PDF, Excel or CSV. Every download is recorded in the audit trail.'],
        ],
        notes: [
            ['Fit to page width:', 'if a table is too wide for the paper, its text is shrunk so nothing is cut off. Landscape or Legal paper gives more room.'],
            ['Recent reports', 'and your last settings are saved in this browser only.'],
        ],
    },
    {
        match: (u) => u.startsWith('/maps'),
        title: 'Using the map',
        steps: [
            ['Choose a layer', 'in the Layers panel: Application Tracking, Demand Forecast or Diversity Index.'],
            ['Click a barangay', 'to see its figures in the analysis panel, or click a parcel to see its application.'],
            ['Turn on CLUP 2030', 'to lay the zoning plan over the map and compare.'],
        ],
        notes: [
            ['Shortcuts:', '1, 2, 3 switch layers, 4 toggles CLUP 2030, I shows or hides the panel, F goes full screen, Esc clears your selection.'],
            ['Search', 'in the header (Ctrl + K) to jump straight to a barangay.'],
        ],
    },
    {
        match: (u) => u.startsWith('/applications/encode'),
        title: 'Encoding an application',
        steps: [
            ['Fill in each step', 'in order. Use <i>Next</i> to move on and <i>Back</i> to correct an earlier step.'],
            ['Review', 'everything on the last step before sending.'],
            ['Submit Application', 'to add it to the Registry as Received.'],
        ],
        notes: [
            ['Save Draft', 'keeps your work so you can finish it later from <i>Drafts</i>. Progress is also saved automatically.'],
            ['Shortcuts:', 'Ctrl + Enter goes to the next step (or submits on the last), Alt + ← goes back.'],
        ],
    },
    {
        match: (u) => u.startsWith('/applications/drafts'),
        title: 'Your drafts',
        steps: [
            ['Find a draft', 'by applicant or reference with the search box. Press / to jump to it.'],
            ['Open it', 'to continue encoding where you left off.'],
            ['Discard', 'a draft you no longer need.'],
        ],
        notes: [
            ['Saved automatically', 'while you encode, so an unfinished application is never lost.'],
            ['Discarding', 'cannot be undone.'],
        ],
    },
    {
        match: (u) => /^\/applications\/\d+/.test(u),
        title: 'Reviewing an application',
        steps: [
            ['Read the record', 'under <i>Application</i>, <i>Property</i> and <i>History</i>.'],
            ['Evaluate each lot', 'as Approve, Site inspection or Decline, then submit the evaluation.'],
            ['Move it forward', 'from Received to Technical Review, For Release and Released.'],
        ],
        notes: [
            ['Before release:', 'generate the required permit documents under <i>Generate permits</i>.'],
            ['Site inspection', 'sends the lot to FieldSync; its result appears here once the inspector submits it.'],
        ],
    },
    {
        match: (u) => u.startsWith('/applications'),
        title: 'Using the Registry',
        steps: [
            ['Search', 'by applicant, reference or barangay.'],
            ['Filter by date', 'to see only filings from a certain period.'],
            ['Open an application', 'to review it, or press Space on a row for a quick look.'],
        ],
        notes: [
            ['Shortcuts:', '/ jumps to search, ↑ ↓ (or J K) move between rows, Enter opens one, Ctrl + A selects all matches, Esc clears.'],
            ['Unfinished filings', 'are kept separately under <i>Drafts</i>.'],
        ],
    },
    {
        match: (u) => /^\/site-inspections\/\d+/.test(u),
        title: 'Reading an inspection',
        steps: [
            ["Check the inspector's result", 'and the inspection report.'],
            ['Look through the field photos', 'taken in FieldSync. Click one to enlarge it; use ← → to flip.'],
            ['Open the application or parcel record', 'if you need more context.'],
        ],
        notes: [
            ['Instructions for the inspector', 'show what was asked for this round.'],
            ['No photos yet?', 'They appear once the inspector uploads them from FieldSync.'],
        ],
    },
    {
        match: (u) => u.startsWith('/site-inspections'),
        title: 'Tracking inspections',
        steps: [
            ['Search', 'by applicant, reference or inspector.'],
            ['Open an applicant folder', 'to see their applications sent for field inspection.'],
            ['Pick an inspection', 'to read its result, report and photos.'],
        ],
        notes: [
            ['FieldSync:', 'inspections are carried out in the iMAPS-FieldSync mobile app and sent back here.'],
            ['Photos and reports', 'appear once the inspector submits them from FieldSync.'],
        ],
    },
    {
        match: (u) => u.startsWith('/notifications'),
        title: 'Notifications',
        steps: [
            ['Click a notification', 'to open the record it is about.'],
            ['Mark as read', 'with the button on its row.'],
            ['Delete', 'one you no longer need.'],
        ],
        notes: [
            ['New notifications', 'appear in a blue bar at the top; click Show to load them.'],
            ['The bell', 'in the header shows your newest notifications on every page.'],
        ],
    },
    {
        match: (u) => u.startsWith('/settings'),
        title: 'Settings',
        steps: [
            ['Replace a map layer', 'under <i>Vector layers</i> by uploading a new Shapefile (.zip).'],
            ['Update the CLUP zoning tiles', 'under <i>Raster overlays</i> by uploading a tile archive (.zip).'],
            ['Check System information', 'for read-only details about this installation.'],
        ],
        notes: [
            ['Uploading', 'replaces the current layer or tiles with your file.'],
            ['Only .zip files', 'are accepted for both uploads.'],
        ],
    },
    {
        match: (u) => u.startsWith('/users'),
        title: 'Managing users',
        steps: [
            ['Find a staff account', 'by name or email, in table or grid view.'],
            ['Edit an account', 'to change its name, email, role, status or password.'],
            ['View metrics or activity logs', 'to see an account\'s caseload and recorded actions.'],
        ],
        notes: [
            ['Setting a new password', 'asks for your own admin password to confirm.'],
            ['Grid or table view:', 'switch with the two view buttons at the top.'],
        ],
    },
    {
        match: (u) => u.startsWith('/audit-trail'),
        title: 'Audit Trail',
        steps: [
            ['Search', 'by reference, applicant or user.'],
            ['Read each entry', 'to see who did what, and when.'],
            ['Filter by action', 'to show only one kind of activity.'],
        ],
        notes: [
            ['Read-only:', 'entries cannot be edited or deleted.'],
            ['Downloads', 'from Export Reports are recorded here too.'],
        ],
    },
    {
        match: (u) => /^\/diagnostics\/.+/.test(u),
        title: 'Responding to a report',
        steps: [
            ['Read the report', 'the inspector sent from FieldSync.'],
            ['Mark In Review', 'so others know you are on it.'],
            ['Write a reply and Resolve', 'when it is handled.'],
        ],
        notes: [
            ['Your reply', 'is shown to the inspector in FieldSync.'],
            ['Resolved reports', 'stay in the list for reference.'],
        ],
    },
    {
        match: (u) => u.startsWith('/diagnostics'),
        title: 'Support Desk',
        steps: [
            ['Search', 'by name or reference number.'],
            ['Pick a report', 'from the list. These are sent by inspectors from FieldSync.'],
            ['Review and respond', 'from the report page.'],
        ],
        notes: [
            ['Your reply', 'is shown to the inspector in FieldSync.'],
            ['Resolved reports', 'stay in the list for reference.'],
        ],
    },
];

const FALLBACK = {
    title: 'Getting around',
    steps: [
        ['Use the sidebar', 'to move between pages.'],
        ['Search', 'with Ctrl + K to jump to a place or record.'],
        ['Open the bell', 'to see your newest notifications.'],
    ],
    notes: [
        ['Help', 'on each page explains what you can do there.'],
        ['Shortcut:', 'press ? on any page to open this help.'],
    ],
};

export function showPageHelp(url) {
    const path = (url || '').split('?')[0];
    const page = PAGES.find((p) => p.match(path)) || FALLBACK;

    return dialog.fire({
        title: page.title,
        icon: 'info',
        width: 420,
        html: tight(`
            <ol class="text-left text-[12.5px] leading-relaxed text-slate-600 space-y-2 list-decimal pl-5">
                ${page.steps.map(([t, x]) => step(t, x)).join('')}
            </ol>
            ${page.notes.map(([t, x], i) => note(t, x, i === 0)).join('')}
        `),
        confirmButtonText: 'Got it',
    });
}
