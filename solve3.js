function hslToRgb(h, s, l) {
  let r, g, b;
  h /= 360;
  s /= 100;
  l /= 100;

  if (s === 0) {
    r = g = b = l; // achromatic
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

const target1 = hslToRgb(85, 39, 64);
const user1 = hslToRgb(180, 50, 50);

const target2 = hslToRgb(91, 29, 55);
const user2 = hslToRgb(180, 50, 50);

console.log(`Target 1 RGB: ${target1}`);
console.log(`User 1 RGB: ${user1}`);
console.log(`Target 2 RGB: ${target2}`);
console.log(`User 2 RGB: ${user2}`);

const dist1 = Math.sqrt(Math.pow(target1[0] - user1[0], 2) + Math.pow(target1[1] - user1[1], 2) + Math.pow(target1[2] - user1[2], 2));
const dist2 = Math.sqrt(Math.pow(target2[0] - user2[0], 2) + Math.pow(target2[1] - user2[1], 2) + Math.pow(target2[2] - user2[2], 2));

console.log(`Dist 1: ${dist1}`);
console.log(`Dist 2: ${dist2}`);

// Max distance is sqrt(255^2 * 3) = 441.67
console.log(`Score 1 if linear: ${25 * (1 - dist1 / 441.67)}`);
console.log(`Score 2 if linear: ${25 * (1 - dist2 / 441.67)}`);

// What if it's 25 - (dist / max_dist) * 25?
// 17.96 = 25 - dist1 * k => k = 7.04 / dist1
console.log(`k1: ${7.04 / dist1}`);
console.log(`k2: ${6.32 / dist2}`);
