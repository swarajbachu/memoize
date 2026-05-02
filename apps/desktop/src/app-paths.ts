import { Context } from "effect";

/**
 * Resolved Electron paths the main process needs at runtime. Provided once at
 * boot from `app.getPath("userData")` etc., then any service that persists or
 * reads from disk yields this tag instead of importing electron itself.
 *
 * Keeps services testable (swap a temp dir in tests) and free of `electron`
 * imports outside the boot script.
 */
export class AppPaths extends Context.Tag("forkzero/AppPaths")<
  AppPaths,
  {
    readonly userData: string;
  }
>() {}
