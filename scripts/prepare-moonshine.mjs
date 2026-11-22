// Copia Moonshine tal como se publicó a `public/moonshine/` y deja ahí una copia parcheada de
// `moonshine.mjs` (design.md, D1). Se ejecuta antes de `wxt dev` y de `wxt build`.
//
// El `moonshine.mjs` publicado (Emscripten + embind) crea dos funciones con `new Function(...)`.
// Una página de extensión no puede evaluar texto como código, así que ahí falla al arrancar. El
// parche hace lo mismo con funciones normales (equivale a compilar con -sDYNAMIC_EXECUTION=0).
import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPLACEMENTS = [
  {
    name: 'embind: llamada de JS a una función o método de C++',
    from: 'let[args,invokerFnBody]=createJsInvoker(argTypes,isClassMethodFunc,returns,isAsync);var invokerFn=new Function(...args,invokerFnBody)(...closureArgs);',
    to:
      'var invokerFn=function(...jsArgs){' +
      'var destructors=needsDestructorStack?[]:null;var wired=[cppTargetFunc];var thisWired;' +
      'if(isClassMethodFunc){thisWired=argTypes[1]["toWireType"](destructors,this);wired.push(thisWired)}' +
      'for(var i=0;i<argCount-2;++i){wired.push(argTypes[i+2]["toWireType"](destructors,jsArgs[i]))}' +
      'var rv=cppInvokerFunc(...wired);' +
      'if(needsDestructorStack){runDestructors(destructors)}' +
      'else{for(var i=isClassMethodFunc?1:2;i<argTypes.length;++i){if(argTypes[i].destructorFunction!==null){' +
      'argTypes[i].destructorFunction(i===1?thisWired:wired[(isClassMethodFunc?2:1)+(i-2)])}}}' +
      'if(returns){return argTypes[0]["fromWireType"](rv)}};',
  },
  {
    name: 'emval: llamada de C++ a un método o constructor de JS',
    from: 'var invokerFunction=new Function(...params,functionBody)(...args);',
    to:
      'var invokerFunction=function(obj,func,destructorsRef,argsPtr){' +
      'var callArgs=[];var off=0;' +
      'for(var i=0;i<argCount;++i){callArgs.push(types[i].readValueFromPointer(argsPtr+off));off+=types[i].argPackAdvance}' +
      'var rv=kind===1?new func(...callArgs):kind===0?func.call(obj,...callArgs):func.call(...callArgs);' +
      'if(!retType.isVoid){return emval_returnValue(retType,destructorsRef,rv)}};',
  },
];

// Cualquier forma de crear código a partir de texto que Chrome rechaza en una extensión.
const CODE_FROM_TEXT = /(?<![\w$.])(?:new\s+Function\b|Function\s*\(|eval\s*\()/;

/** Devuelve el `moonshine.mjs` parcheado. Falla si el texto de entrada no es el esperado. */
export function patchGlue(source) {
  let patched = source;
  for (const { name, from, to } of REPLACEMENTS) {
    const count = patched.split(from).length - 1;
    if (count !== 1) {
      throw new Error(`Parche de Moonshine: se esperaba 1 aparición y hay ${count} (${name}).`);
    }
    patched = patched.replace(from, () => to);
  }
  if (CODE_FROM_TEXT.test(patched)) {
    throw new Error('Parche de Moonshine: queda alguna función creada a partir de texto.');
  }
  return patched;
}

/** Copia `dist/` del paquete a `outDir` (que se vacía antes) y parchea `moonshine.mjs`. */
export function prepareMoonshine({ packageDir, outDir }) {
  const { version } = JSON.parse(readFileSync(path.join(packageDir, 'package.json'), 'utf8'));
  const patched = patchGlue(readFileSync(path.join(packageDir, 'dist', 'moonshine.mjs'), 'utf8'));
  rmSync(outDir, { recursive: true, force: true });
  cpSync(path.join(packageDir, 'dist'), outDir, { recursive: true });
  writeFileSync(path.join(outDir, 'moonshine.mjs'), patched);
  return { version };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const outDir = path.join(root, 'public', 'moonshine');
  const { version } = prepareMoonshine({
    packageDir: path.join(root, 'node_modules', '@moonshine-ai', 'moonshine-wasm'),
    outDir,
  });
  console.log(`Moonshine ${version} copiado y parcheado en ${path.relative(root, outDir)}/`);
}
