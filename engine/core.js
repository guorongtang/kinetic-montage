// kinetic-montage · core helpers (shared global namespace KM)
(() => {
  const KM = (window.KM = window.KM || {});

  KM.clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  KM.eo = t => 1 - Math.pow(1 - t, 3);
  KM.eo5 = t => 1 - Math.pow(1 - t, 5);
  KM.eio = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  KM.P = (t, a, b) => KM.clamp((t - a) / (b - a));

  // deterministic hash in [0,1) — replaces Math.random everywhere
  KM.hash = n => {
    const v = Math.sin(n * 12.9898 + 3.7) * 43758.5453;
    return v - Math.floor(v);
  };

  // mulberry32 for the optional grain tile
  KM.prng = seed => () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  KM.color = (film, name) => {
    const c = film.theme && film.theme.colors;
    return (c && c[name]) || name;
  };
  KM.font = (film, which) => {
    const f = film.theme && film.theme.fonts;
    return (f && f[which]) || 'sans-serif';
  };

  KM.bigText = (ctx, film, str, size, color, x, y, align = 'left', weight = 900) => {
    ctx.font = `${weight} ${size}px ${KM.font(film, 'cjk')}`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillText(str, x, y);
  };

  KM.numText = (ctx, film, str, size, color, x, y, align = 'center') => {
    ctx.font = `900 ${size}px ${KM.font(film, 'number')}`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.letterSpacing = `${-size * 0.03}px`;
    ctx.fillText(str, x, y);
    ctx.letterSpacing = '0px';
  };
})();
