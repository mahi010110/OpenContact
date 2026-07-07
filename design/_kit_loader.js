/* ============================================================
   Open-Contact DS — chargeur des composants pour les cartes/maquettes.
   Garantit window.OC :
   1. si le bundle compilé par la plateforme (_ds_bundle.js) existe,
      il est utilisé (le namespace détecté est aliasé sur window.OC) ;
   2. sinon, les sources components/*.jsx (source de vérité) sont
      chargées et transpilées via Babel standalone.
   Prérequis d'ordre : react, react-dom, babel, puis ce fichier.
   ============================================================ */
(function () {
  var script = document.currentScript;
  var root = script && script.src ? script.src.replace(/[^\/]*$/, '') : '';

  function get(u) {
    var x = new XMLHttpRequest();
    x.open('GET', u, false);
    try { x.send(); } catch (e) { return { status: 0, text: '' }; }
    return { status: x.status, text: x.responseText || '' };
  }

  /* --- 1. Bundle compilé ? --- */
  var b = get(root + '_ds_bundle.js');
  if (b.status >= 200 && b.status < 300 && b.text) {
    var before = Object.keys(window);
    try { (0, eval)(b.text); } catch (e) { /* bundle ESM ou invalide → fallback sources */ }
    var added = Object.keys(window).filter(function (k) { return before.indexOf(k) < 0; });
    for (var i = 0; i < added.length; i++) {
      var v = window[added[i]];
      if (v && typeof v === 'object' && v.Button && v.Window) { window.OC = v; break; }
    }
  }
  if (window.OC && window.OC.Button) return;

  /* --- 2. Fallback : transpiler les sources --- */
  if (!window.Babel) throw new Error('OC loader : charger @babel/standalone avant _kit_loader.js');
  if (!window.React) throw new Error('OC loader : charger React avant _kit_loader.js');

  /* Ordre = dépendances d'abord (_style, Icon ; Window avant Dialog). */
  var FILES = [
    'components/_style.js',
    'components/display/Icon.jsx',
    'components/display/Badge.jsx',
    'components/display/Chip.jsx',
    'components/display/Tabs.jsx',
    'components/display/Toast.jsx',
    'components/forms/Button.jsx',
    'components/forms/IconButton.jsx',
    'components/forms/Input.jsx',
    'components/forms/Select.jsx',
    'components/forms/Checkbox.jsx',
    'components/forms/Radio.jsx',
    'components/forms/Switch.jsx',
    'components/forms/Field.jsx',
    'components/display/Score.jsx',
    'components/surfaces/Window.jsx',
    'components/surfaces/Dialog.jsx',
    'components/surfaces/Sheet.jsx',
    'components/surfaces/Fieldset.jsx',
    'components/app/BottomNav.jsx',
    'components/app/SelectionBar.jsx',
    'components/app/UndoBar.jsx',
    'components/app/EmptyState.jsx'
  ];

  var wrapped = FILES.map(function (f) {
    var r = get(root + f);
    if (r.status < 200 || r.status >= 300) throw new Error('OC loader : ' + f + ' → HTTP ' + r.status);
    var src = r.text;
    var exports = [];
    src.replace(/export\s+(?:function|const|class)\s+(\w+)/g, function (m, n) {
      if (exports.indexOf(n) < 0) exports.push(n);
      return m;
    });
    /* Imports relatifs entre composants → variables lues dans le namespace partagé */
    var importVars = '';
    src.replace(/^\s*import\s*\{([^}]+)\}\s*from\s*['"]\.[^'"]*['"];?\s*$/gm, function (m, names) {
      names.split(',').forEach(function (n) {
        n = n.trim();
        if (n) importVars += 'var ' + n + ' = __ns.' + n + ';\n';
      });
      return m;
    });
    src = src.replace(/^\s*import[^\n]*$/gm, '').replace(/^\s*export\s+/gm, '');
    var assigns = exports.map(function (n) { return '__ns.' + n + ' = ' + n + ';'; }).join('\n');
    return '(function(){\n' + importVars + src + '\n' + assigns + '\n})();';
  }).join('\n');

  var code = Babel.transform(wrapped, { presets: ['react'] }).code;
  var ns = {};
  new Function('React', '__ns', code)(window.React, ns);
  window.OC = ns;
})();
