import { appRouter, createTRPCContext } from "@memoize/api";
import { auth } from "@memoize/auth";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";

export const runtime = "edge";

/**
 * Configure basic CORS headers
 * You should extend this to match your needs
 */
const setCorsHeaders = (res: Response) => {
  res.headers.set("Access-Control-Allow-Origin", "*");
  res.headers.set("Access-Control-Request-Method", "*");
  res.headers.set("Access-Control-Allow-Methods", "OPTIONS, GET, POST");
  res.headers.set("Access-Control-Allow-Headers", "*");
};

export const OPTIONS = () => {
  const response = new Response(null, {
    status: 204,
  });
  setCorsHeaders(response);
  return response;
};

const handler = auth(async (req) => {
  const response = await fetchRequestHandler({
    endpoint: "/api/trpc",
    router: appRouter,
    req,
    batching: {
      enabled: false,
    },
    createContext: () =>
      createTRPCContext({
        session: req.auth,
        headers: req.headers,
      }),
    onError({ error, path }) {
      console.error(`>>> tRPC Error on '${path}'`, error);
    },
  });

  setCorsHeaders(response);
  return response;
});

export { handler as GET, handler as POST };
