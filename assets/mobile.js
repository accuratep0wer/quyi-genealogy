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
  var wideBtn = null;
  var legendBtn = null;
  var handle = null;
  var pointerId = null;
  var suppressPointerClick = false;
  var start = 0;
  var lastLayout = '';
  var lastW = -1;
  var lastH = -1;

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

  function setLegend(open) {
    root.toggleAttribute('data-graph-legend', open);
    if (legendBtn) {
      legendBtn.setAttribute('aria-expanded', String(open));
      legendBtn.textContent = open ? '收起图例' : '图例';
    }
  }

  function setGraphWide(open) {
    if (open && root.getAttribute('data-layout') === 'pane') return;
    root.toggleAttribute('data-graph-wide', open);
    if (wideBtn) {
      wideBtn.setAttribute('aria-pressed', String(open));
      wideBtn.textContent = open ? '退出全屏' : '全屏看图';
    }
    if (open) {
      collapse();
      setLegend(false);
      var bar = document.querySelector('.toolbar');
      var menu = document.getElementById('filterToggle');
      if (bar) bar.classList.remove('filters-open');
      if (menu) menu.setAttribute('aria-expanded', 'false');
    }
  }

  function measure() {
    var box = viewport();
    var layout = choose(box);
    root.setAttribute('data-layout', layout);
    root.style.setProperty('--app-w', box.w + 'px');
    root.style.setProperty('--app-h', box.h + 'px');
    var detail = { layout: layout, w: box.w, h: box.h, ratio: box.ratio };
    var sized = box.w !== lastW || box.h !== lastH;
    lastW = box.w;
    lastH = box.h;
    if (layout !== lastLayout) {
      lastLayout = layout;
      if (layout !== 'pane') collapse();
      else { setGraphWide(false); setLegend(false); expand(); }
      emit('xsmobile', detail);
    } else if (sized) {
      emit('xsmobile-resize', detail);
    }
    return detail;
  }

  function collapse() {
    if (dock) dock.classList.add('collapsed');
    if (handle) handle.setAttribute('aria-expanded', 'false');
  }
  function expand() {
    if (dock) dock.classList.remove('collapsed');
    if (handle) handle.setAttribute('aria-expanded', 'true');
  }
  function toggle() {
    if (!dock) return;
    if (dock.classList.contains('collapsed')) expand();
    else collapse();
  }

  function onDown(ev) {
    if (!dock || root.getAttribute('data-layout') === 'pane' || ev.isPrimary === false || ev.button !== 0) return;
    pointerId = ev.pointerId;
    suppressPointerClick = false;
    start = root.getAttribute('data-layout') === 'drawer' ? ev.clientX : ev.clientY;
  }
  function onUp(ev) {
    if (pointerId === null || ev.pointerId !== pointerId) return;
    pointerId = null;
    var layout = root.getAttribute('data-layout');
    if (layout === 'pane') return;
    var delta = layout === 'drawer' ? (ev.clientX - start) : (ev.clientY - start);
    if (Math.abs(delta) <= 36) return; // A tap is handled by click exactly once.
    suppressPointerClick = true;
    if (delta > 0) collapse();
    else expand();
  }

  function bind() {
    dock = document.getElementById('panelDock');
    handle = document.getElementById('panelHandle');
    if (handle) {
      handle.addEventListener('click', function (ev) {
        ev.preventDefault();
        if (ev.detail > 0 && suppressPointerClick) {
          suppressPointerClick = false;
          return;
        }
        toggle();
      });
      handle.addEventListener('pointerdown', onDown);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', function (ev) {
        if (ev.pointerId === pointerId) pointerId = null;
      });
    }
    wideBtn = document.getElementById('graphWideToggle');
    legendBtn = document.getElementById('graphLegendToggle');
    if (wideBtn) wideBtn.addEventListener('click', function () { setGraphWide(!root.hasAttribute('data-graph-wide')); });
    if (legendBtn) legendBtn.addEventListener('click', function () { setLegend(!root.hasAttribute('data-graph-legend')); });
    document.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Escape' || document.querySelector('dialog[open]')) return;
      if (root.hasAttribute('data-graph-legend')) { setLegend(false); if (legendBtn) legendBtn.focus(); }
      else if (root.hasAttribute('data-graph-wide')) { setGraphWide(false); if (wideBtn) wideBtn.focus(); }
    });
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
    togglePanel: toggle,
    leaveGraph: function () { setGraphWide(false); setLegend(false); }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})();
