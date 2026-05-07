/**
 * Tiny adjective+animal+digit name generator. Used to label new worktrees
 * (and their git branches) so the user gets `happy-otter-42` instead of a
 * UUID stub. Two short word lists are enough — collision probability per
 * project stays low and `WorktreeService.create` retries on duplicates.
 */
const ADJECTIVES = [
  "amber",
  "brave",
  "calm",
  "clever",
  "cosmic",
  "crisp",
  "daring",
  "eager",
  "fierce",
  "frosty",
  "gentle",
  "happy",
  "humble",
  "jolly",
  "keen",
  "lively",
  "lucky",
  "mellow",
  "merry",
  "noble",
  "plucky",
  "polite",
  "proud",
  "quick",
  "quirky",
  "silver",
  "snappy",
  "sturdy",
  "swift",
  "tidy",
  "vivid",
  "wise",
  "witty",
  "zesty",
] as const;

const ANIMALS = [
  "badger",
  "beaver",
  "cheetah",
  "dolphin",
  "eagle",
  "ferret",
  "finch",
  "fox",
  "gecko",
  "heron",
  "ibex",
  "jaguar",
  "koala",
  "lemur",
  "lynx",
  "marmot",
  "moose",
  "newt",
  "ocelot",
  "otter",
  "panda",
  "panther",
  "puffin",
  "raven",
  "robin",
  "salmon",
  "seal",
  "stoat",
  "tapir",
  "tern",
  "toucan",
  "turtle",
  "viper",
  "weasel",
  "wombat",
] as const;

const pick = <T>(list: readonly T[]): T =>
  list[Math.floor(Math.random() * list.length)]!;

export const generateCoolName = (): string => {
  const suffix = Math.floor(Math.random() * 90 + 10); // 10..99
  return `${pick(ADJECTIVES)}-${pick(ANIMALS)}-${suffix}`;
};
