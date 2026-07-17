/* =============================================================================
   Yoni's Farewell — frontend logic
   ============================================================================= */
(function () {
  "use strict";

  var CFG = window.CONFIG || {};
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---- element helpers ------------------------------------------------------
  var $ = function (id) { return document.getElementById(id); };
  var els = {
    openForm: $("openFormBtn"),
    deadline: $("deadlineLine"),
    closedState: $("closedState"),
    overlay: $("overlay"),
    sheetClose: $("sheetClose"),
    stepSignin: $("stepSignin"),
    gsiButton: $("gsiButton"),
    orDivider: $("orDivider"),
    codeInput: $("codeInput"),
    codeSubmit: $("codeSubmit"),
    codeErr: $("codeErr"),
    stepForm: $("stepForm"),
    stepLoading: $("stepLoading"),
    stepDone: $("stepDone"),
    stepAlready: $("stepAlready"),
    loadingText: $("loadingText"),
    name: $("nameInput"),
    message: $("messageInput"),
    charCount: $("charCount"),
    charMax: $("charMax"),
    photoAdd: $("photoAdd"),
    photoInput: $("photoInput"),
    thumbs: $("thumbs"),
    submit: $("submitBtn"),
    formErr: $("formErr"),
    wallGrid: $("wallGrid"),
    wallEmpty: $("wallEmpty"),
    lightbox: $("lightbox"),
    lightboxImg: $("lightboxImg"),
    lightboxClose: $("lightboxClose"),
  };

  var state = {
    idToken: null,
    pin: null,            // party code, if used instead of Google
    photos: [],          // { data: base64, mime, previewUrl }
    seenPhotoIds: {},     // dedupe wall
    closed: false,
    submitting: false,
  };

  // Apply config-driven copy.
  if (els.deadline && CFG.DEADLINE_TEXT) els.deadline.textContent = CFG.DEADLINE_TEXT;
  if (els.charMax) els.charMax.textContent = String(CFG.MAX_MESSAGE_CHARS || 1000);

  var backendReady = CFG.APPS_SCRIPT_URL && CFG.APPS_SCRIPT_URL.indexOf("PASTE_") === -1;

  // ==========================================================================
  // Scroll reveal
  // ==========================================================================
  if (!reduceMotion && "IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
    }, { threshold: 0.12 });
    document.querySelectorAll(".reveal").forEach(function (el) { io.observe(el); });
  } else {
    document.querySelectorAll(".reveal").forEach(function (el) { el.classList.add("in"); });
  }

  // ==========================================================================
  // Overlay flow
  // ==========================================================================
  function openOverlay() {
    els.overlay.hidden = false;
    document.body.style.overflow = "hidden";
    // Always gate on the sign-in step (Google OR party code) until authed once.
    if (state.idToken || state.pin) showStep("form");
    else showStep("signin");
  }
  function closeOverlay() {
    els.overlay.hidden = true;
    document.body.style.overflow = "";
  }
  function showStep(name) {
    els.stepSignin.hidden = name !== "signin";
    els.stepForm.hidden = name !== "form";
    els.stepLoading.hidden = name !== "loading";
    els.stepDone.hidden = name !== "done";
    els.stepAlready.hidden = name !== "already";
  }

  function goToWall() {
    closeOverlay();
    var wall = document.getElementById("wall");
    if (wall) wall.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" });
    loadFeed();
  }

  els.openForm.addEventListener("click", function () {
    if (state.closed) return;
    openOverlay();
  });
  els.sheetClose.addEventListener("click", closeOverlay);
  els.overlay.addEventListener("click", function (e) {
    if (e.target.hasAttribute("data-close")) closeOverlay();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      if (!els.lightbox.hidden) closeLightbox();
      else if (!els.overlay.hidden) closeOverlay();
    }
  });

  // ==========================================================================
  // Google Sign-In (only if configured)
  // ==========================================================================
  function initGoogle() {
    if (!CFG.GOOGLE_CLIENT_ID) { hideGoogleUi(); return; }
    var tries = 0;
    var t = setInterval(function () {
      tries++;
      if (window.google && google.accounts && google.accounts.id) {
        clearInterval(t);
        try {
          google.accounts.id.initialize({
            client_id: CFG.GOOGLE_CLIENT_ID,
            callback: onCredential,
          });
          google.accounts.id.renderButton(els.gsiButton, {
            theme: "filled_black", size: "large", shape: "pill", text: "signin_with",
          });
        } catch (err) { hideGoogleUi(); }
      } else if (tries > 25) { // ~5s
        clearInterval(t);
        hideGoogleUi();
      }
    }, 200);
  }
  function hideGoogleUi() {
    // Google unavailable / not configured -> guests use the party code instead.
    if (els.gsiButton && els.gsiButton.parentNode) els.gsiButton.parentNode.style.display = "none";
    if (els.orDivider) els.orDivider.style.display = "none";
  }

  // Party code entry (alternative to Google).
  function submitCode() {
    var code = (els.codeInput.value || "").trim();
    els.codeErr.hidden = true;
    if (!/^\d{4}$/.test(code)) {
      els.codeErr.textContent = "Enter the 4-digit code.";
      els.codeErr.hidden = false;
      return;
    }
    els.codeSubmit.disabled = true;
    var url = CFG.APPS_SCRIPT_URL + (CFG.APPS_SCRIPT_URL.indexOf("?") > -1 ? "&" : "?") +
      "action=checkpin&pin=" + encodeURIComponent(code);
    fetch(url)
      .then(function (r) { return r.json(); })
      .then(function (res) {
        els.codeSubmit.disabled = false;
        if (res && res.valid) {
          state.pin = code;
          showStep("form");
        } else {
          els.codeErr.textContent = "That code isn't right. Ask whoever's running the book.";
          els.codeErr.hidden = false;
        }
      })
      .catch(function () {
        els.codeSubmit.disabled = false;
        els.codeErr.textContent = "Couldn't check the code — try again.";
        els.codeErr.hidden = false;
      });
  }
  els.codeSubmit.addEventListener("click", submitCode);
  els.codeInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") { e.preventDefault(); submitCode(); }
  });

  function onCredential(resp) {
    state.idToken = resp.credential;
    var payload = decodeJwt(resp.credential);
    if (payload && payload.name && els.name && !els.name.value) {
      els.name.value = payload.name; // editable prefill
    }
    // Cross-check: has this Google account already signed? If so, skip to the wall.
    // GET (not POST) so an un-redeployed backend can never write a stray entry.
    showStep("loading");
    els.loadingText.textContent = "One sec…";
    var mineUrl = CFG.APPS_SCRIPT_URL + (CFG.APPS_SCRIPT_URL.indexOf("?") > -1 ? "&" : "?") +
      "action=checkmine&idToken=" + encodeURIComponent(state.idToken);
    fetch(mineUrl)
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (res && res.submitted) {
          showStep("already");
          setTimeout(goToWall, 1900);
        } else {
          showStep("form");
        }
      })
      .catch(function () { showStep("form"); });
  }
  function decodeJwt(token) {
    try {
      var base = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      return JSON.parse(decodeURIComponent(escape(atob(base))));
    } catch (e) { return null; }
  }

  // ==========================================================================
  // Message counter
  // ==========================================================================
  els.message.addEventListener("input", function () {
    var max = CFG.MAX_MESSAGE_CHARS || 1000;
    if (els.message.value.length > max) els.message.value = els.message.value.slice(0, max);
    els.charCount.textContent = String(els.message.value.length);
  });

  // ==========================================================================
  // Photo picking + compression
  // ==========================================================================
  els.photoAdd.addEventListener("click", function () { els.photoInput.click(); });
  els.photoInput.addEventListener("change", function () {
    var files = Array.prototype.slice.call(els.photoInput.files || []);
    els.photoInput.value = "";
    files.forEach(handleFile);
  });

  function handleFile(file) {
    var max = CFG.MAX_PHOTOS || 3;
    if (state.photos.length >= max) {
      showFormErr("You can add up to " + max + " photos.");
      return;
    }
    var slot = addThumb();
    processImage(file).then(function (result) {
      state.photos.push(result);
      slot.classList.remove("loading");
      var img = document.createElement("img");
      img.src = result.previewUrl;
      slot.appendChild(img);
      updateAddState();
    }).catch(function (err) {
      slot.remove();
      showFormErr("Couldn't read that photo (" + (err && err.message ? err.message : "unknown") + "). Try another.");
    });
  }

  function addThumb() {
    var slot = document.createElement("div");
    slot.className = "thumb loading";
    var rm = document.createElement("button");
    rm.className = "thumb-remove"; rm.type = "button"; rm.innerHTML = "&times;";
    rm.setAttribute("aria-label", "Remove photo");
    rm.addEventListener("click", function () {
      var idx = Array.prototype.indexOf.call(els.thumbs.children, slot);
      if (idx > -1 && state.photos[idx]) state.photos.splice(idx, 1);
      slot.remove();
      updateAddState();
    });
    slot.appendChild(rm);
    els.thumbs.appendChild(slot);
    return slot;
  }
  function updateAddState() {
    var max = CFG.MAX_PHOTOS || 3;
    els.photoAdd.disabled = state.photos.length >= max;
    els.photoAdd.style.display = state.photos.length >= max ? "none" : "";
  }

  // Resolve to { data: base64, mime, previewUrl }
  function processImage(file) {
    var isHeic = /heic|heif/i.test(file.type) || /\.(heic|heif)$/i.test(file.name);
    var pre = (CFG.ENABLE_HEIC && isHeic) ? convertHeic(file) : Promise.resolve(file);
    return pre.then(compressToJpeg);
  }

  function convertHeic(file) {
    return loadHeicLib().then(function () {
      return window.heic2any({ blob: file, toType: "image/jpeg", quality: 0.85 });
    }).then(function (out) {
      return Array.isArray(out) ? out[0] : out;
    });
  }
  var heicLibPromise = null;
  function loadHeicLib() {
    if (window.heic2any) return Promise.resolve();
    if (heicLibPromise) return heicLibPromise;
    heicLibPromise = new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js";
      s.onload = resolve;
      s.onerror = function () { reject(new Error("HEIC converter unavailable")); };
      document.head.appendChild(s);
    });
    return heicLibPromise;
  }

  function compressToJpeg(blob) {
    var maxEdge = CFG.PHOTO_MAX_EDGE || 1600;
    var quality = CFG.PHOTO_JPEG_QUALITY || 0.8;
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(blob);
      var img = new Image();
      img.onload = function () {
        var w = img.naturalWidth, h = img.naturalHeight;
        var scale = Math.min(1, maxEdge / Math.max(w, h));
        var cw = Math.round(w * scale), ch = Math.round(h * scale);
        var canvas = document.createElement("canvas");
        canvas.width = cw; canvas.height = ch;
        var ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, cw, ch);
        URL.revokeObjectURL(url);
        canvas.toBlob(function (out) {
          if (!out) { reject(new Error("encode failed")); return; }
          var previewUrl = URL.createObjectURL(out);
          var reader = new FileReader();
          reader.onload = function () {
            var base64 = String(reader.result).split(",")[1];
            resolve({ data: base64, mime: "image/jpeg", previewUrl: previewUrl });
          };
          reader.onerror = function () { reject(new Error("read failed")); };
          reader.readAsDataURL(out);
        }, "image/jpeg", quality);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("decode failed")); };
      img.src = url;
    });
  }

  // ==========================================================================
  // Submit
  // ==========================================================================
  function showFormErr(msg) {
    els.formErr.textContent = msg;
    els.formErr.hidden = false;
  }
  function clearFormErr() { els.formErr.hidden = true; }

  els.submit.addEventListener("click", function () {
    if (state.submitting) return;
    clearFormErr();

    var name = (els.name.value || "").trim();
    var message = (els.message.value || "").trim();

    if (!name) { showFormErr("Add a name so Yoni knows who this is."); els.name.focus(); return; }
    if (!message && state.photos.length === 0) {
      showFormErr("Leave a message or at least one photo.");
      return;
    }
    if (!state.idToken && !state.pin) {
      // Not authed either way — send them back to the gate.
      showStep("signin");
      return;
    }
    if (!backendReady) {
      showFormErr("Backend not configured yet (APPS_SCRIPT_URL). See SETUP.md.");
      return;
    }

    submit(name, message);
  });

  function submit(name, message) {
    state.submitting = true;
    els.submit.disabled = true;
    showStep("loading");
    els.loadingText.textContent = state.photos.length ? "Uploading your photos…" : "Sealing it…";

    var payload = {
      idToken: state.idToken || null,
      pin: state.pin || null,
      name: name,
      message: message,
      photos: state.photos.map(function (p) { return { data: p.data, mime: p.mime }; }),
    };

    fetch(CFG.APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" }, // simple request, no CORS preflight
      body: JSON.stringify(payload),
    })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        state.submitting = false;
        els.submit.disabled = false;
        if (!res || !res.ok) {
          if (res && res.closed) {
            markClosed();
            showStep("form");
            showFormErr("The book just closed. Thanks anyway — the wall's still here.");
            return;
          }
          if (res && (res.error === "auth_required" || (res.error && res.error.indexOf("auth_failed") === 0))) {
            state.idToken = null; state.pin = null;
            showStep("signin");
            els.codeErr.textContent = "Couldn't verify you — sign in with Google or re-enter the code.";
            els.codeErr.hidden = false;
            return;
          }
          showStep("form");
          showFormErr("Something went wrong (" + ((res && res.error) || "unknown") + "). Try again.");
          return;
        }
        // Optimistically prepend the new photos to the wall.
        if (res.photoIds && res.photoIds.length) {
          res.photoIds.forEach(function (id) { prependPhoto(id, true); });
        }
        onSubmitted();
      })
      .catch(function () {
        state.submitting = false;
        els.submit.disabled = false;
        showStep("form");
        showFormErr("Network hiccup on party wifi. Try once more.");
      });
  }

  function onSubmitted() {
    showStep("done");
    // Reset form for cleanliness.
    state.photos = [];
    els.thumbs.innerHTML = "";
    els.message.value = "";
    els.charCount.textContent = "0";
    updateAddState();
    // Flow into the wall.
    setTimeout(goToWall, 2100);
  }

  // ==========================================================================
  // Photo wall
  // ==========================================================================
  function thumbUrl(id, size) { return "https://drive.google.com/thumbnail?id=" + id + "&sz=w" + (size || 600); }

  function makeWallItem(id, atTop) {
    var div = document.createElement("div");
    div.className = "wall-item";
    div.dataset.id = id;
    var img = document.createElement("img");
    img.loading = "lazy";
    img.alt = "Farewell photo";
    img.src = thumbUrl(id, 600);
    img.addEventListener("click", function () { openLightbox(id); });
    div.appendChild(img);
    return div;
  }

  function prependPhoto(id, atTop) {
    if (state.seenPhotoIds[id]) return;
    state.seenPhotoIds[id] = true;
    hideEmpty();
    var item = makeWallItem(id);
    if (els.wallGrid.firstChild) els.wallGrid.insertBefore(item, els.wallGrid.firstChild);
    else els.wallGrid.appendChild(item);
  }
  function appendPhoto(id) {
    if (state.seenPhotoIds[id]) return;
    state.seenPhotoIds[id] = true;
    hideEmpty();
    els.wallGrid.appendChild(makeWallItem(id));
  }

  function showSkeletons(n) {
    for (var i = 0; i < n; i++) {
      var sk = document.createElement("div");
      sk.className = "skeleton";
      sk.style.height = (140 + (i % 3) * 60) + "px";
      sk.dataset.skeleton = "1";
      els.wallGrid.appendChild(sk);
    }
  }
  function clearSkeletons() {
    els.wallGrid.querySelectorAll("[data-skeleton]").forEach(function (n) { n.remove(); });
  }
  function hideEmpty() { els.wallEmpty.hidden = true; }
  function showEmptyIfNeeded() {
    var hasPhotos = els.wallGrid.querySelector(".wall-item");
    els.wallEmpty.hidden = !!hasPhotos;
  }

  var feedLoadedOnce = false;
  function loadFeed() {
    if (!backendReady) { clearSkeletons(); showEmptyIfNeeded(); return; }
    fetch(CFG.APPS_SCRIPT_URL + (CFG.APPS_SCRIPT_URL.indexOf("?") > -1 ? "&" : "?") + "action=feed")
      .then(function (r) { return r.json(); })
      .then(function (res) {
        clearSkeletons();
        if (res && res.closed) markClosed();
        if (res && res.ok && res.photos) {
          // res.photos is newest-first. Prepend fresh ones oldest-first so the
          // newest ends up on top — works for both first load and live polls.
          var fresh = [];
          res.photos.forEach(function (p) { if (!state.seenPhotoIds[p.id]) fresh.push(p.id); });
          for (var i = fresh.length - 1; i >= 0; i--) prependPhoto(fresh[i]);
        }
        feedLoadedOnce = true;
        showEmptyIfNeeded();
      })
      .catch(function () {
        clearSkeletons();
        showEmptyIfNeeded();
      });
  }

  // ==========================================================================
  // Closed state
  // ==========================================================================
  function markClosed() {
    state.closed = true;
    if (els.openForm) els.openForm.style.display = "none";
    if (els.deadline) els.deadline.style.display = "none";
    if (els.closedState) els.closedState.hidden = false;
  }
  function checkStatus() {
    if (!backendReady) return;
    fetch(CFG.APPS_SCRIPT_URL + (CFG.APPS_SCRIPT_URL.indexOf("?") > -1 ? "&" : "?") + "action=status")
      .then(function (r) { return r.json(); })
      .then(function (res) { if (res && res.closed) markClosed(); })
      .catch(function () {});
  }

  // ==========================================================================
  // Lightbox
  // ==========================================================================
  function openLightbox(id) {
    els.lightboxImg.src = thumbUrl(id, 1600);
    els.lightbox.hidden = false;
    document.body.style.overflow = "hidden";
  }
  function closeLightbox() {
    els.lightbox.hidden = true;
    els.lightboxImg.src = "";
    if (els.overlay.hidden) document.body.style.overflow = "";
  }
  els.lightboxClose.addEventListener("click", closeLightbox);
  els.lightbox.addEventListener("click", function (e) {
    if (e.target === els.lightbox) closeLightbox();
  });

  // ==========================================================================
  // Desktop opposing-column parallax (gentle; off for reduced-motion / mobile)
  // ==========================================================================
  function initParallax() {
    if (reduceMotion) return;
    if (window.matchMedia("(max-width: 719px)").matches) return;
    var ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        var items = els.wallGrid.querySelectorAll(".wall-item");
        var vh = window.innerHeight;
        items.forEach(function (item, i) {
          var col = i % 3;
          var dir = (col === 1) ? 1 : -1;   // middle column drifts opposite
          var rect = item.getBoundingClientRect();
          var progress = (rect.top - vh / 2) / vh; // -~1..1
          item.style.transform = "translateY(" + (progress * 14 * dir) + "px)";
        });
        ticking = false;
      });
    }
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  // ==========================================================================
  // Boot
  // ==========================================================================
  function boot() {
    showSkeletons(6);
    initGoogle();
    checkStatus();
    loadFeed();
    initParallax();
    if (CFG.FEED_POLL_MS && backendReady) {
      setInterval(loadFeed, CFG.FEED_POLL_MS);
    }
  }
  boot();
})();
