// Palette and scale guard for the Diversity Index layer.
//
//   node scripts/check-diversity-palette.mjs
//
// No dependencies, no test runner. It exists because the rules this file
// asserts are invisible in review and easy to break with a "nicer" colour:
//   - every swatch stays legible on the #F8F9FA canvas, and its label text
//     clears WCAG AA against it;
//   - the sequential mix ramp stays monotonic in lightness under simulated
//     deuteranopia and protanopia (that ordering is what makes a sequential
//     scale readable at all with colour-vision deficiency);
//   - the diverging drift scale separates by hue distance, because it has no
//     lightness ordering to fall back on. It previously failed this: red
//     "Sprawl" and green "On Target" sat 43 apart under deuteranopia;
//   - the score scale and the CLUP zone palette never share a swatch, which is
//     what keeps map colour and legend filter meaning the same thing;
//   - legend segments tile their lens domain exactly, so the municipal-average
//     marker lands on the band it actually belongs to.

import * as T from '../resources/js/utils/diversityTheme.js';
import { getZoneInfo, ZONE_CATEGORY_LEGEND } from '../resources/js/utils/clupZones.js';

let fail = 0;
const chk = (name, cond, extra='') => { console.log((cond?'  ok  ':'  FAIL') + '  ' + name + (extra?'  '+extra:'')); if(!cond) fail++; };

console.log('Lenses:', T.DIVERSITY_LENSES.map(l=>l.id).join(', '));
chk('pressure lens removed', T.DIVERSITY_LENSES.length===2 && !T.DIVERSITY_LENSES.find(l=>l.id==='pressure'));
chk('PRESSURE_BANDS gone', T.PRESSURE_BANDS===undefined);

// Sequential scale must be legible on #F8F9FA: no near-white fills.
const lum = h => { const n=parseInt(h.slice(1),16); const [r,g,b]=[n>>16,(n>>8)&255,n&255].map(v=>{v/=255; return v<=.03928?v/12.92:((v+.055)/1.055)**2.4}); return .2126*r+.7152*g+.0722*b; };
const contrastVsCanvas = h => { const L=lum(h), C=lum('#f8f9fa'); return (Math.max(L,C)+.05)/(Math.min(L,C)+.05); };
T.DIVERSITY_TIERS.forEach(t => chk(`tier ${t.id} visible on canvas`, contrastVsCanvas(t.fill) >= 1.18, `${t.fill} ratio ${contrastVsCanvas(t.fill).toFixed(2)}`));
T.DRIFT_BANDS.forEach(b => chk(`drift ${b.id} visible on canvas`, contrastVsCanvas(b.fill) >= 1.5, `${b.fill} ratio ${contrastVsCanvas(b.fill).toFixed(2)}`));

// Label text on each swatch must be readable.
const ratio = (a,b) => { const L1=lum(a),L2=lum(b); return (Math.max(L1,L2)+.05)/(Math.min(L1,L2)+.05); };
[...T.DIVERSITY_TIERS, ...T.DRIFT_BANDS].forEach(b => chk(`onFill contrast ${b.id}`, ratio(b.fill, b.onFill) >= 4.5, `${ratio(b.fill,b.onFill).toFixed(2)}:1`));

// Scale must be monotonic low→high so the stepped legend reads as a ramp.
const steps = T.getScaleSegments('mix');
chk('mix steps low→high', steps[0].id==='monoculture' && steps[4].id==='high');
chk('mix monotonic lightness', steps.every((s,i)=> i===0 || lum(s.fill) < lum(steps[i-1].fill)));

// Drift: equal magnitudes, opposite signs → same height, different colour.
const up = T.resolveLensValue('drift', {variance: 0.14});
const dn = T.resolveLensValue('drift', {variance: -0.14});
chk('drift symmetric height', up.height===dn.height, `${up.height}m`);
chk('drift opposite colour', up.color!==dn.color, `${up.band.id} vs ${dn.band.id}`);
chk('drift on-target band', T.resolveLensValue('drift',{variance:0.01}).band.id==='on_target');

// Missing/garbage data must not throw or produce NaN.
[{}, {diversity:null}, {variance:'abc'}, {diversity:undefined}].forEach((s,i)=>{
  const r = T.resolveLensValue(i%2?'drift':'mix', s);
  chk(`degrades safely #${i}`, Number.isFinite(r.height) && !!r.color && !r.formatted.includes('NaN'), r.formatted);
});

// Lens/CLUP palettes must never collide — that was the original bug.
const lensColors = new Set([...T.DIVERSITY_TIERS, ...T.DRIFT_BANDS].map(b=>b.fill.toLowerCase()));
const clupColors = new Set(ZONE_CATEGORY_LEGEND.map(c=>c.fill.toLowerCase()));
const overlap = [...lensColors].filter(c => clupColors.has(c));
chk('no shared swatch between score scale and CLUP', overlap.length===0, overlap.join(',')||'none');

// No neon left in the CLUP palette.
const neon = ['#fffc2b','#eb3356','#de29c0','#36ff39'];
chk('neon CLUP colours gone', !ZONE_CATEGORY_LEGEND.some(c=>neon.includes(c.fill.toLowerCase())));
chk('zone lookup works', getZoneInfo('C1-Z').label.includes('Commercial') && getZoneInfo('C1-Z').fill==='#c4574d');
chk('unknown zone kept verbatim', getZoneInfo('ZZZ-9').label==='ZZZ-9');
chk('empty zone → undesignated', getZoneInfo('').label==='Undesignated');

// Band counting + ranking against a realistic stat map.
const stats = {
  A:{diversity:0.81, variance:0.22}, B:{diversity:0.30, variance:-0.18},
  C:{diversity:0.52, variance:0.00}, D:{diversity:0.11, variance:0.09},
};
chk('mix band counts', JSON.stringify(T.computeBandCounts('mix',stats))==='{"high":1,"diverse":0,"moderate":1,"developing":1,"monoculture":1}', JSON.stringify(T.computeBandCounts('mix',stats)));
chk('drift ranks by |gap|', T.rankByLens('drift',stats).map(r=>r.name).join('')==='ABDC', T.rankByLens('drift',stats).map(r=>r.name).join(''));
chk('mix ranks high→low', T.rankByLens('mix',stats).map(r=>r.name).join('')==='ACBD');
chk('matchesBand filters', T.matchesBand('mix','high',stats.A) && !T.matchesBand('mix','high',stats.B) && T.matchesBand('mix','all',stats.B));

// -- CVD separability: the whole point of the neutral midpoint --
const deutM=[[0.367,0.861,-0.228],[0.280,0.673,0.047],[-0.012,0.043,0.969]];
const protM=[[0.152,1.053,-0.205],[0.115,0.786,0.099],[-0.004,-0.048,1.052]];
const toRgb=h=>{const n=parseInt(h.slice(1),16);return [n>>16,(n>>8)&255,n&255];};
const simulate=(rgb,m)=>[0,1,2].map(i=>Math.max(0,Math.min(255,m[i][0]*rgb[0]+m[i][1]*rgb[1]+m[i][2]*rgb[2])));
const rgbDist=(a,b)=>Math.sqrt(a.reduce((s,v,i)=>s+(v-b[i])**2,0));
for (const [vname,mat] of [['deuteranopia',deutM],['protanopia',protM]]) {
  for (const [sname,set] of [['mix',T.DIVERSITY_TIERS],['drift',T.DRIFT_BANDS]]) {
    let worst=1e9, pair='';
    for(let i=0;i<set.length;i++) for(let j=i+1;j<set.length;j++){
      const d=rgbDist(simulate(toRgb(set[i].fill),mat), simulate(toRgb(set[j].fill),mat));
      if(d<worst){worst=d; pair=set[i].id+'/'+set[j].id;}
    }
    // A sequential ramp is read as "darker = more", so its real CVD requirement
    // is that lightness stays monotonic; a diverging scale has no such ordering
    // and must separate by hue distance alone.
    const floor = sname==='drift' ? 60 : 45;
    chk(sname+' separable under '+vname, worst>=floor, 'worst '+pair+'='+worst.toFixed(0));
    if (sname==='mix') {
      const lumRgb=r=>{const [a,b2,c]=r.map(v=>{v/=255;return v<=.03928?v/12.92:((v+.055)/1.055)**2.4});return .2126*a+.7152*b2+.0722*c;};
      const lums=[...set].reverse().map(b=>lumRgb(simulate(toRgb(b.fill),mat)));
      chk('mix lightness monotonic under '+vname, lums.every((v,i)=>i===0||v<lums[i-1]), lums.map(v=>v.toFixed(2)).join('>'));
    }
  }
}

// -- Legend segments must tile the domain exactly --
['mix','drift'].forEach(l=>{
  const segs=T.getScaleSegments(l);
  const total=segs.reduce((a,b)=>a+b.weight,0);
  chk(l+' segments tile domain', Math.abs(total-1)<0.001, (total*100).toFixed(1)+'%');
  chk(l+' segments ascend', segs.every((s,i)=>i===0||s.lo>=segs[i-1].lo));
});
const onTarget=T.getScaleSegments('drift').find(s=>s.id==='on_target');
chk('drift midpoint narrow, not a third', onTarget.weight<0.2, (onTarget.weight*100).toFixed(0)+'%');

console.log(fail ? `\n${fail} FAILED` : '\nAll assertions passed');
process.exit(fail?1:0);
