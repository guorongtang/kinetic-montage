// kinetic-montage · engine (boot + draw)
(() => {
  const KM = window.KM;
  const { clamp, eo5 } = KM;

  let film, S, cv, ctx2, buf, bctx, probe, pctx, noise;
  let W = 1920, H = 1080;

  KM.qNow = 0;
  KM.imgs = {};

  function samplePoints(str, size) {
    pctx.clearRect(0, 0, W, H);
    pctx.fillStyle = '#fff';
    pctx.textAlign = 'center';
    pctx.textBaseline = 'middle';
    pctx.font = `900 ${size}px ${KM.font(film, 'number')}`;
    pctx.letterSpacing = `${-size * 0.03}px`;
    pctx.fillText(str, W / 2, H / 2 + 30);
    const d = pctx.getImageData(0, 0, W, H).data;
    const out = [];
    for (let py = 0; py < H; py += 7) {
      for (let px = 0; px < W; px += 7) {
        if (d[(py * W + px) * 4 + 3] > 128) out.push({ x: px, y: py });
      }
    }
    pctx.letterSpacing = '0px';
    return out;
  }

  function makeNoise() {
    const n = document.createElement('canvas');
    n.width = n.height = 256;
    const nx = n.getContext('2d');
    const id = nx.createImageData(256, 256);
    const rand = KM.prng(20261103);
    for (let i = 0; i < id.data.length; i += 4) {
      const v = 128 + (rand() - 0.5) * 255;
      id.data[i] = id.data[i + 1] = id.data[i + 2] = v;
      id.data[i + 3] = 255;
    }
    nx.putImageData(id, 0, 0);
    return n;
  }

  KM.boot = async function (f, assetBase = '../assets/') {
    film = f;
    S = film.shots;
    W = film.meta.width || 1920;
    H = film.meta.height || 1080;

    cv = document.getElementById('c');
    cv.width = W;
    cv.height = H;
    ctx2 = cv.getContext('2d');

    buf = document.createElement('canvas');
    buf.width = W;
    buf.height = H;
    bctx = buf.getContext('2d');

    probe = document.createElement('canvas');
    probe.width = W;
    probe.height = H;
    pctx = probe.getContext('2d', { willReadFrequently: true });

    if (film.post && film.post.grain > 0) noise = makeNoise();

    await document.fonts.ready;

    S.forEach(s => {
      if (s.type === 'number') {
        const size = s.size || (s.unit ? film.motion.numberSizeUnit : film.motion.numberSize);
        s.pts = samplePoints(s.value, size);
      }
    });

    const srcs = [...new Set(S.filter(s => s.src).map(s => s.src))];
    const failed = [];
    await Promise.all(
      srcs.map(
        name =>
          new Promise(resolve => {
            const im = new Image();
            im.onload = resolve;
            im.onerror = () => { failed.push(name); resolve(); };
            im.src = assetBase + name;
            KM.imgs[name] = im;
          })
      )
    );
    KM.failedAssets = failed;
    window.__ready = true;
    return { shots: S.length, images: srcs.length, failed };
  };

  function drawShards(p) {
    const nx = film.motion.shardGrid[0], ny = film.motion.shardGrid[1];
    const w = film.motion.shardWindow;
    const tw = W / nx, th = H / ny;
    const e = 1 - Math.pow(p / w, 0.6);
    const mx = film.motion.shardShift[0], my = film.motion.shardShift[1];
    ctx2.save();
    ctx2.globalAlpha = 1;
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < ny; j++) {
        const k = i * 37 + j * 91 + 13;
        const r1 = ((Math.sin(k * 12.9898) * 43758.5453) % 1 + 1) % 1;
        const r2 = ((Math.sin(k * 78.233) * 43758.5453) % 1 + 1) % 1;
        const dx = (r1 - 0.5) * mx * e;
        const dy = (r2 - 0.5) * my * e;
        ctx2.drawImage(buf, i * tw, j * th, tw, th, i * tw + dx, j * th + dy, tw + 1, th + 1);
      }
    }
    ctx2.restore();
  }

  function post(t, frame) {
    const p = film.post || {};
    if (!(p.grain > 0) && !(p.scanlines > 0) && !(p.flicker > 0)) return;

    if (p.grain > 0 && noise) {
      const ox = -((frame * 53) % 256), oy = -((frame * 97) % 256);
      ctx2.save();
      ctx2.globalAlpha = p.grain;
      ctx2.globalCompositeOperation = 'overlay';
      for (let y = oy; y < H; y += 256) for (let x = ox; x < W; x += 256) ctx2.drawImage(noise, x, y);
      ctx2.restore();
    }

    if (p.scanlines > 0) {
      ctx2.save();
      ctx2.globalAlpha = p.scanlines;
      ctx2.fillStyle = '#000';
      for (let y = 0; y < H; y += 4) ctx2.fillRect(0, y, W, 1.4);
      ctx2.restore();
    }

    if (p.flicker > 0) {
      const r = Math.abs((Math.sin(frame * 127.1) * 43758.5453) % 1);
      ctx2.save();
      ctx2.globalAlpha = p.flicker * (0.3 + r);
      ctx2.fillStyle = '#000';
      ctx2.fillRect(0, 0, W, H);
      ctx2.restore();
    }
  }

  KM.draw = function (t) {
    const frame = Math.round(t * 30);
    let i = 0;
    for (let k = 0; k < S.length; k++) if (t >= S[k].t) i = k;
    const s = S[i];
    const next = S[i + 1];
    const end = (film.meta.duration || 30) + 3;
    const shotLen = Math.max(0.05, (next ? next.t : end) - s.t);
    const dur = Math.min(shotLen, film.motion.entry);
    const p = clamp((t - s.t) / dur);
    KM.qNow = clamp((t - s.t) / shotLen);

    let ctx = bctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.filter = 'none';
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = KM.color(film, s.bg || 'ink');
    ctx.fillRect(0, 0, W, H);

    if (s.type === 'number') KM.cardNumber(ctx, film, s, p, t);
    else if (s.type === 'word') KM.cardWord(ctx, film, s, p, t);
    else if (s.type === 'image') KM.cardImage(ctx, film, s, p, t);
    else if (s.type === 'endcard') KM.cardEndcard(ctx, film, s, p, t);

    ctx2.setTransform(1, 0, 0, 1, 0, 0);
    ctx2.globalAlpha = 1;
    ctx2.globalCompositeOperation = 'source-over';
    ctx2.clearRect(0, 0, W, H);

    const shard = film.motion.shard && s.type !== 'number' && p < film.motion.shardWindow;
    if (shard) drawShards(p);
    else ctx2.drawImage(buf, 0, 0);

    if (shard) {
      ctx2.save();
      ctx2.globalAlpha = 0.5 * (1 - p / film.motion.shardWindow);
      for (let b = 0; b < 5; b++) {
        const y = ((((Math.sin((frame + b) * 12.9) * 43758.5) % 1) + 1) % 1) * H;
        const hh = 12 + ((((Math.sin((frame + b) * 7.7) * 1234.5) % 1) + 1) % 1) * 40;
        ctx2.drawImage(buf, 0, y, W, hh, (Math.sin(b * 3.3) * 60), y, W, hh);
      }
      ctx2.restore();
    }

    post(t, frame);
  };

  // browser preview: if the player injects __FILM__, boot automatically
  window.addEventListener('DOMContentLoaded', () => {
    if (window.__FILM__) {
      KM.boot(window.__FILM__, window.__ASSET_BASE__ || '../assets/').then(() => {
        if (window.__PLAYER__) window.__PLAYER__.ready();
        else KM.draw(0);
      });
    }
  });
})();
