/* Reusable German speaking-practice widget.
   Author a target sentence like:
     <p class="sprechen-item" data-say="Ich arbeite an dem neuen Projekt."></p>
   The script adds a microphone button (browser speech recognition, de-DE) that
   scores what it heard against the target, plus record / replay buttons that
   work in any browser. Add class "sprechen-score" to an element to show
   "n / m gesprochen" for the items in that section.

   Note: speech recognition needs Chrome, Edge or Safari and (in Chrome) an
   internet connection. On file:// it may be blocked, so serve the lessons over
   a local web server when you want to speak. */
(function () {
  'use strict';

  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;

  var MIC =
    '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" focusable="false">' +
    '<path d="M12 3.2a2.6 2.6 0 0 1 2.6 2.6v5.6a2.6 2.6 0 0 1-5.2 0V5.8A2.6 2.6 0 0 1 12 3.2z" fill="currentColor"/>' +
    '<path d="M6.6 11.2a5.4 5.4 0 0 0 10.8 0" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>' +
    '<path d="M12 16.6V21" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>' +
    '</svg>';

  var DOT =
    '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" focusable="false">' +
    '<circle cx="12" cy="12" r="6" fill="currentColor"/>' +
    '</svg>';

  var TRI =
    '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" focusable="false">' +
    '<path d="M8 5.5v13l10-6.5-10-6.5z" fill="currentColor"/>' +
    '</svg>';

  var PAGE_LANG = document.documentElement.lang || 'de-DE';

  function norm(s) {
    return (s || '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function score(target, heard) {
    var tn = norm(target);
    var hn = norm(heard);
    // shortcut: unsegmented scripts (CJK) have no word spaces — score per
    // character instead of per word; upgrade to bigrams if precision matters
    if (tn && tn.indexOf(' ') < 0) {
      var bag = {};
      hn.split('').forEach(function (c) { bag[c] = (bag[c] || 0) + 1; });
      var chit = 0, cmissing = [];
      tn.split('').forEach(function (c) {
        if (bag[c]) { bag[c]--; chit++; } else { cmissing.push(c); }
      });
      var cextra = 0;
      Object.keys(bag).forEach(function (k) { cextra += bag[k]; });
      return { ratio: tn.length ? chit / tn.length : 0, missing: cmissing, extra: cextra };
    }
    var t = tn.split(' ').filter(Boolean);
    var h = hn.split(' ').filter(Boolean);
    var bag = {};
    h.forEach(function (w) { bag[w] = (bag[w] || 0) + 1; });
    var hit = 0;
    var missing = [];
    t.forEach(function (w) {
      if (bag[w]) { bag[w]--; hit++; } else { missing.push(w); }
    });
    var extra = 0;
    Object.keys(bag).forEach(function (k) { extra += bag[k]; });
    return { ratio: t.length ? hit / t.length : 0, missing: missing, extra: extra };
  }

  function boot() {
    var items = Array.prototype.slice.call(document.querySelectorAll('.sprechen-item'));
    if (!items.length) return;

    var scoreEls = Array.prototype.slice.call(document.querySelectorAll('.sprechen-score'));
    var current = null;

    function total() {
      scoreEls.forEach(function (scoreEl) {
        var scope = (scoreEl.closest && scoreEl.closest('section')) || document;
        var list = scope.querySelectorAll('.sprechen-item');
        var ok = 0;
        Array.prototype.forEach.call(list, function (it) {
          if (it.classList.contains('ok')) ok++;
        });
        scoreEl.textContent = ok + ' / ' + list.length + ' gesprochen';
      });
    }

    function feedback(fb, item, target, heard) {
      var s = score(target, heard);
      item.dataset.heard = heard || '';
      item.classList.remove('ok', 'no');
      fb.className = 'sprechen-fb';

      if (!norm(heard)) {
        fb.classList.add('no');
        fb.textContent = 'Nichts gehört — sprich noch einmal.';
        return;
      }
      if (s.ratio >= 0.85 && s.extra <= 2) {
        item.classList.add('ok');
        fb.classList.add('ok');
        fb.textContent = '✓ Sehr gut — ' + Math.round(s.ratio * 100) + '% erkannt.';
      } else if (s.ratio >= 0.5) {
        fb.classList.add('warn');
        fb.textContent = '≈ Fast. Es fehlte: ' + s.missing.slice(0, 4).join(', ') + '.';
      } else {
        item.classList.add('no');
        fb.classList.add('no');
        fb.textContent = '✗ Ich hörte: „' + heard + '“';
      }
    }

    items.forEach(function (item) {
      if (item.dataset.sprechenReady) return;
      item.dataset.sprechenReady = '1';

      var target = (item.getAttribute('data-say') || item.textContent || '').trim();

      var bar = document.createElement('span');
      bar.className = 'sprechen-bar no-print';

      var mic = document.createElement('button');
      mic.type = 'button';
      mic.className = 'sprechen-btn sprechen-mic';
      mic.innerHTML = MIC;
      mic.title = 'Satz laut sprechen';
      mic.setAttribute('aria-label', 'Satz laut sprechen: ' + target);

      var rec = document.createElement('button');
      rec.type = 'button';
      rec.className = 'sprechen-btn sprechen-rec';
      rec.innerHTML = DOT;
      rec.title = 'Aufnehmen';
      rec.setAttribute('aria-label', 'Aufnahme starten: ' + target);

      var play = document.createElement('button');
      play.type = 'button';
      play.className = 'sprechen-btn sprechen-play';
      play.innerHTML = TRI;
      play.title = 'Aufnahme anhören';
      play.setAttribute('aria-label', 'Aufnahme anhören: ' + target);
      play.disabled = true;

      var fb = document.createElement('span');
      fb.className = 'sprechen-fb';

      bar.appendChild(mic);
      if (navigator.mediaDevices && window.MediaRecorder) {
        bar.appendChild(rec);
        bar.appendChild(play);
      }
      item.insertAdjacentElement('afterend', bar);
      bar.insertAdjacentElement('afterend', fb);

      mic.addEventListener('click', function () {
        if (!SR) {
          fb.className = 'sprechen-fb no';
          fb.textContent = 'Spracherkennung gibt es nur in Chrome, Edge oder Safari — nutze den Aufnahme-Knopf.';
          return;
        }
        if (current) { try { current.abort(); } catch (e) {} }

        var r = new SR();
        r.lang = PAGE_LANG;
        r.interimResults = false;
        r.maxAlternatives = 1;
        r.continuous = false;
        current = r;
        var settled = false;

        mic.classList.add('is-listening');
        fb.className = 'sprechen-fb';
        fb.textContent = 'Ich höre …';

        r.onresult = function (ev) {
          settled = true;
          feedback(fb, item, target, (ev.results[0] && ev.results[0][0] && ev.results[0][0].transcript) || '');
          total();
        };
        r.onerror = function (ev) {
          settled = true;
          var msg = {
            'not-allowed': 'Mikrofon blockiert — in der Adresszeile erlauben.',
            'service-not-allowed': 'Mikrofon blockiert — in der Adresszeile erlauben.',
            'no-speech': 'Nichts gehört — sprich noch einmal.',
            'audio-capture': 'Kein Mikrofon gefunden.',
            'network': 'Netzwerkfehler — die Erkennung braucht Internet (Chrome).'
          }[ev.error] || ('Fehler: ' + ev.error);
          fb.className = 'sprechen-fb no';
          fb.textContent = msg;
        };
        r.onend = function () {
          mic.classList.remove('is-listening');
          if (current === r) current = null;
          if (!settled && fb.textContent === 'Ich höre …') {
            fb.className = 'sprechen-fb no';
            fb.textContent = 'Nichts gehört — sprich noch einmal.';
          }
        };
        try {
          r.start();
        } catch (e) {
          mic.classList.remove('is-listening');
          fb.className = 'sprechen-fb no';
          fb.textContent = 'Erkennung startet nicht — Seite neu laden.';
        }
      });

      var recorder = null;
      var chunks = [];
      var blobUrl = null;

      rec.addEventListener('click', function () {
        if (recorder && recorder.state === 'recording') { recorder.stop(); return; }
        navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
          chunks = [];
          recorder = new MediaRecorder(stream);
          recorder.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
          recorder.onstop = function () {
            stream.getTracks().forEach(function (t) { t.stop(); });
            if (chunks.length) {
              if (blobUrl) URL.revokeObjectURL(blobUrl);
              blobUrl = URL.createObjectURL(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }));
              play.disabled = false;
              play.click();
            }
            rec.classList.remove('is-recording');
          };
          recorder.start();
          rec.classList.add('is-recording');
        }).catch(function () {
          fb.className = 'sprechen-fb no';
          fb.textContent = 'Kein Mikrofon-Zugriff.';
        });
      });

      play.addEventListener('click', function () {
        if (blobUrl) new Audio(blobUrl).play();
      });
    });

    total();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
