/* ============================================================
   OpenContact — interface · QR (génération & lecture)
   Libs embarquées (assets/vendor/, licences incluses), chargées
   paresseusement : rien ne pèse sur le démarrage. Lecture par
   BarcodeDetector natif quand il existe, sinon jsQR.
   ============================================================ */

/* ---------- générer (qrcode-generator, MIT) ---------- */
let genP = null;
function loadGen(){
  return genP || (genP = import('../assets/vendor/qrcode-generator.mjs').then(m => m.qrcode));
}
/* SVG redimensionnable — à poser sur fond blanc pour rester lisible en sombre */
export async function makeQrSvg(text){
  const qrcode = await loadGen();
  const qr = qrcode(0, 'M');            /* version auto, correction M */
  qr.addData(text, 'Byte');
  qr.make();
  return qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
}

/* ---------- lire (BarcodeDetector natif, sinon jsQR) ---------- */
let jsqrP = null;
function loadJsQR(){
  if (window.jsQR) return Promise.resolve(window.jsQR);
  return jsqrP || (jsqrP = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'assets/vendor/jsQR.js';
    s.onload = () => res(window.jsQR);
    s.onerror = () => rej(new Error('vendor'));
    document.head.append(s);
  }));
}
/* branche la caméra sur <video> et appelle onCode(texte) à la première
   lecture ; retourne stop(). Jette 'camera' si l'accès est refusé. */
export async function startScan(video, onCode){
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' }, audio: false
    });
  } catch (e) { throw new Error('camera'); }
  video.srcObject = stream;
  await video.play().catch(() => {});
  let detector = null;
  if ('BarcodeDetector' in window){
    try { detector = new BarcodeDetector({ formats: ['qr_code'] }); } catch (e) {}
  }
  const jsQR = detector ? null : await loadJsQR();
  const cv = document.createElement('canvas');
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  let stopped = false, found = false;
  const tick = async () => {
    if (stopped) return;
    if (video.readyState >= 2 && !found){
      try {
        let raw = '';
        if (detector){
          const codes = await detector.detect(video);
          raw = (codes[0] && codes[0].rawValue) || '';
        } else {
          cv.width = video.videoWidth;
          cv.height = video.videoHeight;
          ctx.drawImage(video, 0, 0);
          const d = ctx.getImageData(0, 0, cv.width, cv.height);
          const r = jsQR(d.data, d.width, d.height);
          raw = (r && r.data) || '';
        }
        if (raw){ found = true; onCode(raw); }
      } catch (e) {}
    }
    if (!stopped) setTimeout(tick, 200);
  };
  tick();
  return () => { stopped = true; stream.getTracks().forEach(t => t.stop()); };
}
/* lit un QR dans une image déjà posée sur un canvas (utilisé aussi
   par les auto-vérifications) */
export async function decodeCanvas(canvas){
  const jsQR = await loadJsQR();
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const d = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const r = jsQR(d.data, d.width, d.height);
  return (r && r.data) || '';
}
