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
  function say(text) { status.textContent = text; }

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
    if (maybe) text += ', and ' + maybe + ' Maybe ' + (maybe === 1 ? 'waits' : 'wait') + ' for your tap';
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
  toArray(page.querySelectorAll('.sb-btn')).forEach(function (b) {
    b.addEventListener('click', function (e) {
      e.stopPropagation();
      pop.textContent = b.getAttribute('data-say');
      pop.classList.remove('off');
      clearTimeout(popTimer);
      popTimer = setTimeout(hidePop, 2800);
    });
  });
  document.addEventListener('click', hidePop);

  // Start over.
  btnReset.addEventListener('click', function () {
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
