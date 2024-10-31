// cacheTags.ts
export const cacheTags = {
  eveningReflection: {
    value: "evening_reflection",
    requiresSuffix: false as const,
  },
  morningReflection: {
    value: "morning_reflection",
    requiresSuffix: false as const,
  },
  allEntries: {
    value: "all_entries",
    requiresSuffix: false as const,
  },
  findAllEntries: {
    value: "find_all_entries",
    requiresSuffix: false as const,
  },
  findEntryById: {
    value: "find_entry_by_id",
    requiresSuffix: true as const,
  },
  getStreak: {
    value: "get_streak",
    requiresSuffix: false as const,
  },
  getEntriesCount: {
    value: "get_entries_count",
    requiresSuffix: false as const,
  },
} as const;

export type CacheTags = typeof cacheTags;
