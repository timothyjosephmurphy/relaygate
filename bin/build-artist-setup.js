#!/usr/bin/env node
import { readFile, mkdir, writeFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const [core, ui, shell] = await Promise.all(['src/artist-setup.js', 'src/artist-setup-ui.js', 'src/artist-setup-shell.html'].map(file => readFile(new URL(file, root), 'utf8')));
const script = core.replace(/^export /gm, '') + '\n' + ui;
if (/<\/script/i.test(script)) throw new Error('Unexpected closing script tag in setup source');
const html = shell.replace('<!-- SETUP_SCRIPT -->', `<script>\n'use strict';\n(() => {\n${script}\n})();\n</script>`);
await mkdir(new URL('tools/', root), { recursive: true });
await writeFile(new URL('tools/artist-setup.html', root), html);
console.log('Built tools/artist-setup.html. This only creates a local file.');
