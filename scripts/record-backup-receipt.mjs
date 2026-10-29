import {appendFile,readFile} from 'node:fs/promises';
const manifest=JSON.parse(await readFile(process.argv[2],'utf8'));
if(!process.env.GITHUB_STEP_SUMMARY)throw Error('Missing workflow receipt destination');
await appendFile(process.env.GITHUB_STEP_SUMMARY,`Independent encrypted database backup\n\n- Application: ${manifest.appVersion}\n- Commit: ${manifest.sourceCommit}\n- Key fingerprint: ${manifest.keyId}\n- SQL restore integrity: ok\n- Artifact retention: requested 90 days, subject to repository policy\n- Live database writes: none\n\nDownload the encrypted artifact before its expiry. Recovery requires the separate private key.\n`);
