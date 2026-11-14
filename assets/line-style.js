/* Shared relation line styles for both sites.
   Cytoscape draws these rules in order; a later match wins per property.
   The disputed pattern is reserved: no documented type uses it. */
(function (root) {
  'use strict';
  var DIS_DASH = [2, 12];
  var DIS_W = 2.2;
  var KINDS = {
    md:     {selector:'edge[type = "master_disciple"]', color:'#374151', dis:'#9ca3af', dash:[],                 width:2.6, cap:'butt',   arrow:'triangle', curve:'straight', z:4},
    kin:    {selector:'edge[type = "kin"]',              color:'#0369a1', dis:'#7dd3fc', dash:[30, 9],            width:2.2, cap:'butt',   arrow:'none',     curve:'straight', z:3},
    other:  {selector:'edge[type = "other"]',            color:'#0f766e', dis:'#5eead4', dash:[12, 5, 12, 5, 3, 6], width:2.0, cap:'butt', arrow:'none',     curve:'straight', z:3},
    partner:{selector:'edge[type = "partner"]',          color:'#e11d48', dis:'#fda4af', dash:[12, 10],           width:3.6, cap:'butt',   arrow:'none',     curve:'straight', z:3},
    mar:    {selector:'edge[type = "marriage"]',         color:'#7e22ce', dis:'#d8b4fe', dash:[],                 width:2.4, cap:'butt',   arrow:'none',     curve:'straight', z:0, double:true, gap:3.2, rail:1.35},
    ganqin: {selector:'edge[sub = "ganqin"]',            color:'#c2410c', dis:'#fdba74', dash:[9, 6, 9, 16],      width:2.5, cap:'butt',   arrow:'triangle', curve:'straight', z:3},
    jiebai: {selector:'edge[sub = "jiebai"]',            color:'#4338ca', dis:'#a5b4fc', dash:[24, 7, 4, 7],      width:2.4, cap:'butt',   arrow:'none',     curve:'straight', z:3},
    guoji:  {selector:'edge[sub = "guoji"]',             color:'#9a3412', dis:'#fcd34d', dash:[18, 6, 2, 4, 2, 8], width:2.3, cap:'butt',  arrow:'none',     curve:'straight', z:3}
  };
  var ORDER = ['md', 'kin', 'other', 'partner', 'mar', 'ganqin', 'jiebai', 'guoji'];

  function kindOf(r) {
    var s = (r && (r.subtype || r.sub)) || '';
    if (s === 'ganqin' || s === 'jiebai' || s === 'guoji') return s;
    var t = r && r.type;
    if (t === 'master_disciple') return 'md';
    if (t === 'marriage') return 'mar';
    if (t === 'partner') return 'partner';
    if (t === 'kin') return 'kin';
    return 'other';
  }

  function documentedStyle(k) {
    if (k.double) {
      return {
        'line-color':'#ffffff',
        'line-outline-color':k.color,
        'line-outline-width':k.rail * 2,
        'width':k.gap,
        'line-style':'solid',
        'line-cap':'butt',
        'target-arrow-shape':'none',
        'target-arrow-color':k.color,
        'opacity':1,
        'z-index':0,
        'curve-style':'straight'
      };
    }
    var style = {
      'line-color':k.color,
      'target-arrow-color':k.color,
      'target-arrow-shape':k.arrow,
      'width':k.width,
      'line-style':k.dash.length ? 'dashed' : 'solid',
      'line-cap':k.cap,
      'opacity':1,
      'line-outline-width':0,
      'z-index':k.z,
      'curve-style':k.curve || 'straight'
    };
    if (k.dash.length) style['line-dash-pattern'] = k.dash;
    if (k.arrow === 'triangle') style['arrow-scale'] = 0.9;
    return style;
  }

  function selectors() {
    var out = [{
      selector:'edge',
      style:{
        'width':1.6,
        'line-color':'#6b7280',
        'curve-style':'straight',
        'opacity':1,
        'target-arrow-shape':'none',
        'line-style':'solid',
        'line-cap':'butt',
        'z-index':2,
        'line-outline-width':0
      }
    }];
    ORDER.forEach(function (id) {
      out.push({selector:KINDS[id].selector, style:documentedStyle(KINDS[id])});
    });
    out.push({selector:'edge.extra', style:{'z-index':2}});
    out.push({
      selector:'edge[conf = "disputed"]',
      style:{
        'line-style':'dashed',
        'line-dash-pattern':DIS_DASH.slice(),
        'line-cap':'round',
        'width':DIS_W,
        'line-outline-width':0,
        'opacity':1,
        'z-index':5
      }
    });
    ORDER.forEach(function (id) {
      var k = KINDS[id];
      var style = {'line-color':k.dis, 'target-arrow-color':k.dis};
      if (k.arrow === 'triangle') style['arrow-scale'] = 0.8;
      out.push({selector:k.selector + '[conf = "disputed"]', style:style});
    });
    out.push({selector:'edge.hl', style:{'opacity':1, 'z-index':12}});
    out.push({selector:'edge.tree-link', style:{'opacity':1, 'z-index':20}});
    out.push({
      selector:'edge.tree-reveal',
      style:{'opacity':1, 'z-index':24, 'curve-style':'bezier', 'control-point-step-size':90}
    });
    return out;
  }

  function swatch(kind, disputed) {
    var k = KINDS[kind] || KINDS.other;
    var dis = !!disputed;
    var color = dis ? k.dis : k.color;
    var W = 76, H = 16;
    if (k.double && !dis) {
      var rail = 1.5;
      return '<svg class="ln-svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" aria-hidden="true">'
        + '<line x1="2" y1="5.5" x2="' + (W - 2) + '" y2="5.5" stroke="' + k.color + '" stroke-width="' + rail + '" stroke-linecap="butt"/>'
        + '<line x1="2" y1="10.5" x2="' + (W - 2) + '" y2="10.5" stroke="' + k.color + '" stroke-width="' + rail + '" stroke-linecap="butt"/>'
        + '</svg>';
    }
    var x2 = k.arrow === 'triangle' ? W - 13 : W - 2;
    var dash = dis ? DIS_DASH : k.dash;
    var cap = dis ? 'round' : k.cap;
    var sw = dis ? DIS_W : (k.double ? 2.4 : k.width);
    var dashAttr = dash.length ? ' stroke-dasharray="' + dash.join(' ') + '"' : '';
    var arrow = '';
    if (k.arrow === 'triangle') {
      arrow = '<polygon points="' + (W - 14) + ',3.6 ' + (W - 2) + ',8 ' + (W - 14) + ',12.4" fill="' + color + '"/>';
    }
    return '<svg class="ln-svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" aria-hidden="true">'
      + '<line x1="2" y1="8" x2="' + x2 + '" y2="8" stroke="' + color + '" stroke-width="' + sw + '" stroke-linecap="' + cap + '"' + dashAttr + '/>'
      + arrow + '</svg>';
  }

  function swatchHtml(kind, disputed) {
    return '<i class="ln">' + swatch(kind, disputed) + '</i>';
  }

  function mountLegend() {
    var nodes = document.querySelectorAll('i.ln[data-line]');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      el.innerHTML = swatch(el.getAttribute('data-line'), el.getAttribute('data-dis') === '1');
    }
  }

  root.XSLines = {
    KINDS:KINDS,
    DIS_DASH:DIS_DASH,
    kindOf:kindOf,
    selectors:selectors,
    swatch:swatch,
    swatchHtml:swatchHtml,
    mountLegend:mountLegend
  };
})(window);
