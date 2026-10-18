# Relay Gate

Turn your art website into a walkable 3D gallery, published on **Nostr** under your own key.

```
npx relaygate https://your-site.example --publish
```

- **Import:** reads your own site (respecting robots.txt) and treats every image as a work, hung at true relative size.
- **Publish:** signed Nostr events (gallery manifest + picture events + NIP-99 listings) via your NIP-46/NIP-07 signer. Relay Gate never sees your nsec.
- **Gates:** link your gallery to other artists' galleries by their keys. Discovery happens over relays, with no central server.
- **Get paid:** zaps (NIP-57) and BTCPay invoices go straight to you. Card checkout stays on your existing shop.
- **Books:** every zap and sale is logged with sats, USD value and the work, and exports to QuickBooks Online, GnuCash, Akaunting and Beancount.

Status: the site importer works (M0); Nostr publishing is next. Full design: [SPEC.md](SPEC.md). License: MIT. Maintainer: TJ Murphy.
