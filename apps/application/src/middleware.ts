import { auth } from "@memoize/auth";
import { NextResponse } from "next/server";

// Define arrays for different types of routes
const authRoutes = ["/sign-in", "/sign-up", "/verify-email"];
const publicRoutes = ["/test"];

export default auth((req) => {
  const { nextUrl, auth: session } = req;
  const isApiRoute = nextUrl.pathname.startsWith("/api");
  const isAuthRoute = authRoutes.includes(nextUrl.pathname);
  const isPublicRoute = publicRoutes.includes(nextUrl.pathname);

  // Allow API routes to pass through
  if (isApiRoute) {
    return NextResponse.next();
  }

  // Redirect logged-in users away from auth routes
  if (session && isAuthRoute) {
    return NextResponse.redirect(new URL("/", nextUrl.origin));
  }

  // Allow access to public routes regardless of auth status
  if (isPublicRoute) {
    return NextResponse.next();
  }

  // Redirect non-authenticated users to sign-in for private routes
  if (!session && !isAuthRoute) {
    const signInUrl = new URL("/sign-in", nextUrl.origin);
    signInUrl.searchParams.set("redirectTo", nextUrl.pathname + nextUrl.search);
    return NextResponse.redirect(signInUrl);
  }

  // Allow access to all other routes for authenticated users
  return NextResponse.next();
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
    "/(api|hono)(.*)",
  ],
};
