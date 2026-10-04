const express = require('express');
const fs = require('fs');
const path = require('path');

const modules = path.join(__dirname, '../../node_modules');
const publicDir = path.join(__dirname, '../public');

const vendorDirs = {
  bootstrap: path.join(modules, 'bootstrap/dist'),
  'bootstrap-icons': path.join(modules, 'bootstrap-icons/font'),
  inter: path.join(modules, '@fontsource-variable/inter/files'),
};

const WEEK = 60 * 60 * 24 * 7;
const YEAR = 60 * 60 * 24 * 365;

// the ?v= token from assetUrl, or the content hash bootstrap-icons appends to its font urls
function isVersionedRequest(query) {
  return Object.keys(query || {}).some(key => key === 'v' || /^[0-9a-f]{32}$/.test(key));
}

// a versioned url never changes content, fonts rarely do, everything else revalidates through its ETag
function assetHeaders(res, filePath) {
  const versioned = isVersionedRequest(res.req.query);
  if (versioned) res.setHeader('Cache-Control', `public, max-age=${YEAR}, immutable`);
  else if (/\.woff2?$/.test(filePath)) res.setHeader('Cache-Control', `public, max-age=${WEEK}`);
  else res.setHeader('Cache-Control', 'public, max-age=0');
}

function fileFor(urlPath) {
  const vendor = /^\/vendor\/([^/]+)\/(.+)$/.exec(urlPath);
  if (!vendor) return path.join(publicDir, urlPath);
  const dir = vendorDirs[vendor[1]];
  return dir ? path.join(dir, vendor[2]) : null;
}

// the files of a running production process never change, in development an edit shows up within a second
const VERSION_TTL_MS = process.env.NODE_ENV === 'production' ? Infinity : 1000;
const versioned = new Map();

function versionedUrl(urlPath) {
  const file = fileFor(urlPath);
  if (!file) return urlPath;
  try {
    const { size, mtimeMs } = fs.statSync(file);
    return `${urlPath}?v=${size.toString(36)}${Math.round(mtimeMs).toString(36)}`;
  } catch {
    return urlPath;
  }
}

// adds a content version to the url so a changed file is fetched once and an unchanged one never again
function assetUrl(urlPath) {
  const hit = versioned.get(urlPath);
  if (hit && Date.now() - hit.at < VERSION_TTL_MS) return hit.url;
  const url = versionedUrl(urlPath);
  versioned.set(urlPath, { url, at: Date.now() });
  return url;
}

const publicAssets = express.static(publicDir, { setHeaders: assetHeaders });

module.exports = { publicAssets, assetHeaders, assetUrl, vendorDirs };
