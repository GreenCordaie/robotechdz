const path = require('path');
const root = path.resolve(__dirname, '..');

// Patch server-only 
const Module = require('module');
const origResolve = Module._resolveFilename;
Module._resolveFilename = function(request, parent, isMain, options) {
  if (request === 'server-only') return path.join(root, 'scripts', 'noop.js');
  return origResolve.call(this, request, parent, isMain, options);
};

// Patch react cache
const react = require('react');
if (!react.cache) react.cache = (fn) => fn;

// Load the run script
require(path.join(root, 'scripts', 'e2e-iptv-run.js'));
