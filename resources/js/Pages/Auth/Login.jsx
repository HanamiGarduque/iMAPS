import { useState, useEffect, useRef } from 'react';
import { Head, useForm, usePage } from '@inertiajs/react';
import ApplicationLogo from '@/Components/ApplicationLogo';
import { Icon, ICONS, PARCELS, CadastralBackground, Field, inputClass, AuthStyles } from './AuthUI';
import { confirmDialog } from '@/utils/signOut';

const keySvg = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block"><circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/></svg>';

// Swal shows newlines as line breaks, so this markup stays on single lines.
const resetHelpHeader =
    '<div style="display:flex;flex-direction:column;align-items:center;text-align:center">' +
        '<span aria-hidden="true" style="display:flex;align-items:center;justify-content:center;width:60px;height:60px;border-radius:18px;background:linear-gradient(135deg,#3b82f6,#1d4ed8);color:#fff;box-shadow:0 14px 28px -10px rgba(37,99,235,.65),inset 0 1px 0 rgba(255,255,255,.3),0 0 0 7px rgba(219,234,254,.55)">' + keySvg + '</span>' +
        '<span style="display:block;margin-top:20px;font-size:19px;font-weight:700;letter-spacing:-0.015em;line-height:1.3;color:#0f172a">Forgot your password?</span>' +
    '</div>';

// Only administrators reset passwords, so there is no self-service link.
const showResetHelp = () =>
    confirmDialog(
        resetHelpHeader,
        '<p style="margin:0;padding-bottom:30px;text-wrap:balance">For security, passwords aren\'t changed online. Contact your administrator to reset it.</p>',
        '',
        {
            // No buttons: the close button, Esc and a backdrop click dismiss it.
            showCancelButton: false,
            showConfirmButton: false,
            width: 360,
            // Gentle fade-and-rise instead of Swal's default bounce; keyframes live in AuthStyles.
            showClass: { popup: 'dialog-in', backdrop: 'swal2-backdrop-show' },
            hideClass: { popup: 'dialog-out', backdrop: 'swal2-backdrop-hide' },
        },
    );

const ACTIVE_PARCEL = [10, 21, 28];

// Mirrors the modules that exist in the app today.
const MODULES = [
    { name: 'Registry', title: 'Encode to approval', text: 'Encode zoning applications, save drafts and follow every status change.' },
    { name: 'Geospatial Mapping', title: 'Land use, mapped', text: 'Check each application against zoning, parcel and barangay layers.' },
    { name: 'Demand Forecasting', title: 'Data to decisions', text: 'Turn approved clearances into trends and forecasted demand by barangay.' },
];

// The three policy documents below mirror the FieldSync drafts in
// imaps_fieldsync_main/assets/policies/ (DRAFT v0.9, prepared October 18, 2026).
// Keep both sides in step — when a FieldSync policy is revised, update the
// matching document below as well.

const PRIVACY = [
    ['Who This Notice Covers', [
        'This notice explains how personal information may be handled within the iMAPS internal web system and the iMAPS FieldSync mobile application in connection with MPDO Rosario zoning administration, application monitoring, GIS reporting, and field inspections. It applies to applicant and property records handled by the office and to authorized personnel using the Platforms. If a separate public status portal is operated, its actual authentication method, visible fields, and service provider must be verified and described before including it under this notice.',
    ]],
    ['Responsible Office and Privacy Contact', [
        'The responsible personal information controller and any personal information processors must be identified by the implementing municipality before deployment. Proposed service office: Municipal Planning and Development Office (MPDO), Municipality of Rosario, Batangas. Official controller designation: __________. Data Protection Officer/privacy contact: Name/Office: __________  Email: __________  Address: __________  Request procedure: __________.',
    ]],
    ['Categories of Personal and Operational Data', [
        'Depending on the user’s role and the feature used, records may include: (a) staff account identifiers, contact details, roles, login/session and audit information; (b) application and permit-related records such as applicant and business names, contact details, submitted documents, processing status, dates, parcel identifiers, and land-use or zoning information; (c) inspection assignments and results, inspector identifiers, timestamps, checklists, field notes, GPS coordinates, and photographs; and (d) technical data needed for system operation, troubleshooting, synchronization, and security. Not every field is collected by every feature or from every person. Exact database fields and mobile permissions must be inventoried before publication.',
    ]],
    ['Why the Information Is Processed', [
        'Data are processed to receive and organize zoning-related records, route and monitor administrative work, assign and document site inspections, support verification of land-use information, maintain accountability through audit records, produce administrative reports and geospatial summaries, and support authorized planning decisions. Aggregated or barangay-level analytics and forecasting may use historical transaction or spatial features; these outputs support planning and do not themselves determine the approval or rejection of an individual application. Any research or capstone use of live personal records must have its own lawful basis and applicable safeguards.',
    ]],
    ['Lawful Basis and Fair Processing', [
        'Personal data must be processed for specified, legitimate purposes and on an applicable lawful basis under Republic Act No. 10173 (Data Privacy Act of 2012), its Implementing Rules and Regulations, and relevant National Privacy Commission issuances. For government functions, the legal basis may relate to statutory duties or other grounds recognized by law and is not necessarily consent. The responsible office must document the basis for each processing activity. Where a separate optional activity legally requires consent, that consent must be requested distinctly and must not be hidden inside general Terms acceptance.',
    ]],
    ['When FieldSync Uses Camera and Location', [
        'FieldSync may request camera/photo-library and device location permission when an inspector opens a feature that needs photographic or geospatial inspection evidence. Such evidence may be associated with an assigned application or parcel and transmitted to connected office systems after successful synchronization. The final product team must verify whether the app accesses location only during active use or in the background, whether images embed location metadata, and whether there are alternate workflows when a permission is declined. This notice does not authorize continuous employee tracking.',
    ]],
    ['Offline Records and Data Synchronization', [
        'To support work during weak or unavailable connectivity, FieldSync may hold assignments, completed forms, media, and pending synchronization actions in local device storage. Information remains on the device until the app can transmit it successfully or it is removed under the approved retention process. Lost, shared, or compromised devices therefore present privacy risks. Staff should use supported device security settings and report lost devices promptly. The team must verify local encryption, session handling, logout behavior, and deletion of successfully synchronized drafts before claiming specific protections.',
    ]],
    ['Authorized Access and Data Sharing', [
        'Access should be limited to officials and personnel who need data for their assigned responsibilities. Information may also pass through contracted hosting, authentication, synchronization, backup, and mapping services needed to operate the Platforms; the actual providers, hosting locations, contractual roles, and categories of data disclosed must be confirmed. Information may be disclosed to competent authorities where required or authorized by law. Official records must not be shared for unrelated advertising or marketing purposes. Specific access limitations cannot be promised until role permissions and public endpoints have been verified.',
    ]],
    ['Public Status Information', [
        'If an applicant-facing status portal is part of the approved deployment, the office must publish its verified lookup requirements and the exact application fields it reveals. A public-facing screen should disclose no more information than necessary for the status inquiry. The draft does not assert that full contact information, remarks, or parcel identifiers are inaccessible, because this requires confirmation of deployed queries, database permissions, and access rules.',
    ]],
    ['Security and Incident Handling', [
        'The responsible office should maintain proportionate organizational, physical, and technical safeguards, including approved access permissions, authentication controls, audit logging, secure transmission, backups, incident response, and device procedures. These measures must be regularly reviewed, especially wherever mobile and web services exchange data. No system can promise absolute security. Personal data breaches and requests for assistance should be escalated through the approved municipal incident-response and DPO process, with regulatory notification when required by applicable rules.',
    ]],
    ['Retention and Disposal', [
        'Application, inspection, account, audit, and backup records are retained according to an approved government records-retention schedule and the purposes and legal requirements applicable to each category. Records should be securely deleted or de-identified when retention is no longer lawful or necessary, subject to official recordkeeping obligations. The exact retention periods, deletion authorities, backup schedules, and offline-device cleanup rules are [TO BE CONFIRMED AND DISCLOSED BEFORE PUBLICATION].',
    ]],
    ['Rights of Data Subjects', [
        'Individuals have rights under the Data Privacy Act, as applicable, including the rights to be informed, access information, rectify inaccurate data, object in circumstances provided by law, request erasure or blocking where legally available, data portability where applicable, seek damages, and file a complaint with the National Privacy Commission. Some requests may be limited by lawful government recordkeeping or other statutory duties. Requests should be submitted through the designated MPDO or municipal privacy contact, and identity may be verified before personal records are disclosed.',
    ]],
    ['Policy Changes and Contact', [
        'Material changes in processing practices should be reflected in an updated notice, with notice provided through an appropriate platform or official office channel. Version: DRAFT 0.9. Effective date: Pending official approval. Responsible office: MPDO, Municipality of Rosario, Batangas. Official DPO/privacy contact and reporting channel: __________. This draft requires validation against the production configuration and review by the responsible office before release.',
    ]],
];

const TERMS = [
    ['Purpose and Scope', [
        'These Terms describe the responsible use of iMAPS: An Intelligent Geospatial Analytics System for Zoning Application Tracking and Land-Use Development Monitoring, including its internal web system and its companion iMAPS FieldSync mobile application (together, the “Platforms”). The Platforms are designed to assist the Municipal Planning and Development Office (MPDO) of Rosario, Batangas with application records, zoning-related workflows, maps, analytics, and field inspections. Any separately operated public application-status portal is covered only after the implementing office confirms that it falls within the same service and publishes matching notices.',
    ]],
    ['Authorized Users and Access', [
        'Internal functions are intended for personnel specifically authorized by the implementing office, such as administrators, planning officers, and assigned site inspectors. Access is role-dependent. Users must sign in using credentials provided or approved by the organization and must not share accounts or attempt to access records outside their assigned duties. A person using a public-facing status inquiry, if officially enabled, receives only the access and functions expressly offered through that service.',
    ]],
    ['Responsible Use of Records', [
        'Users must provide and update official information accurately, follow established MPDO procedures, and record status changes and field findings truthfully. The Platforms assist with documentation and monitoring; they do not replace legal review, the Comprehensive Land Use Plan, applicable zoning ordinances, or the final decision of authorized municipal personnel. Maps, density displays, and forecasts are decision-support outputs and must not be treated as automatic approvals, legal land-title determinations, or guarantees about future events.',
    ]],
    ['FieldSync Inspections', [
        'FieldSync supports assigned on-site inspection activities that may include location verification, photographs, checklists, notes, and submission of findings. Users must obtain permissions and follow applicable office procedures when collecting evidence, avoid unnecessary personal information in photos or remarks, and use official devices or approved devices responsibly. Where offline entry is available, saved records may remain on the device until synchronization succeeds; users should verify the app’s synchronization status before treating an inspection as submitted to the office.',
    ]],
    ['Security and Prohibited Conduct', [
        'Users must protect credentials, lock devices when unattended, promptly report lost devices and suspected unauthorized access, and refrain from copying or disclosing applicant, landowner, or inspection information without authority. Prohibited acts include impersonation, deliberate falsification of records, unauthorized extraction of data, attempts to bypass role restrictions, interfering with service operation, or using inspection information for personal gain. Suspected misuse may be handled under applicable office policies and Philippine law, subject to due process.',
    ]],
    ['Availability and Connectivity', [
        'Some functions require an internet or authorized network connection, including online map tiles, web application access, and synchronization with connected services. Availability may be affected by maintenance, network interruptions, third-party systems, and device limitations. A locally saved FieldSync inspection is not necessarily reflected in the central iMAPS record until a successful sync has occurred. Any stated service levels must be supported by an approved operating agreement.',
    ]],
    ['Third-Party Services', [
        'The Platforms may rely on infrastructure and geospatial service providers to enable authentication, hosting, database synchronization, and map display. Such providers may apply their own lawful terms and privacy notices to services they operate. The responsible office must verify and publish the actual provider list before this policy takes effect. No third-party service should be treated as having permission to reuse official case records for unrelated purposes merely because it supports the Platforms.',
    ]],
    ['Privacy and Record Retention', [
        'Handling of personal data is described in the separate iMAPS & FieldSync Privacy Notice. Information recorded through the Platforms remains subject to government recordkeeping, privacy, security, and disclosure requirements. Requests for access, correction, and other data-subject rights should be directed to the designated responsible office or Data Protection Officer (DPO), using the verified contact information published with the final notices.',
    ]],
    ['Ownership and Permitted Use', [
        'Project code, documentation, municipal datasets, maps, and user-submitted official records may have different owners or licenses. No ownership or broad reuse rights are granted by these Terms. The implementing office and capstone project proponents should document the final software license, data ownership, deployment agreement, and any third-party map or library attribution requirements before release.',
    ]],
    ['Updates, Suspension, and Governing Law', [
        'The office may revise operating procedures and these Terms when necessary, with appropriate notice. Access may be suspended or adjusted when authorized for security, role changes, or administrative reasons. These Terms are interpreted in accordance with applicable laws of the Republic of the Philippines. They do not remove rights granted by law or replace established government processes.',
    ]],
    ['Contact and Acknowledgment', [
        'Office: Municipal Planning and Development Office (MPDO), Municipality of Rosario, Batangas. Privacy/security contact: Name/Office: __________  Email: __________  Contact channel: __________. Policy owner and publication authority: __________. Effective date: Pending official approval. For internal staff, acknowledgment may be recorded as part of approved onboarding; displaying this notice alone does not prove that user consent or legal authorization for all processing has been obtained.',
    ]],
];

const COOKIES = [
    ['Scope: Web Cookies and Mobile Storage', [
        'This policy describes how the iMAPS internal web system and FieldSync mobile app may use browser cookies, web storage, device-local storage, and connected servers. Browser cookies and mobile offline records are different technologies; FieldSync does not need to use browser cookies merely because the iMAPS web system does. Any separate public status portal should publish a matching notice based on its actual implementation.',
    ]],
    ['Essential Web Session and Security Storage', [
        'The Laravel-based iMAPS web system may use session-related cookies and anti-forgery tokens to maintain an authenticated session and protect requests. The actual cookie names, scope, expiration, SameSite settings, Secure/HttpOnly flags, and whether sessions are stored server-side must be verified from the deployed configuration. Necessary storage enables authorized workflows; users may be unable to sign in or use protected features if their browser blocks it.',
    ]],
    ['Web Preferences, Caches, and Reports', [
        'Depending on implemented features, the browser may store non-essential preferences (for example, visual or map-view choices) and temporarily cache downloaded resources. An earlier internal assessment also flagged forecast outputs saved to browser localStorage without an expiry; the team must confirm whether that behavior still exists, what information it contains, and whether it should be moved to server-controlled records or given an expiration. No claim is made that all cached information is automatically removed at logout.',
    ]],
    ['FieldSync Offline Storage', [
        'FieldSync may keep inspection assignments, draft forms, GPS readings, geotagged media references, and a synchronization queue on the device so field work can continue during connectivity interruptions. When service returns, the app may attempt to upload pending items to the connected backend or synchronization service. A successful upload does not automatically prove that local copies, device backups, or cached media were erased. The product team must document actual file locations, storage protections, queue cleanup, retry behavior, and the user-facing sync status.',
    ]],
    ['Authentication and Other Device Data', [
        'FieldSync may maintain a session token or similar credential needed for signed-in users. Mobile operating systems and application libraries may also store preferences and temporary media files. Whether credentials are stored in protected device facilities, whether offline records are encrypted at rest, and whether app removal deletes all related copies or cloud backups must be tested. Do not store passwords or sensitive authentication secrets in plain text.',
    ]],
    ['Maps and External Resources', [
        'When users display basemaps or other externally hosted map resources, their browser or device may send ordinary technical requests to the map provider, potentially including an IP address and network/device metadata. The iMAPS manuscript identifies OpenStreetMap and Esri basemaps used with Leaflet and MapLibre; exact provider endpoints, attribution, analytics, cookies, and external requests must be reviewed against the production configuration and respective provider notices.',
    ]],
    ['Analytics, Advertising, and Optional Tracking', [
        'The project materials reviewed do not establish the deployment of advertising cookies, cross-site marketing trackers, or optional behavioral analytics. They must not be described as installed—or definitively absent—without an inventory of production scripts and mobile SDKs. If non-essential tracking is introduced, the responsible office must update this policy and implement any legally required choice and notice mechanisms before activation.',
    ]],
    ['How Users Can Manage Storage', [
        'Web users can manage cookies and local website data through their browser settings, but deleting essential session data can sign them out. FieldSync users can manage app permissions through operating-system settings and should use the app’s intended synchronization workflow before clearing app data or uninstalling it; otherwise, unsent inspection drafts may be lost. Municipal device administrators should provide an approved process for lost devices, account revocation, and secure disposal. Privacy and retention requests should go through the designated DPO.',
    ]],
    ['Data Retention and Updates', [
        'Storage lifetimes vary by record type, device state, server configuration, backup practice, and legal records-retention duties. The final published policy must specify, or link to a schedule for, actual session expiration, offline draft cleanup, audit-log retention, application/inspection record retention, and third-party storage practices. Review this policy whenever the app adds an SDK, changes its sync design, or alters cookies or storage settings.',
    ]],
    ['Contact and Version', [
        'Responsible office: Municipal Planning and Development Office (MPDO), Municipality of Rosario, Batangas. Official DPO/privacy contact: __________. Draft version: 0.9. Effective date: Pending official approval. Users may request clarification about storage, cookies, or data rights through the verified contact channel published with the final policy.',
    ]],
];

const DOCS = {
    privacy: {
        title: 'Privacy Notice',
        subtitle: 'iMAPS: An Intelligent Geospatial Analytics System + FieldSync Mobile App',
        status: [
            ['Document status', 'DRAFT v0.9 — MPDO/DPO review required; not yet effective'],
            ['Prepared', 'October 18, 2026'],
            ['New policy effective date', 'Pending official approval'],
        ],
        notice: [
            'DRAFT — FOR REVIEW ONLY. This is proposed public-facing wording, not an approved municipal notice. Confirm contacts, technical claims, and deployment facts before publication.',
            'Notice: Draft v0.9. Approval and effective date remain pending. Contact names and details are intentionally blank until verified.',
        ],
        sections: PRIVACY,
        contact: ['Data Protection Officer', 'dpo@imaps-rosario.gov.ph'],
    },
    terms: {
        title: 'Terms and Conditions',
        subtitle: 'iMAPS: An Intelligent Geospatial Analytics System + FieldSync Mobile App',
        status: [
            ['Document status', 'DRAFT v0.9 — MPDO/DPO review required; not yet effective'],
            ['Prepared', 'October 18, 2026'],
            ['New policy effective date', 'Pending official approval'],
        ],
        notice: [
            'DRAFT — FOR REVIEW ONLY. This is proposed public-facing wording, not an approved municipal notice. Confirm contacts, technical claims, and deployment facts before publication.',
            'Notice: Draft v0.9. Approval and effective date remain pending. Contact names and details are intentionally blank until verified.',
        ],
        sections: TERMS,
        contact: ['Legal Affairs Office', 'legal@imaps-rosario.gov.ph'],
    },
    cookies: {
        title: 'Cookie & Storage Policy',
        subtitle: 'iMAPS: An Intelligent Geospatial Analytics System + FieldSync Mobile App',
        status: [
            ['Document status', 'DRAFT v0.9 — MPDO/DPO review required; not yet effective'],
            ['Prepared', 'October 18, 2026'],
            ['New policy effective date', 'Pending official approval'],
        ],
        notice: [
            'DRAFT — FOR REVIEW ONLY. This is proposed public-facing wording, not an approved municipal notice. Confirm contacts, technical claims, and deployment facts before publication.',
            'Notice: Draft v0.9. Approval and effective date remain pending. Contact names and details are intentionally blank until verified.',
        ],
        sections: COOKIES,
        contact: ['Data Protection Officer', 'dpo@imaps-rosario.gov.ph'],
    },
};

// Small mock screens echoing the real app shell (sidebar, slate canvas, toolbar) — deliberately low on detail.
const MockFrame = ({ nav, title, children }) => (
    <span className="mt-2 block w-full max-w-[400px] rounded-xl border border-slate-200/80 bg-white p-1 shadow-[0_1px_0_rgba(255,255,255,.8)_inset,0_8px_14px_-10px_rgba(37,99,235,.45),0_4px_12px_-6px_rgba(15,23,42,.08)] ring-1 ring-blue-600/5" aria-hidden="true">
    <span className="flex items-center gap-1 px-2 pt-1 pb-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-rose-300" /><span className="w-1.5 h-1.5 rounded-full bg-amber-300" /><span className="w-1.5 h-1.5 rounded-full bg-emerald-300" />
        <span className="mx-auto h-3 w-32 rounded-full bg-slate-100 text-[7px] leading-3 text-center font-semibold text-slate-400">imaps.rosario.gov.ph</span>
    </span>
    <span className="flex rounded-lg border border-slate-100 overflow-hidden">
        <span className="flex flex-col items-center gap-1.5 w-9 shrink-0 py-2 border-r border-slate-100 bg-white">
            <span className="w-4 h-4 rounded-full bg-blue-600 ring-2 ring-blue-100" />
            {[0, 1, 2, 3].map((n) => (
                <span key={n} className={`w-5 h-5 rounded-md ${n === nav ? 'bg-blue-50 ring-1 ring-blue-200' : 'bg-slate-100/80'}`} />
            ))}
        </span>
        <span className="flex-1 min-w-0 bg-slate-50/75 p-2">
            <span className="flex items-center justify-between gap-2 mb-2">
                <span className="text-[10px] font-bold text-slate-700">{title}</span>
                <span className="flex items-center gap-1">
                    <span className="w-12 h-3.5 rounded-md border border-slate-200 bg-white" />
                    <span className="w-6 h-3.5 rounded-md bg-blue-600" />
                </span>
            </span>
            <span className="block rounded-lg border border-slate-200/90 bg-white p-2 shadow-[0_1px_2px_rgba(15,23,42,.04)]">{children}</span>
        </span>
    </span>
    </span>
);
const Line = ({ w, c = 'bg-slate-200' }) => <span className={`block h-1.5 rounded-full ${c}`} style={{ width: w }} />;
const STATUS = [['bg-emerald-50 text-emerald-700 border-emerald-200/80', 'Approved'], ['bg-blue-50 text-blue-600 border-blue-200/80', 'In review'], ['bg-amber-50 text-amber-700 border-amber-200/80', 'Pending']];
const MOCKS = [
    <MockFrame key="a" nav={0} title="Registry">
        {STATUS.map(([c, s], i) => (
            <span key={s} className="flex items-center justify-between gap-2 py-1 border-b border-slate-100 last:border-0">
                <span className="flex items-center gap-1.5 flex-1">
                    <span className={`w-4 h-4 rounded-full ring-2 ring-white ${['bg-blue-200', 'bg-indigo-200', 'bg-sky-200'][i]}`} />
                    <span className="flex-1 space-y-1"><Line w={`${60 - i * 10}%`} /><Line w={`${35 - i * 5}%`} c="bg-slate-100" /></span>
                </span>
                <span className={`rounded-md border px-1.5 text-[9px] font-semibold leading-4 ${c}`}>{s}</span>
            </span>
        ))}
    </MockFrame>,
    <MockFrame key="b" nav={1} title="Geospatial Mapping">
        <span className="flex gap-2">
            <span className="relative flex-1 h-[60px] rounded-md bg-slate-50 overflow-hidden">
                <svg className="absolute inset-0 w-full h-full" viewBox="0 0 120 60" preserveAspectRatio="none" fill="none">
                    <path d="M0 0H44L38 26L0 30Z" fill="rgba(37,99,235,.08)" />
                    <path d="M44 0H120V22L70 28L38 26Z" fill="rgba(37,99,235,.16)" />
                    <path d="M0 30L38 26L70 28L62 60H0Z" fill="rgba(37,99,235,.24)" />
                    <path d="M70 28L120 22V60H62Z" fill="rgba(37,99,235,.12)" />
                    <path d="M44 0L38 26L0 30M38 26L70 28L120 22M70 28L62 60" stroke="#94a3b8" strokeWidth=".8" />
                    <path d="M8 52C30 40 52 46 72 34S108 14 118 8" stroke="#2563eb" strokeWidth="1.2" strokeDasharray="3 2" />
                </svg>
            </span>
            <span className="w-[72px] shrink-0 space-y-1.5 pt-0.5">
                {[['Zoning', true], ['Parcels', true], ['Barangays', false]].map(([l, on]) => (
                    <span key={l} className="flex items-center justify-between">
                        <span className="text-[9px] font-semibold text-slate-500">{l}</span>
                        <span className={`relative w-5 h-3 rounded-full ${on ? 'bg-blue-600' : 'bg-slate-200'}`}>
                            <span className={`absolute top-0.5 w-2 h-2 rounded-full bg-white ${on ? 'right-0.5' : 'left-0.5'}`} />
                        </span>
                    </span>
                ))}
            </span>
        </span>
    </MockFrame>,
    <MockFrame key="c" nav={2} title="Demand Forecasting">
        <span className="flex items-baseline gap-1.5 mb-1.5">
            <span className="text-[11px] font-extrabold text-slate-800">+18%</span>
            <span className="text-[8px] font-semibold text-emerald-600">next quarter</span>
        </span>
        <span className="flex items-end gap-1 h-[40px]">
            {[40, 55, 45, 70, 60, 85, 95].map((h, i) => (
                <span key={i} className={`flex-1 rounded-t-sm ${i > 4 ? 'bg-blue-600/15 border border-dashed border-blue-600' : 'bg-blue-600'}`} style={{ height: `${h}%` }} />
            ))}
        </span>
        <span className="mt-1.5 flex justify-between text-[9px] font-semibold text-slate-400"><span>Actual</span><span className="text-blue-600">Forecast</span></span>
    </MockFrame>,
];

// Login-only refinement of the shared input: taller, softly tinted at rest, white with a blue halo on focus.
const inputPolish = '!h-11 !rounded-xl !bg-slate-50/70 !shadow-[inset_0_1px_2px_rgba(15,23,42,.05)] focus:!bg-white focus:!shadow-[0_0_0_4px_rgba(37,99,235,.1)] !text-[15px] !font-medium';

// The desktop layout is about 1180 × 680 at natural size. Scale it to the largest size that still fits the window
// (capped so it never gets silly on huge or tiny screens). Below 1024px the page stacks and scrolls, so no scaling.
const fitZoom = () => {
    if (typeof window === 'undefined' || window.innerWidth < 1024) return 1;
    return Math.max(0.7, Math.min(1.6, window.innerWidth / 1180, window.innerHeight / 680));
};

// Cloudflare Turnstile: the "Verifying…" security check. Renders only when the server hands over a site key.
// The slot keeps a fixed height so the card never changes size while the widget loads.
const TURNSTILE_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const Turnstile = ({ siteKey, onToken, widgetRef }) => {
    const box = useRef(null);
    useEffect(() => {
        let cancelled = false;
        const mount = () => {
            if (cancelled || !box.current || !window.turnstile || widgetRef.current !== null) return;
            widgetRef.current = window.turnstile.render(box.current, {
                sitekey: siteKey,
                theme: 'light',
                callback: (token) => onToken(token),
                'expired-callback': () => onToken(''),
                'error-callback': () => onToken(''),
            });
        };
        if (window.turnstile) mount();
        else {
            let script = document.querySelector(`script[src="${TURNSTILE_SRC}"]`);
            if (!script) {
                script = document.createElement('script');
                script.src = TURNSTILE_SRC;
                script.async = true;
                document.head.appendChild(script);
            }
            script.addEventListener('load', mount);
        }
        return () => {
            cancelled = true;
            if (widgetRef.current !== null && window.turnstile) window.turnstile.remove(widgetRef.current);
            widgetRef.current = null;
        };
    }, [siteKey]);
    return <div className="flex h-[65px] items-center justify-center overflow-hidden" ref={box} aria-label="Security check" />;
};

export default function Login() {
    const [zoom, setZoom] = useState(fitZoom);
    useEffect(() => {
        const onResize = () => setZoom(fitZoom());
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    const { turnstileSiteKey } = usePage().props;
    const turnstileWidget = useRef(null);
    const { data, setData, post, processing, errors, reset, clearErrors } = useForm({
        email: '',
        password: '',
        'cf-turnstile-response': '',
    });
    // A Turnstile token works once, so every attempt (even a failed one) gets a fresh check.
    const resetTurnstile = () => {
        setData('cf-turnstile-response', '');
        if (turnstileWidget.current !== null && window.turnstile) window.turnstile.reset(turnstileWidget.current);
    };

    const [showPassword, setShowPassword] = useState(false);
    const [active, setActive] = useState(0);
    const [showTerms, setShowTerms] = useState(false);
    const termsDialog = useRef(null);
    const termsOpener = useRef(null);
    const openTerms = (doc) => {
        termsOpener.current = document.activeElement;
        setShowTerms(doc);
    };

    // Legal modal keyboard support: Escape closes, Tab stays inside, focus returns to the link that opened it.
    useEffect(() => {
        if (!showTerms) return;
        const focusable = () => [...termsDialog.current.querySelectorAll('a[href], button:not([disabled])')];
        focusable()[0]?.focus();

        const onKeyDown = (e) => {
            if (e.key === 'Escape') return setShowTerms(false);
            if (e.key !== 'Tab') return;
            const items = focusable();
            const first = items[0];
            const last = items[items.length - 1];
            if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
            else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        };
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('keydown', onKeyDown);
            termsOpener.current?.focus();
        };
    }, [showTerms]);

    useEffect(() => {
        // Re-armed on every change so a manual click restarts the 6s timer (and the progress line).
        const timeout = setTimeout(() => setActive((p) => (p + 1) % MODULES.length), 6000);
        return () => clearTimeout(timeout);
    }, [active]);

    // After too many failed logins the server sends how many seconds the block lasts; tick it down live.
    const [retryIn, setRetryIn] = useState(0);
    useEffect(() => {
        setRetryIn(Number(errors.retry_after) || 0);
    }, [errors.retry_after]);
    useEffect(() => {
        if (retryIn <= 0) return;
        const timer = setTimeout(() => {
            if (retryIn === 1) clearErrors();
            setRetryIn(retryIn - 1);
        }, 1000);
        return () => clearTimeout(timer);
    }, [retryIn]);
    const countdown = `${Math.floor(retryIn / 60)}:${String(retryIn % 60).padStart(2, '0')}`;

    const submit = (e) => {
        e.preventDefault();
        post('/login', {
            showProgress: false, // the button's spinner is the loading indicator here
            onFinish: () => { reset('password'); if (turnstileSiteKey) resetTurnstile(); },
        });
    };

    return (
        <>
            <Head title="Sign In | iMAPS Rosario" />

            <AuthStyles lockScroll={!!showTerms} />

            {/* On desktop the whole page fits the window, so it never scrolls. The layout is scaled to the window
                (see fitZoom): up on big screens so it isn't tiny, down on short ones so nothing is cut off. */}
            <style>{`
                @media (min-width: 1024px) {
                    body { overflow: hidden; }
                    .login-fit { zoom: var(--z, 1); height: calc(100vh / var(--z, 1)); }
                }
            `}</style>

            <div className="relative min-h-screen w-full overflow-hidden bg-white text-slate-900 lg:h-screen">

                <CadastralBackground activeParcel={ACTIVE_PARCEL[active]} />

                <div style={{ '--z': zoom }} className="login-fit relative z-10 max-w-6xl mx-auto px-5 sm:px-6 min-h-screen flex flex-col lg:min-h-0">

                    {/* Wordmark-only bar; the logo mark lives on the sign-in card below. */}
                    {/* On desktop the bar is exactly as wide as the content below (headline edge to card edge). */}
                    <nav className="rise relative mt-4 flex w-full items-center justify-between rounded-2xl bg-white/75 backdrop-blur-xl border border-white ring-1 ring-slate-900/5 py-2.5 pl-6 pr-3 shadow-[0_1px_2px_rgba(15,23,42,.04),0_18px_44px_-20px_rgba(37,99,235,.35)] lg:mx-auto lg:max-w-[1012px] after:absolute after:inset-x-10 after:bottom-0 after:h-px after:bg-gradient-to-r after:from-transparent after:via-blue-400/50 after:to-transparent">
                        <div className="flex items-center gap-4">
                            <p className="text-[26px] font-extrabold leading-none tracking-[-0.045em] text-slate-900">
                                iMAPS<span className="text-blue-600">.</span>
                            </p>
                            <span className="hidden sm:block h-5 w-px bg-slate-200" aria-hidden="true" />
                            <p className="hidden sm:block text-[10.5px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                                Municipal Planning and Development Office
                            </p>
                        </div>
                        <a href="mailto:admin@imaps-rosario.gov.ph" className="inline-flex items-center gap-2 rounded-xl border border-slate-200/80 bg-white/80 px-4 py-2 text-sm font-semibold text-slate-600 shadow-sm hover:border-blue-200 hover:text-blue-700 hover:bg-blue-50 transition-colors">
                            <Icon d={ICONS.mail} className="w-4 h-4" sw={2} />
                            <span className="hidden sm:inline">Need help?</span>
                        </a>
                    </nav>

                    <main className="flex-1 grid lg:grid-cols-[minmax(0,540px)_376px] lg:justify-center gap-12 lg:gap-24 items-center py-12 lg:min-h-0 lg:py-4">

                        {/* Left: headline + module stepper */}
                        <div className="rise rise-2 order-2 lg:order-1">
                            <h1 className="text-4xl sm:text-[44px] font-extrabold tracking-tight leading-[1.08] text-slate-900">
                                One workspace for<br />Rosario&rsquo;s <span className="text-blue-600">land use</span>
                            </h1>

                            <ol className="mt-5 max-w-md h-[400px]" aria-label="Modules">
                                {MODULES.map((m, i) => {
                                    const on = active === i;
                                    return (
                                        <li key={m.name} className="relative pl-14 pb-2 last:pb-0">
                                            {i < MODULES.length - 1 && (
                                                <span className="absolute left-[19px] top-10 bottom-0 w-0.5 bg-slate-200 overflow-hidden" aria-hidden="true">
                                                    {on && <span key={active} className="fill absolute inset-0 bg-blue-600" />}
                                                </span>
                                            )}
                                            <button onClick={() => setActive(i)} aria-current={on ? 'step' : undefined} className="text-left group w-full">
                                                <span className={`step absolute left-0 top-0 grid place-items-center w-10 h-10 rounded-full text-sm font-bold transition-all duration-500 ${on ? 'bg-white text-blue-600 ring-2 ring-blue-600 shadow-[0_0_0_6px_rgba(37,99,235,.1)]' : i < active ? 'bg-blue-600 text-white shadow-[0_4px_10px_-3px_rgba(37,99,235,.5)]' : 'bg-white text-slate-400 ring-1 ring-slate-200 group-hover:ring-slate-300 group-hover:text-slate-600'}`}>
                                                    {i + 1}
                                                </span>
                                                <span className={`block text-base font-medium leading-10 transition-colors ${on ? 'text-slate-900 font-semibold' : 'text-slate-400 group-hover:text-slate-600'}`}>{m.name}</span>
                                                <span className={`grid transition-[grid-template-rows,opacity] duration-700 ease-[cubic-bezier(.65,0,.35,1)] motion-reduce:transition-none ${on ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                                                    <span className="overflow-hidden block pb-3 text-sm leading-relaxed text-slate-500">
                                                        {m.text}
                                                        <span className={`block transition-[opacity,transform] duration-700 ease-[cubic-bezier(.16,1,.3,1)] motion-reduce:transition-none ${on ? 'opacity-100 translate-y-0 delay-200' : 'opacity-0 translate-y-2'}`}>{MOCKS[i]}</span>
                                                    </span>
                                                </span>
                                            </button>
                                        </li>
                                    );
                                })}
                            </ol>
                        </div>

                        {/* Right: sign-in card */}
                        <div className="rise rise-2 order-1 lg:order-2 w-full">
                            <div style={{ zoom: turnstileSiteKey ? 0.86 : 0.94 }} className="overflow-hidden rounded-3xl bg-white ring-1 ring-slate-900/5 shadow-[0_2px_4px_rgba(15,23,42,.04),0_50px_90px_-34px_rgba(35,71,213,.55)]">
                                {/* Centred header: emblem, eyebrow, title, subtitle */}
                                <div className="px-7 pt-6 text-center">
                                    {/* A faint halo lifts the logo off the card without a heavy shadow */}
                                    <div className="relative mx-auto h-[84px] w-[84px]">
                                        <span className="pointer-events-none absolute -inset-6 rounded-full bg-[radial-gradient(circle,rgba(37,99,235,.13),transparent_68%)]" aria-hidden="true" />
                                        <ApplicationLogo symbol data-splash-target="symbol" className="relative h-full w-full" alt="" aria-hidden="true" />
                                    </div>
<p className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-blue-50/80 px-3 py-[5px] text-[10px] font-bold uppercase leading-none tracking-[0.24em] text-blue-600 ring-1 ring-inset ring-blue-100">                                        <Icon d={ICONS.shield} className="w-3 h-3" sw={2.2} />                                        Authorized Personnel                                    </p>
                                    <h2 className="mt-3 text-[27px] font-extrabold leading-none tracking-[-0.035em] text-slate-900">
                                        Welcome <span className="bg-gradient-to-r from-blue-600 to-indigo-500 bg-clip-text text-transparent">back</span>
                                    </h2>
                                    {/* Fixed-height slot: the subtitle and any sign-in error swap places here, so the card never changes size or moves. */}
                                    <div className="relative mt-2 h-10">
                                        <p className={`absolute inset-0 pt-px text-[13px] leading-5 text-slate-500 transition-opacity duration-200 ${errors.email ? 'opacity-0' : 'opacity-100'}`} aria-hidden={!!errors.email}>
                                            Enter your official staff credentials to continue.
                                        </p>
                                        {errors.email && (
                                            <div id="login-error" role="alert" className="absolute inset-0 flex items-center gap-2.5 rounded-lg border border-red-100 bg-red-50/70 px-3 text-left text-[12.5px] leading-[17px] text-red-700 shadow-[inset_3px_0_0_#ef4444]">
                                                <Icon d={ICONS.alert} className="w-4 h-4 shrink-0 text-red-500" sw={2} />
                                                {retryIn > 0 ? (
                                                    <span>
                                                        Too many failed login attempts. Try again in{' '}
                                                        <time className="font-bold tabular-nums">{countdown}</time>.
                                                    </span>
                                                ) : errors.email}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="px-7 pt-3 pb-6">

                                <form onSubmit={submit} aria-busy={processing} className={`space-y-4 transition-opacity ${processing ? '[&_input]:opacity-60 [&_input]:pointer-events-none' : ''}`}>
                                    <Field id="email" label="Email address" icon={ICONS.mail}>
                                        <input
                                            type="email"
                                            id="email"
                                            value={data.email}
                                            onChange={e => setData('email', e.target.value)}
                                            className={`${inputClass} ${inputPolish}`}
                                            placeholder="name@rosario.gov.ph"
                                            autoComplete="email"
                                            aria-invalid={!!errors.email}
                                            aria-describedby={errors.email ? 'login-error' : undefined}
                                            required
                                        />
                                    </Field>

                                    <Field
                                        id="password"
                                        label="Password"
                                        icon={ICONS.lock}
                                        aside={
                                            <button
                                                type="button"
                                                onClick={showResetHelp}
                                                aria-haspopup="dialog"
                                                className="rounded-md text-[13px] font-semibold text-blue-600 transition-colors hover:text-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600/30"
                                            >
                                                Forgot your password?
                                            </button>
                                        }
                                    >
                                        <input
                                            type={showPassword ? 'text' : 'password'}
                                            id="password"
                                            value={data.password}
                                            onChange={e => setData('password', e.target.value)}
                                            className={`${inputClass} ${inputPolish} pr-12`}
                                            placeholder="Enter your password"
                                            autoComplete="current-password"
                                            aria-invalid={!!errors.email}
                                            aria-describedby={errors.email ? 'login-error' : undefined}
                                            required
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(!showPassword)}
                                            aria-label={showPassword ? 'Hide password' : 'Show password'}
                                            className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition-colors"
                                        >
                                            <Icon className="w-[18px] h-[18px]" d={showPassword ? ICONS.eyeOff : ICONS.eye} />
                                        </button>
                                    </Field>

                                    {turnstileSiteKey && (
                                        <Turnstile siteKey={turnstileSiteKey} widgetRef={turnstileWidget} onToken={(t) => setData('cf-turnstile-response', t)} />
                                    )}

                                    <button
                                        type="submit"
                                        disabled={processing || retryIn > 0 || (!!turnstileSiteKey && !data['cf-turnstile-response'])}
                                        className="w-full h-11 rounded-xl bg-gradient-to-b from-blue-500 via-blue-600 to-blue-700 hover:brightness-110 active:scale-[.99] disabled:cursor-wait disabled:opacity-90 text-white text-[15px] font-semibold tracking-wide shadow-[0_16px_30px_-10px_rgba(37,99,235,.75),inset_0_1px_0_rgba(255,255,255,.3)] transition inline-flex items-center justify-center gap-2.5"
                                    >
                                        {processing && (
                                            <svg className="w-[18px] h-[18px] animate-spin motion-reduce:animate-none" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".3" strokeWidth="3" />
                                                <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                                            </svg>
                                        )}
                                        <span>{processing ? 'Signing in…' : 'Sign In'}</span>
                                        {/* Announced only while a sign-in is in progress, not as a stray "Sign In". */}
                                        <span role="status" className="sr-only">{processing ? 'Signing in…' : ''}</span>
                                    </button>
                                </form>

                                <div className="mt-5 border-t border-slate-100 pt-4 text-center">
                                    {/* text-wrap: balance splits the sentence into two even lines instead of leaving "and" on its own. */}
                                    <p className="mx-auto max-w-[19rem] text-xs leading-[1.65] text-slate-500 [text-wrap:balance]">
                                        By signing in you agree to our{' '}
                                        <span className="whitespace-nowrap"><button type="button" onClick={() => openTerms('terms')} className="font-semibold text-slate-700 underline decoration-slate-300 underline-offset-[3px] transition-colors hover:text-blue-600 hover:decoration-blue-400">Terms & Conditions</button>,</span>{' '}
                                        <button type="button" onClick={() => openTerms('privacy')} className="whitespace-nowrap font-semibold text-slate-700 underline decoration-slate-300 underline-offset-[3px] transition-colors hover:text-blue-600 hover:decoration-blue-400">Privacy Policy</button>{' '}and{' '}
                                        <button type="button" onClick={() => openTerms('cookies')} className="whitespace-nowrap font-semibold text-slate-700 underline decoration-slate-300 underline-offset-[3px] transition-colors hover:text-blue-600 hover:decoration-blue-400">Cookie & Storage Policy</button>.
                                    </p>
                                </div>
                                </div>
                            </div>
                        </div>
                    </main>

                </div>
            </div>

            {/* Legal document modal (Terms or Privacy) */}
            {showTerms && (() => { const d = DOCS[showTerms]; return (
                <div ref={termsDialog} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="terms-title">
                    <div className="bg-white text-slate-900 w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl relative overflow-hidden rounded-2xl">
                        <div className="flex justify-between items-start gap-4 px-8 pt-7 pb-5 border-b border-slate-100">
                            <div>
                                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-600">Legal</p>
                                <h2 id="terms-title" className="mt-1 text-2xl font-semibold tracking-tight text-[#0A2540]">{d.title}</h2>
                                <p className="mt-1.5 text-xs font-medium text-slate-500">{d.subtitle}</p>
                            </div>
                            <button onClick={() => setShowTerms(false)} aria-label="Close" className="shrink-0 text-slate-400 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 p-2 rounded-full transition-colors">
                                <Icon d={ICONS.close} className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="px-8 py-7 overflow-y-auto custom-scrollbar text-sm text-slate-600 leading-7 space-y-8">
                            <section>
                                <h3 className="text-[#0A2540] font-semibold text-xs mb-3 uppercase tracking-[0.16em]">Document Status</h3>
                                <div className="bg-slate-50 border border-slate-200 border-l-4 border-l-blue-600 px-5 py-4 rounded-xl text-slate-600 space-y-2">
                                    {d.status.map(([label, value]) => (
                                        <p key={label}><span className="font-semibold text-slate-900">{label}:</span> {value}</p>
                                    ))}
                                    {d.notice.map((text) => (
                                        <p key={text}>{text}</p>
                                    ))}
                                </div>
                            </section>

                            {d.sections.map(([heading, items], i) => (
                                <section key={heading}>
                                    <h3 className="flex items-center gap-3 text-[#0A2540] font-semibold text-xs mb-4 uppercase tracking-[0.16em]">
                                        <span className="grid place-items-center w-6 h-6 rounded-full bg-blue-50 text-blue-600 text-[11px] tracking-normal">{i + 1}</span>
                                        {heading}
                                    </h3>
                                    <div className="space-y-4 pl-9">
                                        {items.map((text, j) => (
                                            <p key={j}>{text}</p>
                                        ))}
                                    </div>
                                </section>
                            ))}

                            <section className="bg-slate-50 border border-slate-200 px-6 py-5 rounded-xl">
                                <h3 className="text-[#0A2540] font-semibold text-xs mb-4 uppercase tracking-[0.16em]">Contact Information</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                                    <div>
                                        <span className="block font-semibold text-slate-900">System Administrator</span>
                                        <a href="mailto:admin@imaps-rosario.gov.ph" className="text-blue-600 hover:underline">admin@imaps-rosario.gov.ph</a>
                                    </div>
                                    <div>
                                        <span className="block font-semibold text-slate-900">{d.contact[0]}</span>
                                        <a href={`mailto:${d.contact[1]}`} className="text-blue-600 hover:underline">{d.contact[1]}</a>
                                    </div>
                                    <div className="md:col-span-2">
                                        <span className="block font-semibold text-slate-900">Mailing Address</span>
                                        <p className="text-slate-600">Municipal Planning and Development Office, Municipal Hall, Rosario, Batangas 4225</p>
                                    </div>
                                </div>
                            </section>
                        </div>

                        <div className="px-8 py-4 border-t border-slate-100 flex justify-end bg-slate-50">
                            <button onClick={() => setShowTerms(false)} className="px-6 py-2.5 bg-blue-600 text-white rounded-xl shadow-lg shadow-blue-600/25 hover:bg-blue-700 transition-colors text-sm font-semibold">
                                I Understand & Close
                            </button>
                        </div>
                    </div>
                </div>
            ); })()}
        </>
    );
}
