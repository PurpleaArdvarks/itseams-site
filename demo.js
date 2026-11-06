/* itSeams demo: a mock page capture you can clean up, compare and redact.
   Plain JavaScript, no libraries, no network requests. */
(function () {
  'use strict';

  var demo = document.getElementById('demo');
  var screen = document.getElementById('screen');
  var page = document.getElementById('page');
  var panel = document.getElementById('panel');
  if (!demo || !screen || !page || !panel) return;

  var btnClean = document.getElementById('btn-clean');
  var btnApply = document.getElementById('btn-apply');
  var btnBefore = document.getElementById('btn-before');
  var btnAfter = document.getElementById('btn-after');
  var btnRedact = document.getElementById('btn-redact');
  var btnReset = document.getElementById('btn-reset');
  var status = document.getElementById('status');

  // The app's own controls on the device screen. The ones that work here do what the buttons
  // beside it do; the rest explain themselves with a popdown (data-say).
  var device = demo.querySelector('.device');
  var navBefore = document.getElementById('nav-before');
  var navAfter = document.getElementById('nav-after');
  var navUndo = document.getElementById('nav-undo');
  var navExport = document.getElementById('nav-export');
  var sugChip = document.getElementById('sug-chip');
  var chipText = document.getElementById('chip-text');
  var chipChev = document.getElementById('chip-chev');
  var cleanup = document.getElementById('cleanup');
  var cuApply = document.getElementById('cu-apply');
  var cuCount = document.getElementById('cu-count');
  var cuReview = document.getElementById('cu-review');
  var toolRedact = document.getElementById('tool-redact');
  var toolList = document.getElementById('tool-list');
  var listBadge = document.getElementById('list-badge');
  var redactRow = document.getElementById('redact-row');

  var SEAM = 2;    // height of the join line left where a band was cut (px)
  var DUR = 380;   // matches --dur in demo.css
  var INITIAL = 'Scroll the page, then tap Clean Up.';

  var motion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  function animated() { return !(motion && motion.matches); }

  // iPhone or iPad: the iPad at tablet widths (or a touch screen of tablet size) unless the visitor
  // picks one with the switch above the demo. demo.css draws whichever .ipad says.
  var TABLET = '(min-width: 700px) and (max-width: 1099px), (hover: none) and (pointer: coarse) and (min-width: 700px) and (max-width: 1400px)';
  var IPAD_MIN = 720;  // narrowest the iPad is laid out; below that it's zoomed down to fit
  var tablet = window.matchMedia ? window.matchMedia(TABLET) : null;
  var picked = null;   // null (follow the width) | 'phone' | 'ipad'
  function isIpad() { return demo.classList.contains('ipad'); }
  function setDevice() {
    var ipad = picked ? picked === 'ipad' : !!(tablet && tablet.matches);
    demo.classList.toggle('ipad', ipad);
    document.documentElement.classList.toggle('demo-ipad', ipad);
    var room = demo.clientWidth;
    var fit = ipad && room > 0 && room < IPAD_MIN;
    demo.classList.toggle('fit', fit);
    var dev = demo.querySelector('.device');
    if (dev) dev.style.zoom = fit ? String(Math.floor(room / IPAD_MIN * 1000) / 1000) : '';
    return ipad;
  }
  setDevice();

  function toArray(list) { return Array.prototype.slice.call(list); }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }
  // A mouse or trackpad clicks; a finger taps.
  var clicks = window.matchMedia ? window.matchMedia('(hover: hover) and (pointer: fine)').matches : false;
  function words(text) { return clicks ? text.replace(/\bTap\b/g, 'Click').replace(/\btap\b/g, 'click') : text; }
  function say(text) { status.textContent = words(text); }
  toArray(demo.querySelectorAll('.hint')).forEach(function (h) { h.textContent = words(h.textContent); });
  status.textContent = words(status.textContent);

  var bands = toArray(page.querySelectorAll('.band[data-cut]'));
  var allBands = toArray(page.querySelectorAll('.band'));
  var names = toArray(page.querySelectorAll('.nm'));
  var state = 'idle';   // idle | review | applied
  var view = 'after';   // after | before (once applied)
  var applied = [];
  var redacting = false;

  // Suggestion chips: one toggle button per suggested band.
  bands.forEach(function (band) {
    var label = band.getAttribute('data-cut');
    var maybe = band.getAttribute('data-strength') === 'maybe';
    band.classList.add('sug');
    if (maybe) band.classList.add('maybe');

    var chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.hidden = true;
    var hiddenText = document.createElement('span');
    hiddenText.className = 'vh';
    hiddenText.textContent = 'Remove ';
    chip.appendChild(hiddenText);
    chip.appendChild(document.createTextNode(label));
    if (maybe) {
      var tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = 'Maybe';
      chip.appendChild(document.createTextNode(' '));
      chip.appendChild(tag);
    }
    chip.addEventListener('click', function () {
      toggleBand(band, chip.getAttribute('aria-pressed') !== 'true');
    });
    band._chip = chip;
    band._maybe = maybe;
    band._edit = false;  // applied at some point: it's in the edit list, switched on or off
    band._t = 0;
    band.appendChild(chip);
    setOn(band, !maybe);
  });

  function setOn(band, on) {
    band._chip.setAttribute('aria-pressed', on ? 'true' : 'false');
    band.classList.toggle('off', !on);
  }
  function isOn(band) { return band._chip.getAttribute('aria-pressed') === 'true'; }

  // A suggestion switched on or off, from its label on the page or its row in the inspector.
  function toggleBand(band, on) {
    setOn(band, on);
    if (state === 'applied') editApplied(band, on);
    else reviewSummary();
    syncApp();
  }

  function reviewSummary() {
    var on = bands.filter(isOn).length;
    if (on === 0) say('No suggestions switched on.');
    else say(plural(on, 'suggestion', 'suggestions') + ' switched on. Tap Apply to remove ' + (on === 1 ? 'it.' : 'them.'));
  }

  // Collapse a band to a thin join line, or open it back up.
  function setCut(el, cut, anim) {
    el._t += 1;
    var token = el._t;
    if (!anim) {
      el.classList.toggle('cut', cut);
      el.style.height = cut ? SEAM + 'px' : '';
      return;
    }
    var from = el.getBoundingClientRect().height;
    var to;
    el.classList.toggle('cut', cut);
    if (cut) {
      to = SEAM;
    } else {
      el.style.height = '';
      to = el.getBoundingClientRect().height;
    }
    el.style.height = from + 'px';
    void el.offsetHeight; // commit the start height so the change animates
    el.style.height = to + 'px';
    if (!cut) {
      window.setTimeout(function () {
        if (el._t === token) el.style.height = '';
      }, DUR + 60);
    }
  }

  function scrollScreenTo(y) {
    if (typeof screen.scrollTo === 'function') {
      try { screen.scrollTo({ top: y, behavior: animated() ? 'smooth' : 'auto' }); return; } catch (e) { /* older engines */ }
    }
    screen.scrollTop = y;
  }

  function setCompare(enabled) {
    // Until something is applied the editor shows Before, as the app does.
    var before = !enabled || view === 'before';
    [btnBefore, navBefore].forEach(function (b) {
      b.disabled = !enabled;
      b.setAttribute('aria-pressed', before ? 'true' : 'false');
    });
    [btnAfter, navAfter].forEach(function (b) {
      b.disabled = !enabled;
      b.setAttribute('aria-pressed', before ? 'false' : 'true');
    });
    syncApp();
  }

  // Suggestions not yet applied (the app's `pending`), and the edit list's length.
  function pending() { return state === 'idle' ? [] : bands.filter(function (b) { return !b._edit; }); }
  function editCount() { return bands.filter(function (b) { return b._edit; }).length + coveredCount(); }

  // Everything on the device screen that follows the demo's state.
  function syncApp() {
    var on = bands.filter(isOn).length;
    cleanup.hidden = state !== 'review' || on === 0;
    cuCount.textContent = on;
    cuApply.setAttribute('aria-label', 'Clean Up, ' + plural(on, 'suggestion', 'suggestions'));
    // SuggestionChip: Find Suggestions until they're found, then how many wait.
    var waiting = pending().length;
    var chipUp = state === 'idle' || waiting > 0;
    sugChip.hidden = !chipUp;
    demo.classList.toggle('chip-up', chipUp);
    chipText.textContent = state === 'idle' ? 'Find Suggestions' : plural(waiting, 'suggestion', 'suggestions');
    chipChev.hidden = state === 'idle';
    var edits = editCount();
    listBadge.hidden = edits === 0;
    listBadge.textContent = edits;
    toolList.setAttribute('aria-label', edits ? 'List, ' + plural(edits, 'edit', 'edits') : 'List');
    navUndo.disabled = edits === 0;
    toolRedact.setAttribute('aria-pressed', redacting ? 'true' : 'false');
    redactRow.hidden = !redacting;
    syncInspector();
  }

  // 1. Clean Up: show the suggestions. Nothing changes yet.
  btnClean.addEventListener('click', function () {
    if (state !== 'idle') return;
    measure();
    state = 'review';
    demo.classList.add('reviewing');
    bands.forEach(function (b) { b._chip.hidden = false; });
    btnClean.disabled = true;
    btnApply.disabled = false;
    btnApply.focus();
    scrollScreenTo(0);
    showTab('sugs');
    var strong = bands.filter(function (b) { return !b._maybe; }).length;
    var maybe = bands.length - strong;
    var text = plural(bands.length, 'suggestion', 'suggestions') + ' found. ' + strong + ' ' + (strong === 1 ? 'is' : 'are') + ' on';
    if (maybe) text += ', and ' + maybe + ' Maybe ' + (maybe === 1 ? 'waits' : 'wait') + ' for you';
    say(text + '. Scroll the page to review them.');
    syncApp();
  });

  // 2. Apply: collapse the bands that are switched on.
  btnApply.addEventListener('click', function () {
    if (state !== 'review') return;
    var on = bands.filter(isOn);
    if (on.length === 0) {
      say('Switch on at least one suggestion first.');
      return;
    }
    var total = page.getBoundingClientRect().height;
    var removed = 0;
    on.forEach(function (b) { removed += b.getBoundingClientRect().height - SEAM; });

    state = 'applied';
    view = 'after';
    applied = on;
    demo.classList.remove('reviewing');
    bands.forEach(function (b) { b._chip.hidden = true; });
    var anim = animated();
    applied.forEach(function (b) {
      b._edit = true;
      setCut(b, true, anim);
      b.setAttribute('aria-hidden', 'true');
    });
    btnApply.disabled = true;
    showTab('edits');
    setCompare(true);
    btnBefore.focus();
    var pct = total > 0 ? Math.round(removed / total * 100) : 0;
    say(plural(on.length, 'suggestion', 'suggestions') + ' applied. The page is ' + pct + '% shorter.');
  });

  // 3. Before / After. Before shows every suggestion again, applied or skipped, so any of them can
  // be added or taken out; After applies that choice.
  function showView(next) {
    if (state !== 'applied' || view === next) return;
    view = next;
    var anim = animated();
    if (next === 'before') {
      demo.classList.add('reviewing');
      bands.forEach(function (b) {
        var on = applied.indexOf(b) >= 0;
        if (on) setCut(b, false, anim);
        b.classList.toggle('was-cut', on);
        b.removeAttribute('aria-hidden');
        setOn(b, on);
        b._chip.hidden = false;
      });
      say('Before: the removed parts are shaded. Tap a label to add or skip a suggestion.');
    } else {
      demo.classList.remove('reviewing');
      bands.forEach(function (b) {
        b._chip.hidden = true;
        b.classList.remove('was-cut');
        if (applied.indexOf(b) >= 0) {
          setCut(b, true, anim);
          b.setAttribute('aria-hidden', 'true');
        }
      });
      say(applied.length ? 'After: ' + plural(applied.length, 'suggestion', 'suggestions') + ' applied.' : 'After: no suggestions applied.');
    }
    setCompare(true);
  }

  // A suggestion added to what's applied, or taken out. In After (from the inspector) the page
  // changes at once, as switching an edit off does in the app.
  function editApplied(band, on) {
    var i = applied.indexOf(band);
    if (on && i < 0) applied.push(band);
    if (!on && i >= 0) applied.splice(i, 1);
    if (on) band._edit = true;
    if (view === 'before') {
      band.classList.toggle('was-cut', on);
      say((on ? 'Added. ' : 'Skipped. ') + plural(applied.length, 'suggestion', 'suggestions') + ' will be applied. Tap After to see it.');
    } else {
      setCut(band, on, animated());
      if (on) band.setAttribute('aria-hidden', 'true'); else band.removeAttribute('aria-hidden');
      say((on ? 'Added. ' : 'Switched off. ') + plural(applied.length, 'suggestion', 'suggestions') + ' applied.');
    }
  }
  btnBefore.addEventListener('click', function () { showView('before'); });
  btnAfter.addEventListener('click', function () { showView('after'); });

  // 4. Redact: tap a name to cover it with a solid box.
  function setRedacting(on) {
    redacting = on;
    demo.classList.toggle('redacting', on);
    btnRedact.setAttribute('aria-pressed', on ? 'true' : 'false');
    names.forEach(function (n) {
      n.tabIndex = on ? 0 : -1;
      n.setAttribute('aria-disabled', on ? 'false' : 'true');
    });
    syncApp();
  }

  function coveredCount() {
    return names.filter(function (n) { return n.classList.contains('redacted'); }).length;
  }

  function setRedacted(n, on) {
    if (on) n._rect = nameRect(n);
    n.classList.toggle('redacted', on);
    n.setAttribute('aria-pressed', on ? 'true' : 'false');
    if (on) n.setAttribute('aria-label', 'Redacted name');
    else n.removeAttribute('aria-label');
  }

  btnRedact.addEventListener('click', function () {
    setRedacting(!redacting);
    if (!redacting) {
      say('Redact is off. ' + plural(coveredCount(), 'name', 'names') + ' covered.');
      return;
    }
    say('Redact is on. Tap a name on the page to cover it.');
    var first = names[0];
    if (first) {
      var s = screen.getBoundingClientRect();
      var r = first.getBoundingClientRect();
      if (r.top < s.top || r.bottom > s.bottom) {
        scrollScreenTo(screen.scrollTop + (r.top - s.top) - 80);
      }
    }
  });

  names.forEach(function (n) {
    n.setAttribute('aria-pressed', 'false');
    n.addEventListener('click', function () {
      if (!redacting) {
        say('Turn on Redact, then tap a name.');
        return;
      }
      setRedacted(n, !n.classList.contains('redacted'));
      var c = coveredCount();
      say(c === 0 ? 'No names covered.' : plural(c, 'name', 'names') + ' covered.');
      syncApp();
    });
  });

  // Popdowns: the status bar, the app's controls the demo can't run, the ad and the sign-up box
  // each answer with a short note.
  var pop = document.createElement('div');
  pop.className = 'sb-pop off';
  pop.setAttribute('role', 'status');
  device.appendChild(pop);
  var popTimer = 0;
  function hidePop() { pop.classList.add('off'); }
  function showPop(text) {
    pop.textContent = words(text);
    pop.classList.remove('off');
    clearTimeout(popTimer);
    popTimer = setTimeout(hidePop, 2800);
  }
  toArray(device.querySelectorAll('[data-say]')).forEach(function (b) {
    b.addEventListener('click', function (e) {
      e.stopPropagation();
      showPop(b.getAttribute('data-say'));
    });
  });
  document.addEventListener('click', hidePop);

  // The app's controls that work here press the matching button beside the device.
  function press(el, button) { el.addEventListener('click', function () { button.click(); }); }
  press(navBefore, btnBefore);
  press(navAfter, btnAfter);
  press(cuApply, btnApply);
  press(toolRedact, btnRedact);
  press(document.getElementById('redact-done'), btnRedact);

  // The chip: Find Suggestions is step 1; afterwards it opens the suggestions (the inspector on
  // iPad; a sheet on iPhone, which the demo doesn't draw).
  var SHEET_NOTE = 'In the app, this opens the list of suggestions. Here, tap a label on the page.';
  function openSuggestions(e) {
    if (isIpad()) { openInspector('sugs'); return; }
    e.stopPropagation();
    showPop(SHEET_NOTE);
  }
  sugChip.addEventListener('click', function (e) {
    if (state === 'idle') btnClean.click();
    else openSuggestions(e);
  });
  cuReview.addEventListener('click', openSuggestions);

  // List: on iPad it opens and closes the inspector on Edits, as EditorModel.toggleEditList does.
  toolList.addEventListener('click', function (e) {
    if (!isIpad()) {
      e.stopPropagation();
      showPop('In the app: shows every edit.');
      return;
    }
    if (inspectorOpen() && tab === 'edits') demo.classList.add('insp-closed');
    else openInspector('edits');
    syncApp();
  });

  // ---- The iPad inspector: Edits | Suggestions, kept in step with the page. ----
  var inspector = document.getElementById('inspector');
  var tabEdits = document.getElementById('tab-edits');
  var tabSugs = document.getElementById('tab-sugs');
  var paneEdits = document.getElementById('pane-edits');
  var paneSugs = document.getElementById('pane-sugs');
  var editsEmpty = document.getElementById('edits-empty');
  var editsList = document.getElementById('edits-list');
  var editsRows = document.getElementById('edits-rows');
  var editsFoot = document.getElementById('edits-foot');
  var presetBtn = document.getElementById('insp-preset');
  var sugsIdle = document.getElementById('sugs-idle');
  var sugsDone = document.getElementById('sugs-done');
  var sugsList = document.getElementById('sugs-list');
  var sugsSecs = document.getElementById('sugs-secs');
  var sugsApply = document.getElementById('sugs-apply');
  var apAll = document.getElementById('ap-all');
  var apSel = document.getElementById('ap-sel');
  var tab = 'edits';

  // Original drawings in the spirit of the app's symbols.
  var ICONS = {
    sparkles: '<path class="dot" d="m10 3 1.9 5.1L17 10l-5.1 1.9L10 17l-1.9-5.1L3 10l5.1-1.9Zm8.5 10 .9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9Z"/>',
    wifi: '<path d="M12 19.5h0M8.6 16a4.8 4.8 0 0 1 6.8 0M5.4 12.8a9.3 9.3 0 0 1 13.2 0M2.5 9.6a13.4 13.4 0 0 1 19 0"/>',
    video: '<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="m10 9.3 5 2.7-5 2.7Z"/>',
    space: '<rect x="3.5" y="3.5" width="17" height="17" rx="3"/><path d="M12 7v10m-2.5-7.5L12 7l2.5 2.5m-5 5L12 17l2.5-2.5"/>',
    mail: '<rect x="3" y="5.5" width="18" height="13" rx="2.2"/><path d="m3.8 7 8.2 6.2L20.2 7"/>',
    end: '<path d="M4 5h16M4 9.5h16M4 14h9"/><path d="M17 13v6m-3-3h6"/>',
    cutRows: '<path d="M12 3v18M8 6.5 12 3l4 3.5M8 17.5l4 3.5 4-3.5"/>',
    redact: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/><path d="m4 4 16 16"/>'
  };
  function icon(name, cls) {
    var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('class', 'ic' + (cls ? ' ' + cls : ''));
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('aria-hidden', 'true');
    s.setAttribute('focusable', 'false');
    s.innerHTML = ICONS[name];
    return s;
  }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  // Suggestion categories, as SuggestionsSheet groups them (titles from Suggestion.Category, the
  // detector names from SuggestionLabels.title(forDetector:)).
  var CATS = {
    statusBar: { title: 'Status Bar', icon: 'wifi', detector: 'System bar' },
    video: { title: 'Videos', icon: 'video', detector: 'Inline video' },
    emptyBand: { title: 'Empty Space', icon: 'space', detector: 'Empty space' },
    newsletter: { title: 'Newsletter Sign-ups', icon: 'mail', detector: 'Newsletter sign-up' },
    pageEnd: { title: 'End of Page', icon: 'end', detector: 'End of page' }
  };

  // Sizes in the inspector are in the screenshot's pixels: the page as captured on that device.
  var CAPTURE_W = { phone: 1320, ipad: 1640 };
  var measured = null;
  function measure() {
    var k = (isIpad() ? CAPTURE_W.ipad : CAPTURE_W.phone) / page.clientWidth;
    var y = 0;
    allBands.forEach(function (b) {
      var h = b.offsetHeight;
      b._y = Math.round(y * k);
      b._h = Math.round(h * k);
      y += h;
    });
    measured = { k: k, w: Math.round(page.clientWidth * k), h: Math.round((y + 18) * k) };  // 18: the page's bottom padding
  }
  function nameRect(n) {
    if (!measured) measure();
    var band = n.closest('.band');
    var b = band.getBoundingClientRect();
    var r = n.getBoundingClientRect();
    var p = page.getBoundingClientRect();
    var k = measured.k;
    return { x: Math.round((r.left - p.left) * k), y: band._y + Math.round((r.top - b.top) * k), w: Math.round(r.width * k), h: Math.round(r.height * k) };
  }
  function rows(b) { return b._h + ' px · rows ' + b._y + ' to ' + (b._y + b._h - 1); }

  function makeSwitch(label, onClick, cls) {
    var sw = el('button', 'sw' + (cls ? ' ' + cls : ''));
    sw.type = 'button';
    sw.setAttribute('role', 'switch');
    sw.setAttribute('aria-label', label);
    sw.addEventListener('click', function (e) { e.stopPropagation(); onClick(sw.getAttribute('aria-checked') !== 'true'); });
    return sw;
  }

  // Selecting a row shows that part of the page, in Before, as the app does.
  function reveal(target) {
    if (state === 'applied' && view === 'after' && target.classList.contains('cut')) showView('before');
    var go = function () {
      var y = target.getBoundingClientRect().top - page.getBoundingClientRect().top;
      scrollScreenTo(Math.max(0, y + page.offsetTop - 50));
    };
    if (animated()) window.setTimeout(go, DUR); else go();
  }

  function row(iconName, iconCls, onReveal) {
    var r = el('div', 'ig-row');
    var main = el('button', 'ig-main');
    main.type = 'button';
    var ic = el('span', 'ig-ic' + (iconCls ? ' ' + iconCls : ''));
    ic.appendChild(icon(iconName));
    var txt = el('span', 'ig-txt');
    main.appendChild(ic);
    main.appendChild(txt);
    main.addEventListener('click', onReveal);
    r.appendChild(main);
    return { row: r, txt: txt };
  }

  // One suggestions row and one edits row per band, plus an edits row per name; syncInspector
  // shows the ones that apply.
  var sections = {};
  bands.forEach(function (band) {
    var cat = CATS[band.getAttribute('data-cat')];
    var key = band.getAttribute('data-cat');
    if (!sections[key]) {
      var sec = el('div', 'ig-sec');
      var head = el('h4', 'ig-head');
      head.appendChild(icon(cat.icon));
      head.appendChild(document.createTextNode(cat.title));
      sec.appendChild(head);
      sec._group = el('div', 'ig-group');
      sec.appendChild(sec._group);
      sugsSecs.appendChild(sec);
      sections[key] = sec;
    }
    var label = band.getAttribute('data-cut');
    var s = row(cat.icon, '', function () { reveal(band); });
    s.txt.appendChild(el('span', 'ig-title', label));
    band._sSub = s.txt.appendChild(el('span', 'ig-sub'));
    var meta = s.txt.appendChild(el('span', 'ig-meta'));
    meta.appendChild(el('span', 'badge-s' + (band._maybe ? ' maybe' : ''), band._maybe ? 'Maybe' : 'Strong'));
    meta.appendChild(document.createTextNode(cat.detector));
    band._sSw = s.row.appendChild(makeSwitch('Include ' + label, function (on) { toggleBand(band, on); }, 'sug'));
    band._sRow = s.row;
    band._sec = sections[key];
    sections[key]._group.appendChild(s.row);

    var e = row('cutRows', 'cut', function () { reveal(band); });
    e.txt.appendChild(el('span', 'ig-title', 'Cut Rows'));
    band._eSub = e.txt.appendChild(el('span', 'ig-sub'));
    var origin = e.txt.appendChild(el('span', 'ig-meta ig-origin'));
    origin.appendChild(icon('sparkles'));
    origin.appendChild(document.createTextNode(label + ' · 2 px line join · ' + (band._maybe ? 'Maybe' : 'Strong')));
    band._eSw = e.row.appendChild(makeSwitch('Enable Cut Rows, ' + label, function (on) { toggleBand(band, on); }));
    band._eRow = e.row;
    editsRows.appendChild(e.row);
  });
  names.forEach(function (n) {
    var e = row('redact', 'red', function () { reveal(n); });
    e.txt.appendChild(el('span', 'ig-title', 'Redaction'));
    n._eSub = e.txt.appendChild(el('span', 'ig-sub'));
    n._eMeta = e.txt.appendChild(el('span', 'ig-meta ig-origin'));
    var sw = e.row.appendChild(makeSwitch('Enable Redaction', function () {}));
    sw.setAttribute('aria-checked', 'true');
    sw.disabled = true;  // the demo keeps redactions on; Redact again to take one off
    n._eRow = e.row;
    editsRows.appendChild(e.row);
  });

  function inspectorOpen() { return !demo.classList.contains('insp-closed'); }
  function showTab(next) {
    tab = next;
    tabEdits.setAttribute('aria-pressed', next === 'edits' ? 'true' : 'false');
    tabSugs.setAttribute('aria-pressed', next === 'sugs' ? 'true' : 'false');
    paneEdits.hidden = next !== 'edits';
    paneSugs.hidden = next !== 'sugs';
  }
  function openInspector(next) {
    demo.classList.remove('insp-closed');
    showTab(next);
    syncApp();
  }
  tabEdits.addEventListener('click', function () { showTab('edits'); syncApp(); });
  tabSugs.addEventListener('click', function () { showTab('sugs'); syncApp(); });
  document.getElementById('sugs-find').addEventListener('click', function () { btnClean.click(); });
  apSel.addEventListener('click', function () { btnApply.click(); });
  apAll.addEventListener('click', function () {
    bands.forEach(function (b) { setOn(b, true); });
    btnApply.click();
  });

  function syncInspector() {
    if (!inspector) return;
    var ipad = isIpad();
    toolList.setAttribute('aria-pressed', ipad && inspectorOpen() && tab === 'edits' ? 'true' : 'false');
    if (!ipad) return;
    if (state !== 'idle' && !measured) measure();
    var waiting = pending();
    tabSugs.textContent = waiting.length ? 'Suggestions (' + waiting.length + ')' : 'Suggestions';

    // Suggestions
    sugsIdle.hidden = state !== 'idle';
    sugsDone.hidden = state === 'idle' || waiting.length > 0;
    sugsList.hidden = state === 'idle' || waiting.length === 0;
    bands.forEach(function (b) {
      var show = waiting.indexOf(b) >= 0;
      b._sRow.hidden = !show;
      b._sRow.classList.toggle('off', !isOn(b));
      b._sSw.setAttribute('aria-checked', isOn(b) ? 'true' : 'false');
      if (show && measured) b._sSub.textContent = rows(b);
    });
    Object.keys(sections).forEach(function (k) {
      sections[k].hidden = !bands.some(function (b) { return b._sec === sections[k] && !b._sRow.hidden; });
    });
    var on = bands.filter(isOn).length;
    sugsApply.hidden = state !== 'review';
    apSel.textContent = on ? 'Apply ' + on : 'Apply';
    apSel.disabled = on === 0;

    // Edits, in page order
    var any = false;
    var removed = 0;
    bands.forEach(function (b) {
      b._eRow.hidden = !b._edit;
      if (!b._edit) return;
      any = true;
      var enabled = applied.indexOf(b) >= 0;
      if (enabled) removed += b._h;
      b._eRow.classList.toggle('off', !enabled);
      b._eSw.setAttribute('aria-checked', enabled ? 'true' : 'false');
      b._eSub.textContent = rows(b);
    });
    names.forEach(function (n) {
      var on = n.classList.contains('redacted');
      n._eRow.hidden = !on;
      if (!on) return;
      any = true;
      var r = n._rect;
      n._eSub.textContent = 'Solid black · ' + r.w + '×' + r.h + ' px';
      n._eMeta.textContent = 'Manual · at ' + r.x + ', ' + r.y;
    });
    editsEmpty.hidden = any;
    editsList.hidden = !any;
    presetBtn.disabled = !any || (applied.length === 0 && coveredCount() === 0);
    if (any && measured) {
      editsFoot.textContent = 'Output ' + measured.w + ' × ' + (measured.h - removed) + ' px · original ' + measured.w + ' × ' + measured.h + ' px';
    }
  }

  // Edit rows follow the page: a redaction's row goes after its band's cut row.
  names.forEach(function (n) {
    var band = n.closest('.band');
    var next = null;
    for (var i = allBands.indexOf(band) + 1; i < allBands.length && !next; i++) if (allBands[i]._eRow) next = allBands[i]._eRow;
    if (next) editsRows.insertBefore(n._eRow, next);
  });

  // The switch above the demo: a radio group (arrow keys move and choose, as in a native one).
  var devSwitch = document.getElementById('dev-switch');
  var devBtns = [document.getElementById('dev-phone'), document.getElementById('dev-ipad')];
  function syncSwitch() {
    var ipad = isIpad();
    devBtns.forEach(function (b, i) {
      var on = (i === 1) === ipad;
      b.setAttribute('aria-checked', on ? 'true' : 'false');
      b.tabIndex = on ? 0 : -1;
    });
  }

  // Rotating an iPad, resizing a window or the switch can change devices: lay the inspector out
  // again, and measure again while nothing is cut.
  var lastIpad = isIpad();
  function deviceChanged() {
    var now = setDevice();
    syncSwitch();
    if (now === lastIpad) return;
    lastIpad = now;
    if (state !== 'applied') measured = null;
    hidePop();
    syncApp();
  }
  window.addEventListener('resize', deviceChanged);

  function pick(i, focus) {
    var was = isIpad();
    picked = i === 1 ? 'ipad' : 'phone';
    // A smooth change: the frame grows (or shrinks) from one device to the other while the screen
    // inside cross-fades (the View Transitions API, demo.css). Without it, or with reduced motion,
    // the switch is instant.
    if (was !== (i === 1) && animated() && document.startViewTransition) {
      // A page that isn't painting (a background tab) holds the transition back: change anyway
      // after a moment, once.
      var done = false;
      var change = function () { if (!done) { done = true; deviceChanged(); } };
      try { document.startViewTransition(change); } catch (e) { change(); }
      setTimeout(change, 300);
    } else {
      deviceChanged();
    }
    var b = devBtns[i];
    if (focus) b.focus();
    // On a wide screen the page rearranges around the iPad; keep the switch in view.
    var r = devSwitch.getBoundingClientRect();
    if ((r.top < 0 || r.bottom > window.innerHeight) && b.scrollIntoView) {
      try { b.scrollIntoView({ block: 'center', behavior: animated() ? 'smooth' : 'auto' }); } catch (e) { b.scrollIntoView(); }
    }
  }
  devBtns.forEach(function (b, i) {
    b.addEventListener('click', function () { pick(i, false); });
    b.addEventListener('keydown', function (e) {
      var k = e.key;
      var to = (k === 'ArrowRight' || k === 'ArrowDown' || k === 'ArrowLeft' || k === 'ArrowUp') ? 1 - i
        : k === 'Home' ? 0 : k === 'End' ? 1 : -1;
      if (to < 0) return;
      e.preventDefault();
      pick(to, true);
    });
  });
  syncSwitch();
  devSwitch.hidden = false;

  // 5. Export: three of the app's presets as cartoons. The cut count comes from the real page
  // (applied cuts removed, cuts between lines of content); nothing is rendered to a file.
  var btnExport = document.getElementById('btn-export');
  var exPop = document.getElementById('ex-pop');
  var exScrim = document.getElementById('ex-scrim');
  var exSim = document.getElementById('ex-sim');
  var exCap = document.getElementById('ex-cap');
  var exOpts = toArray(exPop.querySelectorAll('.ex-opt'));
  var NS = 'http://www.w3.org/2000/svg';
  var PW = 280;  // page width the cuts are measured at
  // Blocks a cut never goes through: text lines, pictures, boxes.
  var ATOMS = 'p, .photo, .vid-frame, .vid-cta, .ad small, .sbar, .site, .signup, .related > strong, .rel';
  var PAGE_H = PW * (/-(US|CA|MX)$/i.test(navigator.language || '') ? 11 / 8.5 : 297 / 210);
  var preset = 'posts';

  // Cut positions (0..1 of the exported page) at most `limit` page pixels apart, in blank gaps.
  function cuts(limit) {
    var c = page.cloneNode(true);
    c.removeAttribute('id');
    c.className = 'pg ex-measure';
    toArray(c.querySelectorAll('[style], .chip')).forEach(function (e) {
      if (e.classList.contains('chip')) e.parentNode.removeChild(e); else e.removeAttribute('style');
    });
    var orig = toArray(page.querySelectorAll('.band'));
    toArray(c.querySelectorAll('.band')).forEach(function (b, i) {
      if (state === 'applied' && applied.indexOf(orig[i]) >= 0) b.parentNode.removeChild(b);
    });
    exPop.appendChild(c);
    var top = c.getBoundingClientRect().top;
    var H = c.offsetHeight;
    var iv = toArray(c.querySelectorAll(ATOMS)).map(function (e) {
      var r = e.getBoundingClientRect();
      return [r.top - top, r.bottom - top];
    }).sort(function (a, b) { return a[0] - b[0]; });
    exPop.removeChild(c);
    var gaps = [];
    var y = 0;
    iv.forEach(function (v) { if (v[0] > y + 1) gaps.push([y, v[0]]); y = Math.max(y, v[1]); });
    gaps.push([y, H]);
    var out = [];
    var s = 0;
    while (H - s > limit + 1 && out.length < 19) {
      var low = s + limit * 0.3;
      var best = s + limit;  // forced only when no gap fits
      var found = 0;
      gaps.forEach(function (g) {
        if (g[1] > low && g[0] < s + limit) found = Math.max(found, Math.min(Math.max((g[0] + g[1]) / 2, low), s + limit, g[1]));
      });
      s = found || best;
      out.push(s / H);
    }
    return out;
  }

  function svg(tag, attrs, cls, parent, i) {
    var e = document.createElementNS(NS, tag);
    Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    if (cls) e.setAttribute('class', cls);
    if (i !== undefined) e.style.setProperty('--i', i);
    if (parent) parent.appendChild(e);
    return e;
  }

  // A cartoon page: a sheet with text bars, and a picture when `pic`.
  function sheet(g, x, y, w, h, pic, cls) {
    svg('rect', { x: x, y: y, width: w, height: h, rx: 4 }, 'ex-sheet' + (cls ? ' ' + cls : ''), g);
    var yy = y + 6;
    if (pic) {
      svg('rect', { x: x + 5, y: yy, width: w * 0.5, height: 4, rx: 2 }, 'ex-ink', g);
      svg('rect', { x: x + 5, y: yy + 8, width: w - 10, height: h * 0.22, rx: 2 }, 'ex-pic', g);
      yy += 12 + h * 0.22;
    }
    for (var n = 0; yy + 3 < y + h - 5; n++, yy += 7) {
      svg('rect', { x: x + 5, y: yy, width: (w - 10) * [1, 0.9, 0.95, 0.6][n % 4], height: 3, rx: 1.5 }, 'ex-line', g);
    }
  }

  function renderExport() {
    exSim.textContent = '';
    var root = svg('svg', { viewBox: '0 0 268 132', focusable: 'false' }, animated() ? 'ex-art ex-anim' : 'ex-art', exSim);
    if (preset === 'original') {
      sheet(root, 104, 4, 60, 124, true, 'ex-piece');
      exCap.textContent = 'One long image';
      return;
    }
    var pdf = preset === 'print';
    var at = cuts(pdf ? PAGE_H * 0.92 : PW * 5 / 4);
    var n = at.length + 1;
    // The long page with dashed cut lines and scissors at the first.
    sheet(root, 8, 4, 50, 124, true);
    at.forEach(function (f, i) {
      var y = 4 + f * 124;
      svg('line', { x1: 2, y1: y, x2: 64, y2: y }, 'ex-cut', root, i);
    });
    if (at.length) {
      var sc = svg('g', { transform: 'translate(60 ' + (4 + at[0] * 124) + ')' }, 'ex-scissors', root);
      svg('circle', { cx: 6, cy: -3, r: 2.5 }, '', sc);
      svg('circle', { cx: 6, cy: 3, r: 2.5 }, '', sc);
      svg('path', { d: 'M8 -2 L15 2 M8 2 L15 -2' }, '', sc);
    }
    svg('path', { d: 'M78 66 h12 m-5 -5 l5 5 l-5 5' }, 'ex-arrow', root);
    if (pdf) {
      var layers = Math.min(n, 3);
      for (var j = layers - 1; j >= 0; j--) {
        var px = 140 + j * 8;
        var py = 18 - j * 6;
        if (j) svg('rect', { x: px, y: py, width: 74, height: 96, rx: 3 }, 'ex-sheet ex-paper ex-piece', root, layers - j);
        else {
          var front = svg('g', {}, 'ex-piece', root, layers);
          svg('rect', { x: px, y: py, width: 74, height: 96, rx: 3 }, 'ex-sheet ex-paper', front);
          sheet(front, px + 6, py + 6, 62, 74, true, 'ex-inner');
          svg('text', { x: px + 37, y: py + 91, 'text-anchor': 'middle' }, 'ex-pn', front).textContent = '1 / ' + n;
        }
      }
      exCap.textContent = plural(n, 'page', 'pages') + ' · PDF · split between lines';
    } else {
      var shown = Math.min(n, 8);
      var rows = shown > 4 ? 2 : 1;
      var per = Math.ceil(shown / rows);
      for (var k = 0; k < shown; k++) {
        var sw = per > 3 ? 36 : 46;
        var sh = sw * 5 / 4;
        var sx = 100 + (k % per) * (sw + 8);
        var sy = (rows === 1 ? (122 - sh) / 2 : 8) + Math.floor(k / per) * 62;
        var g = svg('g', {}, 'ex-piece', root, k);
        sheet(g, sx, sy, sw, sh, k === 0);
        svg('text', { x: sx + sw / 2, y: sy + sh + 10, 'text-anchor': 'middle' }, 'ex-num', g).textContent = String(k + 1);
      }
      exCap.textContent = plural(n, 'post', 'posts') + ' · 4:5 · cut between lines';
    }
  }

  function choose(id) {
    preset = id;
    exOpts.forEach(function (o) { o.setAttribute('aria-pressed', o.getAttribute('data-preset') === id ? 'true' : 'false'); });
    renderExport();
  }

  function exportOpen() { return !exPop.hidden; }

  // Beside the device the card hangs from the Export button; keep it on the screen however the
  // buttons wrap. (On phones and short screens demo.css centres it as a sheet instead.)
  function placeExport() {
    exPop.style.right = '';
    if (getComputedStyle(exPop).position === 'fixed') return;
    var r = exPop.getBoundingClientRect();
    var room = document.documentElement.clientWidth;
    var shift = r.left < 16 ? 16 - r.left : (r.right > room - 16 ? room - 16 - r.right : 0);
    if (shift) exPop.style.right = -shift + 'px';
  }
  var exOpener = btnExport;
  var exFromNav = false;
  navExport.addEventListener('click', function () { exFromNav = true; });
  window.addEventListener('resize', function () { if (!exPop.hidden) placeExport(); });

  function openExport() {
    exOpener = exFromNav ? navExport : btnExport;
    exFromNav = false;
    exPop.hidden = false;
    exScrim.hidden = false;
    placeExport();
    btnExport.setAttribute('aria-expanded', 'true');
    navExport.setAttribute('aria-expanded', 'true');
    choose(preset);
    exOpts.filter(function (o) { return o.getAttribute('data-preset') === preset; })[0].focus();
    if (exPop.scrollIntoView) {
      try { exPop.scrollIntoView({ block: 'nearest', behavior: animated() ? 'smooth' : 'auto' }); } catch (e) { /* older engines */ }
    }
  }

  function closeExport(refocus) {
    if (!exportOpen()) return;
    exPop.hidden = true;
    exScrim.hidden = true;
    btnExport.setAttribute('aria-expanded', 'false');
    navExport.setAttribute('aria-expanded', 'false');
    exSim.textContent = '';
    if (refocus) exOpener.focus();
  }

  btnExport.addEventListener('click', function () {
    if (exportOpen()) closeExport(true);
    else openExport();
  });
  press(navExport, btnExport);
  document.getElementById('ex-close').addEventListener('click', function () { closeExport(true); });
  exOpts.forEach(function (o) {
    o.addEventListener('click', function () { choose(o.getAttribute('data-preset')); });
  });
  document.addEventListener('keydown', function (e) {
    if (exportOpen() && (e.key === 'Escape' || e.key === 'Esc')) { e.preventDefault(); closeExport(true); }
  });
  document.addEventListener('pointerdown', function (e) {
    if (exportOpen() && !exPop.contains(e.target) && !btnExport.contains(e.target) && !navExport.contains(e.target)) closeExport(false);
  }, true);
  exPop.addEventListener('focusout', function (e) {
    var to = e.relatedTarget;
    if (to && !exPop.contains(to) && to !== btnExport && to !== navExport) closeExport(false);
  });

  // Start over.
  btnReset.addEventListener('click', function () {
    closeExport(false);
    state = 'idle';
    view = 'after';
    applied = [];
    demo.classList.remove('reviewing');
    bands.forEach(function (b) {
      b._t += 1;
      b.classList.remove('cut', 'was-cut');
      b.style.height = '';
      b.removeAttribute('aria-hidden');
      b._chip.hidden = true;
      b._edit = false;
      setOn(b, !b._maybe);
    });
    measured = null;
    showTab('edits');
    names.forEach(function (n) { setRedacted(n, false); });
    setRedacting(false);
    btnClean.disabled = false;
    btnApply.disabled = true;
    setCompare(false);
    scrollScreenTo(0);
    btnClean.focus();
    say(INITIAL);
  });

  setRedacting(false);
  setCompare(false);
  panel.hidden = false;
})();
