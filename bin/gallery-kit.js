#!/usr/bin/env node
import { exportGallery, restoreBundle, verifyBundle } from '../src/gallery-bundle.js';

const usage = 'Usage: node bin/gallery-kit.js build <gallery.json> <new-folder> [public-event.json ...]\n       node bin/gallery-kit.js verify <gallery-folder>\n       node bin/gallery-kit.js restore <gallery-folder> <new-folder>';
const [command, source, destination, ...events] = process.argv.slice(2);
try {
  let manifest;
  if (command === 'build' && source && destination) manifest = await exportGallery(source, destination, { eventFiles: events });
  else if (command === 'verify' && source && !destination) manifest = (await verifyBundle(source)).manifest;
  else if (command === 'restore' && source && destination && !events.length) manifest = await restoreBundle(source, destination);
  else throw new Error(usage);
  console.log(`${command}: ${manifest.files.length} files; ${manifest.missingMedia?.length ?? 0} media items not included. No signature verification or publication performed.`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
