const target1 = {h: 85, s: 39, l: 64};
const user1 = {h: 180, s: 50, l: 50};
const score1 = 17.96;

const target2 = {h: 91, s: 29, l: 55};
const user2 = {h: 180, s: 50, l: 50};
const score2 = 18.68;

// Let's try to find exact weights for H, S, L
// points_lost = w_h * H_diff + w_s * S_diff + w_l * L_diff
// 7.04 = 95 * w_h + 11 * w_s + 14 * w_l
// 6.32 = 89 * w_h + 21 * w_s + 5 * w_l

// Let's assume w_s = w_l
// 7.04 = 95 * w_h + 25 * w_s
// 6.32 = 89 * w_h + 26 * w_s

let w_h = (7.04 * 26 - 6.32 * 25) / (95 * 26 - 89 * 25);
let w_s = (7.04 - 95 * w_h) / 25;

console.log(`w_h: ${w_h}, w_s: ${w_s}`);
console.log(`Max H penalty: ${w_h * 180}`);
console.log(`Max S penalty: ${w_s * 100}`);
console.log(`Max L penalty: ${w_s * 100}`);
