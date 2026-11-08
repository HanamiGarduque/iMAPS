# iMAPS Simulated Application Scenarios & Mock Data — Rosario, Batangas

Limang (5) simulated application scenarios para sa demo, user testing, at QA ng iMAPS. Lahat ng lokasyon ay barangay ng **Rosario, Batangas**.

Ang mga **parcel (lot) ay totoong records mula sa `land_parcels` table** (PIN, lot number, TCT, tax dec, ARP, survey number, owner, lot area, land use class, at coordinates ay kinuha mismo roon), kaya lalabas sila sa map at sa PIN lookup. Ang ibang detalye (pangalan ng kompanya, contact numbers, emails, fees, OR numbers) ay **fictional**.

## Paano gamitin ang dokumentong ito

- **Role na kailangan:** `Planning Officer` (nag-e-encode at nag-e-evaluate), `Site Inspector` (field inspection), `Admin` (opsyonal, para sa audit trail).
- **Ang Reference Number ay auto-generated** ng system (`APP-YYYY-NNNNN`). Ang nasa mga talahanayan ay *expected* lang. Ang **Form Number** naman ay *ikaw* ang mag-type (kailangang unique).
- **Parcel lookup:** Sa Step "Property", i-type ang **PIN** sa lookup (o pumili sa map gamit ang coordinates). Dapat kusang mapunan ang owner, lot area, TCT, atbp. mula sa `land_parcels`. I-verify na tumutugma ito sa talahanayan.
- **Siguraduhing libre pa ang lot:** Bago gamitin, i-check na wala pang application ang parcel (query sa ibaba).
- **Mabilis na alternatibo:** `php artisan demo:applications --count=5` ay gumagawa ng sample records gamit din ang `land_parcels`. Ang mga scenario dito ay para sa **manual, step-by-step walkthrough**.
- Ang text ay ina-uppercase ng system pagka-save (hal. `CORAZON DIMAYUGA`). Normal iyon.

### Query para i-verify ang mga parcel at hanapin ang kapalit

```sql
-- I-verify na existing at libre pa ang lahat ng lot sa dokumentong ito
SELECT gid, barangay, land_use_class, property_index_number, lot_area_sqm, owner_name,
       property_index_number IN (SELECT property_index_number FROM parcels
                                 WHERE property_index_number IS NOT NULL) AS already_used
FROM land_parcels
WHERE property_index_number IN (
  '04-01-021-026-05-708', '04-01-021-007-05-648', '04-01-021-001-07-862',
  '04-01-021-001-10-940', '04-01-021-025-03-461', '04-01-021-037-07-465');

-- Kapalit kung nagamit na ang isang lot (palitan ang barangay / land_use_class / lot_area_sqm)
SELECT gid, barangay, land_use_class, property_index_number, lot_area_sqm, owner_name
FROM land_parcels
WHERE barangay = 'Namunga' AND land_use_class = 'R1-Z'
  AND property_index_number NOT IN (SELECT property_index_number FROM parcels
                                    WHERE property_index_number IS NOT NULL)
ORDER BY gid LIMIT 5;
```

## Buod

| # | Scenario | Barangay | Parcel (PIN) | Application Type | Stream | Daan (Path) | Expected Final Status |
|---|----------|----------|--------------|------------------|--------|-------------|-----------------------|
| 1 | House on a residential lot | Namunga | `04-01-021-026-05-708` | Locational Clearance | permit | Direct approval, walang inspection | Released |
| 2 | Store with rental rooms | Bulihan | `04-01-021-007-05-648` | Zoning Certificate + Locational Clearance | permit | May Site Inspection | Released |
| 3 | Subdivision, 2 parcels | Alupay | `04-01-021-001-07-862`, `04-01-021-001-10-940` | Development Permit | permit | Multi-parcel: 1 approved, 1 declined | Depende sa priority rule (itala ang aktwal) |
| 4 | Agri → Commercial rezoning | Namuco | `04-01-021-025-03-461` | Petition for Rezoning | amendment | Sangguniang Bayan (SB) routing | Released |
| 5 | Poultry house in a residential zone | Quilib | `04-01-021-037-07-465` | Locational Clearance | permit | Declined sa technical review | Denied |

**Mga status sa system:** `Received → Technical Review → (Site Inspection Scheduled) → (Under Sangguniang Bayan) → For Release → Released`, o `Denied`.

---

## Scenario 1 — House on a Residential Lot (Direct Approval)

**Layunin:** Pinakasimpleng daloy. Walang inspection, walang SB.

### Mock data

| Field | Value |
|-------|-------|
| Reference Number (auto) | `APP-2026-00101` |
| **Form Number** | `LC-2026-0101` |
| Stream | permit |
| Application Type | Locational Clearance |
| Purpose | Construction of a single-storey residential house |
| Applicant | Corazon Dimayuga (parcel owner) |
| Contact / Email | 09171234501 / corazon.dimayuga@example.com |
| Applicant address | Purok 4, Brgy. Namunga, Rosario, Batangas |
| Right over land | Owner |
| Project barangay | Namunga |
| Building area | 96 sq.m. |
| Project cost | ₱1,450,000.00 |
| Assessment fee | ₱1,800.00 |
| Preferred release mode | Pick-up |

**Parcel (galing sa `land_parcels`, gid 1983):**

| Field | Value |
|-------|-------|
| Parcel code | P-1983 |
| Property Index Number (PIN) | `04-01-021-026-05-708` |
| Lot number | Lot 5550, Cad-426-D |
| Survey number | Psd-04-100637 |
| TCT number | T-805418 |
| Tax dec number | 24-21-057-28801 |
| ARP number | 2024-005-040 |
| Location address | Purok 4, Brgy. Namunga, Rosario, Batangas |
| Owner | Corazon Dimayuga |
| Land use class | R1-Z |
| Lot area | 170 sq.m. |
| Coordinates (lat, lng) | 13.844937, 121.189946 |
| Decision | Approved |

### Step-by-step (Taglish)

1. **Mag-login** bilang `Planning Officer`.
2. Pumunta sa **Applications → Encode** (`/applications/encode`).
3. **Step "Application":** piliin ang stream na `permit`, i-check ang **Locational Clearance**, i-type ang Form Number na `LC-2026-0101`, at ilagay ang purpose, building area, at project cost.
4. **Step "Applicant":** ilagay ang pangalan, contact number (`09…`, 11 digits), email, at address. Sa "Right over land" piliin ang `Owner`.
5. **Step "Property":** i-type ang PIN na `04-01-021-026-05-708` sa lookup. Dapat lumabas ang lot sa **Namunga** at mapunan ang owner, lot area (170 sq.m.), TCT, at land use `R1-Z`. I-verify na tumutugma ito sa talahanayan sa itaas.
6. Sa parcel, itakda ang **Decision = Approved** (malinaw na pasok sa zoning, hindi na kailangan ng inspection).
7. **Step "Review":** ilagay ang assessment fee na `₱1,800.00`, piliin ang **Pick-up at Office**, at i-check ang buod.
8. I-click ang **Submit**. Tandaan ang lumabas na **Reference Number** at ikumpara sa Form Number.
9. Buksan ang application sa **Applications** list. Dahil approved agad ang parcel, dapat **For Release** na ang status.
10. Pumunta sa tab na **Export permit/doc**, i-generate ang **Locational Clearance** (PDF).
11. Sa **Receipt**, i-record ang **OR Number** (hal. `OR-0048213`) at **date of receipt**.
12. I-click ang **Mark as Released**.

**Dapat makita:** Status `Released`; may saved permit; kumpleto ang timeline (Received → For Release → Released); may entry sa Audit Trail; lumalabas ang lot sa map na naka-link sa application.

---

## Scenario 2 — Store with Rental Rooms (Site Inspection)

**Layunin:** Pagsubok sa pag-assign ng inspector at pagbabalik ng inspection result.

### Mock data

| Field | Value |
|-------|-------|
| Reference Number (auto) | `APP-2026-00102` |
| **Form Number** | `ZC-2026-0102` |
| Stream | permit |
| Application Types | Zoning Certificate, Locational Clearance |
| Purpose | Construction of a 2-storey building with a store on the ground floor and 4 rental rooms upstairs |
| Business name | MENDOZA MINI MART |
| Applicant | Ramon Mendoza (parcel owner) |
| Contact / Email | 09189876502 / ramon.mendoza@example.com |
| Applicant address | Purok 6, Brgy. Bulihan, Rosario, Batangas |
| Right over land | Owner |
| Project barangay | Bulihan |
| Building area | 220 sq.m. |
| Project cost | ₱4,800,000.00 |
| Fees | Zoning Certificate ₱1,000.00 + Locational Clearance ₱3,200.00 = ₱4,200.00 |
| Inspector | Any active `Site Inspector` |
| Scheduled / Deadline | 3 days / 7 days from today |
| Preferred release mode | By mail (Applicant) |

**Parcel (`land_parcels`, gid 879):**

| Field | Value |
|-------|-------|
| Parcel code | P-0879 |
| Property Index Number (PIN) | `04-01-021-007-05-648` |
| Lot number | Lot 891, Cad-426-D |
| Survey number | Psd-04-347324 |
| TCT number | T-629521 |
| Tax dec number | 24-21-056-06860 |
| ARP number | 2023-009-008 |
| Location address | Purok 6, Brgy. Bulihan, Rosario, Batangas |
| Owner | Ramon Mendoza |
| Land use class | C1-Z |
| Lot area | 410 sq.m. |
| Coordinates (lat, lng) | 13.797729, 121.227170 |
| Decision | Needs Site Inspection |

### Step-by-step (Taglish)

1. Mag-login bilang `Planning Officer` at buksan ang **Applications → Encode**.
2. Sa **Step "Application"**, i-check ang **dalawang type** (Zoning Certificate *at* Locational Clearance), ilagay ang Form Number `ZC-2026-0102`, business name, at project cost.
3. Sa **Step "Applicant"**, punan ang detalye ni Ramon at piliin ang `Owner`.
4. Sa **Step "Property"**, i-type ang PIN na `04-01-021-007-05-648`. Dapat lumabas ang lot sa **Bulihan** (`C1-Z`, 410 sq.m.). Itakda ang **Decision = Needs Site Inspection**.
5. Piliin ang **Inspector**, **Scheduled date** (3 araw mula ngayon) at **Deadline date** (7 araw mula ngayon). Hindi puwedeng petsa sa nakaraan at ang deadline ay hindi dapat mas maaga sa schedule. Sa notes: `Check the front setback and whether any structure blocks the drainage.`
6. Sa **Step "Review"**, ilagay ang total fee na `₱4,200.00` at piliin ang **By mail (Applicant)**. Pagkatapos ay **Submit**.
7. Buksan ang application. Dapat makita ang inspection na naka-assign at ang status ay nasa **Technical Review** na may scheduled inspection.
8. **Mag-logout**, tapos mag-login bilang ang napiling `Site Inspector`. Pumunta sa **Site Inspections** at buksan ang bagong assignment (may notification din).
9. Kumpletuhin ang inspection (sa FieldSync/mobile, o i-pull sa **Site Inspections → Sync from FieldSync**). Findings: `Complies with the 3m front setback. No obstruction to the drainage.`
10. Bumalik bilang `Planning Officer`. Buksan ang application, tingnan ang inspection report sa review desk, at itakda ang parcel decision = **Approved**.
11. I-submit ang technical review. Dapat lumipat ang status sa **For Release**.
12. I-generate ang parehong permit (Zoning Certificate at Locational Clearance) sa **Export permit/doc**.
13. I-record ang OR Number (`OR-0048276`) at date of receipt, tapos **Mark as Released**.

**Dapat makita:** May inspection round na `returned`; may notification sa inspector; kumpleto ang timeline; dalawang permit ang naka-save.

---

## Scenario 3 — Subdivision with 2 Parcels (Multi-Parcel, Partial Decision)

**Layunin:** Subukan ang per-parcel na desisyon sa iisang application.

### Mock data

| Field | Value |
|-------|-------|
| Reference Number (auto) | `APP-2026-00103` |
| **Form Number** | `DP-2026-0103` |
| Stream | permit |
| Application Type | Development Permit |
| Purpose | Subdivision of land into 40 residential lots |
| Corporation | Alupay Homes Development Corp. |
| Representative | Evelyn S. Villanueva (Authorized Representative) |
| Contact / Email | 09203456703 / evelyn.villanueva@example.com |
| Corporation address | Brgy. Alupay, Rosario, Batangas |
| Right over land | Owner |
| Project barangay | Alupay |
| Area to develop | 9,000 sq.m. |
| Number of saleable lots | 40 |
| Project cost | ₱18,500,000.00 |
| Fees | Development Permit ₱12,000.00 + Other fees ₱1,500.00 = ₱13,500.00 |
| Preferred release mode | By mail (Authorized Representative) |

**Parcel A (`land_parcels`, gid 75) → Approved**

| Field | Value |
|-------|-------|
| Parcel code | P-0075 |
| Property Index Number (PIN) | `04-01-021-001-07-862` |
| Lot number | Lot 13584, Cad-426-D |
| Survey number | Psd-04-839788 |
| TCT number | T-355999 |
| Tax dec number | 24-21-078-47335 |
| ARP number | 2025-003-102 |
| Location address | Purok 5, Brgy. Alupay, Rosario, Batangas |
| Owner | Eduardo Dimayuga |
| Land use class | R2-Z |
| Lot area | 5,358 sq.m. |
| Coordinates (lat, lng) | 13.844995, 121.288152 |

**Parcel B (`land_parcels`, gid 14) → Declined**

| Field | Value |
|-------|-------|
| Parcel code | P-0014 |
| Property Index Number (PIN) | `04-01-021-001-10-940` |
| Lot number | Lot 12036, Cad-426-D |
| Survey number | Psd-04-106615 |
| TCT number | T-793615 |
| Tax dec number | 24-21-109-26270 |
| ARP number | 2025-005-099 |
| Location address | Purok 6, Brgy. Alupay, Rosario, Batangas |
| Owner | Ramon De Castro |
| Land use class | AgIndZ (agri-industrial, hindi residential) |
| Lot area | 3,810 sq.m. |
| Coordinates (lat, lng) | 13.835048, 121.279009 |
| Decision reason | The lot is zoned agri-industrial (AgIndZ) and cannot be subdivided into residential lots |

### Step-by-step (Taglish)

1. Mag-login bilang `Planning Officer`, buksan ang **Applications → Encode**.
2. **Step "Application":** piliin ang **Development Permit**, Form Number `DP-2026-0103`, at ilagay ang area to develop, number of saleable lots, at project cost.
3. **Step "Applicant":** gamitin ang **corporation** fields (name, address, contact) at idagdag ang **representative** (Evelyn). Piliin ang `Owner` sa right over land.
4. **Step "Property":** idagdag ang **dalawang parcel** gamit ang PIN: `04-01-021-001-07-862` (Parcel A) at `04-01-021-001-10-940` (Parcel B). Parehong nasa **Alupay**.
5. Parcel A (`R2-Z`): **Decision = Approved**.
6. Parcel B (`AgIndZ`): **Decision = Declined**. Kailangan ng **decision reason** (gamitin ang nasa talahanayan) at pumili ng **rejection category/code** mula sa dropdown.
7. **Step "Review":** ilagay ang fees (`₱13,500.00` total) at piliin ang **By mail (Authorized Representative)**. **Submit.**
8. Buksan ang application. Tingnan sa **Lots** tab na magkaiba ang desisyon ng dalawang parcel.
9. Ang prioridad ng system sa halo-halong desisyon ay: **Declined > Needs Site Inspection > Approved**. Obserbahan at itala kung anong status ang lumabas.
10. Bilang `Admin`, i-verify sa **Audit Trail** na naka-log ang bawat parcel decision.

**Dapat makita:** Hiwalay ang record ng bawat parcel; ang rejection reason ay naka-save lang sa Parcel B; tama ang status ayon sa priority rule.

---

## Scenario 4 — Agri → Commercial Rezoning (Sangguniang Bayan Routing)

**Layunin:** Pagsubok sa **amendment stream** at SB/DAR reference numbers bago ang release.

### Mock data

| Field | Value |
|-------|-------|
| Reference Number (auto) | `APP-2026-00104` |
| **Form Number** | `PR-2026-0104` |
| Stream | **amendment** |
| Application Type | Petition for Rezoning |
| Purpose | Rezoning of an agricultural lot for roadside commercial use (gas station and restaurant) |
| Business name | NAMUCO ROADSIDE HUB |
| Applicant | Rosario Agri-Ventures Inc. (corporation) |
| Representative | Fernando L. Atienza |
| Contact / Email | 09215678904 / f.atienza@example.com |
| Address | Brgy. Namuco, Rosario, Batangas |
| Right over land | Owner |
| Project barangay | Namuco |
| **Target land use** | **C2-Z** (kailangan sa amendment) |
| Project cost | ₱22,000,000.00 |
| Assessment fee | ₱6,000.00 |
| SB Ordinance No. | `SB-ORD-2026-014` |
| DAR Clearance Ref | `DAR-IV-A-2026-0331` |
| OR Number | `OR-0048390` |
| Preferred release mode | Pick-up |

**Parcel (`land_parcels`, gid 1798):**

| Field | Value |
|-------|-------|
| Parcel code | P-1798 |
| Property Index Number (PIN) | `04-01-021-025-03-461` |
| Lot number | Lot 830, Cad-426-D |
| Survey number | Psd-04-871788 |
| TCT number | T-655592 |
| Tax dec number | 24-21-034-11599 |
| ARP number | 2024-004-002 |
| Location address | Purok 4, Brgy. Namuco, Rosario, Batangas |
| Owner | Gabriel Ilagan |
| Current land use class | AgIndZ |
| Lot area | 3,063 sq.m. |
| Coordinates (lat, lng) | 13.834656, 121.189355 |

### Step-by-step (Taglish)

1. Mag-login bilang `Planning Officer` → **Applications → Encode**.
2. **Step "Application":** piliin ang stream na **amendment**. Piliin ang **Petition for Rezoning** (kung wala ito, hindi tatanggapin ng system). Ilagay ang **Target land use = C2-Z**. Form Number: `PR-2026-0104`.
3. **Step "Applicant":** ilagay ang corporation name, representative (Fernando), contact, at email. Sa right over land, piliin ang `Owner`.
4. **Step "Property":** i-type ang PIN na `04-01-021-025-03-461`. Dapat lumabas ang lot sa **Namuco** (`AgIndZ`). Dapat lumabas ang babala na hindi tugma ang requested zoning sa CLUP classification. Normal ito sa rezoning.
5. **Step "Review":** ilagay ang fee at piliin ang **Pick-up**. Sa amendment, awtomatikong naka-route sa SB. **Submit.**
6. Buksan ang application. Ilipat sa **Technical Review**, tapusin ang evaluation, at ilipat sa **Under Sangguniang Bayan**.
7. Sa **Amendment refs**, i-record ang **SB Ordinance No.** (`SB-ORD-2026-014`) at **DAR Clearance Ref** (`DAR-IV-A-2026-0331`).
8. Subukan munang i-release nang **walang** SB Ordinance Number. Dapat **tanggihan** ng system. Pagkatapos ay ilagay ito at ituloy.
9. Ilipat sa **For Release**, i-generate ang kinakailangang permit/dokumento, i-record ang OR Number (`OR-0048390`) at date of receipt.
10. **Mark as Released.**

**Dapat makita:** Kasama ang yugtong *Under Sangguniang Bayan* sa timeline (5 stages, hindi 4); hindi puwedeng mag-release kung walang SB ordinance number; nakikita ang status sa public tracker.

---

## Scenario 5 — Poultry House in a Residential Zone (Denied)

**Layunin:** Pagsubok sa pagtanggi, rejection taxonomy, at pagwawasto ng maling encode (void).

### Mock data

| Field | Value |
|-------|-------|
| Reference Number (auto) | `APP-2026-00105` |
| **Form Number** | `LC-2026-0105` |
| Stream | permit |
| Application Type | Locational Clearance |
| Purpose | Construction of a 1,000-head broiler poultry house |
| Business name | QUILIB BROILER FARM |
| Applicant | Danilo R. Hernandez (lessee) |
| Contact / Email | 09167890105 / danilo.hernandez@example.com |
| Applicant address | Purok 1, Brgy. Quilib, Rosario, Batangas |
| Right over land | Lessee |
| Project barangay | Quilib |
| Building area | 120 sq.m. |
| Project cost | ₱950,000.00 |
| Assessment fee | ₱2,500.00 |
| Preferred release mode | By mail (Applicant) |

**Parcel (`land_parcels`, gid 3088):**

| Field | Value |
|-------|-------|
| Parcel code | P-3088 |
| Property Index Number (PIN) | `04-01-021-037-07-465` |
| Lot number | Lot 10911, Cad-426-D |
| Survey number | Psd-04-586841 |
| TCT number | T-979454 |
| Tax dec number | 24-21-074-23146 |
| ARP number | 2023-003-039 |
| Location address | Purok 1, Brgy. Quilib, Rosario, Batangas |
| Owner (lessor) | Ana Ilagan |
| Land use class | R1-Z |
| Lot area | 343 sq.m. |
| Coordinates (lat, lng) | 13.861434, 121.213266 |
| Decision | Declined |
| Reason | Poultry/livestock is not permitted in a residential zone and is close to houses |

### Step-by-step (Taglish)

1. Mag-login bilang `Planning Officer` → **Applications → Encode**.
2. **Step "Application":** **Locational Clearance**, Form Number `LC-2026-0105`, business name, at project cost.
3. **Step "Applicant":** ilagay ang detalye ni Danilo; sa right over land piliin ang `Lessee` (iba siya sa owner ng lot na si Ana Ilagan).
4. **Step "Property":** i-type ang PIN na `04-01-021-037-07-465`. Dapat lumabas ang lot sa **Quilib** (`R1-Z`, 343 sq.m.). Itakda ang **Decision = Declined**, ilagay ang reason, at pumili ng **rejection category at code** mula sa dropdown (hal. use not permitted in the zone).
5. **Step "Review":** ilagay ang assessment fee na `₱2,500.00`, piliin ang **By mail (Applicant)**, at **Submit**.
6. Buksan ang application. Dapat **Denied** na ang status at nakikita ang rejection reason.
7. Subukang i-generate ang permit. Dapat **hindi** ito available dahil denied ang application.
8. Pumunta sa **Reports** at i-filter ang status na `Denied`. Dapat lumabas ang application na **kasama ang Reference Number at Form Number** sa tabi ng bawat isa.
9. **Pagwawasto (void):** kunwari mali ang na-encode na Form Number. Gamitin ang **Void** action sa application. Pagkatapos, i-encode muli gamit ang parehong Form Number (`LC-2026-0105`). Dapat tanggapin ito dahil na-free na ang form number ng na-void.
10. Bilang `Admin`, tingnan ang **Audit Trail** para sa entry ng pag-deny at pag-void.

**Dapat makita:** Status `Denied`; may rejection category/code; walang permit na ma-generate; ang void ay nag-free ng Form Number; naka-log ang lahat sa Audit Trail.

---

## Checklist para sa QA (lahat ng scenario)

- [ ] Tumutugma ang parcel details (PIN, owner, lot area, land use) sa `land_parcels` pagkatapos ng lookup.
- [ ] Tugma ang **Reference Number** at **Form Number** sa list, detail page, at reports (laging magkatabi).
- [ ] Walang duplicate na Form Number (maliban sa na-void).
- [ ] Tama ang timeline ng status sa application at sa public tracker.
- [ ] May notification ang assigned `Site Inspector` (Scenario 2).
- [ ] Bawal i-release nang walang OR Number at petsa ng resibo; bawal i-release ang SB-routed na walang SB Ordinance No.
- [ ] Hindi ma-archive ang application na hindi pa `Released`.
- [ ] Lumalabas ang bawat aksyon sa **Audit Trail**.

## Reset ng test data

Para linisin ang demo records, gamitin ang purge option ng command (tingnan ang `php artisan demo:applications --help`), o i-void ang mga application nang isa-isa. **Huwag** gawin ito sa production database.
