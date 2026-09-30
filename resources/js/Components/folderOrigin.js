/**
 * Folder-origin navigation.
 *
 * THE PROBLEM THIS SOLVES
 *
 * Both registries group records inside applicant folders. A folder is a grouping
 * the user opens, and a folder can hold several records. Opening a record from a
 * folder used to navigate with a bare detail URL, so the detail page had no idea
 * a folder was involved. Its "All Records" link returned to the registry ROOT,
 * the open folder was gone, and reaching the second record in the same folder
 * meant finding and reopening that folder from scratch.
 *
 * THE CONTRACT
 *
 * The registry owns the folder, and the folder is expressed in the URL rather
 * than in component state alone:
 *
 *   registry  ?folder=<applicant>   the folder is open
 *   detail    ?from=folder&folder=<applicant>
 *
 * Putting the folder in the URL is what makes refresh and a pasted link behave
 * the same as a click. A folder that exists only in React state vanishes on
 * refresh and cannot be restored from a link at all.
 *
 * This EXTENDS the existing `?from=` origin mechanism that
 * `?from=technical-review` already established, rather than introducing a second
 * unrelated navigation system. Both origins travel under `from`.
 *
 * A folder is never invented. With no origin in the URL, the detail page falls
 * back to the registry root, which is the honest answer when nothing is known
 * about how the user arrived.
 */

export const FOLDER_ORIGIN = 'folder';

/**
 * Read the origin of a detail page from its location.
 *
 * Accepts a bare query string ("?from=folder&folder=Acme") or a full path
 * ("/applications/12?from=folder&folder=Acme"). This matters: Inertia's
 * `usePage().url` is a PATH, and handing that straight to URLSearchParams makes
 * the first parameter name "/applications/12?folder" — so `folder` reads as
 * undefined and a folder origin silently degrades to the registry root. The
 * query portion is therefore extracted first.
 */
export function readOrigin(search) {
    const raw = String(search || '');
    const queryAt = raw.indexOf('?');
    const query = queryAt === -1 ? '' : raw.slice(queryAt + 1);

    const params = new URLSearchParams(query);
    return {
        from: params.get('from') || null,
        folder: params.get('folder') || null,
    };
}

/**
 * Build the detail URL for a record opened from inside a folder.
 *
 * Returns the registry's own state (search, filters, page) as well as the
 * folder, so returning restores the view the user left, not just the folder.
 */
export function detailUrlFromFolder(basePath, recordId, folder, registryParams) {
    const params = new URLSearchParams(registryParams || '');
    params.set('from', FOLDER_ORIGIN);
    params.set('folder', folder || '');
    return `${basePath}/${recordId}?${params.toString()}`;
}

/** Build the registry URL that reopens a folder, preserving the registry state. */
export function folderRegistryUrl(basePath, folder, registryParams) {
    const params = new URLSearchParams(registryParams || '');
    if (folder) {
        params.set('folder', folder);
    } else {
        params.delete('folder');
    }
    const query = params.toString();
    return query ? `${basePath}?${query}` : basePath;
}

/**
 * The registry query a detail page should restore, without the origin markers.
 *
 * `from` and `folder` describe how the DETAIL page was reached. They must not be
 * sent back to the registry, where they would either be meaningless or would
 * re-open a folder the user is not returning to. Everything else the user
 * applied — search, filters, page, page size — is preserved.
 *
 * Like {@see readOrigin}, this accepts a bare query string or a full path.
 */
export function readRegistryQuery(search) {
    const raw = String(search || '');
    const queryAt = raw.indexOf('?');
    if (queryAt === -1) return '';

    const params = new URLSearchParams(raw.slice(queryAt + 1));
    params.delete('from');
    params.delete('folder');

    return params.toString();
}

/**
 * Decide what the detail page's back control should do.
 *
 * Returns a label and an href. An origin that names a folder gets a contextual
 * label, because a control that says "All Records" but returns to a single
 * applicant folder is simply mislabelled. With no origin, the plain registry
 * label is correct and no folder context is fabricated.
 *
 * @param {object}  options
 * @param {string}  options.search        the detail page's query string
 * @param {string}  options.registryPath  e.g. "/applications"
 * @param {string}  options.rootLabel     e.g. "All Applications"
 * @param {object}  options.origins       e.g. { 'technical-review': { path: '/technical-review', label: 'Technical Review' } }
 * @param {string}  options.registryQuery the registry query string to restore
 */
export function resolveBackTarget({ search, registryPath, rootLabel, origins = {}, registryQuery = '' }) {
    const { from, folder } = readOrigin(search);

    // A named origin that is not a folder (e.g. the Technical Review queue).
    if (from && from !== FOLDER_ORIGIN && origins[from]) {
        return { label: origins[from].label, href: origins[from].path, folder: null };
    }

    // Opened from inside a folder: go back to THAT folder, not the registry root.
    if (from === FOLDER_ORIGIN && folder) {
        return {
            label: `Back to ${folder}`,
            href: folderRegistryUrl(registryPath, folder, registryQuery),
            folder,
        };
    }

    // No usable origin. Plain registry root, and no invented folder.
    return { label: rootLabel, href: registryPath, folder: null };
}
