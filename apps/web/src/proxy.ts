import createMiddleware from 'next-intl/middleware'
import { routing } from './i18n/routing'

export default createMiddleware(routing)

export const config = {
  // Model ids contain dots ("glm-5.3-flash"), so only real static-file
  // extensions are excluded here, not every path with a dot.
  matcher: '/((?!api|_next|_vercel|.*\\.(?:ico|png|jpg|jpeg|svg|webp|gif|txt|xml|json|webmanifest)$).*)',
}
