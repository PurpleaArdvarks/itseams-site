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

  var SEAM = 2;    // height of the join line left where a band was cut (px)
  var DUR = 380;   // matches --dur in demo.css
  var INITIAL = 'Scroll the page, then tap Clean Up.';

  var motion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  function animated() { return !(motion && motion.matches); }

  function toArray(list) { return Array.prototype.slice.call(list); }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }
  // A mouse or trackpad clicks; a finger taps.
  var clicks = window.matchMedia ? window.matchMedia('(hover: hover) and (pointer: fine)').matches : false;
  function words(text) { return clicks ? text.replace(/\bTap\b/g, 'Click').replace(/\btap\b/g, 'click') : text; }
  function say(text) { status.textContent = words(text); }
  toArray(demo.querySelectorAll('.hint')).forEach(function (h) { h.textContent = words(h.textContent); });
  status.textContent = words(status.textContent);

  var bands = toArray(page.querySelectorAll('.band[data-cut]'));
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
      var on = chip.getAttribute('aria-pressed') !== 'true';
      setOn(band, on);
      if (state === 'applied') editApplied(band, on);
      else reviewSummary();
    });
    band._chip = chip;
    band._maybe = maybe;
    band._t = 0;
    band.appendChild(chip);
    setOn(band, !maybe);
  });

  function setOn(band, on) {
    band._chip.setAttribute('aria-pressed', on ? 'true' : 'false');
    band.classList.toggle('off', !on);
  }
  function isOn(band) { return band._chip.getAttribute('aria-pressed') === 'true'; }

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
    btnBefore.disabled = !enabled;
    btnAfter.disabled = !enabled;
    btnBefore.setAttribute('aria-pressed', view === 'before' ? 'true' : 'false');
    btnAfter.setAttribute('aria-pressed', view === 'after' ? 'true' : 'false');
  }

  // 1. Clean Up: show the suggestions. Nothing changes yet.
  btnClean.addEventListener('click', function () {
    if (state !== 'idle') return;
    state = 'review';
    demo.classList.add('reviewing');
    bands.forEach(function (b) { b._chip.hidden = false; });
    btnClean.disabled = true;
    btnApply.disabled = false;
    btnApply.focus();
    scrollScreenTo(0);
    var strong = bands.filter(function (b) { return !b._maybe; }).length;
    var maybe = bands.length - strong;
    var text = plural(bands.length, 'suggestion', 'suggestions') + ' found. ' + strong + ' ' + (strong === 1 ? 'is' : 'are') + ' on';
    if (maybe) text += ', and ' + maybe + ' Maybe ' + (maybe === 1 ? 'waits' : 'wait') + ' for you';
    say(text + '. Scroll the page to review them.');
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
      setCut(b, true, anim);
      b.setAttribute('aria-hidden', 'true');
    });
    btnApply.disabled = true;
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

  // A label tapped in Before: add that suggestion to what's applied, or take it out.
  function editApplied(band, on) {
    var i = applied.indexOf(band);
    if (on && i < 0) applied.push(band);
    if (!on && i >= 0) applied.splice(i, 1);
    band.classList.toggle('was-cut', on);
    say((on ? 'Added. ' : 'Skipped. ') + plural(applied.length, 'suggestion', 'suggestions') + ' will be applied. Tap After to see it.');
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
  }

  function coveredCount() {
    return names.filter(function (n) { return n.classList.contains('redacted'); }).length;
  }

  function setRedacted(n, on) {
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
    });
  });

  // Status bar: time, signal and battery each answer with a short popdown.
  var phone = demo.querySelector('.phone');
  var pop = document.createElement('div');
  pop.className = 'sb-pop off';
  pop.setAttribute('role', 'status');
  phone.appendChild(pop);
  var popTimer = 0;
  function hidePop() { pop.classList.add('off'); }
  function showPop(text) {
    pop.textContent = text;
    pop.classList.remove('off');
    clearTimeout(popTimer);
    popTimer = setTimeout(hidePop, 2800);
  }
  toArray(page.querySelectorAll('.sb-btn')).forEach(function (b) {
    b.addEventListener('click', function (e) {
      e.stopPropagation();
      showPop(b.getAttribute('data-say'));
    });
  });
  document.addEventListener('click', hidePop);

  // The car ad's play button and the sign-up box answer like the status bar does.
  toArray(page.querySelectorAll('.vid-play, .signup .go')).forEach(function (b) {
    b.addEventListener('click', function (e) {
      e.stopPropagation();
      showPop(b.getAttribute('data-say'));
    });
  });

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
  var ATOMS = 'p, .ln, .photo, .vid-frame, .vid-cta, .ad small, .sbar, .site, .signup, .related > strong, .rel';
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

  function openExport() {
    exPop.hidden = false;
    exScrim.hidden = false;
    btnExport.setAttribute('aria-expanded', 'true');
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
    exSim.textContent = '';
    if (refocus) btnExport.focus();
  }

  btnExport.addEventListener('click', function () {
    if (exportOpen()) closeExport(true);
    else openExport();
  });
  document.getElementById('ex-close').addEventListener('click', function () { closeExport(true); });
  exOpts.forEach(function (o) {
    o.addEventListener('click', function () { choose(o.getAttribute('data-preset')); });
  });
  document.addEventListener('keydown', function (e) {
    if (exportOpen() && (e.key === 'Escape' || e.key === 'Esc')) { e.preventDefault(); closeExport(true); }
  });
  document.addEventListener('pointerdown', function (e) {
    if (exportOpen() && !exPop.contains(e.target) && !btnExport.contains(e.target)) closeExport(false);
  }, true);
  exPop.addEventListener('focusout', function (e) {
    var to = e.relatedTarget;
    if (to && !exPop.contains(to) && to !== btnExport) closeExport(false);
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
      setOn(b, !b._maybe);
    });
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
