import * as AutoSizerModule from './node_modules/react-virtualized-auto-sizer/dist/react-virtualized-auto-sizer.js';
console.log('Keys:', Object.keys(AutoSizerModule));
if (AutoSizerModule.AutoSizer) console.log('AutoSizer exists');
if (AutoSizerModule.default) console.log('Default exists');
