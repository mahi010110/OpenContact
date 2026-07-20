/* ============================================================
   OpenContact — moteur · distribution du Compagnon
   D'où viennent les installateurs : les GitHub Releases du dépôt,
   construites par `release.yml` sous des noms STABLES. Ici : dire
   quel système utilise la personne, choisir le bon fichier dans la
   liste réelle des assets, et interroger la dernière release
   (api.github.com répond en CORS, sans compte). Hors ligne ou
   dépôt non publié : erreur courte `reseau` — l'écran propose
   alors la page des téléchargements, jamais un lien mort déguisé.
   Fonctions sans DOM ; les parties pures sont sous ?test.
   ============================================================ */

export const DIST_REPO = 'mahi010110/Open-Contact';
export const DIST_PAGE = `https://github.com/${DIST_REPO}/releases/latest`;
const DIST_API = `https://api.github.com/repos/${DIST_REPO}/releases/latest`;

/* le système d'après le navigateur — un téléphone n'installe pas
   le Compagnon, il répond « autre » et l'écran s'adapte */
export function osFromUA(ua){
  const s = String(ua || '');
  if (/android|iphone|ipad|ipod|mobile/i.test(s)) return 'autre';
  if (/windows/i.test(s)) return 'windows';
  if (/macintosh|mac os x/i.test(s)) return 'mac';
  if (/cros/i.test(s)) return 'autre';
  if (/linux|x11/i.test(s)) return 'linux';
  return 'autre';
}

/* les fichiers qui conviennent à un système, du plus direct au
   repli (Linux : le .deb d'abord, l'AppImage ensuite) */
const MOTIFS = {
  windows: [/setup\.exe$/i, /\.msi$/i],
  mac: [/\.dmg$/i],
  linux: [/\.deb$/i, /\.appimage$/i],
};
export function assetsForOS(assets, os){
  const motifs = MOTIFS[os] || [];
  const list = Array.isArray(assets) ? assets.filter(a => a && a.name) : [];
  const out = [];
  for (const m of motifs)
    for (const a of list)
      if (m.test(a.name) && !out.includes(a)) out.push(a);
  return out;
}

/* la dernière release réelle — version et fichiers tels que servis */
export async function latestRelease(){
  let r;
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 6000);
    r = await fetch(DIST_API, {
      signal: ctl.signal, cache: 'no-store',
      headers: { accept: 'application/vnd.github+json' }
    });
    clearTimeout(t);
  } catch (e) { throw new Error('reseau'); }
  if (!r.ok) throw new Error('reseau');   /* 404 = pas (encore) publié : même repli honnête */
  const j = await r.json();
  return {
    version: String(j.tag_name || j.name || ''),
    assets: (j.assets || []).map(a => ({
      name: String(a.name || ''), url: String(a.browser_download_url || ''),
      taille: Number(a.size) || 0
    })).filter(a => a.name && a.url)
  };
}
