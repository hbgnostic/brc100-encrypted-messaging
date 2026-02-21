# BRC-100 Wallet Project: Complete Session Summary

## What We Built

An encrypted messaging demo using the BRC-100 wallet toolbox. Two wallets (Alice and Bob) can exchange encrypted, signed messages through the terminal — no server, no blockchain, just cryptographic key derivation.

### Project Location
- **Alice's wallet:** `~/BRC100Wallet/`
- **Bob's wallet:** `~/BRC100Wallet-Bob/` (a copy of Alice's folder with its own identity)

### Key File
- `messaging.ts` — The complete application. Uses four BRC-100 wallet methods: `encrypt`, `decrypt`, `createSignature`, `verifySignature`.

### CLI Commands
```bash
npx ts-node messaging.ts init                              # Create wallet identity
npx ts-node messaging.ts identity                          # Show public identity key
npx ts-node messaging.ts encrypt <recipient-pubkey> "msg"  # Encrypt and sign
npx ts-node messaging.ts decrypt '<envelope-json>'         # Verify and decrypt
npx ts-node messaging.ts demo                              # Self-contained Alice/Bob demo
```

### Demo Flow (Two Terminals Side by Side)
1. Alice runs `init` → gets her public identity key
2. Bob runs `init` → gets his public identity key
3. Alice runs `encrypt <bobs-key> "Hello Bob!"` → outputs JSON envelope
4. Bob runs `decrypt '<JSON from Alice>'` → sees the decrypted message
5. Bob can reply with `encrypt <alices-key> "Hey Alice!"` → Alice decrypts
6. Six commands total, three per terminal

---

## How We Got Here: The Journey

### Starting Point
- User had an existing `identity-client` project in TypeScript using `@bsv/sdk`
- It implemented BRC-77 message signing, seed-based key derivation, and CLI signing
- User had a deep dive document (`BRC100-Wallet-Toolbox-Deep-Dive.md`) exploring the Go wallet toolbox

### Phase 1: Hand-Rolled Messaging (SDK Only)
- Built `messaging.ts` using raw SDK primitives: `KeyDeriver`, `SymmetricKey`, `SignedMessage`
- Created our own `SealedMessage` JSON envelope format
- This worked but was not BRC-100 compliant — we invented our own message format
- The crypto ingredients were standard (BRC-42, BRC-77, AES-GCM) but the packaging was ours

### Phase 2: Switched to Wallet Toolbox
- Installed `@bsv/wallet-toolbox` (the TypeScript BRC-100 wallet library)
- Rebuilt `messaging.ts` to use the toolbox's `Setup.createWalletSQLite()` and the wallet's built-in methods
- Now using `wallet.encrypt()`, `wallet.decrypt()`, `wallet.createSignature()`, `wallet.verifySignature()`
- The wallet handles key derivation, encryption, and signing internally — no hand-rolled crypto

### Phase 3: Made It Demo-Ready
- Added `init` command with persisted identity (`wallet-key.json`)
- Removed need to pass private key on every command
- Created Bob's folder as a copy for two-terminal demo
- Cleaned up leftover files from the hand-rolled version (`seed.ts`, `identity.ts`, `seed.bin`)

---

## The Ecosystem: Understanding the Layers

### Three Layers
```
Layer 1: SDK
  - Go:         go-sdk
  - TypeScript: @bsv/sdk (npm)
  - Contains:   PrivateKey, KeyDeriver, SymmetricKey, SignedMessage, type definitions
  - Role:       Cryptographic primitives and the BRC-100 interface DEFINITION

Layer 2: Wallet Toolbox (Library)
  - Go:         go-wallet-toolbox (github.com/bsv-blockchain/go-wallet-toolbox)
  - TypeScript: @bsv/wallet-toolbox (npm, docs at bsv-blockchain.github.io/wallet-toolbox/)
  - Contains:   Wallet, Setup, Storage, Services, Monitor, and more
  - Role:       BRC-100 interface IMPLEMENTATION — a library you import and build with

Layer 3: Applications
  - MetaNet Client (desktop wallet)
  - Our messaging demo
  - Any app that imports the toolbox or implements the interface
```

### SDK vs Wallet Toolbox
- **SDK** = bricks. Cryptographic primitives and type definitions.
- **Wallet Toolbox** = a house made of those bricks. Storage, services, monitoring, the 29+ methods, all wired together.
- The toolbox imports the SDK as a dependency. It wraps it, connects pieces, and adds infrastructure.
- We import from both: `PrivateKey`, `Utils`, `WalletProtocol` from the SDK; `Setup` from the toolbox.

### Go vs TypeScript Implementations
- **Same 29+ BRC-100 methods**, same storage schema, same key derivation, same test vectors
- **Same team**: Thomas Giacomo, Darren Kellenschwiler (owners), Ty Everett (dev lead)
- **Go version**: Server-side focused. SQLite, PostgreSQL, MySQL via GORM. No browser support.
- **TypeScript version adds**: IndexedDB (browser), Shamir key recovery (WABClient), WalletPermissionsManager, multi-profile identity, browser and mobile build targets.
- The extras in TypeScript exist because it targets browsers/phones where users interact directly with wallets.

---

## Key Concepts Explained

### BRC-100 Wallet Interface
- Defines 29+ methods that any BRC-100 wallet must implement
- The interface is fixed, vendor-neutral, and language-independent
- Methods cover: transactions, outputs, crypto primitives, key linkage, certificates, network status
- Any app that targets the interface works with any compliant wallet

### The 29+ Methods (Organized by Category)
**Transaction Operations (7):** CreateAction, SignAction, AbortAction, InternalizeAction, ListActions, ListFailedActions, ListTransactions/ListNoSendActions

**Output Management (2):** ListOutputs, RelinquishOutput

**Cryptographic Primitives (7):** GetPublicKey, CreateSignature, VerifySignature, Encrypt, Decrypt, CreateHMAC, VerifyHMAC

**Key Linkage (2):** RevealCounterpartyKeyLinkage, RevealSpecificKeyLinkage

**Identity Certificates (6):** AcquireCertificate, ListCertificates, ProveCertificate, RelinquishCertificate, DiscoverByIdentityKey, DiscoverByAttributes

**Network and Status (7+):** GetHeight, GetHeaderForHeight, GetNetwork, GetVersion, IsAuthenticated, WaitForAuthentication, Close/Destroy

### BRC-42/43 Key Derivation
- ECDH-based. No BIP32, no xPub, no xPriv.
- Three inputs: your private key + counterparty's public key + protocol/keyID
- Both parties independently derive the same shared key from math alone — no key exchange needed
- The identity key (public key) is never used directly for encryption/signing/transactions
- Every interaction produces a unique derived key
- Privacy at two levels: choice of which identity to use, and unique derived keys per interaction

### Identity Keys
- Your identity key is your compressed secp256k1 public key (33 bytes, 66 hex chars)
- It's meant to be shared openly — like a phone number
- It never appears on-chain. On-chain transactions use derived keys.
- A person can have multiple identity keys for different contexts (personal, professional, anonymous)
- Each identity key is its own root with its own tree of derived keys — completely unlinkable

### What Our Four Methods Do
1. **`wallet.encrypt()`** — Derives a shared symmetric key (BRC-42) from our private key + recipient's public key + protocol + keyID. Encrypts plaintext with AES-GCM.
2. **`wallet.createSignature()`** — Signs the ciphertext with our identity key. Proves who sent it.
3. **`wallet.verifySignature()`** — Verifies the signature came from the claimed sender.
4. **`wallet.decrypt()`** — Derives the same shared key (from the other direction) and decrypts.

### WalletProtocol
- A tuple: `[SecurityLevel, protocolName]`
- SecurityLevel: 0 (silent), 1 (per-app), 2 (per-counterparty per-app)
- Protocol name: 5-400 characters
- We use: `[2, "encrypted messaging"]`
- Every key derivation is scoped to a protocol — different protocols produce different keys

### KeyID
- A string identifier for key derivation (up to 800 characters)
- Allows multiple independent keys per counterparty per protocol
- Could be one per conversation, one per message, one per topic — design choice
- We use: `"default"`

### InternalizeAction
- One of the 29 BRC-100 methods (we don't use it in our demo)
- Means "take a transaction someone else created and bring it into my wallet"
- When someone pays you, your wallet recognizes the outputs that belong to you, adds them to your balance, tags them, tracks them

### WaitForAuthentication
- Takes no parameters, returns `{ authenticated: true }`
- Blocks until the user has been authenticated (e.g., OTP verification for Shamir key recovery)
- We don't use it because we load the private key directly from a file — no authentication gate
- In production with Shamir, the key doesn't exist until the user proves who they are; the key is assembled in memory from shares on the fly

---

## Storage

### What createWalletSQLite Creates
- A full BRC-100 storage schema in SQLite
- Tables for: Users, Transactions, Outputs, OutputBaskets, ProvenTx, ProvenTxReq, Certificates, CertificateFields, TxLabels, OutputTags, Commissions, SyncState, Settings, MonitorEvents
- Most tables are empty in our demo since we only use crypto methods
- The same schema is shared between Go and TypeScript implementations

### Key Persistence in Our Demo
- Private key saved to `wallet-key.json` (plain text — simplified for demo)
- SQLite database at `wallet.sqlite`
- In production: encrypted storage, environment variables, Shamir key splitting, or secrets manager

---

## Swagger / JSON API

### What Swagger Is
- A tool that generates interactive API documentation from an OpenAPI specification file
- Creates a web page where you can see every method, its parameters, and return types
- The BSV SDK hosts one at `bsv-blockchain.github.io/ts-sdk/swagger/`
- It documents the BRC-100 wallet interface — the same 29+ methods regardless of implementation language

### Why Every Method Is a POST Endpoint
- The wallet interface is designed to work over HTTP (not just local function calls)
- A web app in a browser might talk to a wallet running on a server or phone
- POST is used for all endpoints for consistency: send JSON in, get JSON back
- `WalletClient` in the toolbox implements this — same 29 methods but as HTTP requests

### Schemas Section
- Defines the shape of every JSON object used by the endpoints
- `CreateActionArgs` = what you send to `/createAction`
- `CreateActionResult` = what you get back
- Schemas are reusable — `WalletOutput` appears inside multiple results
- Together with the endpoints, schemas form the complete API contract

### HTTP Methods
- **GET** = "give me data" — you're reading
- **POST** = "here's data, do something with it" — you're sending
- **Request** = general term for any call to a server
- **Fetch** = a JavaScript function that makes requests (can do GET, POST, etc.)

---

## Terminology

| Term | Meaning |
|------|---------|
| **SDK** | Software Development Kit — lower-level primitives and type definitions |
| **Library** | Code you import and call. You're in control. The wallet toolbox is a library. |
| **Framework** | Code that calls you. You plug into it. (Express, React) |
| **Method** | A function that belongs to an object. `wallet.encrypt()` is a method. |
| **Function** | Standalone. `deriveSharedKey()` is a function. |
| **Class** | The blueprint that defines what methods an object has. `Wallet` is a class. |
| **Interface** | A contract — defines what methods must exist without implementing them. |
| **Swagger** | A tool that renders interactive API docs from an OpenAPI spec file. |
| **OpenAPI spec** | A JSON/YAML file describing an API's endpoints, parameters, and types. |
| **YAML** | A structured data format (like JSON). Used by Swagger, Docker, and many other tools. Not Docker-specific. |

---

## The Bug We Found

### What Happened
- `Setup.createWalletSQLite()` throws "Function not implemented" on first call
- The function `randomBytesHex` in the compiled `Setup.js` is a stub that throws instead of generating random hex
- The function exists properly in `utilityHelpers.ts` but isn't imported in the compiled output
- Present in both v2.0.19 and v2.1.0-beta.3

### Our Patch
In `node_modules/@bsv/wallet-toolbox/out/src/Setup.js`:
```javascript
// BEFORE (broken)
function randomBytesHex(arg0) {
    throw new Error('Function not implemented.');
}

// AFTER (our fix)
function randomBytesHex(count) {
    return require('crypto').randomBytes(count).toString('hex');
}
```

### Why It Disappears
- The patch is inside `node_modules`, which is downloaded from npm
- Running `npm install` rebuilds the folder, overwriting our change
- The real fix: submit a pull request to the wallet-toolbox repo

### Potential Pull Request
- Fork `github.com/bsv-blockchain/wallet-toolbox`
- Fix the missing import in the source `Setup.ts` (not the compiled `.js`)
- Run `npm test`
- Submit PR
- Forking is normal and silent — the team only sees your work when you submit the PR

---

## Files in the Project

```
~/BRC100Wallet/
├── messaging.ts                           # The application (4 BRC-100 methods)
├── package.json                           # Dependencies: @bsv/sdk, @bsv/wallet-toolbox
├── tsconfig.json                          # TypeScript config
├── .gitignore                             # Excludes node_modules, wallet-key.json, *.sqlite, .env
├── .env                                   # Empty (suppresses dotenv warnings)
├── BRC100-Wallet-Toolbox-Deep-Dive.md     # Go wallet toolbox deep dive (original)
├── BRC100-TS-Wallet-Toolbox-Deep-Dive.md  # TypeScript wallet toolbox deep dive (new)
├── SESSION-SUMMARY.md                     # This file
├── node_modules/                          # Dependencies (includes patched Setup.js)
├── wallet-key.json                        # Created by 'init' — private key (gitignored)
└── wallet.sqlite                          # Created by wallet setup (gitignored)

~/BRC100Wallet-Bob/
└── (same files, separate identity)
```

---

## Video Script Notes

### What to Install
> "I installed two packages: `@bsv/sdk` — the BSV SDK with cryptographic primitives — and `@bsv/wallet-toolbox` — the BRC-100 wallet library with built-in encrypt, decrypt, sign, and verify methods."

### What messaging.ts Does
> "Three parts: wallet setup with `Setup.createWalletSQLite()`, an encrypt flow that calls `wallet.encrypt()` and `wallet.createSignature()`, and a decrypt flow that calls `wallet.verifySignature()` and `wallet.decrypt()`. Four BRC-100 wallet methods doing all the work."

### Identity Key Explanation
> "We create a root private key — 32 random bytes. The wallet derives everything from this one key: encryption keys, signing keys, shared secrets. The public key becomes your identity — how other wallets know you. The identity key never touches the blockchain. Even if this wallet sent a payment, the transaction would use derived keys unique to that specific interaction."

### Multiple Identities
> "A user can have multiple identity keys for different contexts — personal, professional, anonymous. Each is independent and unlinkable. The BRC-42 key derivation creates unique derived keys underneath each identity, per counterparty and per protocol."

### Scope of the Demo
> "What we're building is a messaging-only application using four of the twenty-nine BRC-100 wallet methods. A full BRC-100 wallet handles transactions, certificates, output management, and more. For this demo, we're focused on encrypted communication between two identities."

### Why Wallet Toolbox Instead of Raw SDK
> "We could write the crypto ourselves using the SDK's primitives. But the wallet toolbox gives us BRC-100 compliant methods that interoperate with any other BRC-100 wallet. If we built it from scratch, we'd end up inventing our own message format that nothing else understands."

---

*Summary generated February 20, 2026, from a multi-hour session covering BRC-100 architecture, the Go and TypeScript wallet toolboxes, encrypted messaging implementation, Swagger API documentation, and open-source contribution.*
