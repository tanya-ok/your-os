import * as esbuild from 'esbuild';

const context = await esbuild.context({
  entryPoints: ['src/main.jsx'],
  bundle: true,
  jsx: 'automatic',
  outfile: 'static/bundle.js',
  loader: { '.jsx': 'jsx' },
  sourcemap: false,
});
if (process.argv.includes('--watch')) {
  await context.watch();
  console.log('Watching personal-os');
} else {
  await context.rebuild();
  await context.dispose();
  console.log('Build complete');
}
