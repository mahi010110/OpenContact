/* ============================================================
   OpenContact — moteur · géocodage (Nominatim / OpenStreetMap)
   Seuls appels réseau du moteur, déclenchés uniquement par une
   saisie ou un geste volontaires. Erreurs : 'empty' si introuvable,
   sinon service/réseau indisponible ; les suggestions échouent en
   silence (tableau vide) — hors ligne, rien ne casse.
   ============================================================ */
export async function geocodeAddress(q){
  const ctl = new AbortController();
  const tm = setTimeout(() => ctl.abort(), 8000);
  try {
    const url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=fr&q=' + encodeURIComponent(q);
    const r = await fetch(url, { headers: { 'Accept': 'application/json' }, signal: ctl.signal });
    if (!r.ok) throw new Error('http');
    const j = await r.json();
    if (!j.length) throw new Error('empty');
    return { lat: +j[0].lat, lng: +j[0].lon };
  } finally {
    clearTimeout(tm);
  }
}

/* suggestions d'adresses pendant la frappe — une requête à la fois
   (la précédente est annulée), jamais d'erreur : hors ligne = [] */
let sugCtl = null;
export async function suggestAddresses(q){
  if (sugCtl) sugCtl.abort();
  const ctl = sugCtl = new AbortController();
  const tm = setTimeout(() => ctl.abort(), 6000);
  try {
    const url = 'https://nominatim.openstreetmap.org/search?format=json&limit=4&addressdetails=1&countrycodes=fr&q=' + encodeURIComponent(q);
    const r = await fetch(url, { headers: { 'Accept': 'application/json' }, signal: ctl.signal });
    if (!r.ok) return [];
    const j = await r.json();
    return j.map(x => {
      const a = x.address || {};
      const road = [a.house_number, a.road || a.pedestrian || a.square].filter(Boolean).join(' ');
      const city = a.city || a.town || a.village || a.municipality || '';
      const label = [road, [a.postcode, city].filter(Boolean).join(' ')].filter(Boolean).join(', ')
        || String(x.display_name || '').split(',').slice(0, 3).join(',');
      return { label, city, lat: +x.lat, lng: +x.lon };
    }).filter(s => s.label);
  } catch (e) {
    return [];
  } finally {
    clearTimeout(tm);
  }
}
