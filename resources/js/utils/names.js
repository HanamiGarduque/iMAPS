// Name helpers for records that store one full-name string (tax records, past applications)
// while the application form keeps first / middle / last / suffix separately.

const SURNAME_PARTICLES = new Set(["de", "del", "dela", "della", "delos", "de los", "san", "santa", "sta", "sta.", "sto", "sto.", "la", "las", "los", "van", "von", "di", "da", "du"]);
const SUFFIX = /^(jr\.?|sr\.?|ii|iii|iv|v)$/i;

export const titleCase = (s) => String(s || "").toLowerCase().replace(/(^|[\s-])\S/g, (c) => c.toUpperCase());

export const normalizeName = (s) => String(s || "").toLowerCase().replace(/[^a-z]/g, "");

// Best-effort split; the officer can still correct the fields. Middle names can't be told apart from
// compound first names in a single string, so they stay with the first name.
export function splitFullName(full) {
    const tokens = titleCase(String(full || "").trim()).split(/\s+/).filter(Boolean);
    const rawSuffix = tokens.length > 1 && SUFFIX.test(tokens[tokens.length - 1]) ? tokens.pop() : "";
    const suffix = /^(ii|iii|iv|v)$/i.test(rawSuffix) ? rawSuffix.toUpperCase() : rawSuffix;
    if (tokens.length <= 1) return { first_name: "", middle_name: "", last_name: tokens[0] || "", suffix };
    const last = [tokens.pop()];
    while (tokens.length > 1 && SURNAME_PARTICLES.has(tokens[tokens.length - 1].toLowerCase())) last.unshift(tokens.pop());
    return { first_name: tokens.join(" "), middle_name: "", last_name: last.join(" "), suffix };
}

export const joinName = (p) => [p.first_name, p.middle_name, p.last_name, p.suffix].filter(Boolean).join(" ");
