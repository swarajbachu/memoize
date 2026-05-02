import { Schema } from "effect";

const TrimmedNonEmptyString = Schema.Trim.pipe(Schema.nonEmptyString());

const makeEntityId = <Brand extends string>(brand: Brand) =>
  TrimmedNonEmptyString.pipe(Schema.brand(brand));

export const FolderId = makeEntityId("FolderId");
export type FolderId = typeof FolderId.Type;

export const PtyId = makeEntityId("PtyId");
export type PtyId = typeof PtyId.Type;
