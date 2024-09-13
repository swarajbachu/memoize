import { auth } from '@memoize/auth'

export { auth as middleware } from '@memoize/auth'

// Or like this if you need to do something here.
export default auth((req) => {
  console.log(req.auth, 'auth from middleawre') //  { session: { user: { ... } } }
})

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
    '/(api|hono)(.*)',
  ],
}
