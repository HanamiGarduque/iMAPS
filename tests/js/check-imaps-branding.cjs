const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const { transformSync } = require('esbuild');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

const root = path.resolve(__dirname, '../..');
function load(file, imports = {}) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    const compiled = transformSync(source, { loader: 'jsx', jsx: 'automatic', format: 'cjs' }).code;
    const module = { exports: {} };
    vm.runInNewContext(compiled, {
        module, exports: module.exports,
        require: (id) => Object.hasOwn(imports, id) ? imports[id] : require(id),
    });
    return module.exports;
}

const Logo = load('resources/js/Components/ApplicationLogo.jsx').default;
const logoImport = { __esModule: true, default: Logo };

test('shared logo renders the supplied full artwork with an accessible name', () => {
    const image = Logo({ className: 'h-20 w-20', id: 'fixture-logo' });
    assert.equal(image.type, 'img');
    assert.equal(image.props.src, '/branding/imaps-logo.svg');
    assert.equal(image.props.alt, 'iMAPS');
    assert.equal(image.props.id, 'fixture-logo');
    assert.match(image.props.className, /\bobject-contain\b/);
});

test('compact decorative logo preserves the symbol and caller accessibility', () => {
    const image = Logo({ symbol: true, alt: '', 'aria-hidden': true });
    assert.equal(image.type, 'img');
    assert.equal(image.props.src, '/branding/imaps-symbol.svg');
    assert.equal(image.props.alt, '');
    assert.equal(image.props['aria-hidden'], true);
    assert.equal(image.props.symbol, undefined, 'variant flags must not leak to the DOM');
});

test('login navbar renders the complete logo without losing its municipal label', () => {
    const { Navbar } = load('resources/js/Pages/Auth/AuthUI.jsx', {
        '@/Components/ApplicationLogo': logoImport,
    });
    const html = renderToStaticMarkup(React.createElement(Navbar));
    assert.match(html, /<img[^>]+src="\/branding\/imaps-logo\.svg"/);
    assert.match(html, /Municipal Planning and Development Office/);
});

test('operational brand trigger keeps its existing open and close callbacks', () => {
    const { default: Header } = load('resources/js/Components/Header.jsx', {
        react: { ...React, useState: (v) => [v, () => {}], useEffect: () => {}, useRef: (v) => ({ current: v }) },
        '@inertiajs/react': { usePage: () => ({ url: '/overview', props: {} }) },
        '@/Components/ApplicationLogo': logoImport,
        '@/utils/parcelHandoff.jsx': {}, '@/utils/clupZones': {}, '@/utils/signOut': {},
    });
    function find(node, predicate) {
        if (Array.isArray(node)) return node.map((child) => find(child, predicate)).find(Boolean);
        if (!React.isValidElement(node)) return undefined;
        return predicate(node) ? node : find(node.props.children, predicate);
    }
    for (const open of [false, true]) {
        let requested;
        const tree = Header({ sidebarOpen: open, setSidebarOpen: (value) => { requested = value; } });
        const trigger = find(tree, (node) => node.props.id === 'imaps-brand-trigger');
        assert.equal(trigger.type, 'button');
        const image = find(trigger, (node) => node.type === Logo);
        assert.ok(image, 'the menu trigger must render the shared logo');
        assert.equal(image.props.symbol, true);
        trigger.props.onClick();
        assert.equal(requested, !open);
    }
});

test('browser icons select the transparent white fingerprint and PNG fallback', () => {
    const shell = fs.readFileSync(path.join(root, 'resources/views/app.blade.php'), 'utf8');
    assert.doesNotMatch(shell, /image\/x-icon|branding\/favicon\.ico/,
        'the opaque ICO must not replace the transparent white fingerprint');
    assert.doesNotMatch(shell, /prefers-color-scheme/,
        'retain the explicitly selected white fingerprint');
    for (const [file, signature] of [
        ['favicon-white.svg', '<svg'],
        ['favicon-white-128.png', Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])],
        ['apple-touch-icon-transparent.png', Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])],
    ]) {
        assert.ok(shell.includes(`asset('branding/${file}')`), `${file} must be linked in the browser shell`);
        const bytes = fs.readFileSync(path.join(root, 'public/branding', file));
        if (typeof signature === 'string') assert.ok(bytes.toString().includes(signature));
        else assert.deepEqual(bytes.subarray(0, signature.length), signature);
    }
});

test('white favicon and touch icon retain alpha and declared dimensions', () => {
    for (const [file, size] of [
        ['favicon-white-128.png', 128],
        ['apple-touch-icon-transparent.png', 180],
    ]) {
        const target = path.join(root, 'public/branding', file);
        assert.ok(fs.existsSync(target), `the RGBA ${file} must be packaged`);
        const bytes = fs.readFileSync(target);
        assert.equal(bytes.readUInt32BE(16), size);
        assert.equal(bytes.readUInt32BE(20), size);
        assert.equal(bytes[25], 6, 'RGBA PNG is required, not an opaque RGB export');
    }
});

test('white favicon keeps the enlarged original symbol without a background', () => {
    const original = fs.readFileSync(path.join(root, 'public/branding/imaps-symbol.svg'), 'utf8');
    const file = path.join(root, 'public/branding/favicon-white.svg');
    assert.ok(fs.existsSync(file), 'the transparent white SVG must be packaged');
    const favicon = fs.readFileSync(file, 'utf8');
    const viewBox = (text) => text.match(/viewBox="([^"]+)"/)[1];
    const [x, y, width, height] = viewBox(favicon).split(/\s+/).map(Number);
    assert.ok(width <= 900, 'retain the enlarged favicon viewport');
    assert.equal(width, height);
    assert.ok(x <= 188 && y <= 103 && x + width >= 836 && y + height >= 921,
        'keep every fingerprint/parcel pixel inside the viewport');
    const normalized = favicon.replace(`viewBox="${viewBox(favicon)}"`, `viewBox="${viewBox(original)}"`)
        .replaceAll('#FFFFFF', '#102D50');
    assert.equal(normalized, original,
        'only foreground color and transparent canvas padding may differ; no added background');
    assert.doesNotMatch(favicon, /<image\b/, 'keep the favicon a genuine vector, not an embedded bitmap');
});
