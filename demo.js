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

  // 5. Export: the app's presets, simulated. Miniatures are clones of the page (with the applied
  // cuts and redactions) in scaled, clipped frames; nothing is rendered to a file.
  var btnExport = document.getElementById('btn-export');
  var exPop = document.getElementById('ex-pop');
  var exScrim = document.getElementById('ex-scrim');
  var exSim = document.getElementById('ex-sim');
  var exOpts = toArray(exPop.querySelectorAll('.ex-opt'));
  var PW = 280;  // width the miniatures lay the page out at
  // Atoms a cut never goes through: text lines, pictures, boxes.
  var ATOMS = 'p, .ln, .photo, .vid-frame, .vid-cta, .ad small, .sbar, .site, .signup, .related > strong, .rel';
  var letter = /-(US|CA|MX)$/i.test(navigator.language || '');
  var PRESETS = {  // summaries from the app's ExportPreset
    original: { sum: 'Full size, exactly as edited.' },
    posts: { sum: 'Fixed-ratio images for carousel posts, cut between lines of content.', w: 66, r: 5 / 4 },
    shortPost: { sum: 'Up to 4 images, each under a size limit, for posts that show only a few images.', w: 72, r: 5 / 4, max: 4 },
    story: { sum: '1080 × 1920 images for full-screen stories.', w: 48, r: 16 / 9, center: true },
    print: { sum: 'A PDF that fits the page width, with pages split between lines of content.', w: 66, r: letter ? 11 / 8.5 : 297 / 210, pad: 5 }
  };
  var preset = null;
  var small = window.matchMedia ? window.matchMedia('(max-width: 639px)') : null;

  function el(cls, tag) { var e = document.createElement(tag || 'div'); e.className = cls; return e; }

  // The page as it would export: applied cuts removed, chips gone, names as plain (or covered) text.
  function exportCopy() {
    var c = page.cloneNode(true);
    c.removeAttribute('id');
    c.className = 'pg ex-mini';
    toArray(c.querySelectorAll('[style]')).forEach(function (e) { e.removeAttribute('style'); });
    toArray(c.querySelectorAll('.chip')).forEach(function (e) { e.parentNode.removeChild(e); });
    var orig = toArray(page.querySelectorAll('.band'));
    toArray(c.querySelectorAll('.band')).forEach(function (b, i) {
      if (state === 'applied' && applied.indexOf(orig[i]) >= 0) b.parentNode.removeChild(b);
      else b.classList.remove('sug', 'off', 'maybe', 'was-cut', 'cut');
    });
    toArray(c.querySelectorAll('.nm')).forEach(function (n) {
      var s = el(n.classList.contains('redacted') ? 'nm-x redacted' : 'nm-x', 'span');
      s.textContent = n.textContent;
      n.parentNode.replaceChild(s, n);
    });
    toArray(c.querySelectorAll('button')).forEach(function (b) { b.tabIndex = -1; });
    return c;
  }

  // Page height and the blank gaps between atoms, in page pixels.
  function measure(c) {
    var box = el('ex-measure');
    box.appendChild(c);
    exSim.appendChild(box);
    var top = c.getBoundingClientRect().top;
    var H = c.offsetHeight;
    var iv = toArray(c.querySelectorAll(ATOMS)).map(function (e) {
      var r = e.getBoundingClientRect();
      return [r.top - top, r.bottom - top];
    }).filter(function (v) { return v[1] > v[0]; }).sort(function (a, b) { return a[0] - b[0]; });
    var gaps = [];
    var y = 0;
    iv.forEach(function (v) { if (v[0] > y + 1) gaps.push([y, v[0]]); y = Math.max(y, v[1]); });
    if (H > y + 1) gaps.push([y, H]);
    exSim.removeChild(box);
    box.removeChild(c);
    return { H: H, gaps: gaps };
  }

  // Cuts at most `limit` apart, each in the lowest blank gap that fits (forced only if none).
  function slices(m, limit) {
    var out = [];
    var s = 0;
    out.forced = false;
    while (m.H - s > limit + 1 && out.length < 19) {
      var end = s + limit;
      var low = s + limit * 0.3;
      var best = 0;
      m.gaps.forEach(function (g) {
        if (g[1] <= low || g[0] >= end) return;
        var y = Math.min(Math.max((g[0] + g[1]) / 2, low), end, g[1]);
        if (y > best) best = y;
      });
      if (!best) { best = end; out.forced = true; }
      out.push([s, best]);
      s = best;
    }
    out.push([s, m.H]);
    return out;
  }

  // One output frame w × h showing page rows s0..s1 at scale k.
  function frame(c, w, h, s0, s1, k, opts) {
    opts = opts || {};
    var f = el('ex-frame');
    f.style.width = w + 'px';
    f.style.height = h + 'px';
    var clip = el('ex-clip');
    var cw = PW * k;
    var ch = (s1 - s0) * k;
    clip.style.width = cw + 'px';
    clip.style.height = ch + 'px';
    clip.style.left = (w - cw) / 2 + 'px';
    clip.style.top = (opts.center ? (h - ch) / 2 : opts.pad || 0) + 'px';
    var mini = c.cloneNode(true);
    mini.style.transform = 'scale(' + k + ') translateY(' + -s0 + 'px)';
    if ('inert' in mini) mini.inert = true;
    clip.appendChild(mini);
    f.appendChild(clip);
    return f;
  }

  function renderExport() {
    var p = PRESETS[preset];
    var c = exportCopy();
    var m = measure(c);
    exSim.textContent = '';
    exSim.className = 'ex-sim ex-' + preset + (animated() ? ' ex-anim' : '');
    var n, cap;
    if (preset === 'original') {
      var k0 = Math.min(110 / PW, 240 / m.H);
      exSim.appendChild(frame(c, PW * k0, m.H * k0, 0, m.H, k0));
      cap = '1 image · full length';
    } else {
      var w = p.w;
      var h = Math.round(w * p.r);
      var pad = p.pad || 0;
      var k = (w - 2 * pad) / PW;
      var room = h - 2 * pad - (pad ? 4 : 0);  // PDF: a little space for the page number
      var list = slices(m, room / k);
      var narrowed = false;
      while (p.max && list.length > p.max && k > 0.05) {
        k *= 0.94;
        narrowed = true;
        list = slices(m, room / k);
      }
      // Source strip with the cut lines, then the outputs.
      var ks = Math.min(44 / PW, 210 / m.H);
      var src = el('ex-item ex-src');
      src.appendChild(frame(c, PW * ks, m.H * ks, 0, m.H, ks));
      list.slice(1).forEach(function (sl, i) {
        var mark = el('ex-mark', 'i');
        mark.style.top = sl[0] * ks + 'px';
        mark.style.setProperty('--i', i);
        src.appendChild(mark);
      });
      exSim.appendChild(src);
      exSim.appendChild(el('ex-arrow'));
      var outs = el('ex-outs');
      list.forEach(function (sl, i) {
        var item = el('ex-item');
        item.style.setProperty('--i', i);
        var f = frame(c, w, h, sl[0], sl[1], k, { center: p.center, pad: pad });
        item.appendChild(f);
        var num = el(pad ? 'ex-pn' : 'ex-n', 'span');
        num.textContent = String(i + 1);
        (pad ? f : item).appendChild(num);
        outs.appendChild(item);
      });
      exSim.appendChild(outs);
      n = list.length;
      if (preset === 'posts') cap = plural(n, 'image', 'images') + ' · 4:5 · cut between lines' + (list.forced ? ' where possible' : '');
      else if (preset === 'shortPost') cap = plural(n, 'image', 'images') + ' · 4:5 · each under 5 MB' + (narrowed ? ' · narrowed to fit' : '');
      else if (preset === 'story') cap = plural(n, 'image', 'images') + ' · 9:16 · 1080 × 1920';
      else cap = plural(n, 'page', 'pages') + ' · ' + (letter ? 'Letter' : 'A4') + ' PDF · numbered';
    }
    document.getElementById('ex-sum').textContent = p.sum;
    document.getElementById('ex-cap').textContent = cap;
    var covered = coveredCount();
    document.getElementById('ex-note').textContent = 'Simulated from the ' +
      (state === 'applied' && applied.length ? 'cleaned-up page' : 'page as captured') +
      (covered ? ', ' + plural(covered, 'name', 'names') + ' covered' : '') + '. Nothing is saved.';
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
    if (!preset) {
      // Like the app: Split for posts for tall outputs (height > 2.5 × width), otherwise Original.
      preset = measure(exportCopy()).H > 2.5 * PW ? 'posts' : 'original';
    }
    choose(preset);
    exOpts.filter(function (o) { return o.getAttribute('data-preset') === preset; })[0].focus();
    if (!(small && small.matches) && exPop.scrollIntoView) {
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
