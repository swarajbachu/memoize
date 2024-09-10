import { router } from "../__internals/router";
import { protectedProcedure, publicProcedure } from "../procedure";

export const honoTestRouter = router({
  testRoute: publicProcedure.query(({ c }) => {
    return c.superjson({
      message: "hello world",
    });
  }),
});
