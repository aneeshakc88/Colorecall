import { diff } from 'color-diff';
import convert from 'color-convert';

const lab1Arr = convert.hsl.lab([82, 30, 29]);
const lab2Arr = convert.hsl.lab([80, 29, 39]);

const lab1 = { L: lab1Arr[0], a: lab1Arr[1], b: lab1Arr[2] };
const lab2 = { L: lab2Arr[0], a: lab2Arr[1], b: lab2Arr[2] };

const deltaE = diff(lab1, lab2);
console.log("Delta E:", deltaE);
