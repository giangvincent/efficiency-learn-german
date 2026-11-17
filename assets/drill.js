/* Reusable fill-in drill widget.
   Author a gap like:
     <span class="drill-gap" data-answer="den"
           data-accept="den|'n" data-explain="der Laptop → maskulin → Akkusativ"></span>
   The script adds an input, grades on Enter/blur, gives a second try before
   revealing the answer, and updates any element with class "drill-score". */
(function () {
  'use strict';

  function norm(s) {
    return (s || '').toLowerCase().trim().replace(/[.!?,;:]/g, '').replace(/\s+/g, ' ');
  }

  function boot() {
    var gaps = Array.prototype.slice.call(document.querySelectorAll('.drill-gap'));
    if (!gaps.length) return;
    var scoreEls = Array.prototype.slice.call(document.querySelectorAll('.drill-score'));

    function total() {
      scoreEls.forEach(function (scoreEl) {
        var scope = (scoreEl.closest && scoreEl.closest('section')) || document;
        var list = scope.querySelectorAll('.drill-gap');
        var ok = 0;
        Array.prototype.forEach.call(list, function (g) {
          if (g.classList.contains('ok')) ok++;
        });
        scoreEl.textContent = ok + ' / ' + list.length + ' richtig';
      });
    }

    gaps.forEach(function (gap) {
      if (gap.dataset.ready) return;
      gap.dataset.ready = '1';

      var answer = gap.dataset.answer || '';
      var accept = (gap.dataset.accept || '').split('|').map(norm).filter(Boolean);
      accept.push(norm(answer));
      var explain = gap.dataset.explain || '';
      var tries = 0;

      var input = document.createElement('input');
      input.type = 'text';
      input.className = 'drill-input';
      input.autocomplete = 'off';
      input.spellcheck = false;
      input.setAttribute('aria-label', 'Lücke ausfüllen');

      var fb = document.createElement('span');
      fb.className = 'drill-fb';

      gap.appendChild(input);
      gap.appendChild(fb);

      function check() {
        var v = norm(input.value);
        if (!v) return;
        var ok = accept.indexOf(v) !== -1;
        if (ok) {
          gap.classList.add('ok');
          gap.classList.remove('no');
          fb.textContent = '✓';
        } else {
          tries++;
          gap.classList.add('no');
          fb.textContent = tries >= 2 ? '✗ ' + answer : '✗ nochmal versuchen';
        }
        if (explain) fb.title = explain;
        total();
      }

      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); check(); }
      });
      input.addEventListener('blur', check);
      input.addEventListener('input', function () {
        gap.classList.remove('ok', 'no');
        fb.textContent = '';
        tries = 0;
      });
    });

    total();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
