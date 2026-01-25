module.exports = {
  globDirectory: 'dist',
  globPatterns: ['**/*.{html,json,png,ico,css,js}'],
  swDest: 'dist/sw.js',
  ignoreURLParametersMatching: [/^utm_/, /^fbclid$/],
  maximumFileSizeToCacheInBytes: 5242880,
};
