# AKATSUKI - Options Scalping Terminal

A fully self-contained React Native mobile app for Kotak Securities options trading. Zero backend dependency — everything runs natively on Android.

## Architecture

- **Frontend**: Expo React Native (app runs entirely on device)
- **Backend**: Minimal Express.js (only serves the landing page, not used by the mobile app)
- **Storage**: Android Keystore via expo-secure-store (credentials encrypted on-device)
- **API**: Direct calls from device → Kotak Securities API

## How It Works

1. User sets up Kotak credentials once (stored encrypted in Android Keystore)
2. Each session: enter 6-digit TOTP → app calls Kotak API directly
3. Session tokens held in memory (expire daily)
4. Options chain CSV downloaded from Kotak on login, parsed on-device
5. All orders/positions/funds fetched directly from Kotak's servers

## App Screens

- **Setup** (`app/setup.tsx`): One-time Kotak credential entry
- **TOTP** (`app/totp.tsx`): Daily TOTP login  
- **Chain** (`app/(terminal)/index.tsx`): Options chain with buy/sell
- **Positions** (`app/(terminal)/positions.tsx`): Live positions & P&L
- **Orders** (`app/(terminal)/orders.tsx`): Order book with cancel
- **Funds** (`app/(terminal)/funds.tsx`): Margin info & session

## Key Files

- `context/KotakContext.tsx` — All state management, API calls, polling
- `lib/kotak-api.ts` — Kotak API client (direct fetch calls)
- `lib/options-engine.ts` — CSV download + options chain parser
- `constants/colors.ts` — Dark trading terminal theme

## Building APK

```bash
npx eas build --platform android --profile preview
```
Requires EAS CLI installed and Expo account. No backend server needed for the APK.

## Credentials Flow

accessToken → from NEO dashboard (Trade API section)
mobileNumber → registered mobile (+91XXXXXXXXXX)
UCC → Kotak client code
MPIN → 6-digit trading MPIN

Stored encrypted in Android Keystore. Never transmitted to any server other than Kotak's own servers.
