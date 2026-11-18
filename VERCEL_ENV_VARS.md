# Vercel Environment Variables

> Do not commit real secrets to this file. Set them in the Vercel dashboard.

## Backend project

Dashboard → Settings → Environment Variables → add:

| Name | Value |
|------|-------|
| `MONGODB_URI` | your MongoDB connection string |
| `CLERK_PUBLISHABLE_KEY` | `pk_test_...` or `pk_live_...` |
| `CLERK_SECRET_KEY` | `sk_test_...` or `sk_live_...` |
| `CLERK_WEBHOOK_SIGNING_SECRET` | `whsec_...` (Clerk → Webhooks) |
| `CLIENT_URL` | `https://clientleadscout.vercel.app` (comma-separate multiple origins) |
| `ALLOW_VERCEL_PREVIEWS` | `true` by default; set `false` to restrict CORS to exact origins |
| `NODE_ENV` | `production` |
| `GOOGLE_PLACES_API_KEY` | your Google Places API key (optional) |
| `YELP_API_KEY` | your Yelp Fusion key (optional) |

> `CLIENT_URL` is used to restrict CORS origins. Use a comma-separated list for
> multiple frontend URLs (`CLIENT_URLS` and `FRONTEND_URL` are also accepted).
> Wildcards work: `https://leadscout-*.vercel.app`.
>
> Vercel preview deployments (`https://*.vercel.app`) are allowed by default so
> branch/preview URLs work without another env-var change. Set
> `ALLOW_VERCEL_PREVIEWS=false` once your production domain is fixed.

> **CORS troubleshooting:** if the browser reports
> `Access-Control-Allow-Origin missing`, check the exact origin (scheme + host,
> no trailing slash) in `CLIENT_URL`. A quick check from your machine:
>
> ```bash
> curl -i -H "Origin: https://your-frontend.vercel.app" \
>   https://leadserver.vercel.app/api/auth/me
> ```
>
> You should see `Access-Control-Allow-Origin` in the response — even for a 401
> or 503. Without the header, add that origin to `CLIENT_URL` and redeploy.

> **Database 503:** if the API returns
> `DATABASE_UNAVAILABLE`, add `0.0.0.0/0` to MongoDB Atlas → Network Access (or
> the Vercel egress ranges) and confirm `MONGODB_URI` points at the right
> cluster. The API now keeps running and answers with CORS headers instead of
> crashing.

> The Clerk webhook endpoint is `https://<backend-domain>/api/webhooks/clerk`.
> Subscribe it to `user.created`, `user.updated`, and `user.deleted`.

---

## Frontend project

Dashboard → Settings → Environment Variables → add:

| Name | Value |
|------|-------|
| `VITE_API_URL` | `https://leadserver.vercel.app` |
| `VITE_CLERK_PUBLISHABLE_KEY` | `pk_test_...` or `pk_live_...` |

> No trailing slash on `VITE_API_URL`.

In the Clerk dashboard, add both deployed origins to the instance's allowed
origins (and allowed redirect URLs) before testing sign-in in production.

---

## After saving vars

Click **Redeploy** on each project (without clearing cache is fine).
