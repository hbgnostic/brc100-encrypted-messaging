# BRC-100 TypeScript Wallet Toolbox: A Deep Dive

## What This Document Is

This is a comprehensive exploration of `@bsv/wallet-toolbox` — the BSV Blockchain Association's BRC-100 compliant wallet library for TypeScript. It was produced by installing the npm package, reading type definitions, tracing exports through the package structure, and documenting what was found. Everything in this document is grounded in actual code, not marketing copy.

The goal: understand what this library actually is, how it works at the code level, and how it compares to the Go wallet-toolbox explored in the companion deep dive.

**npm Package:** @bsv/wallet-toolbox
**Repository:** github.com/bsv-blockchain/wallet-toolbox
**Version investigated:** v2.1.0-beta.3 (February 2026)
**Commits:** 2,392 on main
**Releases:** 150
**Language:** TypeScript 99.9%
**License:** Open BSV License
**Stars:** 17 | **Forks:** 19 | **Contributors:** 15

---

## The One-Line Summary

The wallet-toolbox is a TypeScript library that implements the BRC-100 wallet interface specification. You install it from npm and import it into your own application. It gives you key derivation, transaction building, persistent storage, background task management, permission control, Shamir key recovery, and integrations with BSV blockchain services. There is no Docker deployment, no frontend, no admin panel. You write TypeScript code and run it.

---

## How It Relates to the Go Version

The Go wallet-toolbox (`go-wallet-toolbox`) and this TypeScript wallet-toolbox are two independent implementations of the same BRC-100 specification. They share the same database schema, the same `universal-test-vectors` for cross-language compatibility, and the same architectural pattern (wallet, storage, services, monitor). They are maintained by the same team.

### Go

- **Repo:** go-wallet-toolbox
- **Install:** `go get github.com/bsv-blockchain/go-wallet-toolbox`
- **SDK:** go-sdk
- **Storage:** SQLite, PostgreSQL, MySQL (via GORM)

### TypeScript

- **Repo:** wallet-toolbox
- **Install:** `npm install @bsv/wallet-toolbox`
- **SDK:** @bsv/sdk
- **Storage:** SQLite, MySQL (via Knex), IndexedDB (browser)
- **Extras not in Go:** WABClient, Shamir key recovery, WalletPermissionsManager, multi-profile identity, browser and mobile build targets

### Same in Both

- **Leadership:** Thomas Giacomo, Darren Kellenschwiler (owners), Ty Everett (dev lead)
- **Database schema:** Shared across both implementations
- **Test vectors:** universal-test-vectors for cross-language compatibility

The TypeScript version adds browser support (IndexedDB), Shamir-based key recovery (WABClient), application permission control (WalletPermissionsManager), and multi-profile identity management (CWIStyleWalletManager) — features the Go version does not have.

---

## Package Structure

```
@bsv/wallet-toolbox/
├── out/src/
│   ├── Wallet.js/.d.ts                # BRC-100 wallet implementation (the core)
│   ├── Setup.js/.d.ts                 # Server-side wallet creation (SQLite, MySQL, Knex)
│   ├── SetupClient.js/.d.ts           # Browser-side wallet creation (IndexedDB)
│   ├── WalletSigner.js/.d.ts          # Transaction signing
│   ├── ShamirWalletManager.js/.d.ts   # 2-of-3 Shamir key recovery
│   ├── CWIStyleWalletManager.js/.d.ts # Multi-profile, password + UMP tokens
│   ├── WalletAuthenticationManager.js # WAB-integrated authentication
│   ├── WalletPermissionsManager.js    # Application permission control
│   ├── PrivilegedKeyManager.js        # Privileged key management
│   ├── storage/
│   │   ├── WalletStorageManager.js    # Active/backup storage orchestration
│   │   ├── StorageKnex.js             # Knex-backed storage (SQLite, MySQL)
│   │   ├── StorageIdb.js              # IndexedDB storage (browser)
│   │   └── remoting/
│   │       ├── StorageClient.js       # JSON-RPC remote storage client
│   │       └── StorageServer.js       # JSON-RPC remote storage server
│   ├── services/
│   │   └── Services.js                # External service integrations (ARC, WOC, Bitails)
│   ├── monitor/
│   │   ├── Monitor.js                 # Background task scheduler
│   │   ├── MonitorDaemon.js           # Standalone daemon wrapper
│   │   └── tasks/                     # Individual monitor tasks
│   ├── sdk/                           # Internal SDK helpers and error types
│   ├── wab-client/                    # WAB authentication client
│   │   └── auth-method-interactors/   # Phone, ID verification, dev console
│   └── index.js                       # Main entry point
├── client/                            # Browser build entry point
├── mobile/                            # Mobile build entry point
├── docs/                              # Documentation source
└── package.json
```

**Three build targets:**
- `out/src/index.js` — Full library (Node.js server-side)
- `client/` — Browser-optimized (IndexedDB, no SQLite/MySQL)
- `mobile/` — Mobile-optimized build

Everything is a library. You `npm install` it and import what you need.

---

## The BRC-100 Wallet Interface

The central artifact is the `Wallet` class in `Wallet.ts`. It implements the BRC-100 wallet interface — the same 29+ method interface the Go version implements.

### Transaction Operations
| Method | Purpose |
|--------|---------|
| `createAction` | Build a new Bitcoin transaction (inputs, outputs, labels, options) |
| `signAction` | Sign a previously created transaction |
| `abortAction` | Cancel a transaction before it's broadcast |
| `internalizeAction` | Import an external transaction — credit outputs to wallet balance |
| `listActions` | Query transactions by labels |
| `listFailedActions` | List failed transactions, optionally trigger recovery |
| `listNoSendActions` | List transactions in 'nosend' status |

### Output Management
| Method | Purpose |
|--------|---------|
| `listOutputs` | List spendable outputs within a basket, optionally filtered by tags |
| `relinquishOutput` | Remove an output from tracking without spending it |
| `reviewSpendableOutputs` | Review and optionally release spendable outputs |

### Cryptographic Primitives
| Method | Purpose |
|--------|---------|
| `getPublicKey` | Derive or retrieve an identity/protocol public key |
| `createSignature` / `verifySignature` | ECDSA signing and verification |
| `encrypt` / `decrypt` | Symmetric encryption using BRC-42 derived keys |
| `createHmac` / `verifyHmac` | Hash-based message authentication |

### Key Linkage (Privacy)
| Method | Purpose |
|--------|---------|
| `revealCounterpartyKeyLinkage` | Reveal all key linkage with a counterparty to a verifier |
| `revealSpecificKeyLinkage` | Reveal key linkage for a specific interaction |

### Identity Certificates (BRC-52)
| Method | Purpose |
|--------|---------|
| `acquireCertificate` | Obtain a certificate — direct receipt or issuance from a certifier |
| `listCertificates` | List certificates filtered by certifier and type |
| `proveCertificate` | Selectively reveal certificate fields to a verifier |
| `relinquishCertificate` | Remove a certificate from the wallet |
| `discoverByIdentityKey` | Search the overlay network for certificates by public key |
| `discoverByAttributes` | Search the overlay network for certificates by attributes |

### Network and Status
| Method | Purpose |
|--------|---------|
| `getHeight` | Current blockchain height |
| `getHeaderForHeight` | Block header at a specific height |
| `getNetwork` | Which network (mainnet/testnet) |
| `getVersion` | Library version |
| `isAuthenticated` / `waitForAuthentication` | Auth status checks |

### Utility Methods (TypeScript extras beyond BRC-100)
| Method | Purpose |
|--------|---------|
| `sweepTo` | Transfer all funds to another wallet |
| `balanceAndUtxos` | Get balance and UTXO list for a basket |
| `balance` | Get total satoshi balance |
| `setWalletChangeParams` | Configure desired UTXO count and minimum value |
| `destroy` | Shutdown and cleanup |

### How the Wallet Is Created

```typescript
import { Setup } from '@bsv/wallet-toolbox';

const setup = await Setup.createWalletSQLite({
  env: Setup.getEnv('test'),     // reads .env file for keys and config
  filePath: './wallet.sqlite',    // SQLite database path
  databaseName: 'my_wallet',     // database identifier
});

const wallet = setup.wallet;     // BRC-100 Wallet instance
```

The `Setup.createWalletSQLite()` method:
1. Creates a `KeyDeriver` from your root key
2. Initializes a `StorageKnex` provider with SQLite
3. Wraps it in a `WalletStorageManager`
4. Creates `Services` for blockchain integrations
5. Optionally starts a `Monitor` for background tasks
6. Constructs the `Wallet` with all components wired together

### The Wallet's Internal Properties

```typescript
class Wallet {
  chain: Chain;                            // 'main' or 'test'
  keyDeriver: KeyDeriverApi;               // BRC-42/43 key derivation
  storage: WalletStorageManager;           // Persistent storage manager
  services?: WalletServices;               // External blockchain services
  monitor?: Monitor;                       // Background task scheduler
  settingsManager: WalletSettingsManager;  // Wallet settings
  lookupResolver: LookupResolver;          // Overlay network queries
  identityKey: string;                     // Public identity key (hex)
  userParty: string;                       // "user <identity-key-hex>"
  privilegedKeyManager?: PrivilegedKeyManager;
  beef: BeefParty;                         // All processed BEEF data
  includeAllSourceTransactions: boolean;
  autoKnownTxids: boolean;
  returnTxidOnly: boolean;
}
```

---

## Key Derivation: BRC-42/43

The TypeScript wallet-toolbox uses **BRC-42/43 exclusively**, identical to the Go version. No BIP32. No xPub. No xPriv.

Key derivation is handled by the SDK's `KeyDeriver` class:

```typescript
keyDeriver.derivePublicKey(protocolID, keyID, counterparty, forSelf?)
keyDeriver.derivePrivateKey(protocolID, keyID, counterparty)
keyDeriver.deriveSymmetricKey(protocolID, keyID, counterparty)
```

Where:
- **protocolID** = a `WalletProtocol` tuple: `[SecurityLevel, protocolName]`
- **keyID** = a string identifier (up to 800 characters)
- **counterparty** = the other party's public key hex, or `'self'` or `'anyone'`
- **SecurityLevel** = `0` (silent), `1` (per-app), or `2` (per-counterparty per-app)

The derivation is ECDH-based: compute a shared secret between sender and recipient, derive a child key. Both parties can independently derive the same keys from each other's public keys. No server needed.

### Root Key

Your root key is a raw EC private key — 32 bytes of entropy. The identity key is the corresponding compressed public key (33 bytes, 66 hex chars). This identity key is how you're known in the BRC-100 world.

---

## Storage Layer

### Architecture

The storage system has three layers, identical in structure to the Go version:

1. **StorageKnex** (or **StorageIdb** for browser) — Direct database access via Knex query builder. Implements all CRUD operations, workflow transitions, proof merging, broadcasting integration.

2. **WalletStorageManager** — Orchestrates one active provider and optional backup providers. Handles authenticated access (user scoping), replication, conflict detection, and switchover.

3. **StorageClient/StorageServer** — JSON-RPC over HTTPS with Authrite authentication. The storage server wraps a provider; the client implements the same interface. This decouples wallet logic from wallet data.

### Database Engines

| Engine | Class | Use Case |
|--------|-------|----------|
| **SQLite** | `StorageKnex` via `Setup.createWalletSQLite()` | Server-side, development, single-user |
| **MySQL** | `StorageKnex` via `Setup.createWalletMySQL()` | Server-side, production, multi-user |
| **IndexedDB** | `StorageIdb` via `SetupClient.createWalletIdb()` | Browser-based wallets |
| **Remote** | `StorageClient` | Phone/browser connecting to cloud storage |

### Database Tables

The storage schema is shared with the Go version. Both use the same table structure:

| Table | Purpose |
|-------|---------|
| **User** | Wallet user. Identity is a public key hex. |
| **Transaction** | Transaction lifecycle. Status: unsigned → unprocessed → sending → unproven → completed/failed. |
| **Output** | UTXO tracking. Links to basket, tags, derivation prefix/suffix, sender identity. |
| **OutputBasket** | Group UTXOs by purpose. Default 32 desired UTXOs, minimum 1000 satoshis each. |
| **ProvenTx** | Confirmed transactions with merkle proofs. |
| **ProvenTxReq** | Pending proof requests with status management. |
| **Certificate** | BRC-52 identity certificates. |
| **CertificateField** | Certificate field values with encryption keys. |
| **TxLabel / TxLabelMap** | Transaction labels (many-to-many). |
| **OutputTag / OutputTagMap** | Output tags (many-to-many). |
| **Commission** | Storage server monetisation. |
| **SyncState** | Replication progress tracking. |
| **Settings** | Storage configuration. |
| **MonitorEvent** | Monitor audit logs. |

### Storage Replication

The `WalletStorageManager` supports active/backup storage with chunked synchronisation, identical to the Go version:

```typescript
const manager = new WalletStorageManager(identityKey, activeProvider, [backupProvider]);
await manager.updateBackups();       // sync active → backups
await manager.setActive(newStoreId); // switch active provider with conflict detection
```

### Remote Storage

```typescript
// Server side:
const server = new StorageServer(wallet, storage, options);

// Client side:
const client = new StorageClient(wallet, 'https://storage.example.com');
// client implements the same interface as local storage
```

---

## External Services

The `Services` class provides integrations with BSV blockchain infrastructure. The architecture is pluggable with ordered fallback.

### Service Backends

| Backend | Capabilities |
|---------|-------------|
| **ARC (Taal)** | Primary transaction processor — broadcast, status, merkle paths |
| **ARC (GorillaPool)** | Secondary transaction processor |
| **WhatsOnChain** | Raw tx, BEEF, script history, UTXO status, merkle paths, block headers, exchange rates |
| **Bitails** | Raw tx, BEEF, script history, block headers, broadcast |
| **Chaintracks** | Block header chain with P2P sync and reorg detection |

### Service Collections

Each capability is backed by an ordered collection of providers:

```typescript
class Services {
  getMerklePathServices: ServiceCollection<GetMerklePathService>;
  getRawTxServices: ServiceCollection<GetRawTxService>;
  postBeefServices: ServiceCollection<PostBeefService>;
  getUtxoStatusServices: ServiceCollection<GetUtxoStatusService>;
  getStatusForTxidsServices: ServiceCollection<GetStatusForTxidsService>;
  getScriptHashHistoryServices: ServiceCollection<GetScriptHashHistoryService>;
  updateFiatExchangeRateServices: ServiceCollection<UpdateFiatExchangeRateService>;
}
```

If the first service fails, the system falls through to the next. This is automatic.

### Broadcast Modes

```typescript
postBeefMode: 'PromiseAll' | 'UntilSuccess'
```

- `PromiseAll` — broadcast to all services simultaneously
- `UntilSuccess` — try each service in order until one succeeds

---

## Monitor (Background Tasks)

The `Monitor` class runs scheduled background tasks, identical in purpose to the Go version but using a JavaScript scheduler.

### Tasks

| Task | Purpose |
|------|---------|
| `TaskCheckForProofs` | Retrieve merkle proofs for mined transactions. Triggered by new block headers. |
| `TaskSendWaiting` | Broadcast pending transactions to processors. |
| `TaskNewHeader` | Poll for new block headers, age them before processing. |
| `TaskReorg` | Handle chain reorganizations. Update proofs from deactivated headers. Max 3 retries with 10-minute aging. |
| `TaskPurge` | Remove transient data (failed tx data, completed tx payloads). |
| `TaskUnFail` | Re-check failed transactions that may have actually succeeded. |
| `TaskFailAbandoned` | Mark stuck transactions as failed after timeout. |
| `TaskReviewStatus` | Review output spendability. |
| `TaskSyncWhenIdle` | Sync storage to backups when wallet is idle. |
| `TaskCheckNoSends` | Check transactions in 'nosend' status. |
| `TaskClock` | Time-based events. |
| `TaskMonitorCallHistory` | Monitor services call history. |
| `TaskMineBlock` | Support testing via mock chain mining. |

### Usage

```typescript
const monitor = new Monitor(Monitor.createDefaultWalletMonitorOptions(
  chain, storage, services
));
monitor.addDefaultTasks();    // single-user tasks
monitor.startTasks();         // begin background scheduling
```

---

## Identity Certificates (BRC-52)

The wallet implements the full BRC-52 certificate lifecycle — acquisition, listing, selective revelation, discovery, and relinquishment. The implementation matches the Go version.

### Selective Revelation

`proveCertificate` lets you reveal specific certificate fields to a verifier without revealing everything. Each field has its own encryption key derived from the master keyring using BRC-42/43. The wallet re-derives field-specific keys for the verifier.

### Overlay Discovery

```typescript
await wallet.discoverByIdentityKey({
  identityKey: somePublicKey,
  // ...
});

await wallet.discoverByAttributes({
  attributes: { name: 'Alice' },
  // ...
});
```

---

## WAB Client and Shamir Key Recovery

This is a major feature the TypeScript version has that the Go version does not.

### What WAB Is

WAB (Wallet Authentication Backend) is a server that holds one share of a Shamir-split private key. The user holds the other shares. Key recovery requires combining shares from multiple sources — no single party has the full key.

### Shamir Secret Sharing

Default configuration: **2-of-3 split**
- 3 shares total
- Any 2 shares can reconstruct the private key
- Server holds 1 share (locked behind OTP verification)
- User stores 2 shares (for offline recovery without the server)

```typescript
const manager = new ShamirWalletManager({
  wabClient: new WABClient('https://wab.example.com'),
  threshold: 2,    // shares needed
  totalShares: 3,  // shares generated
});

// Collect entropy from mouse movements (browser)
await manager.collectEntropyFromBrowser(element);

// Create wallet — splits key into shares
const result = await manager.createNewWallet(authPayload, (userShares) => {
  // Store these shares safely — they're needed for recovery
  saveShares(userShares);
});

// Later: recover with server share (requires OTP)
const privateKey = await manager.recoverWithServerShare(userShares, authPayload);

// Or: recover offline with user shares only (no server needed)
const privateKey = await manager.recoverWithUserShares(allUserShares);
```

### Authentication Methods

The WAB supports multiple authentication methods via interactors:

| Interactor | Method |
|-----------|--------|
| `TwilioPhoneInteractor` | SMS-based OTP verification |
| `PersonaIDInteractor` | ID document verification |
| `DevConsoleInteractor` | Development/testing (manual entry) |

---

## Wallet Permission Manager

Another TypeScript-only feature. Controls what applications can do with the wallet.

### Permission Types

| Permission | BRC | Controls |
|-----------|-----|----------|
| **Protocol** (DPACP) | BRC-111 | Which protocols an app can use for signing, encryption, HMAC |
| **Basket** (DBAP) | — | Which output baskets an app can read/write |
| **Certificate** (DCAP) | — | Which certificates an app can access |
| **Spending** (DSAP) | — | How much an app can spend |

### Usage

```typescript
const managed = new WalletPermissionsManager(wallet, adminOriginator, {
  seekProtocolPermissionsForSigning: true,
  seekProtocolPermissionsForEncrypting: true,
  seekSpendingPermissions: true,
  seekBasketListingPermissions: true,
});

// The managed wallet wraps the real wallet — every method checks permissions first
// If an app calls managed.encrypt(...), the permission manager checks
// whether that app has protocol permission before delegating to the real wallet
```

---

## Multi-Profile Identity Management

The `CWIStyleWalletManager` supports multiple identities per account:

```typescript
manager.listProfiles();
// → [{ id: 1, name: 'Personal', active: true, identityKey: '02abc...' },
//    { id: 2, name: 'Business', active: false, identityKey: '03def...' }]

await manager.addProfile('Anonymous');
await manager.switchProfile(2);
```

Each profile has its own root key, identity key, and wallet state. Profiles are encrypted and managed through password + UMP token authentication.

---

## Key Dependencies

| Dependency | Version | Purpose |
|-----------|---------|---------|
| `@bsv/sdk` | ^2.0.4 | Core BSV SDK — key derivation, transaction primitives, wallet interface |
| `express` | ^4.21.2 | HTTP server for StorageServer |
| `knex` | ^3.1.0 | SQL query builder for StorageKnex |
| `better-sqlite3` | ^12.6.2 | SQLite driver |
| `mysql2` | ^3.12.0 | MySQL driver |
| `idb` | ^8.0.2 | IndexedDB wrapper for browser storage |
| `ws` | ^8.18.3 | WebSocket support |
| `@bsv/authrite-utils` | ^0.3.1 | Authrite authentication |

---

## BEEF (BRC-62) Transaction Format

BEEF (Background Evaluation Extended Format) handling is identical to the Go version. The wallet uses the SDK's `Beef` type for self-proving transactions.

The `Wallet` class includes BEEF verification methods:
- `verifyReturnedTxidOnly(beef)` — Verify BEEF data
- `verifyReturnedTxidOnlyAtomicBEEF(beef)` — Verify atomic BEEF
- `verifyReturnedTxidOnlyBEEF(beef)` — Verify standard BEEF

---

## What "BRC-100 Compliant" Actually Means

BRC-100 defines a wallet interface with a fixed set of methods. Any application that knows how to talk to a BRC-100 wallet can work with any BRC-100 wallet implementation.

The TypeScript wallet-toolbox implements this interface. MetaNet Client implements it. The Go wallet-toolbox implements it. Your application can target the interface and work with any of them.

The practical implication: if you build against `wallet.encrypt()`, `wallet.createSignature()`, and the other BRC-100 methods, your code works with any compliant wallet — not just this toolbox.

---

## What the TypeScript Version Adds Over Go

### Shared (Both Go and TypeScript)

- Core BRC-100 wallet (29+ methods)
- SQLite storage
- Remote storage (client/server)
- Background monitor
- External service integrations (ARC, WhatsOnChain, Bitails)

### Go Only

- PostgreSQL support (via GORM)

### TypeScript Only

- IndexedDB storage (browser)
- WABClient and Shamir key recovery (2-of-3 key splitting)
- WalletPermissionsManager (application permission control)
- Multi-profile identity (CWIStyleWalletManager)
- UMP token integration
- Browser build target
- Mobile build target

---

## What's Missing / In Progress

1. **Version < 1.0 semantics** — At v2.1.0-beta.3, the version number suggests maturity but the beta tag and rapid release cadence indicate active development. The published package has a build bug (`randomBytesHex` stub in `Setup.js`) that suggests the CI pipeline doesn't fully test the SQLite creation path.

2. **Documentation gaps** — The hosted docs at `bsv-blockchain.github.io/wallet-toolbox` are sparse. Method signatures and argument types are best discovered from the `.d.ts` files in the installed package, not the docs site.

3. **PostgreSQL** — The Go version supports PostgreSQL via GORM. The TypeScript version uses Knex, which could support PostgreSQL, but only SQLite and MySQL are exposed through the `Setup` class.

---

## What This Means for Building Applications

This library is designed to be used selectively. You can import:

- Just `Setup` + `Wallet` for the full BRC-100 interface
- Just `StorageKnex` or `StorageIdb` for persistent state management
- Just `Services` for blockchain service integrations
- Just `Monitor` for background task scheduling
- Just `ShamirWalletManager` for key recovery
- Just `WalletPermissionsManager` for application permission control

A messaging application (like the one in this project) uses four methods: `encrypt`, `decrypt`, `createSignature`, `verifySignature`. A payments application would add `createAction`, `internalizeAction`, `listOutputs`. A certificate-based identity system would add `acquireCertificate`, `proveCertificate`, `discoverByIdentityKey`.

The same wallet instance supports all of these. Which methods you use depends on your application's needs.

---

*Document generated from hands-on exploration of @bsv/wallet-toolbox v2.1.0-beta.3, installed and read February 19, 2026.*
