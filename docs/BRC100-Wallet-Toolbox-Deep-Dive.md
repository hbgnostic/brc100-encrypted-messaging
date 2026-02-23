# BRC-100 Wallet Toolbox: A Deep Dive from Source Code

## What This Document Is

This is a comprehensive exploration of `go-wallet-toolbox` — the BSV Blockchain Association's BRC-100 compliant wallet library for Go. It was produced by cloning the repository, reading the source code, tracing data flows through packages, and documenting what was found. Everything in this document is grounded in actual code, not marketing copy.

The goal: understand what this library actually is, how it works at the code level, and what it would take to build on top of it — specifically to build a scoped BRC-100 client for a production application.

**Repository:** github.com/bsv-blockchain/go-wallet-toolbox
**Version investigated:** v0.172.1 (February 2026)
**Commits:** 587 on main
**Releases:** 198 total
**Language:** Go 1.25.4, 99.8% Go
**License:** Open BSV License

---

## The One-Line Summary

The wallet-toolbox is a Go library that implements the BRC-100 wallet interface specification. You import it into your own application. It gives you key derivation, transaction building, persistent storage, background task management, and integrations with BSV blockchain services. There is no Docker deployment, no frontend, no admin panel. You write Go code and compile a binary.

---

## Repository Structure

```
go-wallet-toolbox/
├── cmd/
│   ├── infra/              # Storage server entry point (port 8100)
│   └── infra_config_gen/   # Config file generator
├── pkg/
│   ├── wallet/             # BRC-100 wallet implementation (the core)
│   ├── storage/            # GORM-backed persistent storage + server/client
│   ├── services/           # External service integrations (ARC, WOC, Bitails, BHS)
│   ├── monitor/            # Background task scheduler
│   ├── brc29/              # BRC-29 payment addressing (serverless P2P)
│   ├── wdk/                # Wallet Development Kit — shared types and interfaces
│   ├── defs/               # Constants, config structs, network definitions
│   ├── entity/             # Domain entities (Transaction, etc.)
│   ├── infra/              # Infrastructure server (wraps storage + monitor)
│   ├── tracing/            # OpenTelemetry integration
│   ├── randomizer/         # Cryptographic random generation
│   ├── errors/             # Error types
│   └── internal/           # Internal packages (assembler, txutils, storage internals)
├── docs/                   # wallet.md, storage.md, storage_server.md, monitor.md
├── examples/               # Wallet examples, service examples, faucet server
├── infra-config.example.yaml
├── go.mod
└── README.md
```

**Two commands:**
- `cmd/infra` — A thin HTTP server that wraps storage + monitor. Listens on port 8100 by default. This is the only runnable binary the project provides.
- `cmd/infra_config_gen` — Generates a config file with a fresh key.

Everything else is a library. You `go get` it and import what you need.

---

## The BRC-100 Wallet Interface

The central artifact is the `Wallet` struct in `pkg/wallet/wallet.go`. It implements `sdk.Interface` from the Go SDK — this is the BRC-100 wallet interface.

```go
var _ sdk.Interface = (*Wallet)(nil)
```

This compile-time assertion guarantees the struct satisfies the interface. The wallet has **29+ public methods** organized into categories:

### Transaction Operations
| Method | Purpose |
|--------|---------|
| `CreateAction` | Build a new Bitcoin transaction (inputs, outputs, labels, options) |
| `SignAction` | Sign a previously created transaction |
| `AbortAction` | Cancel a transaction before it's broadcast |
| `InternalizeAction` | Import an external transaction — credit outputs to wallet balance, tag, basket |
| `ListActions` | Query transactions by labels |
| `ListFailedActions` | List failed transactions, optionally trigger recovery |
| `ListTransactions` | List transactions with status updates (proofs, block info) |

### Output Management
| Method | Purpose |
|--------|---------|
| `ListOutputs` | List spendable outputs within a basket, optionally filtered by tags |
| `RelinquishOutput` | Remove an output from tracking without spending it |

### Cryptographic Primitives
| Method | Purpose |
|--------|---------|
| `GetPublicKey` | Derive or retrieve an identity/protocol public key |
| `CreateSignature` / `VerifySignature` | ECDSA signing and verification |
| `Encrypt` / `Decrypt` | Asymmetric encryption using derived keys |
| `CreateHMAC` / `VerifyHMAC` | Hash-based message authentication |

### Key Linkage (Privacy)
| Method | Purpose |
|--------|---------|
| `RevealCounterpartyKeyLinkage` | Reveal all key linkage with a counterparty to a verifier |
| `RevealSpecificKeyLinkage` | Reveal key linkage for a specific interaction |

### Identity Certificates (BRC-52)
| Method | Purpose |
|--------|---------|
| `AcquireCertificate` | Obtain a certificate — direct receipt or issuance from a certifier |
| `ListCertificates` | List certificates filtered by certifier and type |
| `ProveCertificate` | Selectively reveal certificate fields to a verifier |
| `RelinquishCertificate` | Remove a certificate from the wallet |
| `DiscoverByIdentityKey` | Search the overlay network for certificates by public key |
| `DiscoverByAttributes` | Search the overlay network for certificates by attributes |

### Network and Status
| Method | Purpose |
|--------|---------|
| `GetHeight` | Current blockchain height |
| `GetHeaderForHeight` | Block header at a specific height |
| `GetNetwork` | Which network (mainnet/testnet) |
| `GetVersion` | Library version |
| `IsAuthenticated` / `WaitForAuthentication` | Auth status checks |
| `Close` / `Destroy` | Shutdown and cleanup |

### How the Wallet Is Created

```go
w, err := wallet.New(
    defs.BSVNetworkMainnet,
    wallet.WIF("<your-WIF-key>"),     // private key source
    provider,                          // storage provider
    wallet.WithLogger(logger),
    wallet.WithServices(services),
)
```

The constructor accepts:
- A **network** (mainnet or testnet)
- A **key source** — can be a WIF string, hex string, `*ec.PrivateKey`, or `*sdk.KeyDeriver`
- A **storage provider** — the GORM-backed persistent storage
- Optional **functional options** — services, logger, trust settings, pending action cache

Internally, it creates a `KeyDeriver` from your key source, wraps it in a `ProtoWallet` from the Go SDK (which handles the low-level BRC-42/43 cryptographic operations), and connects it to storage via a `WalletStorageManager`.

### The Wallet Struct Internals

```go
type Wallet struct {
    proto                   *sdk.ProtoWallet              // Go SDK proto wallet (crypto ops)
    storage                 wdk.WalletStorage             // Persistent storage manager
    keyDeriver              *sdk.KeyDeriver               // BRC-42/43 key derivation
    services                *services.WalletServices      // External blockchain services
    flags                   *wallet_opts.Flags            // Behavioral flags
    chain                   defs.BSVNetwork               // mainnet or testnet
    pendingSignActionsCache pending.SignActionsRepository  // In-flight sign operations
    logger                  *slog.Logger                  // Structured logging
    auth                    *clients.AuthFetch            // Authrite HTTP client
    settingsManager         *wallet_settings_manager.WalletSettingsManager
    lookupResolver          *lookup.LookupResolver        // Overlay network queries
    overlayCache            sync.Map                      // Certificate discovery cache (2min TTL)
    trustSettingsCache      atomic.Pointer[...]           // Cached trust settings
    randomizer              wdk.Randomizer                // Crypto-secure random generation
    cleanup                 walletCleanupFunc             // Resource cleanup chain
    userParty               string                        // "user <identity-key-hex>"
}
```

This is a rich object. It's not a thin wrapper — it orchestrates crypto, storage, services, caching, authentication, and overlay network queries.

---

## Key Derivation: BRC-42/43

The wallet-toolbox uses **BRC-42/43 exclusively**. There is no BIP32. No xPub. No xPriv.

Key derivation is delegated to the Go SDK's `KeyDeriver`. The wallet-toolbox doesn't reimplement the math — it calls:

```go
keyDeriver.DerivePublicKey(protocol, keyID, counterparty, privileged)
keyDeriver.DerivePrivateKey(protocol, keyID, counterparty)
```

Where:
- **protocol** = a `sdk.Protocol` with a security level and protocol name
- **keyID** = a string identifier (e.g., derivation prefix + suffix for BRC-29)
- **counterparty** = the other party's public key (or "self" or "anyone")
- **privileged** = whether to use privileged key access

The derivation is ECDH-based: compute a shared secret between sender and recipient, use it as an HMAC key, derive a child key. Both parties can independently derive the same keys from each other's public keys. No server needed.

### Root Key

Your root key is a raw EC private key — passed as WIF, hex, or `*ec.PrivateKey`. The identity key is the corresponding compressed public key (33 bytes, 66 hex chars). This identity key is how you're known in the BRC-100 world.

```go
userParty := fmt.Sprintf("user %s", keyDeriver.IdentityKey().ToDERHex())
// e.g., "user 02a1b2c3d4e5f6..."
```

---

## BRC-29: Serverless Payment Addressing

The `pkg/brc29` package implements BRC-29 — the protocol that replaces Paymail in the BRC-100 world.

### The Core Functions

```go
// Sender generates address for recipient:
address, err := brc29.AddressForCounterparty(senderPrivateKey, keyID, recipientPublicKey)

// Recipient generates the same address independently:
address, err := brc29.AddressForSelf(senderPublicKey, keyID, recipientPrivateKey)
```

Both produce **the same Bitcoin address** through math. No DNS, no HTTP, no server.

### The KeyID

```go
type KeyID struct {
    DerivationPrefix string  // typically random Base64
    DerivationSuffix string  // typically random Base64
}
```

The KeyID's `String()` method concatenates prefix + space + suffix. This becomes the `keyID` parameter in the BRC-42 derivation call. Both parties must agree on the same KeyID for each payment.

### The Protocol Constant

```go
const ProtocolID = "3241645161d8"
var Protocol = sdk.Protocol{
    SecurityLevel: sdk.SecurityLevelEveryAppAndCounterparty,
    Protocol:      ProtocolID,
}
```

BRC-29 uses security level "every app and counterparty" — the broadest scope. The protocol ID `3241645161d8` is a fixed identifier for BRC-29.

### Type-Safe Key Inputs

The BRC-29 package uses Go generics to accept multiple key formats:

```go
type CounterpartyPrivateKey interface {
    PrivHex | WIF | *ec.PrivateKey | *sdk.KeyDeriver
}

type CounterpartyPublicKey interface {
    PubHex | *sdk.KeyDeriver | *ec.PublicKey
}
```

This means you can call `AddressForCounterparty` with raw hex strings, WIF strings, or pre-built SDK objects — the library handles conversion internally.

### Derivation Prefix and Suffix on Outputs

When an output is created, the `DerivationPrefix` and `DerivationSuffix` are stored in the `Output` model (see Storage section). This allows the wallet to reconstruct the spending key later, because the derivation is deterministic: given the prefix, suffix, and the counterparty's public key, you can re-derive the private key needed to spend.

---

## Storage Layer

### Architecture

The storage system has three layers:

1. **Provider** (`storage.NewGORMProvider`) — Direct database access via GORM. Implements all CRUD operations, workflow transitions, proof merging, broadcasting integration.

2. **WalletStorageManager** — Orchestrates one active provider and optional backup providers. Handles authenticated access (user scoping), replication from active to backups, chunked synchronisation.

3. **Remote Client/Server** — JSON-RPC over HTTP with Authrite authentication. The storage server wraps a provider; the client implements the same interface. This decouples wallet logic from wallet data — you can run the wallet on a phone and the storage in the cloud.

### Database Engines

Configured via GORM, supporting:
- **SQLite** (default, `./storage.sqlite`)
- **PostgreSQL**
- **MySQL**

```go
provider, err := storage.NewGORMProvider(
    defs.BSVNetworkMainnet,
    services,
    storage.WithDBConfig(defs.DefaultDBConfig()),
)
```

### Database Tables (GORM Models)

From `pkg/internal/storage/database/models/`:

| Model | Key Fields | Purpose |
|-------|-----------|---------|
| **User** | `UserID`, `IdentityKey`, `ActiveStorage` | Wallet user. Identity is a public key hex. |
| **Transaction** | `UserID`, `Status`, `Reference`, `IsOutgoing`, `Satoshis`, `TxID`, `InputBeef` | Transaction lifecycle. Status enum: unsigned → unprocessed → sending → unproven → completed/failed. |
| **Output** | `UserID`, `TransactionID`, `Vout`, `Satoshis`, `LockingScript`, `DerivationPrefix`, `DerivationSuffix`, `BasketName`, `Spendable`, `Change`, `SenderIdentityKey` | UTXO tracking. Links to basket, tags, and user UTXO. |
| **OutputBasket** | `Name`, `UserID`, `NumberOfDesiredUTXOs`, `MinimumDesiredUTXOValue` | Group UTXOs by purpose. Default 32 desired UTXOs, minimum 1000 satoshis each. |
| **UserUTXO** | Links Output to user as spendable UTXO | Tracks which outputs are available for spending |
| **Certificate** | `Type`, `SerialNumber`, `Certifier`, `Subject`, `Verifier`, `RevocationOutpoint`, `Signature` | BRC-52 identity certificates |
| **CertificateField** | `FieldName`, `FieldValue`, `MasterKey`, `CertificateID` | Certificate field values with encryption keys |
| **Commission** | `UserID`, `TransactionID`, `Satoshis`, `KeyOffset`, `IsRedeemed`, `LockingScript` | Storage server monetisation — charge satoshis per operation |
| **KnownTx** | Known transaction data for BEEF construction | |
| **Label** | Transaction labels (many-to-many with Transaction) | |
| **Tag** | Output tags (many-to-many with Output) | |
| **TxNote** | Transaction notes/memos | |
| **SyncState** | Replication progress tracking | |
| **Settings** | Storage configuration | |
| **ChaintracksBulkFile** | Chaintracks bulk header files | |
| **ChaintracksLiveHeader** | Chaintracks live block headers | |
| **NumericIdLookup** | Numeric ID mapping | |
| **KeyValue** | General key-value store | |

### Transaction Status Lifecycle

```
unsigned → unprocessed → sending → unproven → completed
                                      ↓
                                    failed → (unfail) → sending
```

The monitor (see below) drives these transitions. Transactions start as `unsigned` when created, move to `sending` when broadcast is attempted, to `unproven` when accepted by the network but not yet mined, and to `completed` when a merkle proof is obtained. Failed transactions can be recovered via the `UnFail` task.

### Storage Replication

The `WalletStorageManager` supports active/backup storage with chunked synchronisation:

```go
mgr := storage.NewWalletStorageManager("user-identity-key", logger, activeProvider)
// Can sync to backup providers
// Conflict detection, merge-and-promote during switchover
```

This enables architectures where the wallet runs locally but data is replicated to a cloud backup, or where a mobile wallet can recover state from a remote storage server.

### Remote Storage (Client/Server)

The storage server exposes storage operations over JSON-RPC with Authrite authentication:

```go
// Server side:
server := storage.NewServer(logger, provider, wallet, storage.ServerOptions{Port: 8080})
server.Start()

// Client side:
client, cleanup, err := storage.NewClient("https://localhost:8080", wallet)
// client implements wdk.WalletStorageProvider — same interface as local storage
```

The client is a drop-in replacement for local storage. Your wallet code doesn't know or care whether storage is local SQLite or a remote server.

---

## External Services

The `pkg/services` package provides integrations with BSV blockchain infrastructure. The architecture is pluggable — each service implements a common interface, and the system tries services in order with fallback.

### Service Interface

```go
type Implementation struct {
    RawTx                RawTxFunc
    PostBEEF             PostBEEFFunc
    MerklePath           MerklePathFunc
    FindChainTipHeader   FindChainTipHeaderFunc
    IsValidRootForHeight IsValidRootForHeightFunc
    CurrentHeight        CurrentHeightFunc
    GetScriptHashHistory GetScriptHashHistoryFunc
    HashToHeader         HashToHeaderFunc
    ChainHeaderByHeight  ChainHeaderByHeightFunc
    GetStatusForTxIDs    GetStatusForTxIDsFunc
    GetUtxoStatus        GetUtxoStatusFunc
    IsUtxo               IsUtxo
    BsvExchangeRate      BsvExchangeRateFunc
}
```

Any service backend that implements some or all of these function signatures can be plugged in. `nil` fields are skipped — the system falls through to the next provider.

### Service Backends

From `pkg/services/internal/`:

| Backend | Package | Capabilities |
|---------|---------|-------------|
| **ARC** | `arc/` | Transaction broadcast, merkle path retrieval, transaction status query |
| **WhatsOnChain** | `whatsonchain/` | Raw tx, BEEF, script history, UTXO status, merkle path, block headers, exchange rates, broadcast |
| **Bitails** | `bitails/` | Raw tx, BEEF, script history, block headers, broadcast |
| **Block Headers Service** | `bhs/` | Block headers, merkle root validation |
| **Chaintracks** | `chaintracksclient/` | Embedded or remote block header chain with P2P sync and reorg detection |

### Service Queue and Fallback

The `pkg/services/internal/servicequeue/` package manages ordered service queues. If ARC fails to broadcast, the system can fall through to WhatsOnChain or Bitails. This is automatic — you configure which services are available and the library handles failover.

### Parallel Execution

`pkg/services/internal/parallel.go` provides parallel execution of service calls across multiple backends, collecting results from whoever responds first or aggregating across all.

---

## Monitor (Background Tasks)

The `pkg/monitor` package runs scheduled background tasks using `gocron` with GORM-based distributed locking (so multiple instances don't conflict).

### Tasks

| Task | Default Interval | Purpose |
|------|-----------------|---------|
| `SynchronizeTransactionStatuses` | 60s | Fetch merkle proofs for mined transactions, update statuses |
| `SendWaitingTransactions` | 300s | Broadcast queued transactions (with minimum age threshold) |
| `AbortAbandoned` | 300s | Mark stuck transactions as failed after timeout |
| `UnFail` | 600s | Re-check failed transactions that may have actually succeeded |

### Usage

```go
daemon, err := monitor.NewDaemon(logger, storage)
cfg := defs.DefaultMonitorConfig()
daemon.Start(cfg.Tasks.EnabledTasks())
```

The monitor implements `MonitoredStorage` — an interface that the storage provider satisfies:

```go
type MonitoredStorage interface {
    SynchronizeTransactionStatuses(ctx context.Context) error
    SendWaitingTransactions(ctx context.Context, minTransactionAge time.Duration) error
    AbortAbandoned(ctx context.Context) error
    UnFail(ctx context.Context) error
}
```

You can also call these methods directly without the scheduler if you prefer manual control.

---

## Identity Certificates (BRC-52)

The wallet implements the full BRC-52 certificate lifecycle.

### What Certificates Are

An identity certificate is a signed attestation that a public key belongs to a person or entity. A trusted third party (the **certifier**) signs the certificate. The certificate contains:

- **Type** — what kind of certificate (e.g., identity verification)
- **SerialNumber** — unique identifier
- **Subject** — the public key being certified
- **Certifier** — who signed it
- **RevocationOutpoint** — a UTXO that, when spent, revokes the certificate
- **Fields** — key-value pairs (name, email, organization, etc.)
- **Signature** — the certifier's ECDSA signature

### Selective Revelation

The killer feature: `ProveCertificate` lets you reveal **specific fields** to a verifier without revealing everything.

The flow:
1. Your wallet holds a certificate with encrypted fields and a master keyring
2. A verifier requests proof of certain fields
3. `ProveCertificate` creates a **keyring for the verifier** — derived keys that let the verifier decrypt only the requested fields
4. The verifier can read "name" but not "email" if that's all you revealed

This uses BRC-42/43 key derivation per field. Each field has its own encryption key derived from the master keyring. The wallet re-derives field-specific keys for the verifier.

### Certificate Acquisition

Two protocols:

**Direct** (`AcquisitionProtocolDirect`): You receive a pre-signed certificate and store it.

**Issuance** (`AcquisitionProtocolIssuance`): You request a certificate from a certifier's server:
1. Create a nonce (HMAC-protected replay prevention)
2. Prepare certificate fields and master keyring
3. Send authenticated request to certifier URL (`/signCertificate`)
4. Verify the server's nonce, the certificate signature, and field decryptability
5. Store the certificate

### Overlay Discovery

Certificates can be discovered through the overlay network:

```go
// Find certificates by public key:
w.DiscoverByIdentityKey(ctx, sdk.DiscoverByIdentityKeyArgs{
    IdentityKey: somePublicKey,
}, originator)

// Find certificates by attributes:
w.DiscoverByAttributes(ctx, sdk.DiscoverByAttributesArgs{
    Attributes: map[string]string{"name": "Alice"},
}, originator)
```

These query the `ls_identity` overlay service via the `LookupResolver`. Results are cached for 2 minutes. Trust settings determine which certifiers are trusted — by default, Metanet Trust Services and SocialCert.

---

## The Infra Server

`cmd/infra/main.go` is 32 lines:

```go
func main() {
    server, err := infra.NewServer(
        context.Background(),
        infra.WithConfigFile("infra-config.yaml"),
    )
    if err != nil { panic(err) }

    go func() {
        if err = server.ListenAndServe(); err != nil { panic(err) }
    }()

    quit := make(chan os.Signal, 1)
    signal.Notify(quit, os.Interrupt, syscall.SIGTERM)
    <-quit
    server.Cleanup()
}
```

The `infra.Server` bundles:
- A storage provider (GORM-backed)
- A monitor daemon (background tasks)
- An HTTP server with JSON-RPC endpoints
- Authrite authentication middleware

Default: port 8100, SQLite storage at `./storage.sqlite`.

This is the closest thing to a "running service" that the wallet-toolbox provides. It's a storage backend + background task runner, not a wallet UI or API server.

---

## Key Dependencies

From `go.mod`:

| Dependency | Version | Purpose |
|-----------|---------|---------|
| `go-sdk` | v1.2.17 | Core BSV SDK — key derivation, transaction primitives, wallet interface |
| `go-chaintracks` | v1.1.1 | Embedded block header chain with P2P sync |
| `go-bsv-middleware` | v0.12.4 | Authrite authentication middleware |
| `go-teranode-p2p-client` | v0.1.1 | Teranode peer-to-peer connectivity |
| `gorm` | v1.31.1 | ORM for database operations |
| `gorm/driver/sqlite` | v1.6.0 | SQLite support |
| `gorm/driver/postgres` | v1.6.0 | PostgreSQL support |
| `gorm/driver/mysql` | v1.6.0 | MySQL support |
| `gorm/gen` | v0.3.27 | Type-safe GORM query generation |
| `gocron` | v2.19.1 | Job scheduler for monitor tasks |
| `gocron-gorm-lock` | v2.1.0 | Distributed locking for multi-instance monitors |
| `go-jsonrpc` | v0.10.0 | JSON-RPC for remote storage |
| `go-resty` | v2.17.1 | HTTP client for service calls |
| `viper` | v1.21.0 | Configuration management |
| `opentelemetry` | v1.40.0 | Distributed tracing |
| `universal-test-vectors` | v0.6.1 | Shared test data across Go and TypeScript |

The `universal-test-vectors` dependency is notable — it ensures the Go and TypeScript wallet-toolbox implementations produce identical results for the same inputs.

---

## BEEF (BRC-62) Transaction Format

BEEF (Background Evaluation Extended Format) is the transaction encoding format used throughout the wallet-toolbox.

### What BEEF Is

A BEEF transaction is self-proving. It bundles:
- The transaction itself
- All ancestor transactions needed to verify inputs
- Merkle proofs for mined ancestors

This means the recipient can verify the transaction's validity without querying the network. The wallet-toolbox uses the Go SDK's `transaction.Beef` type.

### BEEF Verification

```go
type BeefVerifier interface {
    VerifyBeef(ctx context.Context, beef *transaction.Beef, allowTxidOnly bool) (bool, error)
}
```

The `allowTxidOnly` flag controls whether verification accepts txid-only references (less strict) or requires full proof data.

### Where BEEF Appears

- `Transaction.InputBeef` — stored as `[]byte` in the database
- `PostBEEF` service method — broadcasts a BEEF to the network via ARC/WOC/Bitails
- `GetBeef` — constructs BEEF from known transactions for a given output set
- `CreateAction` / `InternalizeAction` — input and output transactions are encoded as BEEF

---

## The TypeScript Equivalent

The wallet-toolbox exists in both languages:

| | Go | TypeScript |
|---|---|---|
| **Repo** | go-wallet-toolbox | wallet-toolbox |
| **Package** | `go get github.com/bsv-blockchain/go-wallet-toolbox` | `npm install @bsv/wallet-toolbox` |
| **Stars** | 8 | 17 |
| **Releases** | 198 | 150+ |
| **Leadership** | Thomas Giacomo, Darren Kellenschwiler (owners), Ty Everett (dev lead) | Same |

The TypeScript version adds:
- **IndexedDB storage** for browser deployments
- **WABClient** (Wallet Authentication Backend) for Shamir-based key recovery
- **WalletPermissionsManager** for application permission control
- Build targets for Node.js, Browser, and Mobile

Both share the same database schema and the same `universal-test-vectors` for cross-language compatibility.

---

## What "BRC-100 Compliant" Actually Means

BRC-100 defines a 29-method wallet interface. Any application that knows how to talk to a BRC-100 wallet can work with any BRC-100 wallet implementation. The interface is:

- **Fixed** — the method signatures don't change
- **Complete** — every wallet operation is covered (transactions, keys, encryption, certificates, discovery)
- **Vendor-neutral** — any wallet can implement it

The wallet-toolbox is one implementation. MetaNet Client (a desktop app) is another. Your scoped BRC-100 client would be a third.

The practical implication: if you implement the interface, any BRC-100 application can use your wallet as its backend. If you consume the interface, you're not locked to any specific wallet implementation.

---

## What's Missing / In Progress

From the source code:

1. **Privileged Key Manager** — Multiple `TODO` comments reference the TypeScript implementation. The Go version delegates to `ProtoWallet` but doesn't implement the full privileged key management pattern yet.

2. **Certificate APIs** — The wallet docs note: "Certificate APIs (`AcquireCertificate`, `ListCertificates`, `ProveCertificate`, `RelinquishCertificate`, `Discover*`) are placeholders and not yet implemented." However, the source code shows substantial implementation (AcquireCertificate has full issuance and direct flows, ProveCertificate has selective revelation logic). The docs may be outdated.

3. **Roadmap** — The `ROADMAP.md` says: "Until version 1.0 of this library is released, the roadmap is being managed internally by the development team."

4. **Version < 1.0** — At v0.172.1, the API is still subject to breaking changes. The rapid release cadence (multiple per week) confirms active development but also means the target is still moving.

---

## What This Means for Building a Scoped BRC-100 Client

This library is designed to be used selectively. You don't have to use all of it. The package structure allows you to import:

- Just `pkg/brc29` for payment addressing
- Just `pkg/wallet` for the full BRC-100 interface
- Just `pkg/storage` for persistent state management
- Just `pkg/services` for blockchain service integrations
- Just `pkg/monitor` for background task scheduling

A **scoped BRC-100 client** would choose which pieces to use based on the application's needs. For a production application like Traceport that already has its own UTXO management, key derivation, and ARC integration, the question is: which wallet-toolbox capabilities add value that the existing system doesn't already provide?

That's the next conversation.

---

*Document generated from hands-on source code exploration of go-wallet-toolbox v0.172.1, cloned and read February 15, 2026.*
