import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';

export function load(file, overrides = {}, globals = {}) {
    const filename=path.resolve(file), require=createRequire(filename);
    const js=ts.transpileModule(fs.readFileSync(filename,'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,experimentalDecorators:true}}).outputText;
    const module={exports:{}};
    vm.runInNewContext(js,{exports:module.exports,process,Buffer,TextDecoder,console,Error,setTimeout,clearTimeout,...globals,require:name=>{
        if (Object.hasOwn(overrides,name)) return overrides[name];
        if (name.startsWith('.')) { const target=path.resolve(path.dirname(filename),name+'.ts'); if(fs.existsSync(target)) return load(target,overrides,globals); }
        return require(name);
    }},{filename});
    return module.exports;
}
