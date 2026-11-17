/* Reusable German text-to-speech widget.
   Add data-speak="der Fehler" to any element and it gets a speaker button.
   If the element has no data-speak, its trimmed textContent is spoken.
   Enable the tempo toolbar by adding class "speech-toolbar-on" to <body>. */
(function () {
  'use strict';

  var synth = window.speechSynthesis;
  if (!synth || typeof SpeechSynthesisUtterance === 'undefined') return;

  var ICON =
    '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" focusable="false">' +
    '<path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/>' +
    '<path d="M16.2 8.6a4.8 4.8 0 0 1 0 6.8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>' +
    '<path d="M18.7 6.2a8.2 8.2 0 0 1 0 11.6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>' +
    '</svg>';

  var PAGE_LANG = document.documentElement.lang || 'de-DE';
  var LANG_PREFIX = PAGE_LANG.split('-')[0].toLowerCase();
  var deVoice = null;
  var rate = 0.95;
  try { rate = parseFloat(localStorage.getItem('de-rate') || '') || 0.95; } catch (e) {}

  function refreshVoices() {
    var list = synth.getVoices() || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].lang.toLowerCase().indexOf(LANG_PREFIX) === 0) { deVoice = list[i]; break; }
    }
    if (!deVoice) {
      for (var j = 0; j < list.length; j++) {
        if (list[j].lang.toLowerCase().indexOf(LANG_PREFIX) === 0) { deVoice = list[j]; break; }
      }
    }
  }
  refreshVoices();
  if (typeof synth.onvoiceschanged !== 'undefined') synth.onvoiceschanged = refreshVoices;

  function speak(text) {
    if (!text) return;
    try { synth.cancel(); } catch (e) {}
    var u = new SpeechSynthesisUtterance(text);
    u.lang = PAGE_LANG;
    if (deVoice) u.voice = deVoice;
    u.rate = rate;
    u.pitch = 1;
    synth.speak(u);
  }

  function attach(el) {
    var text = (el.getAttribute('data-speak') || el.textContent || '').trim();
    if (!text) return;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'speak-btn no-print';
    btn.title = 'Anhören';
    btn.setAttribute('aria-label', 'Aussprache anhören: ' + text);
    btn.innerHTML = ICON;
    btn.addEventListener('click', function (e) { e.preventDefault(); speak(text); });
    el.insertAdjacentElement('afterend', btn);
  }

  function instrument(root) {
    var nodes = (root || document).querySelectorAll('[data-speak]');
    Array.prototype.forEach.call(nodes, function (el) {
      if (el.getAttribute('data-speak-ready')) return;
      el.setAttribute('data-speak-ready', '1');
      attach(el);
    });
  }

  function toolbar() {
    var bar = document.createElement('div');
    bar.className = 'speech-toolbar no-print';
    bar.innerHTML =
      '<label>Tempo <input type="range" min="0.6" max="1.2" step="0.05" value="' + rate + '"></label>' +
      '<span class="speech-info"></span>';
    var input = bar.querySelector('input');
    var info = bar.querySelector('.speech-info');
    function upd() { info.textContent = Math.round(rate * 100) + '%'; }
    input.addEventListener('input', function () {
      rate = parseFloat(input.value);
      try { localStorage.setItem('de-rate', String(rate)); } catch (e) {}
      upd();
    });
    upd();
    document.body.appendChild(bar);
  }

  function boot() {
    instrument(document);
    if (document.body.classList.contains('speech-toolbar-on')) toolbar();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
