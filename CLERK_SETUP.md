# Clerk Authentication Setup

Clerk is now the identity provider; MongoDB remains the source of truth for app
data. Every Clerk user is linked to a local `User` document, so `Lead.owner`,
`SavedSearch.owner`, dashboard stats, and progress tracking keep working
unchanged.

## What the backend does

- `clerkMiddleware()` verifies the Clerk session on every request.
- `src/middleware/auth.js` resolves the Clerk user to a local Mongo `User`:
  - found by `clerkId` → use it;
  - not found → fetch the profile from Clerk and create/link one.
- Pre-Clerk users (created with email/password) are matched by **email** on
  first Clerk sign-in, so they keep their existing leads.
- `POST /api/webhooks/clerk` keeps `name`, `email`, and `avatar` in sync and
  deletes the user's leads + saved searches when their Clerk account is deleted.

### Auth endpoints

| Endpoint | Purpose |
|---|---|
| `GET /api/auth/me` | Returns the local `User` document for the Clerk session |
| `PATCH /api/auth/me` | Update the locally-stored `name` |

Signup, login, refresh, and logout are handled entirely by Clerk.

## 1. Configure Clerk

1. Create an application at https://dashboard.clerk.com.
2. Enable **User & Authentication → Social Connections → Google**.
3. Copy the keys from **API keys**:
   - Publishable key (`pk_test_...` / `pk_live_...`)
   - Secret key (`sk_test_...` / `sk_live_...`)
4. Create a webhook at **Webhooks → Add Endpoint**:
   - URL: `https://<your-backend-domain>/api/webhooks/clerk`
   - Events: `user.created`, `user.updated`, `user.deleted`
   - Copy the **Signing Secret** (`whsec_...`).

For local development, expose the server with a tunnel (e.g. ngrok) and use the
tunnel URL as the webhook endpoint. Webhooks are optional for login itself —
the auth middleware creates users on first request if a webhook was missed —
but you need them to receive updates and deletions.

## 2. Backend environment variables

```env
CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
CLERK_WEBHOOK_SIGNING_SECRET=whsec_...
```

If the two API keys are missing, the server still boots but all authenticated
routes return `503 AUTH_NOT_CONFIGURED` instead of failing open.

## 3. Frontend changes (required)

The React app still uses the old email/password endpoints, which no longer
exist. To finish the migration:

```bash
cd front
npm install @clerk/clerk-react
```

```env
# front/.env
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
```

Wrap the app in `ClerkProvider`:

```jsx
// src/main.jsx
import { ClerkProvider } from '@clerk/clerk-react'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ClerkProvider publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY}>
      <App />
    </ClerkProvider>
  </StrictMode>
)
```

Replace the custom login/signup pages with Clerk's components, which render the
Google button automatically once the social connection is enabled:

```jsx
// src/pages/LoginPage.jsx
import { SignIn } from '@clerk/clerk-react'
export default function LoginPage() {
  return <SignIn routing="path" path="/login" signUpUrl="/signup" />
}

// src/pages/SignupPage.jsx
import { SignUp } from '@clerk/clerk-react'
export default function SignupPage() {
  return <SignUp routing="path" path="/signup" signInUrl="/login" />
}
```

Send the Clerk session token with API requests. `getToken()` refreshes
automatically, so the old refresh-token interceptor can be deleted:

```js
// src/lib/authToken.js
let getTokenFn = null
export function setTokenGetter(fn) { getTokenFn = fn }
export async function getAuthToken() { return getTokenFn ? getTokenFn() : null }
```

```jsx
// inside App, rendered under ClerkProvider
import { useAuth } from '@clerk/clerk-react'
import { useEffect } from 'react'
import { setTokenGetter } from '@/lib/authToken'

function TokenBridge() {
  const { getToken } = useAuth()
  useEffect(() => { setTokenGetter(getToken) }, [getToken])
  return null
}
```

```js
// src/lib/api.js — request interceptor
import { getAuthToken } from './authToken'

api.interceptors.request.use(async (config) => {
  const token = await getAuthToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})
```

Remove the `TOKEN_EXPIRED` refresh logic from `api.js` and the old
`authStore`/Logout calls. Use Clerk's `useUser()` for the profile and
`useClerk().signOut()` for logout. Protect routes with `useAuth()` or
`<SignedIn>` / `<SignedOut>`.

Clerk also owns password changes now: replace the Settings page's
`authApi.updateMe({ password })` flow with Clerk's `user.updatePassword(...)`
(or embed Clerk's `<UserProfile />` component). `PATCH /api/auth/me` only
accepts `{ name }` for the local profile.

## 4. Data notes

- Existing users keep their `_id`, so all owned leads remain attached.
- `passwordHash` stays on legacy documents but is never used or returned.
- Deleting a user in Clerk removes their local user, leads, and saved searches.
  If you would rather retain that data, change the `user.deleted` branch in
  `src/routes/clerkWebhook.js`.

## 5. Checklist

- [ ] Add Clerk keys to `.env` (and Vercel env vars)
- [ ] Enable Google in the Clerk dashboard
- [ ] Create the webhook endpoint and add its signing secret
- [ ] Migrate the React app to `@clerk/clerk-react`
- [ ] Sign in with Google and verify the Mongo user has a `clerkId`
- [ ] Trigger a test `user.created` webhook from the Clerk dashboard
