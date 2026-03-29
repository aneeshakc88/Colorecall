const target1 = {h: 85, s: 39, l: 64};
const user1 = {h: 180, s: 50, l: 50};
const score1 = 17.96;

const target2 = {h: 91, s: 29, l: 55};
const user2 = {h: 180, s: 50, l: 50};
const score2 = 18.68;

// Try linear combination
// points_lost = a * h_diff + b * s_diff + c * l_diff
// 7.04 = 95a + 11b + 14c
// 6.32 = 89a + 21b + 5c

// Let's brute force a, b, c
for(let a=0; a<0.2; a+=0.001) {
  for(let b=0; b<0.2; b+=0.001) {
    let c = (7.04 - 95*a - 11*b) / 14;
    if (c < 0) continue;
    let test2 = 89*a + 21*b + 5*c;
    if (Math.abs(test2 - 6.32) < 0.01) {
      console.log(`a=${a.toFixed(4)}, b=${b.toFixed(4)}, c=${c.toFixed(4)}`);
    }
  }
}
