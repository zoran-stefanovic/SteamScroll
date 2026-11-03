// Read-only local verification. Does not start Battle.net or any game.
import {load} from './load-ts.mjs';
const provider=load('src/utils/battlenet-games.ts');
console.log(JSON.stringify(await provider.discoverBattleNetGames({icons:false}),null,2));
