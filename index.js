const BN = require('bn.js');
const crypto = require('crypto');
const Eddsa = require('elliptic').eddsa;
const { encodeAddress } = require('@polkadot/util-crypto');

const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const accountIndex = 0;
const addressIndex = 0;

// 0x01b2 for Kusama, 0x0162 for Polkadot
const path = `m/${0x2c}'/${0x01b2}'/${accountIndex}'/0'/${addressIndex}'`;

// performs hard-only derivation on the xprv
function derivePrivate (xprv, index) {
  let kl = xprv.slice(0, 32);
  let kr = xprv.slice(32, 64);
  const cc = xprv.slice(64, 96);

  const data = Buffer.allocUnsafe(1 + 64 + 4);

  data.writeUInt32LE(index, 1 + 64);
  kl.copy(data, 1);
  kr.copy(data, 1 + 32);

  data[0] = 0x00;

  const z = crypto.createHmac('sha512', cc).update(data).digest();

  data[0] = 0x01;

  const i = crypto.createHmac('sha512', cc).update(data).digest();
  const chainCode = i.slice(32, 64);
  const zl = z.slice(0, 32);
  const zr = z.slice(32, 64);
  const left = new BN(kl, 16, 'le').add(new BN(zl.slice(0, 28), 16, 'le').mul(new BN(8))).toArrayLike(Buffer, 'le', 32);
  let right = new BN(kr, 16, 'le').add(new BN(zr, 16, 'le')).toArrayLike(Buffer, 'le').slice(0, 32);

  if (right.length !== 32) {
    right = Buffer.from(right.toString('hex') + '00', 'hex')
  }

  return Buffer.concat([left, right, chainCode]);
}

// gets an xprv from a mnemonic
function getLedgerMasterKey (mnemonic) {
  const masterSeed = crypto.pbkdf2Sync(mnemonic, 'mnemonic', 2048, 64, 'sha512');
  const chainCode = crypto.createHmac('sha256', 'ed25519 seed').update(new Uint8Array([1, ...masterSeed])).digest();
  let priv;

  while (!priv || (priv[31] & 0b0010_0000)) {
    priv = crypto.createHmac('sha512', 'ed25519 seed').update(priv || masterSeed).digest();
  }

  priv[0]  &= 0b1111_1000;
  priv[31] &= 0b0111_1111;
  priv[31] |= 0b0100_0000;

  return Buffer.concat([priv, chainCode]);
}

async function main () {
  // Just a test to see if we align with the known seed (useful for adjustments here)
  console.log('   algo valid', getLedgerMasterKey('abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about').toString('hex') === '402b03cd9c8bed9ba9f9bd6cd9c315ce9fcc59c7c25d37c85a36096617e69d418e35cb4a3b737afd007f0688618f21a8831643c0e6c77fc33c06026d2a0fc93832596435e70647d7d98ef102a32ea40319ca8fb6c851d7346d3bd8f9d1492658', '\n');

  const pair = new Eddsa('ed25519').keyFromSecret(
    path
      .split('/')
      .slice(1)
      .reduce((xprv, n) => derivePrivate(xprv, parseInt(n.replace("'", ''), 10) + 0x80000000), getLedgerMasterKey(mnemonic))
      .slice(0, 32)
  );
  const [privateKey, publicKey] = [Buffer.from(pair.getSecret()), Buffer.from(pair.getPublic())];
  const publicHex = publicKey.toString('hex');

  console.log('      private', `0x${privateKey.toString('hex')}`);
  console.log('       public', `0x${publicKey.toString('hex')}`);
  console.log();
  console.log('     addr DOT', encodeAddress(`0x${publicHex}`, 0));
  console.log('     addr KSM', encodeAddress(`0x${publicHex}`, 2));
  console.log();
}

main().catch(console.error);