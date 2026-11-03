import {spawnSync} from 'node:child_process';
for(const file of ['steam-location.mjs','regression.mjs','epic-regression.mjs','epic-icons.mjs','icon-feedback.mjs','property-inspector.mjs','unified-regression.mjs','battlenet-regression.mjs']) {
    const result=spawnSync(process.execPath,[`tests/${file}`],{stdio:'inherit',shell:false});
    if(result.error || result.status!==0) {process.exitCode=result.status || 1;break;}
}
