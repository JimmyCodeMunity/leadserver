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
| `NODE_ENV` | `production` |
| `GOOGLE_PLACES_API_KEY` | your Google Places API key (optional) |
| `YELP_API_KEY` | your Yelp Fusion key (optional) |

> **Both Clerk keys must come from the same Clerk application.** The publishable
> key and secret key are not interchangeable between Clerk apps. A mismatch
> verifies tokens against one instance while fetching users from another, which
> shows up as `401 INVALID_TOKEN` or "user not found" errors. The frontend
> `VITE_CLERK_PUBLISHABLE_KEY` must also match the backend publishable key.
> Decode the publishable key's host to check:
>
> ```bash
> echo "$CLERK_PUBLISHABLE_KEY" | cut -d_ -f3 | base64 -d | cut -d'$' -f1
> ```
>
> The sign-in URL host returned by `POST https://api.clerk.com/v1/sign_in_tokens`
> must be the same instance.

> CORS is fully open: the API reflects every request origin and allows
> credentialed requests, so no origin allowlist is needed. Auth is stateless
> (Clerk token in the `Authorization` header), so this does not grant access to
> anyone without a valid token. `CLIENT_URL`, `CLIENT_URLS`,
> `FRONTEND_URL`, and `ALLOW_VERCEL_PREVIEWS` are no longer used.

> **CORS troubleshooting:** every response, including 401/503 errors, must carry
> `Access-Control-Allow-Origin`. Verify from your machine:
>
> ```bash
> curl -i -H "Origin: https://your-frontend.vercel.app" \
>   https://leadserver.vercel.app/api/auth/me
> ```
>
> If the header is missing on a 500, the function crashed before Express started;
> check the deployment logs.

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
