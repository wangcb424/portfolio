import {generateKeyPairSync} from 'node:crypto';
// Native Node crypto generates a P-256 key pair; no third-party CLI needed.
const {privateKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const key=privateKey.export({format:'jwk'});
const publicBytes=Buffer.concat([Buffer.from([4]),Buffer.from(key.x,'base64url'),Buffer.from(key.y,'base64url')]);
console.log('VAPID_PUBLIC_KEY='+publicBytes.toString('base64url'));
console.log('VAPID_PRIVATE_KEY='+key.d);
console.log('Keep the private key in server environment variables. Do not commit it.');
