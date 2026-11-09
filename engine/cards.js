// kinetic-montage · card renderers
(() => {
  const KM = window.KM;
  const { clamp, eo5, eio } = KM;

  function drawNumParticles(ctx, film, s, p, t, fg) {
    const pts = s.pts || [];
    const W = film.meta.width;
    const H = film.meta.height;
    const IN = film.motion.numberIn;
    const OUT = film.motion.numberOut;
    // legacy = v13's original behaviour (numbers snap out when the entry ends)
    // shot   = numbers stay readable until the last 30% of the shot
    const qq = film.motion.numberExit === 'legacy' ? Math.max(p, KM.qNow) : KM.qNow;
    ctx.save();
    ctx.fillStyle = fg;
    for (let n = 0; n < pts.length; n++) {
      const q = pts[n];
      const r1 = KM.hash(n * 3 + 1);
      const r2 = KM.hash(n * 3 + 2);
      const r3 = KM.hash(n * 3 + 3);
      let x = q.x, y = q.y, a = 1;
      if (p < IN) {
        const e = eo5(clamp((p - r2 * 0.22) / (IN * 0.85)));
        const ang = r1 * 6.2832, rad = 260 + r3 * 620;
        x = W / 2 + Math.cos(ang) * rad;
        y = H / 2 + Math.sin(ang) * rad;
        x += (q.x - x) * e;
        y += (q.y - y) * e;
        a = 0.15 + 0.85 * e;
      } else if (qq > OUT) {
        const e2 = (qq - OUT) / (1 - OUT);
        const ang = r1 * 6.2832, sp = 900 + r3 * 1500;
        const d2 = 1 + 1.6 * e2;
        x = q.x * d2 + Math.cos(ang) * sp * e2;
        y = q.y * d2 + Math.sin(ang) * sp * e2;
        a = Math.pow(1 - e2, 0.7);
      } else {
        x = q.x + Math.sin(t * 9 + r1 * 6.2832) * 1.7;
        y = q.y + Math.cos(t * 7.3 + r2 * 6.2832) * 1.7;
      }
      ctx.globalAlpha = a;
      ctx.fillRect(x - 3.2, y - 3.2, 6.4, 6.4);
    }
    ctx.restore();
  }

  function cardNumber(ctx, film, s, p, t) {
    const W = film.meta.width;
    const H = film.meta.height;
    const bg = KM.color(film, s.bg);
    const fg = KM.color(film, s.fg);
    const ink = KM.color(film, 'ink');
    const cream = KM.color(film, 'cream');

    const numSize = s.size || (s.unit ? film.motion.numberSizeUnit : film.motion.numberSize);

    ctx.letterSpacing = '0px';
    ctx.font = `900 ${numSize}px ${KM.font(film, 'number')}`;
    const tw = ctx.measureText(s.value).width;
    const uw = s.unit
      ? (() => {
          ctx.font = `900 ${Math.round(numSize * 0.3)}px ${KM.font(film, 'cjk')}`;
          return ctx.measureText(s.unit).width;
        })()
      : 0;
    const total = tw + (s.unit ? 34 + uw : 0);
    const left = W / 2 - total / 2;

    if (s.kicker) {
      ctx.globalAlpha = clamp(p * 2.4);
      KM.bigText(
        ctx, film, s.kicker, 42,
        bg === ink ? KM.color(film, 'muted') : KM.color(film, 'muted2'),
        110, 150, 'left', 800
      );
      ctx.globalAlpha = 1;
    }

    drawNumParticles(ctx, film, s, p, t, fg);

    if (s.unit) {
      ctx.globalAlpha = clamp(p * 2.4) * 0.9;
      ctx.font = `900 ${Math.round(numSize * 0.3)}px ${KM.font(film, 'cjk')}`;
      ctx.fillStyle = bg === ink ? KM.color(film, 'muted') : fg;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(s.unit, left + tw + 56, H / 2 + 30 + numSize * 0.36);
      ctx.globalAlpha = 1;
    }
  }

  function cardWord(ctx, film, s, p, t) {
    const W = film.meta.width;
    const H = film.meta.height;
    const fg = KM.color(film, s.fg);
    const lines = s.lines;
    const size = s.size || film.motion.wordSize;

    ctx.save();
    ctx.globalAlpha = clamp(p * 3);
    const lh = size * 1.06;
    const total = lh * (lines.length - 1);
    const y = H / 2 - total / 2 + 10;
    lines.forEach((ln, i) => {
      const e = eo5(clamp(p * 1.6 - i * 0.18));
      ctx.save();
      ctx.translate(110, y + lh * i);
      const dy = (1 - e) * size * 1.6;
      ctx.beginPath();
      ctx.rect(-20, -size * 0.95 + dy, W - 180, size * 1.9);
      ctx.clip();
      KM.bigText(ctx, film, ln, size, fg, 0, dy, 'left');
      ctx.restore();
    });
    if (s.stamp) {
      ctx.globalAlpha = clamp((p - 0.15) * 3) * 0.95;
      ctx.save();
      ctx.translate(120, H / 2 + size * 0.95);
      ctx.rotate(-0.06);
      ctx.strokeStyle = fg;
      ctx.lineWidth = 8;
      ctx.strokeRect(0, -70, 520, 130);
      KM.bigText(ctx, film, 'REJECTED', 64, fg, 20, 0, 'left', 900);
      ctx.restore();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function cardImage(ctx, film, s, p, t) {
    const W = film.meta.width;
    const H = film.meta.height;
    const im = (KM.imgs || {})[s.src];
    if (!im || !im.complete) return;

    const [z0, z1] = film.motion.imageZoom;
    const ip = film.motion.imageMotion === 'legacy' ? p : KM.qNow;
    const sc = z0 + (z1 - z0) * eio(ip);
    const iw = im.width, ih = im.height;
    const shot = s.mode === 'shot';
    const cream = KM.color(film, 'cream');

    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.scale(sc, sc);
    if (shot) {
      const kc = Math.max(W / iw, H / ih);
      ctx.filter = 'blur(26px) brightness(.55)';
      ctx.drawImage(im, (-iw * kc) / 2, (-ih * kc) / 2, iw * kc, ih * kc);
      ctx.filter = 'none';
      ctx.fillStyle = 'rgba(8,8,10,.45)';
      ctx.fillRect(-W / 2, -H / 2, W, H);
      const kf = Math.min((W * 0.84) / iw, (H * 0.8) / ih);
      ctx.drawImage(im, (-iw * kf) / 2, (-ih * kf) / 2 - 20, iw * kf, ih * kf);
    } else {
      const k = Math.max(W / iw, H / ih);
      ctx.drawImage(im, (-iw * k) / 2, (-ih * k) / 2, iw * k, ih * k);
    }
    ctx.restore();

    if (shot) {
      const g = ctx.createLinearGradient(0, H * 0.55, 0, H);
      g.addColorStop(0, 'rgba(6,6,8,0)');
      g.addColorStop(1, 'rgba(6,6,8,.82)');
      ctx.fillStyle = g;
      ctx.fillRect(0, H * 0.55, W, H * 0.45);
    }
    if (s.caption) {
      const e = eo5(clamp(p * 2.4));
      const col = KM.color(film, s.bg) === cream ? KM.color(film, 'text') : cream;
      ctx.save();
      ctx.globalAlpha = e;
      ctx.translate(110, H - 120 - (1 - e) * 30);
      KM.bigText(ctx, film, s.caption, 54, col, 0, 0, 'left', 900);
      ctx.restore();
    }
  }

  function cardEndcard(ctx, film, s, p, t) {
    const W = film.meta.width;
    const H = film.meta.height;
    const L = t - s.t;
    const text = KM.color(film, 'text');
    const blue = KM.color(film, 'blue');
    const sub = KM.color(film, 'sub');

    ctx.save();
    ctx.translate(W / 2, 300);
    const sp = 0.6 + 0.4 * eo5(clamp(L / 0.28));
    ctx.scale(sp, sp);
    if (s.mark !== 'none') {
      ctx.fillStyle = blue;
      ctx.beginPath();
      ctx.roundRect(-80, -80, 160, 160, 40);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 9;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(0, -34); ctx.lineTo(0, 22);
      ctx.moveTo(-28, -6); ctx.lineTo(0, 22); ctx.lineTo(28, -6);
      ctx.moveTo(-44, 46); ctx.lineTo(44, 46);
      ctx.stroke();
    }
    ctx.restore();

    let brandSize = 104;
    ctx.font = `900 ${brandSize}px ${KM.font(film, 'number')}`;
    const bw = ctx.measureText(s.brand).width;
    if (bw > W * 0.78) brandSize = Math.floor(brandSize * (W * 0.78) / bw);

    const a = eo5(clamp((L - 0.12) / 0.3));
    ctx.globalAlpha = a;
    KM.numText(ctx, film, s.brand, brandSize, text, W / 2, 520, 'center');

    ctx.globalAlpha = eo5(clamp((L - 0.35) / 0.3));
    KM.bigText(ctx, film, s.tagline, 52, sub, W / 2, 640, 'center', 700);

    ctx.globalAlpha = eo5(clamp((L - 0.55) / 0.3));
    KM.bigText(ctx, film, s.url, 44, blue, W / 2, 740, 'center', 800);

    ctx.globalAlpha = eo5(clamp((L - 0.75) / 0.3));
    const cw = 330, bh = 78;
    ctx.fillStyle = text;
    ctx.beginPath();
    ctx.roundRect(W / 2 - cw / 2, 810, cw, bh, 16);
    ctx.fill();
    KM.bigText(ctx, film, s.cta, 30, '#fff', W / 2, 850, 'center', 800);
    ctx.globalAlpha = 1;
  }

  KM.cardNumber = cardNumber;
  KM.cardWord = cardWord;
  KM.cardImage = cardImage;
  KM.cardEndcard = cardEndcard;
})();
