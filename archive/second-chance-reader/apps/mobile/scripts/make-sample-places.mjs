// Run from the repo root: node apps/mobile/scripts/make-sample-places.mjs apps/mobile/src/map/data/sample-places.json
// Generates apps/mobile/src/map/data/sample-places.json: clearly fake places for the
// Resource Map. Every name starts with "SAMPLE —", phones use the fictional 555-01xx
// range, and streets are named "Sample ..." so nothing can be mistaken for real.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const out = process.argv[2];

// Real county outlines, so every sample pin lands inside the county it claims.
const shapes = JSON.parse(readFileSync(join(dirname(out), '../geo/counties.geo.json'), 'utf8')).features;
function countyAt(lat, lng) {
  for (const f of shapes) {
    for (const [ring] of f.geometry.coordinates) {
      let inside = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i]; const [xj, yj] = ring[j];
        if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
      }
      if (inside) return f.properties.id;
    }
  }
  return null;
}

const categories = [
  ['courts', 'Courts', 'Tribunales', 'bank'],
  ['probation_parole', 'Probation and parole', 'Libertad condicional', 'clipboard-account'],
  ['id_license', "ID and driver's license", 'Identificación y licencia', 'card-account-details'],
  ['benefits', 'Benefits', 'Beneficios', 'hand-heart'],
  ['legal_help', 'Legal help', 'Ayuda legal', 'scale-balance'],
  ['health_recovery', 'Health and recovery', 'Salud y recuperación', 'medical-bag'],
  ['housing_shelter', 'Housing and shelter', 'Vivienda y refugio', 'home'],
  ['food', 'Food', 'Comida', 'bowl-mix'],
  ['jobs_training', 'Jobs and training', 'Empleo y capacitación', 'briefcase'],
  ['libraries_computers', 'Libraries and computers', 'Bibliotecas y computadoras', 'book-open-variant'],
].map(([id, label, label_es, icon], order) => ({ id, label, label_es, icon, colorToken: id, order }));

// Town centers inside each county (approximate), used to spread pins out.
const towns = {
  fulton: [['Atlanta', 33.749, -84.388, '30303'], ['College Park', 33.653, -84.449, '30337'], ['Sandy Springs', 33.924, -84.379, '30328'], ['Roswell', 34.023, -84.362, '30075']],
  dekalb: [['Decatur', 33.774, -84.296, '30030'], ['Tucker', 33.855, -84.217, '30084'], ['Stone Mountain', 33.808, -84.17, '30083'], ['Lithonia', 33.712, -84.105, '30058']],
  cobb: [['Marietta', 33.952, -84.55, '30060'], ['Smyrna', 33.884, -84.514, '30080'], ['Kennesaw', 34.023, -84.615, '30144'], ['Austell', 33.813, -84.634, '30106']],
  gwinnett: [['Lawrenceville', 33.956, -83.988, '30046'], ['Norcross', 33.941, -84.213, '30071'], ['Duluth', 34.003, -84.145, '30096'], ['Snellville', 33.857, -84.02, '30078']],
  clayton: [['Jonesboro', 33.521, -84.354, '30236'], ['Forest Park', 33.622, -84.369, '30297'], ['Riverdale', 33.572, -84.413, '30274'], ['Morrow', 33.583, -84.339, '30260']],
};
const counties = Object.keys(towns);

const days = (list, open, close) => list.map(day => ({ day, open, close }));
const MON_FRI = [1, 2, 3, 4, 5];
const GOV_HOLIDAYS = [
  { date: '2026-11-11', closed: true, note: 'Veterans Day' },
  { date: '2026-11-26', closed: true, note: 'Thanksgiving' },
  { date: '2026-11-27', closed: true, note: 'Day after Thanksgiving' },
  { date: '2026-12-25', closed: true, note: 'Christmas' },
];

const templates = {
  courts: { kind: 'County Courthouse', building: 'County courthouse', hours: days(MON_FRI, '08:00', '16:30'), holidays: true,
    services: ['Pay fines and fees', 'Request court records', 'Jury check-in', 'Ask about court dates'], bring: ['Photo ID', 'Case number'] },
  probation_parole: { kind: 'Community Supervision Office', building: 'State office', hours: [...days(MON_FRI, '08:00', '12:00'), ...days(MON_FRI, '13:00', '17:00')], holidays: true,
    services: ['Report to your officer', 'Drug testing', 'Pay supervision fees', 'Update your address'], bring: ['Photo ID', 'Release papers'], note: 'Walk-ins until 3:00 PM' },
  id_license: { kind: 'Driver Services Center', building: 'State office', hours: days([1, 2, 3, 4, 5, 6], '08:00', '17:00'), holidays: true,
    services: ['Get a state ID card', 'Replace a lost ID', "Renew a driver's license", 'Request a birth certificate'], bring: ['Proof of identity', 'Two proofs of address', 'Social Security number'] },
  benefits: { kind: 'Family and Children Services Office', building: 'County office', hours: days(MON_FRI, '08:00', '17:00'), holidays: true,
    services: ['Apply for SNAP (food stamps)', 'Apply for Medicaid', 'Apply for TANF', 'Get help with an application'], bring: ['Photo ID', 'Proof of income, if any'] },
  legal_help: { kind: 'Legal Aid Office', building: 'Nonprofit office', hours: days([1, 2, 3, 4], '09:00', '17:00'),
    services: ['Free legal advice', 'Record restriction (expungement) help', 'Housing and benefits disputes', 'Child support questions'], bring: ['Any court papers you have'], languages: ['en', 'es'] },
  health_recovery: { kind: 'Community Health Center', building: 'Health center', hours: [...days(MON_FRI, '08:00', '18:00'), ...days([6], '09:00', '13:00')],
    services: ['Doctor visits', 'Mental health counseling', 'Substance use treatment', 'Help getting medicine'], bring: ['Photo ID, if you have one'], languages: ['en', 'es'] },
  housing_shelter: { kind: 'Shelter and Housing Help', building: 'Nonprofit shelter', hours: days([0, 1, 2, 3, 4, 5, 6], '00:00', '23:59'),
    services: ['Emergency beds', 'Transitional housing referrals', 'Showers and laundry', 'Mail address'], note: 'Beds assigned at 6:00 PM' },
  food: { kind: 'Food Pantry', building: 'Church fellowship hall', hours: [...days([2, 4], '10:00', '14:00'), ...days([6], '09:00', '12:00')],
    services: ['Free groceries', 'Hot meals on Saturdays', 'Baby food and diapers'], note: 'No ID needed' },
  jobs_training: { kind: 'Career Center', building: 'State office', hours: days(MON_FRI, '08:00', '17:00'), holidays: true,
    services: ['Job search help', 'Resume help', 'Reentry job programs', 'Free job training classes'], bring: ['Photo ID', 'Social Security card'] },
  libraries_computers: { kind: 'Public Library', building: 'Public library', hours: [...days([1, 2, 3, 4], '10:00', '20:00'), ...days([5, 6], '10:00', '18:00'), ...days([0], '14:00', '18:00')], holidays: true,
    services: ['Free computers and internet', 'Printing and copies', 'Help with online forms', 'Quiet place to read'] },
};

const places = [];
let phone = 100;
categories.forEach((cat, ci) => {
  const t = templates[cat.id];
  // Four places per category, rotating through the counties so every county has some.
  for (let k = 0; k < 4; k++) {
    const county = counties[(ci + k) % counties.length];
    const [city, lat, lng, zip] = towns[county][(ci + k) % 4];
    // Small fixed offset so pins from different categories in one town don't sit on top of
    // each other. If the offset crosses a county line, shrink it until it doesn't.
    const baseLat = ((ci * 7 + k * 3) % 11 - 5) * 0.0045;
    const baseLng = ((ci * 5 + k * 9) % 13 - 6) * 0.0045;
    const scale = [1, 0.75, 0.5, 0.25, -0.5, -1, 0].find(s => countyAt(lat + baseLat * s, lng + baseLng * s) === county);
    if (scale === undefined) throw new Error(`${city} is not inside ${county}`);
    const dLat = baseLat * scale;
    const dLng = baseLng * scale;
    places.push({
      id: `sample-${cat.id}-${k + 1}`,
      name: `SAMPLE — ${city} ${t.kind}`,
      categoryId: cat.id,
      buildingType: t.building,
      location: { lat: +(lat + dLat).toFixed(5), lng: +(lng + dLng).toFixed(5) },
      address: { street: `${100 + ci * 10 + k} Sample ${['St', 'Ave', 'Rd', 'Blvd'][k]}`, city, state: 'GA', zip },
      county,
      phone: `404-555-${String(phone++).padStart(4, '0')}`,
      hours: t.hours,
      hoursExceptions: t.holidays ? GOV_HOLIDAYS : [],
      ...(t.note ? { hoursNote: t.note } : {}),
      services: t.services,
      ...(t.bring ? { whatToBring: t.bring } : {}),
      languages: t.languages ?? ['en'],
      wheelchairAccessible: k !== 3,
      status: 'open',
      lastVerified: '2026-10-01',
      isSample: true,
      updatedAt: '2026-10-01T12:00:00Z',
    });
  }
});

// A courthouse holding two courts: same building, so the map shows one pin listing both.
const court = places.find(p => p.id === 'sample-courts-1');
places.push({
  ...court, id: 'sample-courts-1b', name: court.name.replace('County Courthouse', 'State Court (same building)'),
  services: ['Traffic tickets', 'Misdemeanor cases', 'Pay fines and fees'], phone: `404-555-${String(phone++).padStart(4, '0')}`,
});

// Edge cases the app must handle.
Object.assign(places.find(p => p.id === 'sample-food-2'), { status: 'temporarily_closed', statusNote: 'Closed for repairs until November' });
Object.assign(places.find(p => p.id === 'sample-legal_help-3'), { lastVerified: '2026-05-15' });   // > 90 days old
Object.assign(places.find(p => p.id === 'sample-jobs_training-4'), { status: 'permanently_closed' });  // must be hidden

writeFileSync(out, JSON.stringify({ categories, places }, null, 2) + '\n');
console.log(`${places.length} places, ${categories.length} categories → ${out}`);
