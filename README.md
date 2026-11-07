# DRUGS LITES PHARMA

Pharmacy point-of-sale and recordkeeping application for inventory, billing, batches, suppliers, customers, prescriptions, expenses, and reports.

## Run locally

**Prerequisite:** Node.js 20.19+ or 22.12+.

```sh
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) on the computer running the server. There is no demo login or preloaded sales, customer, supplier, or inventory data. Sign-in requires a configured Firebase Authentication account linked to an active Firestore staff profile.

### Test on a phone or tablet

The development server listens on the network so you can test the responsive app from another device on the same trusted Wi-Fi network. Find the computer's IPv4 address with `ipconfig`, then open `http://<computer-ipv4-address>:3000` on the phone or tablet. If Windows Firewall prompts you, allow Node.js on **Private networks** only. Do not expose the development server to the public internet or forward its port through your router.

Set `HOST=127.0.0.1` in `.env` and restart the server to disable LAN access. If Firebase Authentication rejects the phone's address as an unauthorized domain, add that address under the Firebase project's Authentication authorized domains.

## Firebase setup

1. Enable **Email/Password** in Firebase Authentication and create the first Admin user. Public account requests cannot initialize the first Admin.
2. Before deploying the rules, create these Firestore documents in the configured database:
   - `staff/{staffId}` with `id`, `name`, `username`, `email`, `phone`, `role: "Admin"`, `status: "Active"`, and `createdDate` (`YYYY-MM-DD`).
   - `staff_accounts/{firebaseAuthUid}` with `enabled: true`, the same `staffId`, and `role: "Admin"`.
   The staff profile email must match the Firebase Authentication email. Never add a password to a staff profile.
3. Deploy [firestore.rules](./firestore.rules). Staff can then create accounts from the sign-in screen; each account stays locked until an Admin approves its access request in Staff Management and assigns a role. Adding a profile with **Add Staff Account** alone does not create a sign-in.
4. Configure and test the Firebase project and Firestore database before entering pharmacy records. Local browser storage is device- and browser-specific; it is not a backup.

## AI features

The server-side assistant requires `GEMINI_API_KEY`. Invoice extraction uses Gemini first and can fall back to OpenRouter when `OPENROUTER_API_KEY` is configured. Set keys only in the server environment (for local development, create a private `.env` file based on `.env.example`); never put keys in browser code or source control. AI requests require a valid Firebase staff session and are rate-limited. Provider quotas and billing still apply; the fallback does not make AI usage unlimited. OpenRouter model availability, image/PDF support, and pricing depend on the selected model; PDF processing may incur additional provider charges. If authentication, network access, quota, or AI service setup fails, the app reports an error instead of inventing invoice or inventory data. Verify extracted invoice details against the source document before saving.

AI assistant requests send the entered message, optional image, and relevant inventory context to Gemini. Invoice pages are sent to Gemini and, only if Gemini fails, OpenRouter when its fallback key is configured. The fallback model defaults to `openai/gpt-4o-mini`; set `OPENROUTER_MODEL` in the server environment to use a different model supported by OpenRouter. Do not send information unless your store has approved that processing.

New medicines created from purchase entries default to Schedule H until an authorized user verifies and updates their actual classification. Confirm product classification, batch, expiry, tax, and price details before dispensing or completing records.

The POS creates UPI payment QR codes but is not connected to a bank/payment gateway and cannot verify settlement automatically. Staff must verify the payment in the merchant app and enter the actual transaction reference before completing a UPI bill. Card payments are processed on an external terminal; enter its transaction reference after verifying payment. The app does not connect to a card terminal.

## Production checks

```sh
npm run lint
npm run build
npm start
```

## Publish on Render

1. In Render, choose **New → Blueprint**, connect `dreglitespharma-ui/Druglitespharma`, and deploy the `main` branch. Render reads [render.yaml](./render.yaml) to build the Vite app and run its Express server.
2. After Render gives the service its `onrender.com` address, add that hostname under **Firebase Console → Authentication → Settings → Authorized domains**. Deploy and verify [firestore.rules](./firestore.rules), and configure the first Admin and active staff profile using the Firebase setup instructions above.
3. To enable the AI assistant, add `GEMINI_API_KEY` in the Render service's private **Environment** settings. To enable invoice parsing fallback, also add `OPENROUTER_API_KEY`; optionally configure `OPENROUTER_MODEL`. Redeploy after configuring either key. Do not put keys in this repository or browser code.

The included Blueprint uses Render's free web-service plan, which may spin down after inactivity. A static-only deployment does not provide the authenticated AI API routes. Test authentication, rules, sales, restore, backups, and synchronization with the actual Firebase project before using real pharmacy or patient data.

Deploy to another Node.js host by running the same build and start commands and configuring the host's `PORT`, Firebase project, Firestore rules, and server-side AI provider keys.

JSON backup downloads are manual exports to the current device. Google Drive backup is not implemented. This application does not itself verify pharmacy licences or regulatory compliance.
