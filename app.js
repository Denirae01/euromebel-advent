(function () {
  'use strict';

  var CFG = window.ADVENT_CONFIG || {};
  var TOKEN_KEY = 'em_advent_token';
  var ICONS = {
    sofa: 'M4 11V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3 M2 13a2 2 0 0 1 4 0v2h12v-2a2 2 0 0 1 4 0v4a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z M5 18v2 M19 18v2',
    bed: 'M2 4v16 M2 8h18a2 2 0 0 1 2 2v10 M2 17h20 M6 8v9',
    wardrobe: 'M5 3h14v18H5z M12 3v18 M9.5 12h.01 M14.5 12h.01 M7 21v1 M17 21v1',
    gift: 'M3 8h18v4H3z M12 8v13 M19 12v9H5v-9 M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5',
    truck: 'M14 17V6H2v11h2 M14 9h4l4 4v4h-2 M9 17h6 M6.5 19.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4z M17.5 19.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
    star: 'M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z',
    tools: 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9z',
    chair: 'M7 18v-6a5 5 0 0 1 10 0v6 M5 11a2 2 0 0 1 2 2v3h10v-3a2 2 0 0 1 4 0v5H3v-5a2 2 0 0 1 2-2z M6 18v3 M18 18v3',
    table: 'M3 9h18 M5 9v11 M19 9v11 M8 9V5h8v4',
    percent: 'M19 5L5 19 M6.5 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z M17.5 20a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z'
  };
  var BULBS = ['#FFC94A', '#5CC8FF', '#FFFFFF', '#6BE38A'];
  var WD = ['Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье', 'Понедельник']; // 1 декабря 2026 — вторник

  var S = { st: null, token: null, clockOffset: 0, busy: false, lastFocus: null, timer: null, pendingOpen: false };

  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var icon = function (name) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + (ICONS[name] || ICONS.gift) + '"/></svg>'; };
  var store = {
    get: function (k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { window.localStorage.setItem(k, v); } catch (e) {} },
    del: function (k) { try { window.localStorage.removeItem(k); } catch (e) {} }
  };

  /* ── API ── */
  function api(action, body) {
    body = Object.assign({ action: action }, body || {});
    if (window.ADVENT_DEMO_API) return window.ADVENT_DEMO_API(body);
    if (!CFG.API_URL) return Promise.reject(new Error('API_URL не настроен в config.js'));
    return fetch(CFG.API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json(); });
  }

  function applyStatus(r) {
    if (!r || !r.ok) return;
    S.st = r;
    S.clockOffset = r.serverNow - Date.now();
    if (r.token) { S.token = r.token; store.set(TOKEN_KEY, r.token); }
    if (r.tokenInvalid) { S.token = null; store.del(TOKEN_KEY); }
    render();
  }

  /* ── Отрисовка дома и прогресса ── */
  function opened() { return (S.st && S.st.user && S.st.user.opened) || []; }

  function stateOf(d) {
    var st = S.st; var op = opened();
    if (op.indexOf(d) >= 0) return 'open';
    if (!st || st.phase === 'before') return 'future';
    if (st.phase === 'after') return 'missed';
    if (d < st.today) return 'missed';
    if (d === st.today) return st.windowOpen ? 'today' : 'future';
    return 'future';
  }

  function buildStatic() {
    var g = $('garland'); var html = '';
    for (var i = 0; i < 22; i++) {
      var y = Math.round(Math.sin((i / 21) * Math.PI) * 10);
      html += '<span class="bulb" style="background:' + BULBS[i % 4] + ';box-shadow:0 0 10px 2px ' + BULBS[i % 4] + ';transform:translateY(' + y + 'px);animation-delay:' + ((i % 5) * 0.3).toFixed(1) + 's"></span>';
    }
    g.innerHTML = html;

    var w = ''; for (var d = 1; d <= 30; d++) {
      w += '<button class="win" type="button" data-day="' + d + '">' +
        '<span class="frame"><span class="inside"><span class="ic"></span><span>' + d + '</span></span>' +
        '<span class="shutter l"></span><span class="shutter r"></span><span class="num">' + d + '</span></span>' +
        '<span class="sill"></span></button>';
    }
    $('windows').innerHTML = w;
    $('windows').addEventListener('click', function (e) {
      var b = e.target.closest('.win'); if (b) onWindow(Number(b.getAttribute('data-day')), b);
    });
    $('door').addEventListener('click', function () { onWindow(31, $('door')); });
    $('cta').addEventListener('click', onCta);

    var seg = ''; for (var k = 1; k <= 31; k++) seg += '<span class="seg" data-d="' + k + '"></span>';
    $('segs').innerHTML = seg;

    var snow = $('snow'); var fl = '';
    var seed = 7; var rnd = function () { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    for (var f = 0; f < 60; f++) {
      var s = (2 + rnd() * 4).toFixed(1);
      fl += '<span class="flake" style="left:' + (rnd() * 100).toFixed(1) + '%;width:' + s + 'px;height:' + s + 'px;opacity:' + (0.25 + rnd() * 0.6).toFixed(2) +
        ';animation-duration:' + (9 + rnd() * 14).toFixed(1) + 's;animation-delay:-' + (rnd() * 20).toFixed(1) + 's"></span>';
    }
    snow.innerHTML = fl;
  }

  function render() {
    var st = S.st; if (!st) return;
    var op = opened();
    var itemsByDay = {};
    ((st.user && st.user.items) || []).forEach(function (it) { itemsByDay[it.day] = it; });

    var wins = document.querySelectorAll('.win');
    for (var i = 0; i < wins.length; i++) {
      var b = wins[i]; var d = i + 1; var s = stateOf(d);
      b.className = 'win is-' + s;
      var it = itemsByDay[d];
      b.querySelector('.ic').innerHTML = it ? icon(it.icon) : icon('gift');
      var tag = b.querySelector('.tag');
      if (s === 'today' && !tag) { tag = document.createElement('span'); tag.className = 'tag'; tag.textContent = 'Сегодня'; b.insertBefore(tag, b.firstChild); }
      if (s !== 'today' && tag) tag.remove();
      b.setAttribute('aria-label', 'Окно ' + d + ': ' + ({ open: 'открыто', today: 'сегодня, открыть', missed: 'пропущено', future: 'откроется ' + d + ' декабря' })[s]);
    }
    var ds = stateOf(31); var door = $('door');
    door.className = 'door' + (ds === 'today' ? ' is-today' : ds === 'open' ? ' is-open' : '');

    var segs = document.querySelectorAll('.seg');
    for (var k = 0; k < segs.length; k++) {
      var dd = k + 1; var ss = stateOf(dd);
      segs[k].className = 'seg' + (ss === 'open' ? ' on' : ss === 'missed' && st.phase === 'live' ? ' missed' : ss === 'today' ? ' today' : '');
    }

    $('opened-count').textContent = op.length;
    var left = Math.max(0, st.drawThreshold - op.length);
    $('goal').textContent = st.phase === 'after'
      ? 'Акция завершена. Спасибо, что заглядывали в Новогодний дом!'
      : left > 0
        ? 'Откройте ' + st.drawThreshold + ' окон — и 31 декабря участвуете в розыгрыше дивана. Осталось ' + left + '.'
        : 'Вы в розыгрыше дивана 31 декабря. Открывайте дальше — подарки ещё будут.';

    renderCountdownCard();
    renderCta();
  }

  function nowMs() { return Date.now() + S.clockOffset; }

  function hms(ms) {
    if (ms < 0) ms = 0;
    var t = Math.floor(ms / 1000);
    var h = Math.floor(t / 3600); var m = Math.floor((t % 3600) / 60); var s = t % 60;
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return (h > 47 ? Math.floor(h / 24) + ' дн. ' + p(h % 24) : p(h)) + ':' + p(m) + ':' + p(s);
  }

  function renderCountdownCard() {
    var st = S.st;
    if (st.phase === 'before') {
      var days = Math.ceil((st.nextOpenAt - nowMs()) / 86400000);
      $('right-label').textContent = 'До старта';
      $('right-value').innerHTML = Math.max(0, days) + ' <small>дн.</small>';
    } else {
      $('right-label').textContent = 'До Нового года';
      $('right-value').innerHTML = st.daysToNewYear + ' <small>дн.</small>';
    }
  }

  function renderCta() {
    var st = S.st; var cta = $('cta'); var note = $('cta-note');
    cta.disabled = false;
    if (st.phase === 'before') {
      cta.textContent = S.token ? 'Вы в списке — старт 1 декабря' : 'Записаться заранее';
      cta.disabled = !!S.token;
      note.innerHTML = 'Первое окно загорится<br>1 декабря в ' + st.openHour + ':00';
    } else if (st.phase === 'after') {
      cta.textContent = 'Акция завершена'; cta.disabled = true; note.textContent = '';
    } else if (!st.windowOpen) {
      cta.textContent = 'Окно ' + st.today + ' декабря загорится в ' + st.openHour + ':00';
      note.innerHTML = 'Осталось <b>' + hms(st.nextOpenAt - nowMs()) + '</b>';
    } else if (opened().indexOf(st.today) >= 0) {
      cta.textContent = 'Посмотреть окно ' + st.today + ' декабря';
      note.innerHTML = st.today < 31 ? 'Следующее окно — завтра<br>в ' + st.openHour + ':00' : 'С Новым годом!';
    } else {
      cta.textContent = 'Открыть окно ' + st.today + ' декабря';
      note.innerHTML = 'Пропущенное окно<br>не откроется снова';
    }
  }

  /* ── Клики ── */
  function onCta() {
    var st = S.st; if (!st) return;
    if (st.phase === 'before') return openPhoneDialog(0);
    if (st.phase === 'live') {
      var el = st.today === 31 ? $('door') : document.querySelector('.win[data-day="' + st.today + '"]');
      if (el && el.scrollIntoView && window.innerWidth <= 1180) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      onWindow(st.today, el);
    }
  }

  function onWindow(d, el) {
    var st = S.st; if (!st || S.busy) return;
    var s = stateOf(d);
    var item = ((st.user && st.user.items) || []).filter(function (x) { return x.day === d; })[0];
    if (s === 'open' && item) return showOffer(item);
    if (st.phase === 'before') return S.token ? showInfo('blue', d, 'Откроется ' + d + ' декабря', 'Первое окно загорится 1 декабря в ' + st.openHour + ':00. Что внутри — секрет до утра.') : openPhoneDialog(d);
    if (st.phase === 'after') return showInfo('grey', d, 'Акция завершена', 'Новогодний дом закрылся до следующего декабря. Спасибо, что заглядывали!');
    if (s === 'missed') return showInfo('grey', d, 'Это окно пропущено', 'Предложение этого дня уже сгорело. Но сегодняшнее окно ещё ждёт — и до розыгрыша главного приза время есть.', { label: 'К сегодняшнему окну', fn: function () { closeDialog(); onCta(); } });
    if (d > st.today || (d === st.today && !st.windowOpen)) return showWaiting(d);
    // Сегодняшнее окно
    if (!S.token) return openPhoneDialog(d);
    doOpen(d, el);
  }

  function doOpen(d, el) {
    S.busy = true;
    var started = Date.now();
    if (el) el.classList.add('is-open');
    api('open', { token: S.token, day: d }).then(function (r) {
      var wait = Math.max(0, 850 - (Date.now() - started));
      setTimeout(function () {
        S.busy = false;
        if (r && r.ok) { applyStatus(r); showOffer(r.item); }
        else if (r && r.error === 'no_user') { S.token = null; store.del(TOKEN_KEY); render(); openPhoneDialog(d); }
        else if (r && r.error === 'not_open_yet') { refresh(); showWaiting(d); }
        else { render(); toast('Не получилось открыть окно. Попробуйте ещё раз.'); }
      }, wait);
    }).catch(function () { S.busy = false; render(); toast('Нет связи. Проверьте интернет и попробуйте ещё раз.'); });
  }

  /* ── Диалоги ── */
  function head(kind, day, title) {
    var mini = '';
    for (var i = 0; i < 16; i++) mini += '<span class="bulb" style="background:' + BULBS[i % 4] + ';transform:translateY(' + Math.round(Math.sin((i / 15) * Math.PI) * 6) + 'px);animation-delay:' + ((i % 4) * 0.35).toFixed(1) + 's"></span>';
    return '<div class="dialog-head ' + kind + '"><div class="mini" aria-hidden="true">' + mini + '</div>' +
      (day ? '<span class="kicker">Окно № ' + day + '</span>' : '<span class="kicker">Новогодний дом</span>') +
      '<h2 id="dlg-title">' + esc(title) + '</h2>' +
      '<button class="close" type="button" data-close aria-label="Закрыть"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>';
  }

  function openDialog(html, focusSel) {
    S.lastFocus = document.activeElement;
    $('dialog').innerHTML = html;
    $('overlay').hidden = false;
    document.body.style.overflow = 'hidden';
    var f = $('dialog').querySelector(focusSel || '[data-autofocus]') || $('dialog').querySelector('button, input, a');
    if (f) f.focus();
  }

  function closeDialog() {
    $('overlay').hidden = true;
    $('dialog').innerHTML = '';
    document.body.style.overflow = '';
    clearInterval(S.timer);
    if (S.lastFocus && S.lastFocus.focus) S.lastFocus.focus();
  }

  function showOffer(it) {
    var st = S.st; var d = it.day;
    var isToday = st.phase === 'live' && d === st.today;
    var title = WD[(d - 1) % 7] + ', ' + d + ' декабря';
    var html = head(isToday ? '' : 'blue', d, title) + '<div class="dialog-body">' +
      '<div class="offer"><span class="ico">' + icon(it.icon) + '</span><div><span class="big' + (it.big.length > 6 ? ' long' : '') + '">' + esc(it.big) + '</span><span class="sub">' + esc(it.sub) + '</span></div></div>';
    if (it.code) {
      if (it.active) {
        html += '<div class="code"><div><span class="lbl">Ваш промокод</span><span class="val" id="code-val">' + esc(it.code) + '</span></div>' +
          '<button class="btn btn-outline" type="button" id="copy-btn">Скопировать</button></div>' +
          '<span class="terms">Действует до ' + esc(it.untilText) + ' на euromebel.kz и во всех салонах EuroMebel. Назовите промокод или номер телефона на кассе. Один промокод — одна покупка.' + (it.terms ? ' ' + esc(it.terms) : '') + '</span>';
      } else {
        html += '<span class="terms">' + (it.redeemed ? 'Промокод ' + esc(it.code) + ' уже использован.' : 'Срок действия закончился в ' + esc(it.untilText) + '.') + '</span>';
      }
    } else {
      html += '<span class="terms">Вы участвуете. ' + (d === 31 ? 'Победителя объявим по правилам акции и позвоним по номеру, который вы оставили.' : 'Итоги объявим по правилам акции и позвоним победителю.') + (it.terms ? ' ' + esc(it.terms) : '') + '</span>';
    }
    var next = isToday && d < 31 ? 'Завтра в ' + st.openHour + ':00 — окно № ' + (d + 1) : '';
    html += '<div class="actions"><a class="btn btn-red" href="' + esc(safeLink(it.link)) + '" target="_blank" rel="noopener">' + esc(it.cta) + '</a>' +
      (next ? '<span class="next">' + next + '</span>' : '') + '</div></div>';
    openDialog(html, '#copy-btn');
    var cb = $('copy-btn');
    if (cb) cb.addEventListener('click', function () { copy(it.code); cb.textContent = 'Скопировано'; });
  }

  function safeLink(u) { return /^https?:\/\//i.test(String(u || '')) ? u : 'https://euromebel.kz/'; }

  function showInfo(kind, d, title, text, action) {
    var html = head(kind, d, title) + '<div class="dialog-body"><p>' + esc(text) + '</p>' +
      (action ? '<button class="btn btn-red" type="button" id="info-act" style="align-self:flex-start">' + esc(action.label) + '</button>'
        : '<button class="btn btn-blue" type="button" data-close style="align-self:flex-start">Понятно</button>') + '</div>';
    openDialog(html);
    if (action) $('info-act').addEventListener('click', action.fn);
  }

  function showWaiting(d) {
    var st = S.st;
    var target = st.nextOpenAt;
    if (d !== st.today || st.windowOpen) {
      // окно в будущем
      return showInfo('blue', d, 'Откроется ' + d + ' декабря в ' + st.openHour + ':00', 'Что внутри — секрет до утра. Каждый день в ' + st.openHour + ':00 загорается новое окно — заходите, чтобы не пропустить.');
    }
    var html = head('blue', d, 'Окно загорится в ' + st.openHour + ':00') + '<div class="dialog-body">' +
      '<p>Осталось совсем немного:</p><span class="countdown" id="cd">' + hms(target - nowMs()) + '</span>' +
      '<button class="btn btn-blue" type="button" data-close style="align-self:flex-start">Понятно</button></div>';
    openDialog(html);
    clearInterval(S.timer);
    S.timer = setInterval(function () {
      var left = target - nowMs();
      var cd = $('cd'); if (cd) cd.textContent = hms(left);
      if (left <= 0) { clearInterval(S.timer); closeDialog(); refresh(); }
    }, 1000);
  }

  function openPhoneDialog(d) {
    var st = S.st;
    var before = st.phase === 'before';
    var html = head('', d || 0, before ? 'Запишитесь заранее' : 'Окно уже светится — осталось войти') + '<div class="dialog-body">' +
      '<form class="phone-form" id="phone-form" novalidate>' +
      '<p>' + (before
        ? 'Оставьте номер — и 1 декабря в ' + st.openHour + ':00 откройте первое окно одним нажатием.'
        : 'Оставьте номер телефона один раз — и открывайте окна весь декабрь. По этому номеру салон найдёт ваши промокоды.') + '</p>' +
      '<label class="field-label" for="phone">Номер телефона</label>' +
      '<div class="field"><input id="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="+7 (7__) ___-__-__" data-autofocus>' +
      '<button class="btn btn-red" type="submit" id="phone-submit">' + (before ? 'Записаться' : 'Открыть окно') + '</button></div>' +
      '<label class="consent"><input type="checkbox" id="consent"><span>Согласен(на) на сбор и обработку персональных данных и получение сообщений от EuroMebel, с <a href="rules.html" target="_blank">правилами акции</a> ознакомлен(а).</span></label>' +
      '<span class="error" id="phone-error" role="alert"></span>' +
      '</form></div>';
    openDialog(html, '#phone');
    var input = $('phone');
    input.addEventListener('input', function () { input.value = formatPhone(input.value); $('phone-error').textContent = ''; });
    input.addEventListener('focus', function () { if (!input.value) input.value = '+7 ('; });
    $('phone-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var digits = phoneDigits(input.value);
      if (!digits) { $('phone-error').textContent = 'Введите мобильный номер Казахстана: +7 7XX XXX XX XX'; input.focus(); return; }
      if (!$('consent').checked) { $('phone-error').textContent = 'Нужно согласие на обработку данных'; return; }
      var btn = $('phone-submit'); btn.disabled = true;
      api('register', { phone: '+' + digits, consent: true, source: source() }).then(function (r) {
        btn.disabled = false;
        if (!r || !r.ok) { $('phone-error').textContent = r && r.error === 'bad_phone' ? 'Проверьте номер телефона' : 'Не получилось. Попробуйте ещё раз.'; return; }
        applyStatus(r);
        closeDialog();
        var st2 = S.st;
        if (st2.phase === 'live' && st2.windowOpen && opened().indexOf(st2.today) < 0) {
          var el = st2.today === 31 ? $('door') : document.querySelector('.win[data-day="' + st2.today + '"]');
          if (el && el.scrollIntoView && window.innerWidth <= 1180) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          setTimeout(function () { doOpen(st2.today, el); }, 350);
        } else if (st2.phase === 'before') {
          toast('Готово! Ждём вас 1 декабря в ' + st2.openHour + ':00');
        }
      }).catch(function () { btn.disabled = false; $('phone-error').textContent = 'Нет связи. Попробуйте ещё раз.'; });
    });
  }

  /* ── Телефон ── */
  function phoneDigits(v) {
    var d = String(v).replace(/\D/g, '');
    if (d.length === 11 && d.charAt(0) === '8') d = '7' + d.slice(1);
    if (d.length === 10) d = '7' + d;
    return d.length === 11 && d.slice(0, 2) === '77' ? d : null;
  }

  function formatPhone(v) {
    var s = String(v);
    var local;
    if (/^\s*\+7/.test(s)) local = s.replace(/^\s*\+7/, '').replace(/\D/g, '');
    else {
      var d = s.replace(/\D/g, '');
      local = d.length >= 11 && (d.charAt(0) === '7' || d.charAt(0) === '8') ? d.slice(1) : d;
    }
    local = local.slice(0, 10);
    var out = '+7 (' + local.slice(0, 3);
    if (local.length >= 3) out += ')';
    if (local.length > 3) out += ' ' + local.slice(3, 6);
    if (local.length > 6) out += '-' + local.slice(6, 8);
    if (local.length > 8) out += '-' + local.slice(8, 10);
    return out;
  }

  function source() {
    try { var p = new URLSearchParams(location.search); return p.get('utm_source') || p.get('src') || document.referrer.split('/')[2] || ''; } catch (e) { return ''; }
  }

  /* ── Прочее ── */
  function copy(text) {
    try { navigator.clipboard.writeText(text); } catch (e) {}
    toast('Промокод скопирован');
  }

  var toastT;
  function toast(msg) {
    var t = $('toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(function () { t.hidden = true; }, 2600);
  }

  function refresh() {
    return api('status', { token: S.token || undefined }).then(applyStatus).catch(function (e) {
      $('cta').textContent = 'Сервис временно недоступен';
      $('cta').disabled = true;
      if (window.console) console.error(e);
    });
  }

  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-close]')) closeDialog();
    else if (e.target === $('overlay')) closeDialog();
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('overlay').hidden) closeDialog(); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) refresh(); });

  // Тиканье таймера в кнопке и переход в 10:00
  setInterval(function () {
    var st = S.st; if (!st) return;
    if (st.nextOpenAt && nowMs() >= st.nextOpenAt) { st.nextOpenAt = null; refresh(); return; }
    if (st.phase === 'live' && !st.windowOpen) renderCta();
  }, 1000);

  buildStatic();
  S.token = store.get(TOKEN_KEY);
  refresh();
})();
