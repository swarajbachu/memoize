import { NextResponse } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const publicRoutes = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/verify-email(.*)",
]);

const authRoutes = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/verify-email(.*)",
]);

export default clerkMiddleware((auth, req) => {
  const { userId, redirectToSignIn } = auth();
  const { nextUrl } = req;

  // Allow access to public routes regardless of auth status
  if (publicRoutes(req)) {
    return NextResponse.next();
  }

  // If the user isn't signed in and the route is private, redirect to sign-in
  if (!userId && !publicRoutes(req)) {
    return redirectToSignIn({ returnBackUrl: req.url });
  }

  // Redirect logged-in users away from auth routes
  if (userId && authRoutes(req)) {
    const homeUrl = new URL("/", nextUrl.origin);
    return NextResponse.redirect(homeUrl);
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
