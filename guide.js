/* itSeams demo guide.
   Until the visitor touches the demo, it plays itself after a few idle seconds (Clean Up, a scroll
   through the suggestions, Apply, Before/After, a redaction, Start over), at most a few times and
   never with reduced motion. Any touch, key or wheel stops it and resets the demo. From then on,
   after a few idle seconds it points at the next step (a pulsing button, or a finger swiping up in
   the phone); each step's hint shows at most twice, and none once the demo has been tried.
   Nothing runs while the phone is off screen or the page is hidden. */
(function () {
  'use strict';

  var demo = document.getElementById('demo');
  var screen = document.getElementById('screen');
  var phone = demo && demo.querySelector('.phone');
  if (!demo || !screen || !phone) return;

  var btnClean = document.getElementById('btn-clean');
  var btnApply = document.getElementById('btn-apply');
  var btnBefore = document.getElementById('btn-before');
  var btnAfter = document.getElementById('btn-after');
  var btnRedact = document.getElementById('btn-redact');
  var btnReset = document.getElementById('btn-reset');
  var status = document.getElementById('status');
  var target = demo.querySelector('.band[data-cut="Inline video"]') || demo.querySelector('.band[data-cut]:not(.band-sbar)');
  var lastBand = demo.querySelector('.band[data-cut="End of page"]');
  var name = demo.querySelector('.nm');

  var IDLE = 3000;        // ms without input before a hint shows
  var AUTO_IDLE = 4000;   // ms before the demo first plays itself
  // Step pauses are long enough to read each change (owner: half the first speed).
  var MAX_SHOWS = 2;      // hints per step
  var MAX_PLAYS = 3;      // autoplay runs

  var motion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

  // A mouse or trackpad gets a scroll-wheel hint; a finger gets a swipe.
  var clicks = window.matchMedia ? window.matchMedia('(hover: hover) and (pointer: fine)').matches : false;

  var ghost = document.createElement('div');
  ghost.className = clicks ? 'ghost mouse' : 'ghost';
  ghost.setAttribute('aria-hidden', 'true');
  ghost.innerHTML = '<span class="ghost-trail"></span><span class="ghost-dot"></span><span class="ghost-mouse"></span><span class="ghost-label">Scroll</span>';
  phone.appendChild(ghost);

  var badge = document.createElement('div');
  badge.className = 'autoplay-badge';
  badge.setAttribute('aria-hidden', 'true');
  badge.textContent = clicks ? 'Playing · Click to try' : 'Playing · Tap to try';
  phone.appendChild(badge);

  var touched = false;  // the visitor has used the demo
  var playing = false;
  var plays = 0;
  var done = {};        // step -> true once the visitor has done it
  var shows = {};       // step -> times its hint has shown
  var timer = 0;
  var shown = null;     // the step whose hint is up

  // At least half the phone is in the window.
  function onScreen() {
    var r = phone.getBoundingClientRect();
    return Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0) >= r.height / 2;
  }

  // An element's position in the scrolling page (offsets are measured from the phone frame).
  function top(el) { return el.offsetTop - screen.offsetTop; }

  function scrolledToTarget() {
    if (!target) return true;
    return screen.scrollTop + screen.clientHeight * 0.6 >= top(target);
  }

  function scrollTo(el, offset) {
    var y = el ? Math.max(0, top(el) - (offset || 0)) : 0;
    try { screen.scrollTo({ top: y, behavior: 'smooth' }); } catch (e) { screen.scrollTop = y; }
  }

  // MARK: Autoplay

  var script = [
    [function () { btnClean.click(); }, 3600],
    [function () { scrollTo(target, 40); }, 3600],
    [function () { scrollTo(lastBand, 60); }, 3600],
    [function () { btnApply.click(); }, 4400],
    [function () { btnBefore.click(); }, 3600],
    [function () { btnAfter.click(); }, 2800],
    [function () { btnRedact.click(); scrollTo(name, 120); }, 2400],
    [function () { if (name) name.click(); }, 4000],
    [function () { btnReset.click(); }, 5000]
  ];

  function play(i) {
    if (!playing) return;
    if (document.hidden || !onScreen()) { stopPlaying(true); restart(); return; }
    if (i >= script.length) {
      plays += 1;
      if (plays >= MAX_PLAYS) { stopPlaying(false); restart(); return; }
      i = 0;
    }
    script[i][0]();
    timer = setTimeout(function () { play(i + 1); }, script[i][1]);
  }

  function startPlaying() {
    if (touched || playing || plays >= MAX_PLAYS || (motion && motion.matches)) return false;
    playing = true;
    status.setAttribute('aria-live', 'off');
    badge.classList.add('on');
    play(0);
    return true;
  }

  function stopPlaying(reset) {
    if (!playing) return;
    playing = false;
    clearTimeout(timer);
    badge.classList.remove('on');
    if (reset) btnReset.click();
    status.setAttribute('aria-live', 'polite');
  }

  // MARK: Hints

  // The next thing to do, or null when the demo has been tried.
  function step() {
    if (!done.clean) return 'clean';
    if (!done.apply) return scrolledToTarget() ? 'apply' : 'scroll';
    if (!done.compare) return 'compare';
    if (!done.redact) return 'redact';
    return null;
  }

  function buttonFor(s) {
    return { clean: btnClean, apply: btnApply, compare: btnBefore, redact: btnRedact }[s] || null;
  }

  function hide() {
    if (!shown) return;
    var b = buttonFor(shown);
    if (b) b.classList.remove('hint-pulse');
    ghost.classList.remove('on');
    shown = null;
  }

  function show() {
    if (playing) return;
    if (document.hidden || !onScreen()) { restart(); return; }
    if (startPlaying()) return;
    var s = step();
    if (!s || (shows[s] || 0) >= MAX_SHOWS) return;
    var b = buttonFor(s);
    if (b && b.disabled) return;
    shows[s] = (shows[s] || 0) + 1;
    shown = s;
    if (s === 'scroll') ghost.classList.add('on');
    else if (b) b.classList.add('hint-pulse');
  }

  function restart() {
    clearTimeout(timer);
    timer = setTimeout(show, touched || plays >= MAX_PLAYS ? IDLE : AUTO_IDLE);
  }

  // MARK: Input

  function activity() {
    var wasPlaying = playing;
    touched = true;
    stopPlaying(true);
    hide();
    if (wasPlaying) { done = {}; shows = {}; }
    restart();
  }

  ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(function (type) {
    demo.addEventListener(type, activity, { passive: true, capture: true });
  });
  screen.addEventListener('scroll', function () {
    if (playing) return;
    if (shown === 'scroll' && scrolledToTarget()) hide();
    restart();
  }, { passive: true });
  window.addEventListener('scroll', function () {
    if (shown && !onScreen()) hide();
  }, { passive: true });

  // Clicks made by the autoplay don't count as the visitor's progress.
  function mark(key) { return function () { if (!playing) done[key] = true; }; }
  btnClean.addEventListener('click', mark('clean'));
  btnApply.addEventListener('click', mark('apply'));
  btnBefore.addEventListener('click', mark('compare'));
  btnAfter.addEventListener('click', mark('compare'));
  btnRedact.addEventListener('click', mark('redact'));
  btnReset.addEventListener('click', function () { if (!playing) { done = {}; shows = {}; } });

  restart();
})();
