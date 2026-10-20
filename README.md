# Relay Gate

Relay Gate is an MIT-licensed project in development for turning artist websites into portable, walkable galleries. The repository currently contains the site importer and its tests.

Run the local importer with Node.js 20 or newer:

```sh
npm ci
node bin/cli.js https://your-site.example --out ./gallery
npm test
```

Review the imported works before using them. Website metadata may be incomplete; a public image URL does not establish ownership or permission to publish it.

The proposed Nostr design gives artists signed gallery identities, gates to other artists, and relay-based discovery. Visitors should be able to open a gallery without an account. Nostr publishing, viewer integration, Lightning zaps, BTCPay reconciliation, certificates, and bookkeeping exports are planned, not implemented features. See [SPEC.md](SPEC.md) for the protocol choices, delivery plan, and open questions.

Relay Gate has not launched. Maintainer: TJ Murphy. License: [MIT](LICENSE).
