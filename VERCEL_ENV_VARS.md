# Vercel Environment Variables

> Never commit real secrets to this file. Set values in the Vercel dashboard
> (Project → Settings → Environment Variables) or locally in `.env`.

## Backend project (leadserver.vercel.app)

| Name | Value |
|------|-------|
| `MONGODB_URI` | your MongoDB Atlas connection string |
| `CLERK_PUBLISHABLE_KEY` | `pk_live_...` (Clerk → API keys) |
| `CLERK_SECRET_KEY` | `sk_live_...` (Clerk → API keys) |
| `CLERK_WEBHOOK_SIGNING_SECRET` | `whsec_...` (Clerk → Webhooks → your endpoint) |
| `CLIENT_URL` | `https://clientleadscout.vercel.app` |
| `NODE_ENV` | `production` |
| `GOOGLE_PLACES_API_KEY` | your Google Places API key |
| `YELP_API_KEY` | your Yelp Fusion API key |

> `CLIENT_URL` = the FRONTEND domain (where the React app is hosted).
> The backend uses this to decide which origins are allowed in CORS.

Set the Clerk webhook endpoint to:

```
https://leadserver.vercel.app/api/webhooks/clerk
```

with events `user.created`, `user.updated`, and `user.deleted`.

---

## Frontend project (clientleadscout.vercel.app)

| Name | Value |
|------|-------|
| `VITE_API_URL` | `https://leadserver.vercel.app` |
| `VITE_CLERK_PUBLISHABLE_KEY` | `pk_live_...` (same publishable key as the backend) |

> No trailing slash on `VITE_API_URL`. This tells the React app where to send
> API requests.

---

## After saving vars

Click **Redeploy** on each project. See `CLERK_SETUP.md` for the full Clerk and
frontend migration checklist.
