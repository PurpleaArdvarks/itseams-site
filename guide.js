/* itSeams demo guide: after a few idle seconds, points at the next step (a pulsing button, or a
   finger swiping up inside the phone). Any touch, key or scroll hides it. Each step's hint shows at
   most twice, and none once the demo has been tried. Shows only while the phone is on screen. */
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
  var target = demo.querySelector('.band[data-cut="Inline video"]') || demo.querySelector('.band[data-cut]:not(.band-sbar)');

  var IDLE = 3000;      // ms without input before a hint shows
  var MAX_SHOWS = 2;    // per step

  var ghost = document.createElement('div');
  ghost.className = 'ghost';
  ghost.setAttribute('aria-hidden', 'true');
  ghost.innerHTML = '<span class="ghost-trail"></span><span class="ghost-dot"></span><span class="ghost-label">Scroll</span>';
  phone.appendChild(ghost);

  var done = {};        // step -> true once the visitor has done it
  var shows = {};       // step -> times its hint has shown
  var timer = 0;
  var shown = null;     // the step whose hint is up

  // At least half the phone is in the window.
  function onScreen() {
    var r = phone.getBoundingClientRect();
    return Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0) >= r.height / 2;
  }

  function scrolledToTarget() {
    if (!target) return true;
    return screen.scrollTop + screen.clientHeight * 0.6 >= target.offsetTop;
  }

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
    var s = step();
    if (!s || (shows[s] || 0) >= MAX_SHOWS) return;
    if (document.hidden || !onScreen()) { restart(); return; }
    var b = buttonFor(s);
    if (b && b.disabled) return;
    shows[s] = (shows[s] || 0) + 1;
    shown = s;
    if (s === 'scroll') ghost.classList.add('on');
    else if (b) b.classList.add('hint-pulse');
  }

  function restart() {
    clearTimeout(timer);
    timer = setTimeout(show, IDLE);
  }

  function activity() {
    hide();
    restart();
  }

  ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(function (type) {
    demo.addEventListener(type, activity, { passive: true });
  });
  screen.addEventListener('scroll', function () {
    if (shown === 'scroll' && scrolledToTarget()) hide();
    restart();
  }, { passive: true });

  btnClean.addEventListener('click', function () { done.clean = true; });
  btnApply.addEventListener('click', function () { done.apply = true; });
  btnBefore.addEventListener('click', function () { done.compare = true; });
  btnAfter.addEventListener('click', function () { done.compare = true; });
  btnRedact.addEventListener('click', function () { done.redact = true; });
  if (btnReset) btnReset.addEventListener('click', function () { done = {}; shows = {}; });

  window.addEventListener('scroll', function () {
    if (shown && !onScreen()) hide();
  }, { passive: true });

  restart();
})();
