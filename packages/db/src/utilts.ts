import { customAlphabet, nanoid } from "nanoid";
import { z } from "zod";

export const uniqueIds = z.enum([
  "user",
  "account",
  "session",
  "entry",
  "mood",
  "en_ai",
  "en_tp",
  "en_pe",
]);
export type UniqueIdsType = z.infer<typeof uniqueIds>;
export function createUniqueIds(
  id: UniqueIdsType,
  length?: number,
  custom?: boolean,
) {
  if (custom) {
    const nanoid = customAlphabet("-abcdefghijklmnopqrstuvwxyz1234567890", 14);
    return `${id}-${nanoid()}`;
  }
  return `${id}_${nanoid(length ? length : 11)}`;
}

// function convertStringToFixedNumber(input: string): number {
//   let hash = 0;
//   for (let i = 0; i < input.length; i++) {
//     const char = input.charCodeAt(i);
//     hash = (hash * 31 + char) % 1000000007; // Hashing by a large prime number
//   }
//   return hash;
// }

// const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-1234567890";

// if (process.env.BACKEND_SECURITY_KEY === undefined) {
//   throw new Error("BACKEND_SECURITY_KEY is not defined");
// }

// const securityKey = process.env.BACKEND_SECURITY_KEY ?? "defaultKey";

// const shuffled = shuffle(
//   chars.split(""),
//   convertStringToFixedNumber(securityKey)
// );

// function random(seed: number) {
//   const newSeed = seed + 1; // Avoid parameter reassignment
//   const x = Math.sin(newSeed) * 10000;
//   return x - Math.floor(x);
// }

// function shuffle(array: string[], seed: number) {
//   let m = array.length;
//   // biome-ignore lint/suspicious/noImplicitAnyLet: <explanation>
//   let t;
//   // biome-ignore lint/suspicious/noImplicitAnyLet: <explanation>
//   let i;

//   while (m) {
//     i = Math.floor(random(seed) * m--);

//     t = array[m];
//     // biome-ignore lint/style/noNonNullAssertion: <explanation>
//     array[m] = array[i]!;
//     // biome-ignore lint/style/noNonNullAssertion: <explanation>
//     array[i] = t!;
//     // biome-ignore lint/style/noParameterAssign: <explanation>
//     ++seed;
//   }

//   return array;
// }

// export const cipher = (text: string) => {
//   let returned_text = "";

//   for (let i = 0; i < text.length; i++) {
//     // biome-ignore lint/style/noNonNullAssertion: <explanation>
//     returned_text += shuffled[chars.indexOf(text[i]!)];
//   }

//   return extend(returned_text);
// };

// export const decipher = (text: string) => {
//   let returned_text = "";
//   const index = Math.floor(
//     random(convertStringToFixedNumber(securityKey)) * (text.length / 2)
//   );

//   for (let i = 0; i < text.length; i++) {
//     // biome-ignore lint/style/noNonNullAssertion: <explanation>
//     returned_text += chars[shuffled.indexOf(text[i]!)];
//   }
//   // biome-ignore lint/style/noNonNullAssertion: <explanation>
//   const total = Number.parseInt(text[index]!);
//   const str = Number.parseInt(text.slice(index + 1, index + total + 1));
//   return returned_text.slice(text.length - str);
// };

// const extend = (text: string, length = 60) => {
//   const extra = length - text.length;

//   if (extra < 0) {
//     return text;
//   }

//   // Random index to store the length of the string
//   const index = Math.floor(
//     random(convertStringToFixedNumber(securityKey)) * (length / 2)
//   );

//   const storage_string =
//     text.length.toString().length.toString() + text.length.toString();
//   let returned = "";
//   let total = storage_string.length + text.length;

//   for (let i = 0; i < extra; i++) {
//     if (i === index) {
//       returned += storage_string;
//     } else {
//       if (total >= length) {
//         break;
//       }
//       // Add a random character
//       returned += shuffled[Math.floor(random(Math.random()) * shuffled.length)];
//       total++;
//     }
//   }
//   returned += text;
//   return returned;
// };
