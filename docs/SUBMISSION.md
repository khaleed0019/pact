# Submission draft (Cycle III, category: Pay)

PACT turns a real work agreement into a traceable, verified payment inside Nimiq Pay.

Sign in with your Nimiq wallet and choose how you'll use it: Brand or Contributor. Brands post paid work with a brief, requirements, a fixed reward in NIM or USDT, and a number of spots. Contributors browse open work, read the exact agreement before taking it up, and get their own two-party PACT with the brand.

Both sides sign the terms with their wallets: a real Ed25519 signature over a fingerprint of the exact terms, so neither can later claim it said something else. The contributor submits their work; the brand approves it or sends it back with a reason. Approved work is paid from the agreement in Nimiq Pay, and NIM payments carry the agreement reference on-chain in the transaction memo.

PACT never takes a payment's word for it. The wallet's reference only marks a payment as sent. The server then reads the network itself and confirms only a transaction that exists, succeeded, reached the agreed recipient for the agreed amount, and carries this agreement's memo. A confirmed payment is final, one transaction can settle only one payment, and an outage never fails a payment.

PACT is honest about what it isn't: there is no escrow, because Mini Apps cannot hold funds. Budgets show what a brand agreed to pay and what the network confirmed paid, never money "locked".

Also: role dashboards built from records, renegotiation, disputes and public verification. Open source, MIT.
