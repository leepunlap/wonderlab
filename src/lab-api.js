/*!
 * Wonder Lab — the API: the lab's ONE way out of the page.
 * Copyright (C) 2026 IITS (工信學堂（香港）). Licensed under the GNU Affero General Public License v3.0 (see LICENSE).
 *
 * Two things live here and nothing else:
 *   · the transport — every lab POST goes through lab-host.js's send(), the same one the teachers' playground uses.
 *     This file used to carry an inline fallback "for a page that runs lab.js without lab-host.js beside it"; the
 *     build never produces one, so the fallback was unreachable dead code and is gone (test/check_bundle.mjs now
 *     fails if a second POST shape appears in the bundle).
 *   · this page's READING of a lab reply — which HTTP shapes mean what. A body that is not JSON at all (an HTML
 *     error page from the proxy) is the soft "another turn is in flight" shape and keeps the 413 / 504 wording.
 *
 * The endpoints are options, not constants: lesson pages address /api/ai/lab/<data-ep> and /api/ai/status/<data-ep>
 * (the defaults, unchanged), the standalone entry can point elsewhere, and a page with no service at all can say so.
 *
 * ES5 on purpose (see lab-core.js).
 */
WLR.define('api', function (L) {
  'use strict';

  var LAB = '/api/ai/lab/', STATUS = '/api/ai/status/';

  function paths(urls) {
    var u = urls || {};
    if (typeof u.lab === 'string' && u.lab) LAB = u.lab;
    if (typeof u.status === 'string' && u.status) STATUS = u.status;
    if (u.lab === null || u.status === null) L.offline = true;      // no AI service on this page: do not pretend
  }
  function labUrl(ep) { return LAB + ep; }
  function statusUrl(ep) { return STATUS + ep; }

  function getJSON(u) {
    return fetch(u, { credentials: 'same-origin' }).then(function (r) { if (!r.ok) throw new Error(u + ' ' + r.status); return r.json(); });
  }
  /** The lab GET: caps, whether the Studio is open for this login, this student's last program, the wrap-up state. */
  function labGet(ep) {
    return fetch(labUrl(ep), { credentials: 'same-origin' }).then(function (r) {
      if (r.status === 401 || r.status === 403 || r.status === 404) return { soon: true };
      if (!r.ok) throw new Error('lab ' + r.status);
      return r.json();
    });
  }
  function statusGet(ep) { return getJSON(statusUrl(ep)); }

  /** One lab turn. Only the host's transport; there is no second implementation in this file any more. */
  function send(url, body, opt) {
    if (!L.host || typeof L.host.send !== 'function') return Promise.reject(new Error('WonderLabHost.send is missing'));
    return L.host.send(url, body, opt);
  }
  function labSend(ep, body, opt) { return send(labUrl(ep), body, opt); }

  /** This page's reading of a lab reply (see lab-host.js request(): {status, data, ok, retry}). */
  function reply(res) {
    var d = res.data || { ok: false, retry: res.retry, reason: res.status === 413 ? L.core.MSG.BIG : L.core.MSG.SLOW };
    d._status = res.status;
    return d;
  }
  /** The wrap-up's reading: a body that is not JSON must NOT look like "another turn is in flight". */
  function replyStrict(res) { var d = res.data || { ok: false }; d._status = res.status; return d; }

  return { getJSON: getJSON, labGet: labGet, status: statusGet, send: send, labSend: labSend,
           reply: reply, replyStrict: replyStrict, paths: paths, labUrl: labUrl, statusUrl: statusUrl };
});
