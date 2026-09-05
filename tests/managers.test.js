// Unit tests for manager assignment resolution and Excel tab naming.
//
//   node tests/managers.test.js
//
// No API key, no network. Assignments come from CINC at runtime; these cases
// cover the resolution order, the name matching, and the sheet-name rules.

const fs = require('fs');
const path = require('path');

const APP = path.join(__dirname, '..', 'hoa-financial-review.html');
const src = fs.readFileSync(APP, 'utf8').match(/<script>([\s\S]*)<\/script>/)[1];
// Stop before the UI block, which needs a DOM.
const block = src.slice(src.indexOf('// ===== MANAGER ASSIGNMENTS ====='), src.indexOf('// ===== MANAGER ASSIGNMENTS UI ====='));

// Evaluate the block inside its own function scope. `const`/`let` declared in an
// eval do not escape it, and the module's mutable state is read through closures,
// so the block returns an interface rather than being reached into from outside.
const {
  normCommunity, managerTabName, buildTabNames,
  managerForCommunity, groupResultsByManager, setState
} = new Function('localStorage', block + `
  return {
    normCommunity, managerTabName, buildTabNames,
    managerForCommunity, groupResultsByManager,
    setState(map, overrides) { managerMap = map; managerOverrides = overrides; }
  };
`)({ getItem: () => null, setItem: () => {} });

let pass = 0, fail = 0;
function t(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  pass  ' + name); }
  else { fail++; console.log('  FAIL  ' + name); console.log('          got:  ' + JSON.stringify(got)); console.log('          want: ' + JSON.stringify(want)); }
}
const section = n => console.log('\n' + n);

// ------------------------------------------------------------ name matching
section('Community name matching');
// The same community reaches us from CINC's association list, the document
// fetch, and the model's transcription, with small punctuation differences.
t('trailing comma ignored',
  normCommunity('Trinity Falls Homeowners Association, Inc.,') === normCommunity('Trinity Falls Homeowners Association, Inc.'), true);
t('trailing space ignored',
  normCommunity('Grayson Manor Homeowners Association, Inc. ') === normCommunity('Grayson Manor Homeowners Association, Inc.'), true);
t('case ignored', normCommunity('ABC HOA') === normCommunity('abc hoa'), true);
t('different communities stay different',
  normCommunity('Windsor Creek Community Association') === normCommunity('Windsor Forest Homeowners Association'), false);

// ------------------------------------------------------------- tab naming
section('Excel tab naming');
t('first name and last initial', managerTabName('Alice Abernathy'), 'Alice A');
t('single-word name kept whole', managerTabName('Cher'), 'Cher');
t('unassigned passes through', managerTabName('Unassigned'), 'Unassigned');
t('empty falls back to Unassigned', managerTabName(''), 'Unassigned');
t('characters Excel rejects are stripped', managerTabName('An/na B*ker'), 'Anna B');
t('long name stays within the 31-character limit',
  managerTabName('Bartholomew Featherstonehaugh-Winterbottom').length <= 31, true);

section('Tab-name collisions');
{
  const names = ['Alice Abernathy', 'Alice Ashford', 'Alice Atwood'];
  const tabs = buildTabNames(names);
  t('three colliding names all become distinct', new Set(Object.values(tabs)).size, 3);
  t('first keeps the short form', tabs['Alice Abernathy'], 'Alice A');
  t('others widen the surname', [tabs['Alice Ashford'], tabs['Alice Atwood']], ['Alice As', 'Alice At']);
}
{
  // Shaped like a real roster - 15 entries, mixed name lengths, one very long
  // surname - without publishing staff names to a public repository.
  const roster = ['Alice Abernathy', 'Bruno Castellanos', 'Chandra Deshpande', 'Diego Esposito',
    'Elena Fitzgerald', 'Farouk Gutierrez', 'Greta Hollingsworth', 'Hana Ivanova', 'Ibrahim Jorgensen',
    'Jonas Kowalczyk', 'Keiko Lindqvist', 'Lars Mbeki', 'Mira Nakamura', 'Bo Ng', 'Unassigned'];
  const tabs = buildTabNames(roster);
  t('a full roster produces unique names', new Set(Object.values(tabs)).size, roster.length);
  t('a full roster stays within the limit', Object.values(tabs).every(v => v.length <= 31), true);
  t('two-letter surname still shortens', tabs['Bo Ng'], 'Bo N');
}

// -------------------------------------------------------------- resolution
section('Assignment resolution');
{
  const map = {
    [normCommunity('Alpha HOA')]: { manager: 'Alice Abernathy', display: 'Alpha HOA', active: true },
    [normCommunity('Beta HOA')]: { manager: '', display: 'Beta HOA', active: true },
    [normCommunity('Gamma HOA')]: { manager: 'Bruno Castellanos', display: 'Gamma HOA', active: false }
  };
  setState(map, {});
  t('assignment comes from CINC', managerForCommunity('Alpha HOA'), 'Alice Abernathy');
  t('blank manager in CINC is Unassigned', managerForCommunity('Beta HOA'), 'Unassigned');
  t('inactive association still resolves', managerForCommunity('Gamma HOA'), 'Bruno Castellanos');
  t('community CINC has never heard of is Unassigned', managerForCommunity('Delta HOA'), 'Unassigned');
  t('punctuation variant still resolves', managerForCommunity('Alpha HOA,'), 'Alice Abernathy');

  setState(map, { [normCommunity('Beta HOA')]: 'Diego Esposito' });
  t('override fills a gap', managerForCommunity('Beta HOA'), 'Diego Esposito');
  setState(map, { [normCommunity('Alpha HOA')]: 'Elena Fitzgerald' });
  t('override beats CINC', managerForCommunity('Alpha HOA'), 'Elena Fitzgerald');
  setState(map, {});
}

// ---------------------------------------------------------------- grouping
section('Grouping a run');
{
  setState({
    [normCommunity('Alpha HOA')]: { manager: 'Alice Abernathy', display: 'Alpha HOA', active: true },
    [normCommunity('Beta HOA')]: { manager: 'Alice Abernathy', display: 'Beta HOA', active: true },
    [normCommunity('Gamma HOA')]: { manager: 'Bruno Castellanos', display: 'Gamma HOA', active: true },
    [normCommunity('Delta HOA')]: { manager: '', display: 'Delta HOA', active: true },
    // Not in this month's batch, so this manager should get no tab at all.
    [normCommunity('Absent HOA')]: { manager: 'Elena Fitzgerald', display: 'Absent HOA', active: true }
  }, {});
  const results = ['Alpha HOA', 'Beta HOA', 'Gamma HOA', 'Delta HOA'].map(n => ({ communityName: n }));
  const groups = groupResultsByManager(results);
  t('one group per manager present in the run, plus Unassigned',
    groups.map(([m, r]) => [m, r.length]),
    [['Alice Abernathy', 2], ['Bruno Castellanos', 1], ['Unassigned', 1]]);
  t('Unassigned sorts last', groups[groups.length - 1][0], 'Unassigned');
  t('every community is placed exactly once',
    groups.reduce((n, [, r]) => n + r.length, 0), results.length);
  t('a manager with no community in this run gets no tab',
    groups.some(([m]) => m === 'Elena Fitzgerald'), false);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
