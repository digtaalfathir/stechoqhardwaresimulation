// Vite 5 dies deep in its own internals on Node < 18 ("crypto$2.getRandomValues
// is not a function"). Fail here instead, naming the cause and the fix.
const major = Number(process.versions.node.split('.')[0]);
if (major < 18) {
  console.error(
    `\nNode ${process.version} is too old for this project — Vite 5 needs Node 18+.\n` +
      `  nvm use            (reads .nvmrc)\n` +
      `  nvm install 20     (if you do not have it yet)\n`,
  );
  process.exit(1);
}
