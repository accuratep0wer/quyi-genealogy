/* Generic viewport layout for a graph page with a side panel.
   Reusable by other static sites (for example a future /liyuan/ page)
   that expose #panelDock, #panelHandle and .toolbar.

   Layouts, chosen from the live viewport rather than a single width cutoff:
   - pane:   wide and tall (desktop, unfolded foldable, tablet) — panel beside the graph
   - drawer: short wide screen (phone landscape) — panel is a right-hand drawer
   - sheet:  tall narrow screen (phone portrait, folded foldable) — panel is a bottom sheet
*/
(function () {
  'use strict';
  var root = document.documentElement;
  var dock = null;
  var handle = null;
  var dragging = false;
  var start = 0;
  var lastLayout = '';

  function viewport() {
    var vv = window.visualViewport;
    var w = Math.round(vv ? vv.width : window.innerWidth);
    var h = Math.round(vv ? vv.height : window.innerHeight);
    return { w: w, h: h, ratio: h ? w / h : 1 };
  }

  function choose(box) {
    if (box.w >= 700 && box.h >= 640) return 'pane';
    if (box.w > box.h && box.h <= 540) return 'drawer';
    return 'sheet';
  }

  function emit(name, detail) {
    document.dispatchEvent(new CustomEvent(name, { detail: detail }));
  }

  function measure() {
    var box = viewport();
    var layout = choose(box);
    root.setAttribute('data-layout', layout);
    root.style.setProperty('--app-w', box.w + 'px');
    root.style.setProperty('--app-h', box.h + 'px');
    var detail = { layout: layout, w: box.w, h: box.h, ratio: box.ratio };
    if (layout !== lastLayout) {
      lastLayout = layout;
      if (layout !== 'pane') collapse();
      else expand();
      emit('xsmobile', detail);
    } else {
      emit('xsmobile-resize', detail);
    }
    return detail;
  }

  function collapse() {
    if (dock) dock.classList.add('collapsed');
  }
  function expand() {
    if (dock) dock.classList.remove('collapsed');
  }
  function toggle() {
    if (!dock) return;
    dock.classList.toggle('collapsed');
  }

  function onDown(ev) {
    if (!dock || root.getAttribute('data-layout') === 'pane') return;
    dragging = true;
    var p = ev.touches ? ev.touches[0] : ev;
    start = root.getAttribute('data-layout') === 'drawer' ? p.clientX : p.clientY;
    if (ev.cancelable && ev.type === 'touchstart') { /* keep the click */ }
  }
  function onUp(ev) {
    if (!dragging) return;
    dragging = false;
    var p = ev.changedTouches ? ev.changedTouches[0] : ev;
    var layout = root.getAttribute('data-layout');
    var delta = layout === 'drawer' ? (p.clientX - start) : (p.clientY - start);
    if (delta > 36) collapse();
    else if (delta < -36) expand();
    else toggle();
  }

  function bind() {
    dock = document.getElementById('panelDock');
    handle = document.getElementById('panelHandle');
    if (handle) {
      handle.addEventListener('click', function (ev) {
        ev.preventDefault();
        toggle();
      });
      handle.addEventListener('pointerdown', onDown);
      window.addEventListener('pointerup', onUp);
    }
    var menu = document.getElementById('filterToggle');
    var bar = document.querySelector('.toolbar');
    if (menu && bar) {
      menu.addEventListener('click', function () {
        bar.classList.toggle('filters-open');
        menu.setAttribute('aria-expanded', bar.classList.contains('filters-open') ? 'true' : 'false');
      });
    }
    window.addEventListener('resize', measure);
    window.addEventListener('orientationchange', function () { setTimeout(measure, 60); });
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', measure);
    }
    if (window.ResizeObserver && document.body) {
      var ro = new ResizeObserver(function () { measure(); });
      ro.observe(document.body);
    }
    measure();
  }

  window.XSMobile = {
    measure: measure,
    layout: function () { return root.getAttribute('data-layout') || 'pane'; },
    openPanel: expand,
    closePanel: collapse,
    togglePanel: toggle
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})();
