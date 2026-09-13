import {cp,mkdir} from 'node:fs/promises';
await mkdir('dist',{recursive:true});
await cp('src','dist',{recursive:true});
console.log('Built static site in dist/');
