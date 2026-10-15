import { router } from "@inertiajs/react";
import dialog, { esc, tight } from "@/utils/dialog";
import { getZoneInfo } from "@/utils/clupZones";
import { getZoningConformity, getStatusMarkerConfig, LAND_USE_CLASSES } from "@/Components/MapLayers/StatusPanel";

// A parcel found by TCT, Tax Dec or PIN: show what it is and where it sits in
// CLUP 2030, ask what it will be used for, and hand it to Step 1 of a new
// application the same way the form's own PIN lookup would fill it.
export async function promptParcelApplication({ parcel, application }) {
    const zoneValue = parcel.clup_zone_code || parcel.land_use_class;
    const zone = getZoneInfo(zoneValue);
    const row = (k, v) => (v ? `<tr><td style="color:#64748b;padding:3px 14px 3px 0;white-space:nowrap;vertical-align:top">${k}</td><td style="color:#0f172a;padding:3px 0">${esc(v)}</td></tr>` : "");

    const existing = application
        ? `<p style="margin-top:10px;padding:8px 10px;border:1px solid #fcd34d;background:#fffbeb;border-radius:10px;font-size:12px;color:#92400e">This parcel already has application <a href="/applications/${Number(application.id)}" style="text-decoration:underline">${esc(application.reference_number)}</a> (${esc(getStatusMarkerConfig(application.status).label)}).</p>`
        : "";

    const { value: intendedUse, isConfirmed } = await dialog.fire({
        title: "Parcel found",
        icon: "success",
        width: 440,
        html: tight(`
            <div style="text-align:left">
                <div style="padding:8px 12px;border:1px solid #e2e8f0;background:#f8fafc;border-radius:12px">
                    <table style="font-size:12.5px;border-collapse:collapse;width:100%">
                        ${row("TCT", parcel.tct_number)}
                        ${row("Tax Dec.", parcel.tax_dec_number)}
                        ${row("PIN", parcel.property_index_number)}
                        ${row("Lot", parcel.lot_number)}
                        ${row("Area", parcel.lot_area_sqm ? `${Number(parcel.lot_area_sqm).toLocaleString("en-PH")} sqm` : "")}
                        ${row("Barangay", parcel.barangay)}
                        ${row("Owner", parcel.owner_name)}
                    </table>
                </div>
                <p style="margin-top:10px;font-size:12.5px;display:flex;align-items:center;gap:6px">
                    <span style="width:12px;height:12px;border-radius:3px;background:${zone.fill};border:1px solid rgba(0,0,0,.2)"></span>
                    <span>CLUP 2030: <b style="color:#0f172a">${esc(zone.code ? `${zone.label} (${zone.code})` : "Not mapped in CLUP")}</b></span>
                </p>
                ${existing}
                <label for="imaps-intended-use" style="display:block;margin-top:14px;font-size:12px;color:#475569">What will the parcel be used for?</label>
                <select id="imaps-intended-use" style="display:block;width:100%;margin-top:4px;padding:8px 32px 8px 10px;font-size:13px;line-height:20px;color:#0f172a;border:1px solid #cbd5e1;border-radius:10px;background-color:#fff">
                    ${LAND_USE_CLASSES.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join("")}
                </select>
                <p id="imaps-use-fit" style="margin-top:6px;font-size:12px;min-height:18px"></p>
            </div>`),
        // Shows, as the use is picked, whether it fits the parcel's CLUP zone.
        didOpen: (popup) => {
            const select = popup.querySelector("#imaps-intended-use");
            const fit = popup.querySelector("#imaps-use-fit");
            const update = () => {
                const c = getZoningConformity(select.value, zoneValue);
                fit.textContent = c.isConforming ? "Conforms to CLUP 2030." : `${c.title}: ${c.desc}`;
                fit.style.color = c.isConforming ? "#15803d" : "#b45309";
            };
            select.addEventListener("change", update);
            update();
            select.focus();
        },
        preConfirm: () => document.getElementById("imaps-intended-use")?.value || LAND_USE_CLASSES[0],
        showCancelButton: true,
        confirmButtonText: "Proceed to application",
        cancelButtonText: "Close",
    });
    if (!isConfirmed) return false;

    const conformity = getZoningConformity(intendedUse, zoneValue);
    if (!conformity.isConforming) {
        const { isConfirmed: proceed } = await dialog.fire({
            title: conformity.title,
            html: tight(`<p>${esc(conformity.desc)}</p><p style="margin-top:8px">The application will be flagged for variance review.</p>`),
            icon: "warning",
            width: 380,
            showCancelButton: true,
            confirmButtonText: "Proceed anyway",
            cancelButtonText: "Back",
        });
        if (!proceed) return false;
    }

    try {
        sessionStorage.setItem(
            "imaps_verified_parcel_prefill",
            JSON.stringify({
                target_land_use_class: intendedUse,
                tct_number: parcel.tct_number || "",
                tax_dec_number: parcel.tax_dec_number || "",
                property_index_number: parcel.property_index_number || "",
                lot_number: parcel.lot_number || "",
                barangay: parcel.barangay || "",
                owner_name: parcel.owner_name || "",
                location_address: parcel.location_address || "",
                lot_area_sqm: parcel.lot_area_sqm || "",
                clup_zone_code: parcel.clup_zone_code || "",
                cadastral_zone: parcel.land_use_class || "",
                coordinates: parcel.latitude != null && parcel.longitude != null
                    ? `${Number(parcel.latitude).toFixed(6)},${Number(parcel.longitude).toFixed(6)}`
                    : "",
                requiresVariance: !conformity.isConforming,
            })
        );
    } catch (e) {}
    router.visit("/applications/encode");
    return true;
}
