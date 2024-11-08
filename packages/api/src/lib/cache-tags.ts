// cacheTags.ts
export const cacheTags = {
  eveningReflection: {
    value: "evening_reflection",
    requiresSuffix: false,
  },
  morningReflection: {
    value: "morning_reflection",
    requiresSuffix: false,
  },
  allEntries: {
    value: "all_entries",
    requiresSuffix: false,
  },
  findAllEntries: {
    value: "find_all_entries",
    requiresSuffix: false,
  },
  findEntryById: {
    value: "find_entry_by_id",
    requiresSuffix: true,
  },
  getStreak: {
    value: "get_streak",
    requiresSuffix: false,
  },
  getEntriesCount: {
    value: "get_entries_count",
    requiresSuffix: false,
  },
} as const;

export type CacheTags = typeof cacheTags;
